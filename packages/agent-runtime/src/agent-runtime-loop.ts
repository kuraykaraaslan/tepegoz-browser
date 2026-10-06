import type { CanonMessage, ModelRouter } from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type InvokeContext } from '@tepegoz/capability-plane';
import {
  buildNavigationGroundingHook,
  Planner,
  Reactor,
  type StepOutcome,
} from '@tepegoz/orchestrator';
import { TaintTracker, isSameSite, registrableDomain } from '@tepegoz/security-policy';
import type { Plan } from '@tepegoz/shared-types';
import {
  checkpointFromOutcome,
  type AgentRunCheckpoint,
  type AgentRunPhase,
} from './run-lifecycle';
import type { AgentRunDeps, AgentRunHooks } from './agent-runtime-types';
import { contentFromResult, tabIdFromArgs, urlFromArgs } from './agent-runtime-tool-io';
import {
  RESUME_AFTER_LOGIN,
  handoffMessageFor,
  perceivedHandoffSignal,
} from './agent-runtime-handoff';
import { advanceTabLifecycle } from './agent-runtime-tabs';

// The handoff and tab-spawn halves live in their own modules; re-exported so this file's public surface
// (and every importer of it) is unchanged.
export { handoffMessageFor, perceivedHandoffSignal } from './agent-runtime-handoff';
export { advanceTabLifecycle, originTabFor, spawnedTabFromResult } from './agent-runtime-tabs';

/** Fill the single `{domain}` placeholder in a localized template (Turkish word order, not concatenation). */
function fillDomain(template: string, domain: string): string {
  return template.replace('{domain}', domain);
}

/**
 * Pure domain-transition decision (S8 PR7 second wave), exported so it is unit-testable without
 * spinning up a full run. Reuses `isSameSite`/`registrableDomain` — the SAME eTLD+1 comparator
 * `plan-grant-scope`/`remembered-grant-scope` already gate coverage with — only to narrate, never to
 * decide anything.
 *
 * `lastUrl` only ever tracks a RESOLVABLE site (never `about:blank`/internal pages), so a transient
 * internal page can be neither the "from" nor the "to" of an announced transition. `announceDomain` is
 * the domain to show, or `null` when nothing should be announced this step; `nextUrl` is what the
 * caller should track forward regardless.
 */
export function nextDomainState(
  lastUrl: string | undefined,
  currentUrl: string | undefined,
): { announceDomain: string | null; nextUrl: string | undefined } {
  if (currentUrl === undefined) return { announceDomain: null, nextUrl: lastUrl };
  const domain = registrableDomain(currentUrl);
  if (domain === null) return { announceDomain: null, nextUrl: lastUrl };
  const announceDomain = lastUrl !== undefined && !isSameSite(lastUrl, currentUrl) ? domain : null;
  return { announceDomain, nextUrl: currentUrl };
}

/**
 * Drive the reactive loop for an approved plan: the plan becomes GUIDANCE (a suggested outline + a list
 * of pruned steps to avoid), and the model reactively picks each next action from the live page through
 * the single ToolGateway PEP (Policy Kernel + HITL). Encapsulates the per-run taint corpus, the
 * Planner-as-validator completion authority, the policy site/taint context, and the Human Handoff
 * Controller. Behavior is identical to the inlined version in {@link runAgent}.
 */
export function runReactiveLoop(args: {
  prompt: string;
  plan: Plan;
  approvedPlan: Plan;
  skip: Set<string>;
  tools: Parameters<typeof Reactor.run>[0]['tools'];
  execRoute: ReturnType<typeof ModelRouter.route>;
  maxTokens: number;
  history: readonly CanonMessage[];
  phase: AgentRunPhase;
  hooks: AgentRunHooks;
  deps: AgentRunDeps;
  emitCheckpoint: (checkpoint: AgentRunCheckpoint) => void;
}): Promise<Awaited<ReturnType<typeof Reactor.run>>> {
  const {
    prompt,
    plan,
    approvedPlan,
    skip,
    tools,
    execRoute,
    maxTokens,
    history,
    phase,
    hooks,
    deps,
  } = args;
  const { emitCheckpoint } = args;

  // Taint corpus for THIS run: web/model text the agent perceives becomes untrusted, so any later
  // side-effecting arg that lifts it escalates to HITL (Policy Kernel `taintedArgs`).
  const taint = new TaintTracker();

  // Domain-transition narration (S8 PR7 second wave): the SAME eTLD+1 comparator plan-grant-scope and
  // remembered-grant-scope already gate coverage with, reused here to NARRATE rather than decide.
  // Seeded from the run's starting tab so the first step never reads as a "transition" from nothing;
  // only a REAL registrable-domain change (never a same-site subdomain hop) is ever announced.
  let lastSiteUrl: string | undefined = deps.activeTabUrl();

  // Tab-spawn world model (S3 PR3): which spawned tab the run is currently following, and where to
  // return once it closes. Reactor-owned, not part of the model-visible working state — the follow
  // decision is this loop's own, never something the model declares. `tabLifecycle` serializes the async
  // updates across steps: `onOutcome` below is fire-and-forget (the reactor does not await it), so
  // without a chain two steps whose bookkeeping overlaps could race on the same `follow` slot.
  let follow: { actingTabId: string; originTabId: string } | undefined;
  let tabLifecycle: Promise<void> = Promise.resolve();

  // The approved plan becomes GUIDANCE for the reactive loop (not a rigid script): its steps are a
  // suggested outline and the pruned steps are things to avoid. Execution is reactive — the model
  // sees each page (via browser_get_elements) and picks the next action, so it can target live
  // element refs and recover from a failed step. Static Executor.run stays for deterministic replays.
  const outline = approvedPlan.steps.map((s) => `- ${s.tool}: ${s.rationale}`);
  const avoid = plan.steps.filter((s) => skip.has(s.id)).map((s) => s.rationale || s.tool);

  const goal = approvedPlan.goal.length > 0 ? approvedPlan.goal : prompt;
  return ToolGateway.runWithHandlers(
    {
      confirmHandler: hooks.requestApproval,
      auditHandler: (entry) => {
        // S6 PR4: a divergence the advisory critic saw is surfaced with the step it belongs to. It did
        // NOT stop the call — recording it beside the action is what makes an advisory plane auditable
        // rather than decorative.
        const divergence =
          entry.critic !== undefined && !entry.critic.aligned
            ? ` — intent divergence: ${entry.critic.reason}`
            : '';
        hooks.onEvent(
          'step_start',
          `${entry.toolName}: ${entry.decision}`,
          `${entry.reason}${divergence}`,
        );
        // Permission Debug (S8 PR7): forward the verdict verbatim. Purely additive — nothing here reads
        // the forwarded entry back, so it cannot change what the gateway decided or who it asked.
        hooks.onAudit?.(entry);
      },
      goal,
    },
    async () => {
      const result = await Reactor.run(
        {
          goal,
          outline,
          avoid,
          tools,
          provider: execRoute.provider,
          model: execRoute.model,
          maxTokens,
          history,
        },
        {
          signal: hooks.signal,
          ...(hooks.control !== undefined ? { control: hooks.control } : {}),
          // Planner-as-validator (AI-3): the actor's `finish` is only a claim — a periodic Planner pass is
          // the sole completion authority, so a premature give-up is challenged and the run continues. The
          // validator call goes through ModelGateway, so the Egress-Firewall inspector + TokenLedger apply.
          // S4: the typed evidence rides along, so the verdict's AUTHORITY is deterministic — a claim the
          // run's own observations contradict cannot be talked into `done` by a page that says otherwise.
          validateCompletion: (ctx) =>
            Planner.validateCompletion({
              goal: ctx.goal,
              memory: ctx.memory,
              claimedSummary: ctx.claimedSummary,
              recentObservations: ctx.recentObservations,
              evidence: ctx.evidence,
              provider: execRoute.provider,
              model: execRoute.model,
              maxTokens,
            }),
          // C1 PR2 no-progress replan: when the reactor detects the world has not moved across N acting steps,
          // ask the Planner for a genuinely NEW approach (through ModelGateway, so Egress + TokenLedger apply)
          // instead of failing closed. Advisory — a null/failed reply leaves the run to continue as before.
          replan: (ctx) =>
            Planner.replan({
              goal: ctx.goal,
              workingState: ctx.workingState,
              memory: ctx.memory,
              recentObservations: ctx.recentObservations,
              reason: ctx.reason,
              provider: execRoute.provider,
              model: execRoute.model,
              maxTokens,
            }),
          // C1 PR3: an ESCAPE = a web search, or a navigation OFF the current tab's origin, while an on-page
          // task is unfinished. The reactor forces its replan on the next step so the agent is steered back
          // on-page instead of wandering off (the verified cause of C1's first-sweep miss). Off-origin is
          // judged against the live active-tab url; a same-origin or in-page nav is NOT an escape.
          isEscapeTool: (tool, args) => {
            if (tool === 'web_search_items') return true;
            if (tool === 'browser_update_location') {
              const target = urlFromArgs(args);
              if (target === undefined) return false;
              const tabId = tabIdFromArgs(args);
              const active = tabId !== undefined ? deps.tabUrl?.(tabId) : deps.activeTabUrl();
              if (active === undefined) return false;
              try {
                return new URL(target).origin !== new URL(active).origin;
              } catch {
                return false;
              }
            }
            return false;
          },
          // AI-7 navigation grounding: after each element read, steer the model toward a route it can see or
          // verify (a visible link / same-origin sitemap-backed path) instead of fabricating a URL or bailing
          // to web_search. The zod boundary + resolver live in orchestrator; `discoverSitemap` is the
          // optional host fetch seam (absent ⇒ visible-link grounding only).
          groundNavigation: buildNavigationGroundingHook(deps.discoverSitemap),
          // Stream model output to the UI while the step runs (ADR-0025). Forwarded verbatim: the runtime
          // adds no meaning to a fragment, and nothing here reads it back.
          ...(hooks.onModelDelta !== undefined ? { onModelDelta: hooks.onModelDelta } : {}),
          // Surface each step's decision rationale as a 'decision' event → the panel's Reasoning section.
          onDecision: (tool, rationale) => {
            if (rationale.length > 0) hooks.onEvent('decision', tool, rationale);
          },
          // The Policy Kernel gets the concrete site + taint of EACH tool call here (this is what
          // makes the sensitive-site lockout and taint→HITL actually fire at runtime).
          ctxFor: (tool, args): InvokeContext => {
            // Falls back to the ACTIVE tab when the call names none (most tab-scoped tools act on
            // "whatever tab the agent is on" implicitly) — without this fallback the egress check below
            // would only ever fire for the minority of calls that pass an explicit tabId.
            const tabId = tabIdFromArgs(args) ?? deps.listTabs?.().find((t) => t.active)?.id;
            const targetUrl =
              urlFromArgs(args) ??
              (tabId !== undefined ? deps.tabUrl?.(tabId) : undefined) ??
              deps.activeTabUrl();
            const ctx: InvokeContext = { taintedArgs: taint.isTainted(args) };
            if (targetUrl !== undefined) ctx.targetUrl = targetUrl;
            if (tabId !== undefined && deps.tabEgressBlocked?.(tabId) === true) {
              ctx.egressBlocked = true;
            }
            // create/upload-style tools require an idempotency key at the PEP. The agent supplies a fresh
            // one per invocation — the reactor's loop detection and each tool's own guards (e.g.
            // file_create_file's exists→409 check) handle accidental repeats.
            if (CapabilityRegistry.get(tool)?.descriptor.requiresIdempotencyKey === true) {
              ctx.idempotencyKey = globalThis.crypto.randomUUID();
            }
            return ctx;
          },
          onOutcome: (o: StepOutcome) => {
            emitCheckpoint(checkpointFromOutcome(phase, o));
            if (o.ok) {
              // Record perceived page text as untrusted for subsequent steps' taint checks.
              const content = contentFromResult(o.result);
              if (content !== undefined) taint.record(content);
              hooks.onEvent('step_ok', `${o.tool} ✓`);
              // A visible "the run changed site" line (S8 PR7 second wave). Checked after EVERY
              // successful step, not just navigation tools, so it catches a site change however it
              // happened (a followed tab-spawn, a redirect, a click).
              const { announceDomain, nextUrl } = nextDomainState(lastSiteUrl, deps.activeTabUrl());
              if (announceDomain !== null) {
                hooks.onEvent(
                  'domain_transition',
                  fillDomain(deps.runtimeStrings.domainTransition, announceDomain),
                );
              }
              lastSiteUrl = nextUrl;
            } else {
              hooks.onEvent('step_error', `${o.tool} ✗`, o.error?.message ?? 'failed');
            }
            // Chained (not fired independently) so this step's follow/return-to-origin can never race the
            // previous step's — see the `tabLifecycle` comment above.
            tabLifecycle = tabLifecycle.then(async () => {
              follow = await advanceTabLifecycle(o, follow, deps, hooks);
            });
          },
          // Human Handoff Controller: a CAPTCHA / 2FA / login wall in a perceived page hands control back
          // to the user — deterministic, NO auto-solve (the agent holds no credentials), credit preserved.
          // A login wall is RESUMABLE in-session: pause and wait for the user to sign in, then continue from
          // the re-perceived (now authenticated) page — the agent must NOT "cleverly" work around the gate.
          // CAPTCHA / 2FA stay terminal (solve-and-restart). Without a run-control (eval/tests) a login wall
          // also terminates, so the harness still sees a definite stop rather than a silent hang.
          guard: (o: StepOutcome) => {
            const signal = perceivedHandoffSignal(o);
            if (signal === null) return null;
            hooks.onEvent('handoff', handoffMessageFor(signal, o, deps));
            if (signal.kind === 'login' && hooks.control !== undefined) {
              hooks.control.enterHandoffHold(RESUME_AFTER_LOGIN);
              hooks.onEvent('paused', 'paused'); // surface the Resume affordance while we wait for sign-in
              return null; // hold at the next step gate — the run is NOT terminated
            }
            return 'handoff';
          },
        },
      );
      // Let any in-flight follow/return-to-origin settle before the run's summary is finalized — still
      // inside the same ToolGateway.runWithHandlers scope, so a trailing `tab_update_item` gets the same
      // confirm/audit handlers as every step that ran before it.
      await tabLifecycle;
      return result;
    },
  );
}
