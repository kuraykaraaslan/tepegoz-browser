import { z } from 'zod';

/**
 * How much the agent may do without asking. This is a **security-relevant** setting, so its canonical
 * definition lives here (the single schema source) rather than in a UI package — the main process is
 * the only place allowed to act on it.
 *
 * - `ask` — confirm every gated action (the safe default).
 * - `act` — auto-approve the plan + routine page changes, but STILL pause for anything the policy
 *   kernel marks biometric (destructive / financial / high-risk).
 * - `auto` — hands-off: auto-approve every action the kernel merely asks about.
 * - `dangerous` — reserved, **not user-selectable**; it is deliberately NOT an escalation. Anything
 *   that resolves to this level is treated exactly like `ask` (fail-safe), so a value that leaks in
 *   from a stale preference file or a doctored payload can never widen permissions.
 *
 * At **every** level the `deny` class (e.g. the sensitive-site lockout) still hard-blocks in the main
 * process — autonomy can only skip a prompt the kernel raised, never overturn a denial.
 */
export type AgentAutonomy = 'ask' | 'act' | 'auto' | 'dangerous';

/** Every level the type admits, including the reserved one. */
export const AGENT_AUTONOMY_LEVELS = ['ask', 'act', 'auto', 'dangerous'] as const;

/** The levels a user may actually select. `dangerous` is excluded by design. */
export const SELECTABLE_AGENT_AUTONOMY_LEVELS = ['ask', 'act', 'auto'] as const;

/** Parses any autonomy level, including the reserved `dangerous`. */
export const AgentAutonomySchema = z.enum(AGENT_AUTONOMY_LEVELS);

/** Parses only user-selectable levels — use this on the set-autonomy trust boundary. */
export const SelectableAgentAutonomySchema = z.enum(SELECTABLE_AGENT_AUTONOMY_LEVELS);
