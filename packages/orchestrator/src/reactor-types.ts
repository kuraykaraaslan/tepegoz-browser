import type { CanonMessage } from '@tepegoz/model-gateway';
import type { InvokeContext } from '@tepegoz/capability-plane';
import type { AIProvider, ToolDescriptor } from '@tepegoz/shared-types';
import type { StepOutcome, StopReason } from './executor';
import type { RunControl } from './run-control';
import type { AgentFailure } from './recovery';

export interface ReactRequest {
  goal: string;
  /** Approved-plan outline shown to the model as guidance (not a rigid script). */
  outline?: string[];
  /** Steps the user pruned from the plan preview — the agent must NOT do these. */
  avoid?: string[];
  tools: Pick<ToolDescriptor, 'id' | 'description' | 'dangerClass'>[];
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Prior conversation turns (earlier user prompts + the agent's closing summaries) so follow-up
   *  messages have context — injected between the system prompt and the current goal. */
  history?: readonly CanonMessage[];
}

/**
 * Completion-authority hook (AI-3 PR2). When supplied, the ACTOR can no longer end the run by itself:
 * its `finish` becomes a *claim* that the validator (a periodic Planner pass) must confirm. Only a
 * `done: true` verdict terminates — supplying the authoritative `finalAnswer`. This is the loop-level
 * fix for premature give-ups ("I couldn't find the blog" after one page).
 */
export interface CompletionContext {
  goal: string;
  /** The actor's latest progress ledger (`memory` field), carried across steps. */
  memory: string;
  /** The actor's `finish` summary when this check was triggered by a completion CLAIM. */
  claimedSummary?: string;
  /** What prompted the check — an actor claim, or the periodic cadence. */
  trigger: 'claim' | 'periodic';
  /** Compact tail of recent observations, so the validator can judge against real page evidence. */
  recentObservations: readonly string[];
}
export interface CompletionVerdict {
  done: boolean;
  /** The authoritative final answer when `done` — wired to the run summary. */
  finalAnswer?: string;
  /** Why not done (fed back to the actor as guidance to continue). */
  reason?: string;
}

export interface ReactOptions {
  maxSteps?: number;
  loopThreshold?: number;
  /**
   * The completion validator (AI-3). Present ⇒ the actor's `finish` is only a claim; the validator is
   * the sole terminator. Absent ⇒ legacy behaviour (the actor's `finish` ends the run directly).
   */
  validateCompletion?: (ctx: CompletionContext) => Promise<CompletionVerdict>;
  /** Cadence for the periodic validator pass (in actions taken). Default 3. */
  planningInterval?: number;
  /** Rejected completion CLAIMS tolerated before conceding to the actor (fail-closed). Default 3. */
  maxCompletionRejects?: number;
  /** Per-call Policy Kernel context (targetUrl for the sensitive-site lockout, taintedArgs). */
  ctxFor?: (tool: string, args: unknown) => InvokeContext;
  signal?: { readonly aborted: boolean };
  /**
   * Composed run-control gate (user pause/resume, connectivity hold, mid-run steering). Additive: when
   * absent the loop runs exactly as before (signal-only). See {@link RunControl}.
   */
  control?: RunControl;
  /** Fired when the model chooses to act, before the tool runs (Agent Console). */
  onDecision?: (tool: string, rationale: string) => void;
  /** Fired after each tool call resolves (drives taint recording + console step events). */
  onOutcome?: (outcome: StepOutcome) => void;
  /** Post-step guard (Human Handoff Controller): return a StopReason to halt (e.g. CAPTCHA/2FA). */
  guard?: (outcome: StepOutcome) => StopReason | null;
  /**
   * AI-7 navigation grounding. After each successful outcome, return a deterministic steer toward a route
   * the agent can actually see or verify (a visible link / sitemap-backed path) — so it navigates there
   * instead of fabricating a URL or bailing to `web_search`. Return null to stay silent (the general
   * system-prompt ordering then governs). Additive: absent ⇒ the loop runs exactly as before. Must not
   * throw (the reactor also fails open to "no hint"). The steer is injected once per distinct hint.
   */
  groundNavigation?: (outcome: StepOutcome, goal: string) => Promise<string | null>;
  /** Bounded self-repair attempts for malformed model decisions. */
  maxDecisionRepairs?: number;
  /** Bounded recovery attempts per failure kind+tool before fail-closed. */
  maxRecoveryAttempts?: number;
}

export interface ReactResult {
  outcomes: StepOutcome[];
  stoppedReason: StopReason;
  failure?: AgentFailure | undefined;
  /** The model's closing summary when it finished on its own. */
  summary?: string;
}
