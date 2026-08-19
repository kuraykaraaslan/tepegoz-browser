import type { CanonMessage } from '@tepegoz/model-gateway';
import type { InvokeContext } from '@tepegoz/capability-plane';
import type {
  AgentWorkingState,
  AIProvider,
  CompletionEvidence,
  CompletionOutcome,
  ToolDescriptor,
} from '@tepegoz/shared-types';
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
  /**
   * Typed evidence assembled from the run's own step results (S4): network verdicts, page checks, and
   * whether any state-changing action happened at all.
   *
   * The point is that the validator stops taking the page's word for it. A `"Saved!"` toast painted over
   * a 5xx used to PASS, because the only completion signal was visible text.
   */
  evidence: CompletionEvidence;
}
export interface CompletionVerdict {
  done: boolean;
  /**
   * What the evidence supported (S4). `attempted_unverified` and `contradicted` are both not-done, but
   * they are different facts: one is "I could not confirm it", the other is "the server said no".
   */
  outcome?: CompletionOutcome;
  /** The authoritative final answer when `done` — wired to the run summary. */
  finalAnswer?: string;
  /** Why not done (fed back to the actor as guidance to continue). */
  reason?: string;
}

/**
 * No-progress replan hook (C1 PR2 / `s14`). Fired when the world has not moved across N acting steps — the
 * loop is stuck taking DIFFERENT-but-ineffective actions (the identical-args loop detector can't see this).
 * The hook re-invokes the Planner with fresh evidence to propose a genuinely NEW approach; the reactor
 * injects that as guidance and the run continues, instead of grinding out the step budget or failing closed.
 * This is the *trigger + a single replan pass*; the full Replanner authority is [C2](phase-ai-c2).
 */
export interface ReplanContext {
  goal: string;
  /** The actor's typed working ledger (C1 PR1) — what it has done and what is pending. */
  workingState: AgentWorkingState;
  /** The actor's free-text progress ledger (`memory`). */
  memory: string;
  /** Compact tail of recent page observations — the ground-truth evidence to replan against. */
  recentObservations: readonly string[];
  /** Why the replan fired (e.g. "no observable page-state change across 6 acting steps"). */
  reason: string;
}
export interface ReplanResult {
  /** A concrete NEW approach to try — injected verbatim as a steer. Empty ⇒ nothing usable, no injection. */
  guidance: string;
}

export interface ReactOptions {
  maxSteps?: number;
  loopThreshold?: number;
  /**
   * M1: cap on IDENTICAL CONSECUTIVE read-only calls (same tool + args, back to back). Reads are exempt
   * from the run-global loop detector by design (re-reading after each action is the encouraged
   * state-every-step pattern) — but that exemption let a live trial burn 22 consecutive
   * `browser_get_elements` calls unpunished. At the cap the actor gets ONE structured nudge; a further
   * identical consecutive read stops the run as `loop_detected`. Any different call resets the streak.
   * Default 5.
   */
  readLoopThreshold?: number;
  /**
   * The completion validator (AI-3). Present ⇒ the actor's `finish` is only a claim; the validator is
   * the sole terminator. Absent ⇒ legacy behaviour (the actor's `finish` ends the run directly).
   */
  validateCompletion?: (ctx: CompletionContext) => Promise<CompletionVerdict>;
  /** Cadence for the periodic validator pass (in actions taken). Default 3. */
  planningInterval?: number;
  /**
   * C1 PR2 no-progress replan. When supplied AND `noProgressThreshold` consecutive state-changing actions
   * pass with no observable page-state change, the reactor asks this hook for a NEW approach and injects it
   * as guidance (fail-open: a hook error is swallowed, the run continues). Absent ⇒ the loop runs exactly as
   * before. Bounded by `maxReplans` so a persistently-stuck run still terminates on the step budget.
   */
  replan?: (ctx: ReplanContext) => Promise<ReplanResult | null>;
  /** Consecutive no-progress acting steps that trigger a replan. Default 6 (past a typical form-fill run so
   *  it does not false-fire on a healthy multi-field form). */
  noProgressThreshold?: number;
  /** Replan passes allowed per run (each resets the no-progress budget). Default 2. */
  maxReplans?: number;
  /**
   * C1 PR3: predicate marking an executed call as an ESCAPE — leaving the current on-page task via a web
   * search or an off-origin navigation. Escape is a DISTINCT failure mode the no-progress detector cannot
   * see (an escape through a read-class tool like `web_search_items` reads as `neutral`, never a `stall`),
   * which is why C1's first sweep found the agent wandering off unpunished. When this returns true the
   * reactor forces the replan to fire on the next step, so the Replanner steers the agent back on-page
   * instead of letting it leave. The semantics (which tools/urls are escapes) live in the host, keeping the
   * reactor generic. Absent ⇒ no escape handling (legacy).
   */
  isEscapeTool?: (tool: string, args: unknown) => boolean;
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
  /**
   * S1 PR5: receives UNSETTLED output fragments as the model produces them, so the UI can show that work
   * is happening instead of waiting a whole step for the first character. Supplying it switches the
   * decision call onto `ModelGateway.generateStream`.
   *
   * A fragment is not a decision: it is unvalidated, possibly half a token, and the loop never reads it.
   * Only the settled response is parsed, journaled, or acted on (ADR-0025). Absent ⇒ the non-streaming
   * path, unchanged.
   */
  onModelDelta?: (delta: string) => void;
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
  /**
   * S1: which transport the decision rides on — `native` (one provider-enforced tool call) or `json`
   * (the legacy JSON-in-text parse). Absent ⇒ resolved from `TEPEGOZ_DECISION_MODE`, defaulting to
   * `auto` (native wherever the registered adapter supports it). Present only so a test can pin an arm
   * without touching process env; the paired sweep flips the env var.
   */
  decisionMode?: 'native' | 'json' | 'auto';
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
