import type { ModelProvider } from '@tepegoz/model-gateway';
import type { ConfirmRequest } from '@tepegoz/capability-plane';
import type { RunControl } from '@tepegoz/orchestrator';
import type { HandoffKind } from '@tepegoz/security-policy';
import type { AIProvider, Plan } from '@tepegoz/shared-types';
import type { AgentEventKind } from '@tepegoz/ext-agent/types';
import type { LocalProviderConfig } from '@tepegoz/local-inference';
import type { AgentRunCheckpoint } from './run-lifecycle';

export interface PlanApprovalDecision {
  approved: boolean;
  /** Step ids the user chose to skip (editable plan preview). */
  skipStepIds?: string[];
}

export interface AgentRunHooks {
  onEvent: (kind: AgentEventKind, message: string, detail?: string) => void;
  /**
   * S1 PR5: receives UNSETTLED model-output fragments while a step runs, so the UI can show progress
   * before the step settles. Absent ⇒ the run is non-streaming, exactly as before. A fragment is never
   * journaled and never influences the loop (ADR-0025).
   */
  onModelDelta?: (delta: string) => void;
  /** Durable checkpoint seam: hosts may project this into the Event Journal for resume/replay. */
  onCheckpoint?: (checkpoint: AgentRunCheckpoint) => void;
  /** HITL before the loop: user reviews/edits the plan; resolve approved=false to abort. */
  requestPlanApproval: (plan: Plan) => Promise<PlanApprovalDecision>;
  /** HITL: resolve true to allow a gated tool call, false to deny. */
  requestApproval: (req: ConfirmRequest) => Promise<boolean>;
  /** Cooperative cancellation, checked between steps. */
  signal: { readonly aborted: boolean };
  /**
   * Composed run-control gate (user pause/resume, connectivity hold, mid-run steering). Additive: when
   * absent the run behaves exactly as before (signal-only). Forwarded verbatim to the reactor.
   */
  control?: RunControl;
}

/**
 * Host-injected seams so the runtime stays Electron- and app-free: a live "active tab URL" reader
 * (Policy Kernel site context) and the localized human-handoff copy (the only user-facing strings the
 * runtime emits that must be localized). The agent's built-in tools (and their concrete browser/journal
 * host) are registered separately at app startup via `ExtensionCapabilityService` (ADR-0021/0024), so
 * they are NOT passed here — this runtime just enumerates the single `CapabilityRegistry`.
 */
export interface AgentRunDeps {
  activeTabUrl: () => string | undefined;
  /** Resolve a browser tab's committed URL for tabId-scoped browser tools. */
  tabUrl?: (tabId: string) => string | undefined;
  /**
   * AI-7 navigation grounding seam: discover the SAME-ORIGIN sitemap page URLs for the page the agent is
   * on, so a conventional path is only proposed when the origin actually publishes it. Injected by the
   * Electron wiring (over `@tepegoz/http`, SSRF-safe by same-origin construction — see web-tools'
   * `createSitemapReader`); absent ⇒ grounding falls back to visible on-page links only. Keeps this
   * package Electron-free.
   */
  discoverSitemap?: (pageUrl: string) => Promise<readonly string[]>;
  /** Localized human-handoff copy, one message per {@link HandoffKind} (captcha / twofa / login). */
  handoffStrings: Record<HandoffKind, string>;
  /**
   * On-device inference config (engine + selected-model resolver). Injected by the Electron wiring;
   * absent when the app didn't wire a local engine, in which case `'local'` routing is unavailable and
   * the run falls back to a cloud provider. Keeps this package Electron-free.
   */
  localInference?: LocalProviderConfig;
  /**
   * Token budget seam (L7): the account-wide total-token quota + the persisted lifetime usage (from
   * the SQLite Token Ledger). Seeds the in-memory ledger AFTER its per-run reset so the live quota
   * indicator + 80% warning reflect CUMULATIVE spend, not just this run. Absent → no quota (unlimited).
   * The host owns persistence + the pre-flight block + auto-refund; this only feeds the live status.
   */
  tokenBudget?: { quota: number; lifetimeUsed: number };
  /**
   * Test/eval seam (AI-1): a pre-resolved model provider. When present, `runAgent` registers this
   * instance directly and SKIPS the vault/prefs resolution — so the eval harness can inject a scripted
   * provider (deterministic fixtures) or a real cloud model (honest competence) without a stored key,
   * while everything else (real BrowserHost, Policy/HITL plane, routing, ledger, egress firewall) runs
   * exactly as in production. Absent → today's behavior (resolve from the safeStorage vault). The `id`
   * drives the ModelRouter's per-capability model choice, unchanged.
   */
  provider?: { id: AIProvider; instance: ModelProvider };
}

export interface AgentRunSummary {
  stoppedReason: string;
  ok: boolean;
  /**
   * What the completion evidence supported (S4). `attempted_unverified` is the product behaving
   * CORRECTLY — refusing to claim a success it cannot back — so a host that reports it must count it as
   * its own category, never as a competence failure.
   */
  completionOutcome?: string | undefined;
  checkpoint?: AgentRunCheckpoint | undefined;
  /** The agent's closing summary for this turn — appended to the conversation memory by the host. */
  summary?: string;
  /**
   * Real per-run token usage read from the process-global {@link TokenLedger} at run end. Additive and
   * optional (absent on early terminal returns like plan_rejected/egress_blocked). Lets the AI-1 eval
   * harness report honest cost instead of the previous hard-coded 0, and any host surface a real total.
   */
  tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;
  /**
   * The per-step tool outcomes of the reactive loop (tool id + ok + optional error + the nav/fetch
   * `targetUrl`, when the call had a `url` arg), in order. Additive and optional. Lets the AI-1 eval
   * harness compute real toolCalls/toolErrors, the AI-7 escape rate (off-origin nav / search), and print
   * a compact failure trace for triage, instead of reconstructing them by parsing event strings.
   */
  steps?:
    | Array<{ tool: string; ok: boolean; error?: string | undefined; targetUrl?: string | undefined }>
    | undefined;
}
