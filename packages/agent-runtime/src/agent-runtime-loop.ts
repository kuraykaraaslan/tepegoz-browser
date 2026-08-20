import type { CanonMessage, ModelRouter } from '@tepegoz/model-gateway';
import { CapabilityRegistry, ToolGateway, type InvokeContext } from '@tepegoz/capability-plane';
import {
  buildNavigationGroundingHook,
  Planner,
  Reactor,
  type StepOutcome,
} from '@tepegoz/orchestrator';
import { TaintTracker, detectHandoff } from '@tepegoz/security-policy';
import type { Plan } from '@tepegoz/shared-types';
import {
  checkpointFromOutcome,
  type AgentRunCheckpoint,
  type AgentRunPhase,
} from './run-lifecycle';
import type { AgentRunDeps, AgentRunHooks } from './agent-runtime-types';

/** Model-facing nudge injected (as a steer message) when the user resumes after a login handoff-hold:
 *  re-perceive the now-authenticated page and continue the ORIGINAL task rather than restart. English to
 *  match the other reactor-injected control messages (the model reasons in English internally). */
const RESUME_AFTER_LOGIN =
  'I have completed the sign-in on this page. Re-read the current page with browser_get_elements, then ' +
  'continue the original task from where you left off — do not start over.';

/** Best-effort URL string from a tool call's args (for the sensitive-site lockout). */
function urlFromArgs(args: unknown): string | undefined {
  if (args !== null && typeof args === 'object' && 'url' in args) {
    const url = (args as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return undefined;
}

/** Best-effort tab id string from a tool call's args, for tab-scoped policy context. */
function tabIdFromArgs(args: unknown): string | undefined {
  if (args !== null && typeof args === 'object' && 'tabId' in args) {
    const tabId = (args as { tabId?: unknown }).tabId;
    if (typeof tabId === 'string' && tabId.length > 0) return tabId;
  }
  return undefined;
}

/** The sanitized page text a read tool returned, so it can be recorded as untrusted (taint). */
function contentFromResult(result: unknown): string | undefined {
  if (result !== null && typeof result === 'object' && 'content' in result) {
    const content = (result as { content?: unknown }).content;
    if (typeof content === 'string' && content.length > 0) return content;
  }
  return undefined;
}

/** The url a read tool's result reports (perception snapshot), for handoff/URL-aware checks. */
function urlFromResult(result: unknown): string | undefined {
  if (result !== null && typeof result === 'object' && 'url' in result) {
    const url = (result as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return undefined;
}

/** The tab a `browser_update_page` interaction just opened (its `openedTabs[0]`), if any (S3 PR3). Only
 *  the first is followed — a single interaction spawning more than one tab is not a case any fixture or
 *  real site exercises today. */
export function spawnedTabFromResult(
  result: unknown,
): { id: string; url: string; title: string } | undefined {
  if (result === null || typeof result !== 'object' || !('openedTabs' in result)) return undefined;
  const tabs = (result as { openedTabs?: unknown }).openedTabs;
  // `Array.isArray`'s built-in type predicate narrows to `any[]`, not `unknown[]` — the explicit cast
  // keeps `first` honestly `unknown` below instead of silently reintroducing `any`.
  const first: unknown = Array.isArray(tabs) ? (tabs as unknown[])[0] : undefined;
  if (first === null || typeof first !== 'object') return undefined;
  const { id, url, title } = first as { id?: unknown; url?: unknown; title?: unknown };
  if (typeof id !== 'string' || typeof url !== 'string' || typeof title !== 'string')
    return undefined;
  return { id, url, title };
}

/** `deps.listTabs()`, or `[]` when the host cannot enumerate tabs — one fallback instead of scattering
 *  `?? []` across every caller below. */
function listTabs(
  deps: AgentRunDeps,
): { id: string; url: string; title: string; active: boolean }[] {
  return deps.listTabs?.() ?? [];
}

/** Which tab a spawned tab should be attributed to: the click's own explicit `tabId` when the model gave
 *  one, else whichever tab is active right now. `undefined` when neither is known, or when the "active"
 *  tab already reads as the spawned tab itself — a same-origin foreground click can auto-activate its
 *  new tab before this runs, and guessing an origin in that case would book a return to the wrong tab. */
export function originTabFor(
  spawned: { id: string },
  args: unknown,
  deps: AgentRunDeps,
): string | undefined {
  const origin = tabIdFromArgs(args) ?? listTabs(deps).find((t) => t.active)?.id;
  return origin === undefined || origin === spawned.id ? undefined : origin;
}

/**
 * Tab-spawn world model (S3 PR3): a click/form-submit that opens a new tab is already REPORTED to the
 * model on every call (`browser-tools`' own `openedTabs` note) regardless of what happens here — this
 * only adds a best-effort, POLICY-CHECKED follow so the agent does not have to spend a step re-reading
 * the tab id it was just handed. It runs `tab_update_item` through the exact same `ToolGateway` PEP a
 * model-issued tab switch would get (same HITL/autonomy gate, same audit entry): an attacker-controlled
 * `window.open` still has to clear the Policy Kernel, not walk through a separate fast path. Args are
 * marked TAINTED — the destination was the PAGE's choice, not the agent's — so a side-effecting follow
 * always asks unless the caller's autonomy level already auto-resolves `ask`.
 */
async function followSpawnedTab(
  spawned: { id: string; url: string; title: string },
  originTabId: string,
  deps: AgentRunDeps,
  hooks: AgentRunHooks,
): Promise<{ actingTabId: string; originTabId: string } | undefined> {
  const result = await ToolGateway.invoke(
    'tab_update_item',
    { id: spawned.id },
    { targetUrl: spawned.url, taintedArgs: true },
  );
  const activated =
    result !== null &&
    typeof result === 'object' &&
    (result as { active?: unknown }).active === true;
  if (!activated) {
    hooks.onEvent(
      'tab_spawn',
      deps.tabSpawnStrings.followBlocked,
      `${spawned.title} — ${spawned.url}`,
    );
    return undefined;
  }
  hooks.onEvent('tab_spawn', deps.tabSpawnStrings.opened, `${spawned.title} — ${spawned.url}`);
  return { actingTabId: spawned.id, originTabId };
}

/** Return-to-origin bookkeeping (S3 PR3): once a followed tab is gone (closed by the page, by the
 *  model's own `tab_delete_item`, or by the user), switch back through the same PEP so the agent's
 *  default target is the page it started from — and say so, rather than leaving it silently pointed at
 *  a tab that no longer exists. */
async function returnToOrigin(
  follow: { actingTabId: string; originTabId: string },
  deps: AgentRunDeps,
  hooks: AgentRunHooks,
): Promise<void> {
  const targetUrl = deps.tabUrl?.(follow.originTabId);
  await ToolGateway.invoke(
    'tab_update_item',
    { id: follow.originTabId },
    { ...(targetUrl !== undefined ? { targetUrl } : {}), taintedArgs: false },
  );
  hooks.onEvent('tab_spawn', deps.tabSpawnStrings.returnedToOrigin);
}

/** One step's tab-spawn bookkeeping: return-to-origin first (a followed tab can vanish on ANY later
 *  step, not just the one that closed it), then a fresh follow if this step's own result opened a tab.
 *  Callers must serialize calls per run — see the `tabLifecycle` chain in {@link runReactiveLoop} — since
 *  this reads-then-writes the run's single `follow` slot. */
export async function advanceTabLifecycle(
  outcome: StepOutcome,
  follow: { actingTabId: string; originTabId: string } | undefined,
  deps: AgentRunDeps,
  hooks: AgentRunHooks,
): Promise<{ actingTabId: string; originTabId: string } | undefined> {
  const following = follow;
  if (following !== undefined && !listTabs(deps).some((t) => t.id === following.actingTabId)) {
    await returnToOrigin(following, deps, hooks);
    follow = undefined;
  }
  if (!outcome.ok || follow !== undefined) return follow;
  const spawned = spawnedTabFromResult(outcome.result);
  if (spawned === undefined) return follow;
  const origin = originTabFor(spawned, outcome.args, deps);
  if (origin === undefined) return follow;
  return followSpawnedTab(spawned, origin, deps, hooks);
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
            const tabId = tabIdFromArgs(args);
            const targetUrl =
              urlFromArgs(args) ??
              (tabId !== undefined ? deps.tabUrl?.(tabId) : undefined) ??
              deps.activeTabUrl();
            const ctx: InvokeContext = { taintedArgs: taint.isTainted(args) };
            if (targetUrl !== undefined) ctx.targetUrl = targetUrl;
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
            const content = contentFromResult(o.result);
            if (content === undefined) return null;
            const signal = detectHandoff(content, urlFromResult(o.result));
            if (signal === null) return null;
            hooks.onEvent('handoff', deps.handoffStrings[signal.kind]);
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
