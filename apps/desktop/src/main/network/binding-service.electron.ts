import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import {
  affectedByGeneralChange,
  affectedByGroupChange,
  bindingOnInvoluntaryGroupExit,
  partitionKeyFor,
  privatePartitionKey,
  PRIVATE_PARTITION,
  resolveBinding,
  type GeneralBinding,
  type ResolvedBinding,
  type ScopedBinding,
} from '@tepegoz/tab-engine';
import { killSwitchVerdicts } from '@tepegoz/security-policy';
import TabManager from '../tabs';
import BrowsingSessions from './browsing-sessions.electron';
import ConnectionPool from './connection-pool.electron';

/**
 * The three-scope binding, applied to live tabs (Phase 5, L0).
 *
 * Everything this needs already exists and is tested in isolation: `resolveBinding` decides the route,
 * `affectedBy*Change` decides who moves, `ConnectionPool` decides what is alive, `rehostTab` performs the
 * move. This module is where those meet, and its whole job is to make sure they meet in an order that
 * cannot leak.
 *
 * **Where each scope is stored, and why they differ.**
 * - **General** → preferences. It is a profile-wide user setting, and it must survive a restart: a user
 *   who set "everything through Tor" and finds it forgotten after a crash has been failed badly.
 * - **Group** → `TabGroupInfo.settings['vpn.connectionId']`, the flat per-group bag ADR-0020 reserved for
 *   exactly this. It carries no isolation semantics, which matches the phase: groups are a binding/UI
 *   layer, never a partition axis.
 * - **Tab** → memory only. A tab override is a decision about *this browsing session*, and silently
 *   restoring one after a restart — onto a connection that may no longer exist — would re-route a page the
 *   user is looking at without them asking. On restore, a tab falls back to its group/General, which is
 *   the conservative direction.
 *
 * **The apply order is the safety property.** A tab is only re-hosted onto a tunnel AFTER the connection
 * is confirmed up and the proxy verified. If bringing it up fails, the tab is left exactly where it is —
 * never moved to the target "optimistically", and never quietly redirected to Direct. Both of those would
 * put a user on a network they did not choose, in opposite directions.
 */

/** The group-settings key ADR-0020 reserved for this. */
const GROUP_BINDING_KEY = 'vpn.connectionId';
/** The sentinel stored in the group bag for an explicit Direct (as opposed to "no entry" = inherit). */
const DIRECT_SENTINEL = 'direct';

const tabBindings = new Map<string, ScopedBinding>();

function generalBinding(): GeneralBinding {
  const stored = PreferenceStore.getAll().networkGeneralBinding;
  return stored.kind === 'connection'
    ? { kind: 'connection', connectionId: stored.connectionId }
    : { kind: 'direct' };
}

function groupBindings(): Map<string, ScopedBinding> {
  const map = new Map<string, ScopedBinding>();
  for (const group of TabManager.allGroups()) {
    const raw = group.settings[GROUP_BINDING_KEY];
    if (typeof raw !== 'string' || raw.length === 0) continue;
    map.set(
      group.id,
      raw === DIRECT_SENTINEL ? { kind: 'direct' } : { kind: 'connection', connectionId: raw },
    );
  }
  return map;
}

function groupOf(tabId: string): string | null {
  return TabManager.bindingStates().find((t) => t.tabId === tabId)?.groupId ?? null;
}

const BindingService = {
  general: generalBinding,

  tabBinding(tabId: string): ScopedBinding {
    return tabBindings.get(tabId) ?? { kind: 'inherit' };
  },

  groupBinding(groupId: string): ScopedBinding {
    return groupBindings().get(groupId) ?? { kind: 'inherit' };
  },

  /**
   * Where a GROUP's traffic goes right now — its own binding, or whatever it inherits from General.
   *
   * Distinct from reading the raw group binding: a group on `inherit` under a tunneled General default is
   * genuinely tunneled, and its header badge has to say so. Showing a badge only for an explicit group
   * binding would leave the most common case ("everything through FRA") looking untunneled.
   */
  resolveForGroup(groupId: string): ResolvedBinding {
    const group = groupBindings().get(groupId) ?? { kind: 'inherit' };
    return resolveBinding({ kind: 'inherit' }, group, generalBinding());
  },

  /** Where this tab's traffic goes right now, and which scope decided it. */
  resolveFor(tabId: string): ResolvedBinding {
    const groupId = groupOf(tabId);
    const group = groupId === null ? null : (groupBindings().get(groupId) ?? { kind: 'inherit' });
    return resolveBinding(BindingService.tabBinding(tabId), group, generalBinding());
  },

  /**
   * May this tab's traffic leave at all? The kill-switch, asked per tab against live pool health.
   *
   * Note what this is NOT: it is not what stops a leak. A dropped tunnel already fails closed at the
   * network layer, because the session's proxy rules carry no `DIRECT` fallback. This is the *reportable*
   * form of the same fact — what the UI shows, and what an agent run must be locked out on — and it is
   * deliberately derived from the same fail-closed function rather than re-deciding anything.
   */
  mayEgress(tabId: string): boolean {
    const resolved = BindingService.resolveFor(tabId).resolved;
    return (
      killSwitchVerdicts(
        [{ tabId, resolvedConnectionId: resolved.connectionId }],
        ConnectionPool.statusMap(),
      )[0]?.allowed === true
    );
  },

  /**
   * Put `tabIds` onto whatever they now resolve to. The single path every scope change funnels through.
   *
   * Sequential, not parallel, and not for tidiness: two tabs moving onto the same connection must not
   * race to bring it up, and a failure on one tab must not leave the rest half-applied without a log line
   * saying so.
   */
  async apply(tabIds: readonly string[]): Promise<void> {
    for (const tabId of tabIds) {
      const { resolved } = BindingService.resolveFor(tabId);
      try {
        if (resolved.connectionId === null) {
          TabManager.rehostTab(tabId, BrowsingSessions.direct());
          continue;
        }
        // Confirm the tunnel is real BEFORE the tab moves onto it. `ensureUp` only resolves once the
        // endpoint answered and Chromium confirmed the proxy took effect.
        await ConnectionPool.ensureUp(resolved.connectionId);
        TabManager.rehostTab(tabId, BrowsingSessions.ensure(partitionKeyFor(resolved)));
      } catch (err) {
        // Left exactly where it was. Not moved optimistically (the user would believe they are tunneled
        // when the tunnel is dead) and not redirected to Direct (that IS the leak).
        Logger.error('Could not apply a network binding; tab left on its current route', {
          tabId,
          connectionId: resolved.connectionId,
          err: String(err),
        });
      }
    }
  },

  /** Bind ONE tab. Only that tab moves — an explicit override is exactly a per-tab decision. */
  async bindTab(tabId: string, binding: ScopedBinding): Promise<void> {
    if (binding.kind === 'inherit') tabBindings.delete(tabId);
    else tabBindings.set(tabId, binding);
    await BindingService.apply([tabId]);
  },

  /** Bind a GROUP. Members holding their own override are left alone, per most-specific-wins. */
  async bindGroup(groupId: string, binding: ScopedBinding): Promise<void> {
    TabManager.updateGroupSettings(groupId, {
      [GROUP_BINDING_KEY]:
        binding.kind === 'inherit'
          ? ''
          : binding.kind === 'direct'
            ? DIRECT_SENTINEL
            : binding.connectionId,
    });
    const states = TabManager.bindingStates().map((t) => ({
      tabId: t.tabId,
      groupId: t.groupId,
      binding: BindingService.tabBinding(t.tabId),
    }));
    await BindingService.apply(affectedByGroupChange(states, groupId));
  },

  /** Set the profile-wide default. Re-resolves every tab still inheriting all the way up to it. */
  async setGeneral(binding: GeneralBinding): Promise<void> {
    PreferenceStore.update({
      networkGeneralBinding:
        binding.kind === 'connection'
          ? { kind: 'connection', connectionId: binding.connectionId }
          : { kind: 'direct' },
    });
    const states = TabManager.bindingStates().map((t) => ({
      tabId: t.tabId,
      groupId: t.groupId,
      binding: BindingService.tabBinding(t.tabId),
    }));
    await BindingService.apply(affectedByGeneralChange(states, groupBindings()));
  },

  /**
   * Keep a tab's ROUTE when it involuntarily loses the group that was deciding it (today: pinning,
   * which clears group membership to keep the pinned run and the group run from competing, ADR-0020).
   *
   * Without this the tab's resolution silently falls to General the instant it is unpinned from its
   * group — a tab inheriting a tunnel drops to Direct, and traffic the user believed was tunneled goes
   * out over the clear path because they pinned a tab. Materializing the group's binding as the tab's
   * own override keeps `resolveBinding` returning the identical destination, so there is nothing to
   * re-host: no reload, no gap, and nothing to leak through. Must be called BEFORE the membership is
   * cleared, while the group scope is still readable.
   */
  preserveRouteOnGroupExit(tabId: string, groupId: string): void {
    const group = groupBindings().get(groupId) ?? { kind: 'inherit' as const };
    const preserved = bindingOnInvoluntaryGroupExit(BindingService.tabBinding(tabId), group);
    if (preserved === null) return;
    tabBindings.set(tabId, preserved);
    Logger.info('Preserved a tab route across an involuntary group exit', {
      tabId,
      groupId,
      binding: preserved.kind === 'connection' ? preserved.connectionId : preserved.kind,
    });
  },

  /** Forget a closed tab's override so a recycled id cannot inherit a stranger's route. */
  forgetTab(tabId: string): void {
    tabBindings.delete(tabId);
  },

  /**
   * Drop overrides for tabs that no longer exist.
   *
   * Cheap housekeeping with a real edge behind it: tab ids are allocated by the store, and a future tab
   * that happened to reuse a closed one's id would silently inherit a stranger's route. Called wherever
   * the routing picture is rebuilt, so it cannot be forgotten at an individual close site.
   */
  prune(): void {
    const live = new Set(TabManager.bindingStates().map((t) => t.tabId));
    for (const tabId of [...tabBindings.keys()]) {
      if (!live.has(tabId)) tabBindings.delete(tabId);
    }
  },

  /**
   * Drop every binding that points at `connectionId` and send its tabs back to their next scope up.
   *
   * Called when a connection is REMOVED. Leaving the bindings behind would strand those tabs on
   * `unknown_connection_failclosed` forever — correctly blocked, but with no way out that the user could
   * find, since the connection they would need to fix is gone.
   */
  async releaseConnection(connectionId: string): Promise<void> {
    for (const [tabId, binding] of [...tabBindings]) {
      if (binding.kind === 'connection' && binding.connectionId === connectionId)
        tabBindings.delete(tabId);
    }
    for (const [groupId, binding] of groupBindings()) {
      if (binding.kind === 'connection' && binding.connectionId === connectionId) {
        TabManager.updateGroupSettings(groupId, { [GROUP_BINDING_KEY]: '' });
      }
    }
    const general = generalBinding();
    if (general.kind === 'connection' && general.connectionId === connectionId) {
      PreferenceStore.update({ networkGeneralBinding: { kind: 'direct' } });
    }
    await BindingService.apply(TabManager.bindingStates().map((t) => t.tabId));
  },

  /**
   * Teach the tab factory where a NEW tab is born.
   *
   * Synchronous by necessity (tab creation is), so it hands back the target partition's session without
   * waiting for the tunnel to be verified — and kicks `ensureUp` so the real proxy lands. That is safe
   * only because a tunnel partition is BLACKHOLED from the instant it exists: the worst case is the
   * first request failing and a reload working, never a clear-path request.
   */
  /**
   * Subscribe to tabs losing their group involuntarily, so a pin cannot silently change a route.
   * Registered once at startup next to {@link installNewTabRoute}.
   */
  installGroupExitGuard(): void {
    TabManager.onInvoluntaryGroupExit((tabId, groupId) => {
      BindingService.preserveRouteOnGroupExit(tabId, groupId);
    });
  },

  installNewTabRoute(): void {
    BrowsingSessions.setNewTabSessionProvider(() => {
      const general = generalBinding();
      if (general.kind === 'direct') return BrowsingSessions.direct();
      void ConnectionPool.ensureUp(general.connectionId).catch((err: unknown) => {
        Logger.warn('Default-route connection is not available for a new tab', {
          connectionId: general.connectionId,
          err: String(err),
        });
      });
      return BrowsingSessions.ensure(partitionKeyFor({ connectionId: general.connectionId }));
    });

    // The same route, on the private side. A private window on a profile whose General binding is a
    // VPN or Tor must not fall to the clear path — that is the failure this provider pair exists to
    // prevent, and private browsing is where it would matter most.
    BrowsingSessions.setPrivatePartitionProvider(() => {
      const general = generalBinding();
      if (general.kind === 'direct') return PRIVATE_PARTITION;
      void ConnectionPool.ensureUp(general.connectionId).catch((err: unknown) => {
        Logger.warn('Default-route connection is not available for a private tab', {
          connectionId: general.connectionId,
          err: String(err),
        });
      });
      return privatePartitionKey({ connectionId: general.connectionId });
    });
  },

  resetForTests(): void {
    tabBindings.clear();
  },
};

export default BindingService;
