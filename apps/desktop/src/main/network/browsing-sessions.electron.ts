import { session, type Session } from 'electron';
import { Logger } from '@tepegoz/libs';
import { DIRECT_PARTITION } from '@tepegoz/tab-engine';
import { BLACKHOLE_PROXY_CONFIG } from '@tepegoz/security-policy';

/**
 * The registry of BROWSING sessions and the per-session wiring every one of them must carry.
 *
 * Why this exists. Until Phase 5 the browser had exactly one browsing partition, so every main-process
 * subsystem that needs a `Session` reached for `session.fromPartition('persist:tepegoz-web')` directly
 * and attached itself once, at startup. Phase 5 makes that assumption false: a tunnel-bound tab lives on
 * a `--conn-{id}` sibling partition, and a subsystem still nailed to the base session simply **is not
 * there** for it. The failure mode is silent and one-directional — the tunneled tab loads fine, it just
 * has no ad/tracker filtering, no download quarantine, no User-Agent override, and its cookies survive a
 * "forget this site". Every one of those is a privacy regression, inside the privacy feature.
 *
 * So sessions are created through here, never by calling `session.fromPartition` at a use site, and
 * subsystems `register()` an attacher instead of attaching once. Two ordering guarantees make that safe:
 *
 * 1. **Registration order does not matter.** `register()` retro-applies to every session already live,
 *    and `ensure()` applies every attacher registered so far. A subsystem that inits after the first
 *    window opened still reaches that window's session.
 * 2. **Exactly once per (attacher, session).** Attaching the webRequest multiplexer twice to one session
 *    would double-run every filter.
 *
 * A **critical** attacher that throws makes `ensure()` throw rather than hand back a half-wired session.
 * That is deliberate and fail-closed: no session means no `WebContents` can be hosted on it, which means
 * no traffic — the correct outcome when we cannot prove the filtering/quarantine plane is attached.
 */

/** Every tunnel partition is a `--conn-` sibling of the Direct one — see `partitionKeyFor`. */
const TUNNEL_PREFIX = `${DIRECT_PARTITION}--conn-`;

export type BrowsingSessionAttacher = (ses: Session, partition: string) => void;

interface Registration {
  attacher: BrowsingSessionAttacher;
  /** A critical attacher failing makes the session unusable instead of silently degraded. */
  critical: boolean;
}

const registrations = new Map<string, Registration>();
const live = new Map<string, Session>();
/**
 * Partitions a CRITICAL attacher failed on. Permanent for the process lifetime, and the reason is
 * subtle: exactly-once means a retry would SKIP the attacher that already failed and hand back a session
 * that looks wired and is not. Refusing the partition outright is the only answer that cannot degrade
 * into a silently unfiltered tunnel.
 */
const poisoned = new Map<string, Error>();
/** Supplies the session a new tab is born on; installed by the binding layer (see `defaultForNewTab`). */
let newTabSessionProvider: (() => Session) | null = null;
/** `${partition}\u0000${attacherId}` pairs already applied — the exactly-once guarantee. */
const appliedPairs = new Set<string>();

function pairKey(partition: string, id: string): string {
  return `${partition}\u0000${id}`;
}

/** Apply one attacher to one session. Returns false when a NON-critical attacher failed. Throws when a
 *  critical one did — the caller (`ensure`) turns that into "this session does not exist". */
function apply(id: string, reg: Registration, partition: string, ses: Session): boolean {
  const key = pairKey(partition, id);
  if (appliedPairs.has(key)) return true;
  // Marked BEFORE the call: an attacher that throws half-way through has already added listeners, and
  // re-running it on a retry would double them. One failed attach is recoverable; a doubled filter
  // pipeline that cancels every request twice is not.
  appliedPairs.add(key);
  try {
    reg.attacher(ses, partition);
    return true;
  } catch (err) {
    if (reg.critical) {
      Logger.error('Critical browsing-session attacher failed — refusing the session', {
        id,
        partition,
        err: String(err),
      });
      throw err;
    }
    Logger.warn('Browsing-session attacher failed', { id, partition, err: String(err) });
    return false;
  }
}

const BrowsingSessions = {
  /**
   * Register per-session wiring. Applied to every browsing session — the ones already live and every one
   * created later. `critical` marks wiring whose absence would be a privacy regression rather than a
   * missing nicety (the request-filtering plane, download quarantine).
   */
  register(id: string, attacher: BrowsingSessionAttacher, opts?: { critical?: boolean }): void {
    const reg: Registration = { attacher, critical: opts?.critical === true };
    registrations.set(id, reg);
    const failures: [string, Error][] = [];
    for (const [partition, ses] of live) {
      try {
        apply(id, reg, partition, ses);
      } catch (err) {
        failures.push([partition, err instanceof Error ? err : new Error(String(err))]);
      }
    }
    // Same rule as `ensure`: a critical attacher that cannot attach to an ALREADY-LIVE session poisons
    // that partition rather than leaving it running half-wired. Applied after the walk, not during it.
    for (const [partition, err] of failures) {
      live.delete(partition);
      poisoned.set(partition, err);
    }
  },

  /**
   * The session for a partition, fully wired. Idempotent: the same partition always returns the same
   * `Session`, and each attacher runs against it exactly once.
   */
  ensure(partition: string): Session {
    const failure = poisoned.get(partition);
    if (failure !== undefined) throw failure;

    const existing = live.get(partition);
    const ses = existing ?? session.fromPartition(partition);
    if (existing === undefined) {
      live.set(partition, ses);
      // A tunnel partition is BLACKHOLED the instant it exists, before anything can be hosted on it.
      // Without this, a partition created but not yet bound has no proxy at all — which in Chromium means
      // DIRECT, i.e. a tab that believes it is tunneled going out the clear path. `ensureTunnelSession`
      // replaces this with the real config only once it has verified the tunnel actually took effect, so
      // the failure mode of every ordering is "requests fail", never "requests leak".
      if (BrowsingSessions.isTunnelPartition(partition)) {
        void ses.setProxy(BLACKHOLE_PROXY_CONFIG).catch((err: unknown) => {
          Logger.error('Could not blackhole a new tunnel partition', { partition, err: String(err) });
        });
      }
      Logger.info('Browsing session created', { partition, attachers: registrations.size });
    }
    try {
      for (const [id, reg] of registrations) apply(id, reg, partition, ses);
    } catch (err) {
      // A critical attacher failed: refuse this partition for good so nothing can host a tab on a
      // half-wired session, and let the caller decide (a tunnel bind must abort, never fall back to
      // Direct — falling back is the leak).
      live.delete(partition);
      poisoned.set(partition, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
    return ses;
  },

  /** The base, untunneled partition every page used before Phase 5 and every Direct tab still uses. */
  direct(): Session {
    return BrowsingSessions.ensure(DIRECT_PARTITION);
  },

  /**
   * The session a NEW tab should be born on, per the profile-wide default route.
   *
   * Installed by the binding layer (which owns the General binding) rather than read from it here, so
   * this module keeps its one job and there is no import cycle between sessions and bindings. Absent a
   * provider — during startup, or in tests — it is the Direct session, which is the pre-Phase-5 behaviour.
   */
  defaultForNewTab(): Session {
    try {
      return newTabSessionProvider?.() ?? BrowsingSessions.direct();
    } catch (err) {
      // A provider that cannot answer must not silently produce a Direct tab under a tunneled default.
      // Refusing outright is the fail-closed direction; the caller surfaces it rather than opening a tab
      // on a network the user did not choose.
      Logger.error('Default-route provider failed', { err: String(err) });
      throw err;
    }
  },

  /** Install the default-route provider. Called once by the binding layer at startup. */
  setNewTabSessionProvider(provider: (() => Session) | null): void {
    newTabSessionProvider = provider;
  },

  /** Every live browsing session. The iteration order is creation order, base partition first. */
  all(): readonly { partition: string; session: Session }[] {
    return [...live].map(([partition, ses]) => ({ partition, session: ses }));
  },

  /** Is this one of OUR browsing partitions? Guards call sites that must never touch app chrome. */
  isBrowsingPartition(partition: string): boolean {
    return partition === DIRECT_PARTITION || partition.startsWith(TUNNEL_PREFIX);
  },

  /** Is this a tunnel-bound partition, as opposed to the Direct one? Wiring that must differ between the
   *  two — the DNS-prefetch suppression header, for one — asks here rather than pattern-matching itself. */
  isTunnelPartition(partition: string): boolean {
    return partition.startsWith(TUNNEL_PREFIX);
  },

  /**
   * Tear a tunnel partition down for good: wipe its storage, caches and credentials, then forget it.
   *
   * Called when a connection is removed from the pool. Electron can clear a partition's CONTENTS but has
   * no API to delete its directory, so without this a "private" partition outlives the connection it
   * belonged to — the cookies from a VPN/Tor session sitting on disk indefinitely, under a name nothing
   * reads any more, which is the opposite of what the user asked for when they removed it.
   *
   * Refuses the Direct partition outright: that one holds every ordinary tab's cookies and logins, and a
   * "release" reaching it would be a silent mass sign-out.
   */
  async release(partition: string): Promise<void> {
    if (!BrowsingSessions.isTunnelPartition(partition)) {
      throw new Error(`Refusing to release a non-tunnel partition: ${partition}`);
    }
    const ses = live.get(partition);
    live.delete(partition);
    for (const id of registrations.keys()) appliedPairs.delete(pairKey(partition, id));
    if (ses === undefined) return;
    try {
      await ses.clearStorageData();
      await ses.clearCache();
      await ses.clearAuthCache();
      await ses.clearHostResolverCache();
      Logger.info('Tunnel partition released', { partition });
    } catch (err) {
      // Reported, not swallowed: leftover data from a removed tunnel is exactly what the user believed
      // they were deleting, so a failure here is something an operator must be able to see.
      Logger.error('Failed to clear a released tunnel partition', { partition, err: String(err) });
      throw err;
    }
  },

  resetForTests(): void {
    newTabSessionProvider = null;
    registrations.clear();
    live.clear();
    appliedPairs.clear();
    poisoned.clear();
  },
};

export default BrowsingSessions;
