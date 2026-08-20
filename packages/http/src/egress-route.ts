import { AppError } from '@tepegoz/libs';

/**
 * Where outbound HTTP made by the APP ITSELF goes — as opposed to a page's traffic, which Electron
 * routes per session.
 *
 * This exists because of a gap Phase 5 never stated. `session.setProxy` governs the network stack
 * Chromium owns: pages, and anything issued through an Electron session. It has no effect whatsoever on
 * axios, which runs on Node's own stack. So every request this package makes — the agent's `web_fetch`
 * and sitemap reads, model-provider calls, MCP HTTP transports — leaves on the clear path no matter
 * what any tab is bound to, and nothing anywhere said so.
 *
 * **The decision recorded here:** app-issued HTTP follows the **General** binding only. Tab and Group
 * bindings are page-scoped by definition — they answer "where does THIS page's traffic go" — and a
 * main-process request has no tab to inherit from. A user who wants everything tunneled sets General;
 * that is the scope whose name already means "the profile-wide default".
 *
 * **And it is fail-closed.** If the policy says a tunnel is in force and no transport has been installed
 * to honour it, {@link resolveEgressAgents} throws. It does NOT quietly send the request direct. That is
 * the same rule as everywhere else in this phase: silently downgrading to the clear path is the leak, and
 * it is worse here than in a tab, because there is no address bar showing the user what happened.
 *
 * There is no SOCKS transport installed today — nothing produces a port yet, since the connection pool
 * is unbuilt — so the policy resolves to `direct` and this is inert. It stops being inert the moment the
 * pool lands, without anyone having to remember this file existed.
 */

export type EgressRoute = { mode: 'direct' } | { mode: 'tunnel'; socksPort: number };

/** Node HTTP agents that carry requests through a tunnel. Typed structurally so this package keeps its
 *  "no Electron, no app imports" boundary and takes no dependency on a specific agent implementation. */
export interface EgressAgents {
  httpAgent: unknown;
  httpsAgent: unknown;
}

export type EgressPolicy = () => EgressRoute;
export type TunnelAgentFactory = (socksPort: number) => EgressAgents;

const DIRECT: EgressRoute = { mode: 'direct' };

let policy: EgressPolicy = () => DIRECT;
let agentFactory: TunnelAgentFactory | null = null;

/**
 * Install the policy that decides where app-issued HTTP goes. Called once by the main process, which is
 * the only place that knows the General binding. Absent an installed policy, everything is Direct —
 * exactly the behaviour before Phase 5.
 */
export function setEgressPolicy(next: EgressPolicy): void {
  policy = next;
}

/**
 * Install the transport that can actually carry a tunneled request (a SOCKS5 agent over the connection's
 * loopback port). Until one is installed, a `tunnel` route is a hard failure rather than a silent
 * downgrade — see {@link resolveEgressAgents}.
 */
export function setTunnelAgentFactory(next: TunnelAgentFactory | null): void {
  agentFactory = next;
}

export function currentEgressRoute(): EgressRoute {
  try {
    return policy();
  } catch {
    // A policy that cannot answer is not evidence that Direct is safe. Refuse rather than guess: the
    // caller sees a thrown AppError from `resolveEgressAgents`, which is recoverable; a leak is not.
    return { mode: 'tunnel', socksPort: 0 };
  }
}

/**
 * The agents to attach to an outbound request, or `null` when the route is Direct.
 *
 * Throws (503) when a tunnel is in force but cannot be honoured. Callers must not catch this into a
 * retry-without-proxy: that would convert a refusal into the leak it exists to prevent.
 */
export function resolveEgressAgents(): EgressAgents | null {
  const route = currentEgressRoute();
  if (route.mode === 'direct') return null;
  if (agentFactory === null) {
    throw new AppError(
      'Outbound request refused: a network tunnel is in force but no tunnel transport is installed',
      503,
    );
  }
  return agentFactory(route.socksPort);
}

export function resetEgressForTests(): void {
  policy = () => DIRECT;
  agentFactory = null;
}
