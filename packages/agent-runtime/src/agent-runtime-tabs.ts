import { ToolGateway } from '@tepegoz/capability-plane';
import type { StepOutcome } from '@tepegoz/orchestrator';
import type { AgentRunDeps, AgentRunHooks } from './agent-runtime-types';
import { listTabs, tabIdFromArgs } from './agent-runtime-tool-io';

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
