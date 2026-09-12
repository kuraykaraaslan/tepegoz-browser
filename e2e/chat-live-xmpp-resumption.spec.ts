import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { XmppAdapter, type ChatAccountCreds, type ChatSession } from '@tepegoz/chat-adapters';
import { NodeChatTransport, type RawDuplex } from '@tepegoz/chat-transport-node';
import { startTcpPassthrough, type TcpPassthrough } from './tcp-passthrough';

/**
 * X-chat.1's other live-server Functional DoD line: "Network drop → XEP-0198 resumption (no
 * missed/duplicated messages); a longer outage → clean reconnect + MAM catch-up."
 *
 * Investigating this found that XEP-0198 resumption itself is NOT wired: `StreamManager.resumeXml`
 * / `canResume` / `previd` (`packages/chat-adapters/src/xmpp/stream-management.ts`) are pure,
 * fixture-tested primitives with no caller anywhere in `negotiator.ts` / `adapter.ts` — every
 * reconnect, dropped or not, does a full fresh bind. See the phase doc for that correction. What
 * this test actually proves is the achievable half of the DoD line: a dropped connection is
 * detected, the account does a clean full reconnect, and a message that arrived while it was down
 * is recovered via MAM once the conversation is (re)opened — with no duplicate.
 *
 * Skipped unless `TEPEGOZ_LIVE_XMPP=1` — see `chat-live-xmpp.spec.ts`'s header for how to stand up
 * the local Prosody this needs.
 */
test.skip(process.env.TEPEGOZ_LIVE_XMPP !== '1', 'needs a live local Prosody — see chat-live-xmpp.spec.ts');

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  const testCa = resolve(process.cwd(), '.prosody-test-ca.crt');
  env.NODE_EXTRA_CA_CERTS = testCa;
  return env;
}

/** Bob talks to the real Prosody directly — never through the passthrough — so his side is
 *  unaffected by alice's simulated drop. Mirrors `xmpp-live-prosody.manual.test.ts`'s helper. */
function insecureTransport(): NodeChatTransport {
  return new NodeChatTransport({
    secure: (raw, opts) =>
      new Promise<RawDuplex>((resolvePromise, reject) => {
        const socket: TLSSocket = tlsConnect({
          socket: raw.nodeSocket,
          servername: opts.servername,
          rejectUnauthorized: false,
        });
        socket.once('secureConnect', () => {
          let closeCb: (err?: Error) => void = () => undefined;
          socket.on('error', (err: Error) => closeCb(err));
          socket.on('close', () => closeCb());
          resolvePromise({
            write: (data) => {
              socket.write(data);
            },
            onData: (cb) => socket.on('data', (chunk: Buffer) => cb(new Uint8Array(chunk))),
            onClose: (cb) => {
              closeCb = cb;
            },
            destroy: () => socket.destroy(),
            ...(raw.nodeSocket !== undefined ? { nodeSocket: raw.nodeSocket } : {}),
          });
        });
        socket.once('error', reject);
      }),
  });
}

async function connectBob(): Promise<{ adapter: XmppAdapter; session: ChatSession }> {
  const adapter = new XmppAdapter();
  const creds: ChatAccountCreds = {
    accountId: 'bob',
    secret: 'bobpw123',
    server: { protocol: 'xmpp', jid: 'bob@localhost', host: 'localhost', port: 5222, security: 'starttls', wsUrl: null },
  };
  const session = await adapter.connect(creds, insecureTransport());
  await adapter.setPresence(session, 'online');
  return { adapter, session };
}

async function openChatPage(window: Page): Promise<void> {
  const omnibox = window.getByRole('combobox').first();
  await omnibox.fill('tepegoz://com.tepegoz.chat');
  await omnibox.press('Enter');
  await expect(window.getByRole('tab', { name: 'Chats' })).toBeVisible({ timeout: 20_000 });
}

test('a dropped connection reconnects cleanly, and a message sent during the drop is recovered with no duplicate', async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  const passthrough: TcpPassthrough = await startTcpPassthrough({ host: '127.0.0.1', port: 5222 });
  const bob = await connectBob();
  const profileDir = join(process.cwd(), '.chat-live-xmpp-resumption-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{"locale":"en"}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    const window = await app.firstWindow();
    await expect(window.getByRole('banner')).toBeVisible();
    await openChatPage(window);

    // Add the account through the passthrough, not straight to Prosody — everything alice's client
    // sends or receives crosses this proxy, which is what lets a "network drop" be simulated later
    // without touching the real server.
    await window.getByRole('button', { name: 'Add account' }).click();
    await window.getByLabel('Account name').fill('E2E Alice Resume');
    await window.getByLabel('Jabber ID (JID)').fill('alice@localhost');
    await window.getByLabel('Password').fill('alicepw123');
    await window.getByRole('button', { name: 'Connection settings' }).click();
    await window.getByLabel('Server host').fill('127.0.0.1');
    await window.getByLabel('Port').fill(String(passthrough.port));
    await window.getByLabel('Security').selectOption('starttls');
    await window.getByRole('button', { name: 'Add account' }).click();

    type ChatBridge = {
      listChatAccounts: () => Promise<{ accounts: { id: string }[]; states: Record<string, string> }>;
    };
    const accountId = await window.evaluate(async () => {
      const bridge = (window as unknown as { tepegoz: ChatBridge }).tepegoz;
      const snapshot = await bridge.listChatAccounts();
      return snapshot.accounts[0]?.id ?? null;
    });
    expect(accountId).not.toBeNull();

    const statesOf = (): Promise<Record<string, string>> =>
      window.evaluate(async () => {
        const bridge = (window as unknown as { tepegoz: ChatBridge }).tepegoz;
        return (await bridge.listChatAccounts()).states;
      });
    await expect.poll(async () => (await statesOf())[accountId as string], { timeout: 20_000 }).toBe('online');

    // The app never broadcasts initial presence automatically on connect, and an XMPP resource that
    // has never sent bare `<presence/>` is not "available" for live routing (RFC 6121) — without
    // this, bob's messages below only ever land in alice's MAM archive, never live.
    await window.evaluate(async (id: string) => {
      const bridge = (window as unknown as { tepegoz: { setChatPresence: (a: string, p: string) => Promise<void> } })
        .tepegoz;
      await bridge.setChatPresence(id, 'online');
    }, accountId as string);
    await window.waitForTimeout(500);

    // Prime the conversation: bob sends a first message while alice is fully connected, so there is
    // a real conversation row (and this session's own FK-on-first-DM fix is exercised too) before
    // any drop happens.
    const beforeBody = `before the drop ${String(Date.now())}`;
    await bob.adapter.sendMessage(bob.session, 'alice@localhost', {
      body: beforeBody,
      replyToId: null,
      mediaPath: null,
    });
    // The Chats tab lists the new conversation once the first message lands — the row itself only
    // shows the address + unread count, so open it to see the message body.
    const conversationRow = window.getByRole('button', { name: /bob@localhost/ });
    await expect(conversationRow).toBeVisible({ timeout: 15_000 });
    await conversationRow.click();
    await expect(window.getByText(beforeBody)).toBeVisible({ timeout: 15_000 });

    // ── Simulate the drop: kill the live pipe, Prosody itself and its session stay up ──
    passthrough.dropAll();
    await expect.poll(async () => (await statesOf())[accountId as string], { timeout: 15_000 }).not.toBe('online');

    // While alice is down, bob sends a message that can only ever reach her via MAM catch-up (no
    // XEP-0198 resumption is wired — see the file header) once she reconnects.
    const duringBody = `during the drop ${String(Date.now())}`;
    await bob.adapter.sendMessage(bob.session, 'alice@localhost', {
      body: duringBody,
      replyToId: null,
      mediaPath: null,
    });

    // ── The SAME passthrough listener is still up, so a plain reconnect (full bind, not resume)
    // reaches Prosody again through it and comes back online. ──
    await expect.poll(async () => (await statesOf())[accountId as string], { timeout: 30_000 }).toBe('online');

    // `selectConversation` only fetches history the FIRST time a conversation's message window is
    // seeded — it is a no-op on an already-open one, live pushes aside. There is no manual refresh
    // affordance today, so the only way to force a fresh `getChatHistory` (→ MAM query) is a full
    // remount: navigate away from the extension page and back.
    await window.getByRole('combobox').first().fill('about:blank');
    await window.getByRole('combobox').first().press('Enter');
    await openChatPage(window);

    const reopenedRow = window.getByRole('button', { name: /bob@localhost/ });
    await expect(reopenedRow).toBeVisible({ timeout: 15_000 });
    await reopenedRow.click();
    await expect(window.getByText(beforeBody)).toBeVisible({ timeout: 15_000 });
    await expect(window.getByText(duringBody)).toBeVisible({ timeout: 15_000 });

    // No duplicate of the pre-drop message, and only one copy of the during-drop message.
    expect(await window.getByText(beforeBody).count()).toBe(1);
    expect(await window.getByText(duringBody).count()).toBe(1);
  } finally {
    await app.close();
    await bob.adapter.disconnect(bob.session);
    await passthrough.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
