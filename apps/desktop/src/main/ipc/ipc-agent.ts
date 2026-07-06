import { dialog, shell } from 'electron';
import { z } from 'zod';
import { AppError, Logger } from '@tepegoz/libs';
import {
  AGENT_EFFORT_LEVELS,
  IpcChannels,
  isExtensionEnabled,
  PROVIDER_IDS,
  type AgentApprovalRequest,
  type AgentAutonomy,
  type AgentConfig,
  type AgentEvent,
  type AgentEventKind,
  type AgentModelChoice,
  type AgentPlanPreview,
  type AgentRunResult,
  type Preferences,
  type TokenUsageSnapshot,
} from '@tepegoz/desktop-ipc';
import { agentManifest } from '@tepegoz/ext-agent/manifest';
import {
  AgentApprovalResponseSchema,
  AgentNewConversationSchema,
  AgentOpenFileSchema,
  AgentPlanResponseSchema,
  AgentRunIdSchema,
  AgentRunInputSchema,
} from '@tepegoz/desktop-ipc/schemas';
import NotificationHost from '../notifications/notification-host';
import type { ConfirmRequest } from '@tepegoz/capability-plane';
import { TokenLedger } from '@tepegoz/model-gateway';
import { EventJournal } from '@tepegoz/persistence';
import { isRunnableProvider, type AIProvider, type EventType, type Plan } from '@tepegoz/shared-types';
import { randomUUID } from 'node:crypto';
import AgentService, { type PlanApprovalDecision } from '../agent/agent-service.electron';
import { setCurrentAgentRun } from '../agent/browser-host.electron';
import {
  abortAllAgentRunControllers,
  agentRunController,
  hasActiveAgentRun,
  registerAgentRunController,
  unregisterAgentRunController,
} from '../agent/agent-run-lock.electron';
import FileOperationsHost from '../file-operations/file-operations-host';
import { getDb } from '../db/database.electron';
import { mainStrings } from '../lib/i18n-main';
import CredentialVault from '@tepegoz/credential-vault';
import PreferenceStore from '@tepegoz/preferences';
import TabManager from '../tabs';
import { handle, handleAsync, onAction } from './ipc-helpers';

/**
 * Agent run/config + HITL (approval + plan-preview) IPC domain (split out of `ipc.ts`, ADR-0010
 * 250-line cap). Owns the per-run tracking state since only this domain's handlers touch it.
 */

// Agent run + HITL state (registerAgentIpc runs once at startup, so module scope is fine).
let runCounter = 0;
let approvalCounter = 0;
let planCounter = 0;
// Run tracking: the UI state is per group, but the browser driver still targets the focused tab and
// input-action event wiring is process-scoped. Keep execution single-run until browser tools become
// tabId-scoped end to end.
const agentRunByGroup = new Map<string, boolean>();
const pendingApprovals = new Map<string, { runId: string; resolve: (approved: boolean) => void }>();
const pendingPlans = new Map<
  string,
  { runId: string; resolve: (decision: PlanApprovalDecision) => void }
>();

/** Abort every in-flight agent run and unblock any HITL prompt parked on a promise (fail-safe deny),
 *  so quit doesn't race a half-finished run against store/database teardown. Called from before-quit. */
export function abortActiveAgentRuns(): void {
  abortAllAgentRunControllers();
  agentRunByGroup.clear();
  for (const [id, entry] of pendingApprovals) {
    pendingApprovals.delete(id);
    entry.resolve(false);
  }
  for (const [id, entry] of pendingPlans) {
    pendingPlans.delete(id);
    entry.resolve({ approved: false });
  }
}

/** Whether the Agent extension (`com.tepegoz.agent`) is currently enabled. Disabling it is a real
 *  kill-switch: its built-in tools are already unregistered from the CapabilityRegistry (ADR-0024),
 *  and these IPC handlers refuse too, so no agent work can start. */
function agentEnabled(): boolean {
  return isExtensionEnabled(PreferenceStore.getAll().extensions, agentManifest.id);
}

/** Throw a 403 at the boundary when the Agent extension is disabled (for request/response handlers). */
function requireAgentEnabled(): void {
  if (!agentEnabled()) throw new AppError('Agent extension is disabled', 403);
}

function tokenUsage(): TokenUsageSnapshot {
  const t = TokenLedger.totals();
  return { inputTokens: t.inputTokens, outputTokens: t.outputTokens, totalTokens: t.totalTokens };
}

/** Truncated, safe preview of tool args for the HITL modal (never the full payload). */
function safeArgsPreview(args: unknown): string {
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
const JOURNAL_TYPE_BY_KIND: Partial<Record<AgentEventKind, EventType>> = {
  step_start: 'AgentStepExecuted',
  step_ok: 'AgentStepExecuted',
  step_error: 'AgentStepExecuted',
  awaiting_approval: 'HitlRequested',
  handoff: 'HandoffRequested',
  done: 'TaskSucceeded',
  error: 'TaskFailed',
};

/** The effective provider the NEXT run resolves to (mirrors `resolveProvider`, non-throwing for the
 *  panel's display). `local` availability is proxied by "a model is selected" here. */
function effectiveAgentProvider(prefs: Preferences, hasKey: (p: AIProvider) => boolean): AIProvider {
  const localAvailable = prefs.localProvider.selectedModelId !== '';
  const ov = prefs.agentProviderOverride;
  if (ov === 'local' && localAvailable) return 'local';
  if (ov !== null && ov !== 'local' && isRunnableProvider(ov) && hasKey(ov)) return ov;
  if (prefs.localProvider.mode === 'default' && localAvailable) return 'local';
  const top = CredentialVault.topProvider();
  return top !== null && isRunnableProvider(top) ? top : 'anthropic';
}

/** Build the Agent panel's config: selectable providers (with a usable-now flag) + the current choice +
 *  the autonomy level. Data-driven from the vault status + prefs. */
function buildAgentConfig(): AgentConfig {
  const prefs = PreferenceStore.getAll();
  const status = CredentialVault.status();
  const hasKey = (p: AIProvider): boolean => status[p];
  const localModel = prefs.localProvider.selectedModelId;
  const choices: AgentModelChoice[] = [
    { provider: 'anthropic', label: 'Claude', available: hasKey('anthropic') },
    { provider: 'openai', label: 'OpenAI', available: hasKey('openai') },
    {
      provider: 'local',
      label: localModel !== '' ? `Local: ${localModel}` : 'Local',
      available: localModel !== '',
    },
  ];
  return {
    provider: effectiveAgentProvider(prefs, hasKey),
    choices,
    autonomy: prefs.agentAutonomy,
    effort: prefs.agentEffort,
  };
}

/** Register the agent run/config/HITL IPC handlers. */
export function registerAgentIpc(): void {
  // Agent (Do mode). agent:run streams live events back to the SENDER and round-trips HITL approvals;
  // the raw API key and tool args never cross to the renderer (only a truncated preview does).
  handleAsync(IpcChannels.agentRun, async (event, payload): Promise<AgentRunResult> => {
    requireAgentEnabled();
    const { prompt, groupId } = AgentRunInputSchema.parse(payload);
    if (hasActiveAgentRun()) {
      throw new AppError('An agent task is already running', 409);
    }
    if (agentRunByGroup.get(groupId) === true) {
      throw new AppError('An agent task is already running for this group', 409);
    }
    agentRunByGroup.set(groupId, true);
    const sender = event.sender;
    const runId = `run-${String(++runCounter)}`;
    const controller = new AbortController();
    registerAgentRunController(runId, controller);
    const sendEvent = (e: AgentEvent): void => {
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentEvent, e);
    };
    setCurrentAgentRun(runId, groupId, sendEvent);
    const onEvent = (kind: AgentEventKind, message: string, detail?: string): void => {
      sendEvent({
        runId,
        groupId,
        kind,
        message,
        ts: Date.now(),
        ...(detail !== undefined ? { detail } : {}),
      });
      // Project agent events into the Event Journal (append-only audit; DoD "→ Event Journal").
      // message/detail can carry model output (untrusted) — strip secrets/PII BEFORE the write and
      // mark the record accordingly, per the journal schema's redaction contract (plan §13.9).
      const db = getDb();
      const type = JOURNAL_TYPE_BY_KIND[kind];
      if (db !== null && type !== undefined) {
        const safeMessage = Logger.redact(message);
        const safeDetail = detail !== undefined ? Logger.redact(detail) : undefined;
        try {
          EventJournal.append(db, {
            id: randomUUID(),
            type,
            ts: Date.now(),
            actor: 'agent',
            correlationId: runId,
            payload:
              safeDetail !== undefined
                ? { kind, message: safeMessage, detail: safeDetail }
                : { kind, message: safeMessage },
            redacted: true,
          });
        } catch (err) {
          Logger.warn('Journal append failed', { err: String(err) });
        }
      }
      // Human Handoff Controller: surface the handoff across every channel — the user may be looking
      // elsewhere while the agent runs. NotificationHost records it in the center, shows a toast, and
      // raises a native OS notification (all localized, gated on the notifications preference).
      if (kind === 'handoff') {
        NotificationHost.push({
          source: 'agent',
          kind: 'warning',
          title: mainStrings().agent.handoff.notifyTitle,
          body: message,
          channels: ['center', 'toast', 'native'],
        });
      }
    };
    const onCheckpoint: NonNullable<Parameters<typeof AgentService.run>[1]['onCheckpoint']> = (checkpoint) => {
      const db = getDb();
      if (db === null) return;
      let payload: unknown = checkpoint;
      try {
        payload = JSON.parse(Logger.redact(JSON.stringify(checkpoint)));
      } catch {
        payload = checkpoint;
      }
      try {
        EventJournal.append(db, {
          id: randomUUID(),
          type: 'CheckpointWritten',
          ts: Date.now(),
          actor: 'agent',
          correlationId: runId,
          payload,
          redacted: true,
        });
      } catch (err) {
        Logger.warn('Journal checkpoint append failed', { err: String(err) });
      }
    };
    /** Present the standard HITL approval modal and await the user's answer. */
    const promptApproval = (req: ConfirmRequest): Promise<boolean> => {
      const approvalId = `appr-${String(++approvalCounter)}`;
      const request: AgentApprovalRequest = {
        runId,
        groupId,
        approvalId,
        toolName: req.toolName,
        reason: req.policy.reason,
        biometric: req.policy.biometric,
        argsPreview: safeArgsPreview(req.args),
      };
      onEvent('awaiting_approval', `Approval needed: ${req.toolName}`, req.policy.reason);
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentApprovalRequest, request);
      return new Promise<boolean>((resolve) => {
        pendingApprovals.set(approvalId, { runId, resolve });
        setTimeout(() => {
          if (pendingApprovals.delete(approvalId)) resolve(false); // fail-safe deny on no response
        }, 120_000);
      });
    };
    // File tools self-gate on their folder grant mode: an op within the granted mode runs silently,
    // one outside every grant is refused, and an escalation / grant-management tool falls through to the
    // standard approval modal so the user consents. Every other tool goes straight to the modal.
    const requestApproval = async (req: ConfirmRequest): Promise<boolean> => {
      const decision = await FileOperationsHost.consentDecision(req);
      if (decision.type === 'auto') return decision.approved;
      return promptApproval(req);
    };
    const requestPlanApproval = (plan: Plan): Promise<PlanApprovalDecision> => {
      const planId = `plan-${String(++planCounter)}`;
      const preview: AgentPlanPreview = {
        runId,
        groupId,
        planId,
        goal: plan.goal,
        steps: plan.steps.map((s) => ({ id: s.id, tool: s.tool, rationale: s.rationale })),
      };
      if (!sender.isDestroyed()) sender.send(IpcChannels.agentPlanPreview, preview);
      return new Promise<PlanApprovalDecision>((resolve) => {
        pendingPlans.set(planId, { runId, resolve });
        setTimeout(() => {
          if (pendingPlans.delete(planId)) resolve({ approved: false }); // fail-safe reject
        }, 120_000);
      });
    };

    try {
      const summary = await AgentService.run(prompt, {
        onEvent,
        onCheckpoint,
        requestPlanApproval,
        requestApproval,
        signal: controller.signal,
      }, groupId);
      return { runId, stoppedReason: summary.stoppedReason, ok: summary.ok };
    } catch (err) {
      onEvent('error', err instanceof Error ? err.message : 'Agent run failed');
      throw err;
    } finally {
      setCurrentAgentRun(null, null, null);
      unregisterAgentRunController(runId);
      agentRunByGroup.delete(groupId);
      if (!sender.isDestroyed()) sender.send(IpcChannels.tokenUsage, tokenUsage());
    }
  });

  onAction(IpcChannels.agentCancel, AgentRunIdSchema, (runId) => {
    agentRunController(runId)?.abort();
    // Unblock a run parked on a pending HITL prompt so cancel takes effect immediately (not after the
    // 120s fail-safe): reject its plan/approval promises now.
    for (const [id, entry] of pendingApprovals) {
      if (entry.runId === runId) {
        pendingApprovals.delete(id);
        entry.resolve(false);
      }
    }
    for (const [id, entry] of pendingPlans) {
      if (entry.runId === runId) {
        pendingPlans.delete(id);
        entry.resolve({ approved: false });
      }
    }
  });
  onAction(IpcChannels.agentNewConversation, AgentNewConversationSchema, (groupId) => {
    if (!agentEnabled()) return;
    AgentService.newConversation(groupId);
  });

  // Ensure the active tab belongs to a tab group; creates one if needed → { groupId }.
  handleAsync(IpcChannels.agentEnsureGroup, async (): Promise<{ groupId: string }> => {
    requireAgentEnabled();
    const state = TabManager.getState();
    if (state.activeId === null) throw new AppError('No active tab', 409);
    const AgentTabGroup = (await import('../agent/agent-tab-group.electron')).default;
    const groupId = AgentTabGroup.ensureGroupForTab(state.activeId);
    return { groupId };
  });

  // Capture the active page's text selection via executeJavaScript.
  handleAsync(IpcChannels.agentCaptureSelection, async (): Promise<string> => {
    requireAgentEnabled();
    const wc = TabManager.activeWebContents();
    if (wc === null || wc.isDestroyed()) return '';
    const result: unknown = await wc.executeJavaScript(
      'window.getSelection() ? window.getSelection().toString() : ""',
      true,
    );
    return typeof result === 'string' ? result : '';
  });

  // Open a native file picker and read the selected files for agent attachment.
  handleAsync(IpcChannels.agentPickFiles, async () => {
    requireAgentEnabled();
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
    });
    if (canceled || filePaths.length === 0) return [];
    const fs = await import('node:fs/promises');
    const mime = (name: string): string => {
      const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
      const map: Record<string, string> = {
        pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
        json: 'application/json', csv: 'text/csv', html: 'text/html',
        js: 'text/javascript', ts: 'text/typescript', py: 'text/x-python',
      };
      return map[ext] ?? 'application/octet-stream';
    };
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB per file
    const results = await Promise.all(
      filePaths.slice(0, 5).map(async (fp) => {
        const stat = await fs.stat(fp);
        if (stat.size > MAX_SIZE) return null;
        const buf = await fs.readFile(fp);
        const name = fp.slice(Math.max(fp.lastIndexOf('/'), fp.lastIndexOf('\\')) + 1);
        const mimeType = mime(name);
        const isText = mimeType.startsWith('text/') || mimeType === 'application/json';
        return {
          name,
          content: isText ? buf.toString('utf8') : buf.toString('base64'),
          mimeType,
          sizeBytes: stat.size,
        };
      }),
    );
    return results.filter(Boolean);
  });
  onAction(
    IpcChannels.agentApprovalResponse,
    AgentApprovalResponseSchema,
    ({ approvalId, approved }) => {
      const entry = pendingApprovals.get(approvalId);
      if (entry !== undefined) {
        pendingApprovals.delete(approvalId);
        entry.resolve(approved);
      }
    },
  );
  onAction(
    IpcChannels.agentPlanResponse,
    AgentPlanResponseSchema,
    ({ planId, approved, skipStepIds }) => {
      const entry = pendingPlans.get(planId);
      if (entry !== undefined) {
        pendingPlans.delete(planId);
        entry.resolve(skipStepIds !== undefined ? { approved, skipStepIds } : { approved });
      }
    },
  );

  handle(IpcChannels.tokenUsageGet, (): TokenUsageSnapshot => tokenUsage());

  // Agent panel config: current provider + selectable choices + autonomy level, and setters.
  handle(IpcChannels.agentGetConfig, (): AgentConfig => buildAgentConfig());
  handle(IpcChannels.agentSetProvider, (_event, payload): void => {
    const provider = z.enum(PROVIDER_IDS).parse(payload);
    PreferenceStore.update({ agentProviderOverride: provider });
  });
  handle(IpcChannels.agentSetAutonomy, (_event, payload): void => {
    const level: AgentAutonomy = z.enum(['ask', 'act', 'auto']).parse(payload);
    PreferenceStore.update({ agentAutonomy: level });
  });
  handle(IpcChannels.agentSetEffort, (_event, payload): void => {
    const level = z.enum(AGENT_EFFORT_LEVELS).parse(payload);
    PreferenceStore.update({ agentEffort: level });
  });
  // Open a file the agent produced — gated to the whitelisted folders (403 → refused + logged, never
  // opens outside a grant). Fire-and-forget; the async open runs off the handler.
  onAction(IpcChannels.agentOpenFile, AgentOpenFileSchema, (path) => {
    if (!agentEnabled()) return;
    void (async () => {
      try {
        const real = await FileOperationsHost.assertOpenablePath(path);
        await shell.openPath(real);
      } catch (err) {
        Logger.warn('Refused to open agent file', { path, err: String(err) });
      }
    })();
  });
}
