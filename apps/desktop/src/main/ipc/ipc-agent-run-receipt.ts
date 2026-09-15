import { shell } from 'electron';
import { AppError } from '@tepegoz/libs';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { AgentExportRunReceiptSchema } from '@tepegoz/desktop-ipc/schemas';
import { EventJournal, MetaStore } from '@tepegoz/persistence';
import { buildRunReceipt, type RunReceiptResult } from '../notary/build-run-receipt';
import NotarySigningKeyStore from '../notary/notary-signing-key.electron';
import { getDb } from '../db/database.electron';
import FileOperationsHost from '../file-operations/file-operations-host';
import { handleAsync } from './ipc-helpers';
import { requireAgentEnabled } from './ipc-agent-shared';

// Same cap as the run-report export — one agentic run does not approach the journal's own 1000-row
// scoped-read ceiling in practice.
const MAX_RUN_RECEIPT_EVENTS = 1000;

const REFUSAL_MESSAGE: Record<Exclude<RunReceiptResult, { ok: true }>['reason'], string> = {
  no_events: 'No events were journaled for this run.',
  not_chained:
    'This run predates Notary hash-chaining and cannot produce a receipt — only runs journaled after ' +
    'the chaining wiring landed carry the prevHash/selfHash a receipt is built from.',
  chain_broken:
    'This run’s journal history failed integrity verification — a stored event no longer matches ' +
    'the hash recorded when it was chained.',
};

/**
 * Register `agent:export-run-receipt` (Phase 7 NotaryService DoD: "Replay Receipt is emitted for a
 * completed task and validated by a standalone tepegoz-verify CLI ... PASS; a tampered event →
 * FAIL/TAMPERED"). The first real caller of `NotarySigningKeyStore.getOrCreate()` — the device signing
 * key generates on first use, right here.
 */
export function registerAgentRunReceiptIpc(): void {
  handleAsync(IpcChannels.agentExportRunReceipt, async (_event, payload): Promise<string> => {
    requireAgentEnabled();
    const { runId } = AgentExportRunReceiptSchema.parse(payload);
    const db = getDb();
    const events = db === null ? [] : EventJournal.readRecent(db, MAX_RUN_RECEIPT_EVENTS, runId);
    if (db === null || events.length === 0) {
      throw new AppError(REFUSAL_MESSAGE.no_events, 404);
    }
    const deviceId = MetaStore.deviceId(db);
    const keyPair = NotarySigningKeyStore.getOrCreate();
    const result = buildRunReceipt(runId, deviceId, events, keyPair);
    if (!result.ok) {
      throw new AppError(REFUSAL_MESSAGE[result.reason], 409);
    }
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const stamp =
      `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
      `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `ai_agent_run_receipt_${stamp}.json`;
    const full = await FileOperationsHost.writeExport(
      filename,
      JSON.stringify(result.receipt, null, 2),
    );
    shell.showItemInFolder(full);
    return full;
  });
}
