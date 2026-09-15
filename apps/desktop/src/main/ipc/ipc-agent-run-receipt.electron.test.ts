import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `registerAgentRunReceiptIpc` — `agent:export-run-receipt` (Phase 7 NotaryService DoD). Pinned: it
 * requires the agent enabled; 404s with no write attempted when there is no database or no events for
 * the run; fetches the signing key (the FIRST real caller of `NotarySigningKeyStore.getOrCreate()`) and
 * builds a real, standalone-verifiable receipt (this test does not mock `build-run-receipt` or
 * `@tepegoz/notary` — a thin adapter is exactly where a real integration check is cheap); 409s with
 * `buildRunReceipt`'s own refusal reason when the run cannot produce one (unchained / integrity break);
 * and writes + reveals the JSON on success.
 */

const helpers = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, p: unknown) => unknown>(),
}));
vi.mock('./ipc-helpers', () => ({
  handleAsync: (c: string, fn: (e: unknown, p: unknown) => unknown) => helpers.handlers.set(c, fn),
}));

const shell = vi.hoisted(() => ({ showItemInFolder: vi.fn() }));
vi.mock('electron', () => ({ shell }));

vi.mock('@tepegoz/desktop-ipc', () => ({
  IpcChannels: { agentExportRunReceipt: 'agent:export-run-receipt' },
}));
vi.mock('@tepegoz/desktop-ipc/schemas', () => ({
  AgentExportRunReceiptSchema: { parse: (x: unknown) => x },
}));

const journal = vi.hoisted(() => ({ readRecent: vi.fn(() => [] as unknown[]) }));
const meta = vi.hoisted(() => ({ deviceId: vi.fn(() => 'device-1') }));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: journal, MetaStore: meta }));

const getDb = vi.hoisted(() => vi.fn((): unknown => ({})));
vi.mock('../db/database.electron', () => ({ getDb }));

const signingKeyStore = vi.hoisted(() => ({
  getOrCreate: vi.fn(() => ({ privateKeyPem: 'PRIV', publicKeyPem: 'PUB' })),
}));
vi.mock('../notary/notary-signing-key.electron', () => ({ default: signingKeyStore }));

const fsHost = vi.hoisted(() => ({
  writeExport: vi.fn<(filename: string, content: string) => Promise<string>>(() =>
    Promise.resolve('/home/u/tepegoz/receipt.json'),
  ),
}));
vi.mock('../file-operations/file-operations-host', () => ({ default: fsHost }));

const shared = vi.hoisted(() => ({ requireAgentEnabled: vi.fn() }));
vi.mock('./ipc-agent-shared', () => shared);

const { registerAgentRunReceiptIpc } = await import('./ipc-agent-run-receipt');
const { generateSigningKeyPair, selfHashOf, verifyReceipt, GENESIS_HASH } =
  await import('@tepegoz/notary');
const realKeyPair = generateSigningKeyPair();

const call = (payload: unknown) =>
  helpers.handlers.get('agent:export-run-receipt')!({}, payload) as Promise<string>;

/** A REAL chained event, matching what appendChainedEvent would have persisted. */
function chainedEvent(over: Record<string, unknown> = {}, prevHash = GENESIS_HASH) {
  const base = {
    lsn: 1,
    id: 'e1',
    type: 'AgentStepExecuted',
    ts: 1000,
    actor: 'agent',
    correlationId: 'run-1',
    payload: { step: 1 },
    redacted: true,
    deviceId: 'device-1',
    ...over,
  };
  const selfHash = selfHashOf(base, prevHash);
  return { ...base, prevHash, selfHash };
}

beforeEach(() => {
  vi.clearAllMocks();
  helpers.handlers.clear();
  getDb.mockReturnValue({});
  journal.readRecent.mockReturnValue([]);
  meta.deviceId.mockReturnValue('device-1');
  signingKeyStore.getOrCreate.mockReturnValue({ privateKeyPem: 'PRIV', publicKeyPem: 'PUB' });
  fsHost.writeExport.mockResolvedValue('/home/u/tepegoz/receipt.json');
  registerAgentRunReceiptIpc();
});

describe('registerAgentRunReceiptIpc', () => {
  it('requires the agent enabled before doing anything else', async () => {
    shared.requireAgentEnabled.mockImplementationOnce(() => {
      throw new Error('disabled');
    });
    await expect(call({ runId: 'run-1' })).rejects.toThrow('disabled');
    expect(journal.readRecent).not.toHaveBeenCalled();
  });

  it('404s with no signing-key fetch when there is no database', async () => {
    getDb.mockReturnValue(null);
    await expect(call({ runId: 'run-1' })).rejects.toThrow('No events were journaled for this run');
    expect(signingKeyStore.getOrCreate).not.toHaveBeenCalled();
    expect(fsHost.writeExport).not.toHaveBeenCalled();
  });

  it('404s with no signing-key fetch when the run has no events', async () => {
    journal.readRecent.mockReturnValue([]);
    await expect(call({ runId: 'run-1' })).rejects.toThrow('No events were journaled for this run');
    expect(signingKeyStore.getOrCreate).not.toHaveBeenCalled();
  });

  it('409s with a clear reason when the run predates chaining (unchained events)', async () => {
    journal.readRecent.mockReturnValue([
      { lsn: 1, id: 'e1', type: 'AgentStepExecuted', ts: 1000, actor: 'agent', correlationId: 'run-1', payload: {}, redacted: true, deviceId: 'device-1' },
    ]);
    await expect(call({ runId: 'run-1' })).rejects.toThrow('predates Notary hash-chaining');
    expect(fsHost.writeExport).not.toHaveBeenCalled();
  });

  it('409s when the stored chain fails integrity verification', async () => {
    const e1 = chainedEvent({ lsn: 1, id: 'e1', ts: 1000 });
    const e2 = chainedEvent({ lsn: 2, id: 'e2', ts: 2000 }, e1.selfHash);
    // Tamper e2's payload without recomputing its selfHash — a raw DB edit.
    journal.readRecent.mockReturnValue([e1, { ...e2, payload: { step: 999 } }]);
    await expect(call({ runId: 'run-1' })).rejects.toThrow('failed integrity verification');
  });

  it('fetches the device signing key and writes + reveals a real, standalone-verifiable receipt', async () => {
    signingKeyStore.getOrCreate.mockReturnValue(realKeyPair);
    const e1 = chainedEvent({ lsn: 1, id: 'e1', ts: 1000 });
    journal.readRecent.mockReturnValue([e1]);

    const full = await call({ runId: 'run-1' });

    expect(journal.readRecent).toHaveBeenCalledWith({}, 1000, 'run-1');
    expect(signingKeyStore.getOrCreate).toHaveBeenCalledTimes(1);
    expect(full).toBe('/home/u/tepegoz/receipt.json');
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/home/u/tepegoz/receipt.json');
    expect(fsHost.writeExport).toHaveBeenCalledWith(
      expect.stringMatching(/^ai_agent_run_receipt_.*\.json$/),
      expect.any(String),
    );
    const written: unknown = JSON.parse(fsHost.writeExport.mock.calls[0]![1]);
    expect(written).toMatchObject({ correlationId: 'run-1', deviceId: 'device-1' });
    // The whole point: what gets written is a receipt a standalone verifier (nothing but the file)
    // would PASS — not merely well-formed JSON.
    expect(verifyReceipt(written as Parameters<typeof verifyReceipt>[0])).toEqual({ status: 'PASS' });
  });
});
