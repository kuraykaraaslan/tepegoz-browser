import { BrowserWindow } from 'electron';
import { AppError, Logger } from '@tepegoz/libs';
import {
  IpcChannels,
  isExtensionEnabled,
  type AgentEventKind,
  type TokenUsageSnapshot,
} from '@tepegoz/desktop-ipc';
import { agentManifest } from '@tepegoz/ext-agent/manifest';
import { TokenLedger } from '@tepegoz/model-gateway';
import { AgentConversationStore, TokenStore } from '@tepegoz/persistence';
import { AGENT_HISTORY_EVENT_KINDS, type AgentHistoryEventKind } from '@tepegoz/ext-agent/history';
import type { EventType } from '@tepegoz/shared-types';
import { getDb } from '../db/database.electron';
import { mainStrings } from '../lib/i18n-main';
import NotificationHost from '../notifications/notification-host';
import PreferenceStore from '@tepegoz/preferences';
import type { AgentConversationsState } from '@tepegoz/desktop-ipc';
import type { PlanApprovalDecision } from '../agent/agent-service.electron';

/**
 * Shared agent-IPC state + cross-concern helpers (split out of `ipc-agent.ts`, ADR-0010 250-line cap).
 * Owns the per-run tracking state since only this domain's handlers touch it; the maps are module
 * singletons so the run/controls registrars and the facade's `abortActiveAgentRuns` share one instance.
 */

// Run tracking: the UI state is per group, but the browser driver still targets the focused tab and
// input-action event wiring is process-scoped. Keep execution single-run until browser tools become
// tabId-scoped end to end.
export const agentRunByGroup = new Map<string, boolean>();
export const pendingApprovals = new Map<
  string,
  { runId: string; resolve: (approved: boolean) => void }
>();
export const pendingPlans = new Map<
  string,
  { runId: string; resolve: (decision: PlanApprovalDecision) => void }
>();

function listConversationsState(): AgentConversationsState {
  const db = getDb();
  return { items: db === null ? [] : AgentConversationStore.list(db, { limit: 50 }) };
}

export function broadcastConversationsState(): void {
  const state = listConversationsState();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send(IpcChannels.agentConversationsState, state);
    }
  }
}

/** Whether the Agent extension (`com.tepegoz.agent`) is currently enabled. Disabling it is a real
 *  kill-switch: its built-in tools are already unregistered from the CapabilityRegistry (ADR-0024),
 *  and these IPC handlers refuse too, so no agent work can start. */
export function agentEnabled(): boolean {
  return isExtensionEnabled(PreferenceStore.getAll().extensions, agentManifest.id);
}

/** Throw a 403 at the boundary when the Agent extension is disabled (for request/response handlers). */
export function requireAgentEnabled(): void {
  if (!agentEnabled()) throw new AppError('Agent extension is disabled', 403);
}

/** Live token snapshot: this run's counter (in-memory ledger) + the account quota and persisted
 *  lifetime usage (SQLite Token Ledger), so the panel can render the quota indicator + 80% warning. */
export function tokenUsage(): TokenUsageSnapshot {
  const t = TokenLedger.totals();
  const db = getDb();
  const quota = PreferenceStore.getAll().agentTokenQuota;
  const lifetimeTokens = db !== null ? TokenStore.lifetimeTotals(db).totalTokens : 0;
  return {
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    totalTokens: t.totalTokens,
    quota,
    lifetimeTokens,
  };
}

/** Terminal reasons where the run's tokens are auto-refunded (credit preserved): the failure was
 *  outside the user's control — a system/transient error, a CAPTCHA/2FA handoff, or a detected loop. */
export const REFUNDABLE_STOP_REASONS = new Set<string>([
  'handoff',
  'loop_detected',
  'transient_error',
  'navigation_timeout',
  'model_malformed',
  'selector_stale',
  'page_changed',
  'max_steps',
  // Egress Firewall stopped the run (secret in the outbound request) — a security stop, not the user's
  // productive work; don't spend their quota on it.
  'egress_blocked',
]);

/** Raise the localized 80%-quota warning ONCE, on the run that pushes cumulative usage across the
 *  threshold (was below, now at/over). No-op when the quota is off or the threshold was already passed. */
export function maybeWarnQuota(quota: number, usedBefore: number, usedAfter: number): void {
  if (quota <= 0) return;
  const threshold = quota * 0.8;
  if (usedBefore < threshold && usedAfter >= threshold) {
    const strings = mainStrings().agent.quota;
    NotificationHost.push({
      source: 'agent',
      kind: 'warning',
      title: strings.warnTitle,
      body: strings.warnBody,
      channels: ['center', 'toast'],
    });
  }
}

/** Truncated, safe preview of tool args for the HITL modal (never the full payload). */
export function safeArgsPreview(args: unknown): string {
  let s: string | undefined;
  try {
    s = JSON.stringify(args);
  } catch {
    s = String(args);
  }
  s ??= 'undefined';
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

/** Maps a UI agent-event kind to a journal EventType. Unmapped kinds (e.g. 'plan') are not journaled. */
/** Ephemeral run-control kinds (paused/resumed/steered) bypass onEvent, so they're never persisted — this
 *  guard narrows a live event kind to the persisted history subset at the conversation-store boundary. */
export function isHistoryKind(kind: AgentEventKind): kind is AgentHistoryEventKind {
  return (AGENT_HISTORY_EVENT_KINDS as readonly string[]).includes(kind);
}

export const JOURNAL_TYPE_BY_KIND: Partial<Record<AgentEventKind, EventType>> = {
  step_start: 'AgentStepExecuted',
  step_ok: 'AgentStepExecuted',
  step_error: 'AgentStepExecuted',
  awaiting_approval: 'HitlRequested',
  handoff: 'HandoffRequested',
  done: 'TaskSucceeded',
  error: 'TaskFailed',
};
