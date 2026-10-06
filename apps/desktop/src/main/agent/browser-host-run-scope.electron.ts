import { AsyncLocalStorage } from 'node:async_hooks';
import type { AgentEvent, AgentEventKind } from '@tepegoz/desktop-ipc';

export interface RunChannel {
  groupId: string;
  send: (e: AgentEvent) => void;
  /** The tab this run is working in — see {@link resolveRunTab}. Null until the run latches one. */
  currentTabId: string | null;
}

/**
 * Every live run's event channel, keyed by runId — not a single "current run" pointer.
 *
 * A pointer was last-writer-wins: a second run starting re-pointed it, and the first run's
 * out-of-band narration (input actions, pause/resume/steer) would then be delivered to the SECOND
 * run's panel, labelled with the second run's ids. Keyed by runId, each event reaches the run that
 * actually produced it.
 */
const runChannels = new Map<string, RunChannel>();

/**
 * Which run the current async context belongs to.
 *
 * The narration callers (the input adapter, tab ownership) are deep inside the run's own call stack
 * and cannot be handed a runId, so they read it from the ambient scope the same way `ToolGateway`
 * resolves its handlers. Callers that DO know the run (the IPC control handlers) name it explicitly
 * via {@link emitRunEvent} instead of relying on ambience.
 */
const runScope = new AsyncLocalStorage<string>();

/** Called by ipc.ts at the start/end of each agentRun to bind (or release) that run's event channel. */
export function setCurrentAgentRun(
  runId: string | null,
  groupId: string | null,
  send: ((e: AgentEvent) => void) | null,
): void {
  if (runId === null) return; // release is per-run — see releaseAgentRun
  if (groupId === null || send === null) {
    runChannels.delete(runId);
    return;
  }
  runChannels.set(runId, { groupId, send, currentTabId: null });
}

/**
 * Register a run that has no renderer channel (the background task runner). It still needs its own
 * working-tab latch and group, or an unattended task would drive whatever tab the user is looking at.
 */
export function registerHeadlessRun(runId: string, groupId: string): void {
  runChannels.set(runId, { groupId, send: () => undefined, currentTabId: null });
}

/** The ambient run's record, or null outside a run. */
export function currentRunRecord(): RunChannel | null {
  const runId = runScope.getStore();
  if (runId === undefined) return null;
  return runChannels.get(runId) ?? null;
}

/** Point the ambient run at a tab it just opened/activated, so later tabId-less actions follow it. */
export function setRunCurrentTab(tabId: string): void {
  const record = currentRunRecord();
  if (record !== null) record.currentTabId = tabId;
}

/** Drop one run's channel (its handler's teardown path). */
export function releaseAgentRun(runId: string): void {
  runChannels.delete(runId);
}

/** Run `fn` with `runId` as the ambient run, so in-run narration reaches the right panel. */
export function withAgentRunScope<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  return runScope.run(runId, fn);
}

/** The group of the run owning the current async context (tab-ownership checks). */
export function currentGroupId(): string | null {
  return currentRunRecord()?.groupId ?? null;
}

/** Emit a live event on a NAMED run's channel. No-op when that run has no channel bound. */
export function emitRunEvent(
  runId: string,
  kind: AgentEventKind,
  message: string,
  detail?: string,
): void {
  const channel = runChannels.get(runId);
  if (channel === undefined) return;
  channel.send({
    runId,
    groupId: channel.groupId,
    kind,
    message,
    ...(detail !== undefined ? { detail } : {}),
    ts: Date.now(),
  });
}

/** Emit on the run owning the current async context — input-action narration, out-of-band from the
 *  reactor loop. No-op outside a run. */
export function emitCurrentRunEvent(kind: AgentEventKind, message: string, detail?: string): void {
  const runId = runScope.getStore();
  if (runId === undefined) return;
  emitRunEvent(runId, kind, message, detail);
}
