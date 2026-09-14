import { afterEach, describe, expect, it } from 'vitest';
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEvent } from '@tepegoz/chat-core';
import { BRIDGE_DEFAULT_CAPS, SubprocessChatAdapter, type ChatAccountCreds } from '@tepegoz/chat-adapters';

/**
 * The X-chat.8 Functional DoD, proven against a REAL `node` child process (not `FakeChild`) — the one
 * thing `packages/chat-adapters/src/bridge/subprocess-adapter.test.ts`'s fakes cannot demonstrate.
 * Lives here, not in `@tepegoz/chat-adapters` itself, because that package is contractually Electron-,
 * app-, and Node-free (`dependency-cruiser.cjs`'s `chat-adapters-no-app-no-electron-no-node` rule) —
 * `apps/desktop` is the layer allowed to touch a real `node:child_process`, the same reason
 * `chat-service.electron.test.ts` (real Electron/IO) sits beside `chat-service.test.ts` (pure fakes).
 *
 * Scoped honestly to what the current code actually guarantees (see `process-supervisor.ts` /
 * `subprocess-adapter.ts` docstrings and `phases/extensions/ext-chat.md`'s X-chat.8 status): a real
 * spawn/RPC/lifecycle round trip and real crash isolation between two independently-spawned accounts.
 * It does NOT test filesystem or egress confinement — nothing in this codebase enforces either on an
 * arbitrary child process yet (that's flagged, unbuilt work, not silently assumed).
 */

const scriptPath = fileURLToPath(new URL('./echo-bridge.mjs', import.meta.url));

describe('echo-bridge (real process) — X-chat.8 Functional DoD', () => {
  const children: ChildProcess[] = [];
  const childrenByAccount = new Map<string, ChildProcess>();
  const stateDirs: string[] = [];

  afterEach(async () => {
    // Wait for each real child to actually exit before touching its state dir — on Windows, a
    // just-killed process can hold its cwd's directory handle open for a few ms after `kill()`
    // returns, so an immediate `rmSync` intermittently fails with EPERM.
    await Promise.all(
      children.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) {
              resolve();
              return;
            }
            child.once('exit', () => resolve());
            if (!child.killed) child.kill();
            setTimeout(resolve, 500);
          }),
      ),
    );
    children.length = 0;
    childrenByAccount.clear();
    for (const dir of stateDirs) {
      for (let attempt = 0; ; attempt++) {
        try {
          rmSync(dir, { recursive: true, force: true });
          break;
        } catch (err) {
          if (attempt >= 4) throw err;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }
    stateDirs.length = 0;
  });

  function stateDirFor(accountId: string): string {
    const dir = mkdtempSync(join(tmpdir(), `echo-bridge-${accountId}-`));
    stateDirs.push(dir);
    return dir;
  }

  function make(): SubprocessChatAdapter {
    return new SubprocessChatAdapter({
      spawn: (command, args, env, cwd) => {
        const child = nodeSpawn(command, [...args], { cwd, env: { ...process.env, ...env } });
        children.push(child);
        const accountId = env.TEPEGOZ_BRIDGE_ACCOUNT_ID;
        if (accountId !== undefined) childrenByAccount.set(accountId, child);
        return child;
      },
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
      id: 'bridge:echo',
      capabilities: BRIDGE_DEFAULT_CAPS,
      command: process.execPath,
      args: [scriptPath],
      stateDirFor,
    });
  }

  function creds(accountId: string): ChatAccountCreds {
    return { accountId, server: { protocol: 'bridge', bridgeId: 'echo', config: {} }, secret: 's3cr3t' };
  }

  it('spawns a real child, connects over real stdio, and passes the account state dir as cwd', async () => {
    const adapter = make();
    const session = await adapter.connect(creds('acc-real-1'));
    expect(session).toEqual({ accountId: 'acc-real-1', caps: BRIDGE_DEFAULT_CAPS });
    const child = childrenByAccount.get('acc-real-1');
    expect(child?.spawnfile).toContain('node');
    await adapter.disconnect(session);
  }, 10_000);

  it('a sent message is echoed back as a real event that chat-core normalizeEvent accepts', async () => {
    const adapter = make();
    const session = await adapter.connect(creds('acc-real-2'));
    const iterator = adapter.events(session)[Symbol.asyncIterator]();
    const nextEvent = async (): Promise<unknown> => (await iterator.next()).value as unknown;
    const [receipt, rawEvent] = await Promise.all([
      adapter.sendMessage(session, 'conv-1', { kind: 'text', text: 'hello from a real test' }),
      nextEvent(),
    ]);
    expect(receipt.protocolId).toMatch(/^echo-/);

    const { event, dropped } = normalizeEvent(rawEvent, session.caps);
    expect(dropped).toBeNull();
    if (event?.type !== 'message') throw new Error(`expected a message event, got ${String(event?.type)}`);
    expect(event.message.body).toBe('hello from a real test');
    expect(event.message.conversationId).toBe('conv-1');

    await adapter.disconnect(session);
  }, 10_000);

  it('force-killing one account real child leaves a second, independently-spawned account fully live', async () => {
    const adapter = make();
    const [sessionA, sessionB] = await Promise.all([
      adapter.connect(creds('acc-a')),
      adapter.connect(creds('acc-b')),
    ]);

    // A real, unexpected termination — not `adapter.disconnect()` — proving crash isolation, not just
    // graceful shutdown isolation.
    childrenByAccount.get('acc-a')!.kill('SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 200));

    await expect(adapter.sendMessage(sessionA, 'conv-1', { kind: 'text', text: 'x' })).rejects.toThrow();

    const receipt = await adapter.sendMessage(sessionB, 'conv-1', { kind: 'text', text: 'still alive' });
    expect(receipt.protocolId).toMatch(/^echo-/);

    await adapter.disconnect(sessionB);
  }, 10_000);
});
