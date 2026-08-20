/**
 * Three-scope network-privacy binding resolution (Phase 5, L0).
 *
 * A tab's traffic goes through whichever VPN/Tor connection is bound at the MOST SPECIFIC scope that
 * actually names one: **tab override → group binding → General default → Direct**. This module is that
 * resolution rule, and nothing else — no Electron, no session partitions, no proxy configuration. It is
 * the one piece of Phase 5 that has no dependency on anything else in the phase (no connection pool, no
 * SOCKS bridge, no UI), which is why it is what lands first: the resolution logic is where a subtle bug
 * would be most expensive, because it decides which network a page's traffic actually goes out on.
 *
 * Three properties this module exists to guarantee, all backed by tests:
 *
 * 1. **Most-specific wins, always.** A tab with an explicit override is never re-routed by a group or
 *    General change; a group's explicit binding is never overridden by a General change.
 * 2. **`inherit` is not a fourth destination.** It means "keep asking the next scope up" — resolution
 *    always bottoms out at a real destination (a connection or Direct), never at "inherit" itself.
 * 3. **Default is Direct.** An ungrouped tab with no override and no General default set resolves to
 *    Direct — pure local-first is the floor this cannot fall below.
 */

/** What one scope (Tab or Group) can be set to. `inherit` defers to the next scope up. */
export type ScopedBinding =
  | { kind: 'connection'; connectionId: string }
  | { kind: 'direct' }
  | { kind: 'inherit' };

/** General has nowhere further to defer to, so it cannot be `inherit` — it IS the floor above Direct. */
export type GeneralBinding = { kind: 'connection'; connectionId: string } | { kind: 'direct' };

export type ResolvedConnection = { connectionId: string } | { connectionId: null };

export type BindingSource = 'tab' | 'group' | 'general';

export interface ResolvedBinding {
  resolved: ResolvedConnection;
  /** Which scope actually decided this — the scope resolution stopped climbing at. */
  source: BindingSource;
}

/**
 * Resolve one tab's binding. `group` is `null` for an ungrouped tab, which is a DIFFERENT thing from a
 * group bound to `inherit` — an ungrouped tab has no group scope to consult at all and falls straight
 * to General; a grouped tab on `inherit` consults General only because its group also deferred.
 */
export function resolveBinding(
  tab: ScopedBinding,
  group: ScopedBinding | null,
  general: GeneralBinding,
): ResolvedBinding {
  if (tab.kind === 'connection') return { resolved: { connectionId: tab.connectionId }, source: 'tab' };
  if (tab.kind === 'direct') return { resolved: { connectionId: null }, source: 'tab' };

  // tab.kind === 'inherit' from here down.
  if (group !== null) {
    if (group.kind === 'connection') {
      return { resolved: { connectionId: group.connectionId }, source: 'group' };
    }
    if (group.kind === 'direct') return { resolved: { connectionId: null }, source: 'group' };
    // group.kind === 'inherit' — fall through to General, same as an ungrouped tab.
  }

  return {
    resolved: general.kind === 'connection' ? { connectionId: general.connectionId } : { connectionId: null },
    source: 'general',
  };
}

/**
 * The partition every Direct (untunneled) page has always lived in, unchanged. Kept BYTE-IDENTICAL on
 * purpose: renaming it would orphan every existing user's cookies, logins and site storage behind a
 * partition nothing reads any more. Phase 5 only ever ADDS `--conn-` siblings next to it.
 *
 * Deliberately NOT profile-keyed. Profile isolation is done a level up — each profile runs as its own
 * process over its own `userData` directory — so the partition name is already profile-scoped by
 * construction, and baking a profile id into it would be both redundant and the rename described above.
 */
export const DIRECT_PARTITION = 'persist:tepegoz-web';

/** A connection id is a partition-name component, so it is constrained to what can never collide or
 *  escape: lowercase alphanumerics and single dashes. Two DIFFERENT connections whose ids normalized to
 *  the same partition would silently share one cookie jar — the cross-tab bleed the phase forbids. */
export const CONNECTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidConnectionId(connectionId: string): boolean {
  return connectionId.length <= 64 && CONNECTION_ID_PATTERN.test(connectionId);
}

/**
 * The session-partition key a resolved binding hosts a tab's `WebContents` on.
 *
 * Keyed by connection, deliberately NOT by group — per the phase's own model, groups are a binding/UI
 * layer, and N groups sharing one connection share one partition. A `Direct` resolution uses
 * {@link DIRECT_PARTITION}, so an untunneled tab is byte-identical to the browser before Phase 5.
 *
 * Throws on an id that is not a valid partition component rather than sanitizing it: quietly mapping
 * `vpn/a` and `vpn-a` onto one partition would put two connections' traffic in one cookie jar, and a
 * throw at the binding boundary is recoverable where that bleed is not.
 */
export function partitionKeyFor(resolved: ResolvedConnection): string {
  if (resolved.connectionId === null) return DIRECT_PARTITION;
  if (!isValidConnectionId(resolved.connectionId)) {
    throw new Error(`Invalid connection id for a session partition: ${JSON.stringify(resolved.connectionId)}`);
  }
  return `${DIRECT_PARTITION}--conn-${resolved.connectionId}`;
}

export interface TabBindingState {
  tabId: string;
  binding: ScopedBinding;
  /** Which group this tab belongs to, or null. */
  groupId: string | null;
}

/**
 * Which tabs must be RE-HOSTED (and therefore reload) when a group's binding changes.
 *
 * Only members that were actually INHERITING the group's connection move — a tab holding its own
 * explicit override was never affected by the group in the first place and must be left exactly alone,
 * per the phase's own trade-off ("tabs with an explicit override are left alone").
 */
export function affectedByGroupChange(
  tabs: readonly TabBindingState[],
  groupId: string,
): readonly string[] {
  return tabs
    .filter((t) => t.groupId === groupId && t.binding.kind === 'inherit')
    .map((t) => t.tabId);
}

/**
 * Which tabs must be re-hosted when the General default changes.
 *
 * A tab is affected only if EVERY scope between it and General was deferring — its own binding is
 * `inherit`, and it is either ungrouped or its group is also `inherit`. A tab (or its group) holding any
 * explicit binding — including an explicit `direct` — is insulated from a General change exactly as it
 * is insulated from a group change, by the same most-specific-wins rule.
 */
export function affectedByGeneralChange(
  tabs: readonly TabBindingState[],
  groups: ReadonlyMap<string, ScopedBinding>,
): readonly string[] {
  return tabs
    .filter((t) => {
      if (t.binding.kind !== 'inherit') return false;
      if (t.groupId === null) return true;
      const groupBinding = groups.get(t.groupId);
      return groupBinding === undefined || groupBinding.kind === 'inherit';
    })
    .map((t) => t.tabId);
}
