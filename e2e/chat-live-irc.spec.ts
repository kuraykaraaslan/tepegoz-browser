import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * The IRC counterpart to `chat-live-xmpp.spec.ts` — X-chat.10's Playwright `_electron` e2e, run for
 * real against the live local `ergo` set up for the X-chat.4 Functional DoD (see
 * `packages/chat-transport-node/src/irc-live-ergo.manual.test.ts` for how to stand it up: a static
 * release binary, no install needed, plaintext loopback listener on `127.0.0.1:6667`). Skipped
 * unless `TEPEGOZ_LIVE_IRC=1`.
 *
 * Only possible once `AccountSetupForm` grew IRC fields (`packages/chat-ui/src/account-form.ts`,
 * `validateIrcAccountForm`) — until then this file's account-setup step had no UI to drive.
 */
test.skip(process.env.TEPEGOZ_LIVE_IRC !== '1', 'needs a live local ergo — see the file header');

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

async function openChatPage(window: Page): Promise<void> {
  const omnibox = window.getByRole('combobox').first();
  await omnibox.fill('tepegoz://com.tepegoz.chat');
  await omnibox.press('Enter');
  // Not a bare 'tablist' role query: the browser chrome has its own tab strip under that same role.
  await expect(window.getByRole('tab', { name: 'Chats' })).toBeVisible({ timeout: 20_000 });
}

test('adds a live IRC account, joins a channel, and sees a sent message render', async ({}, testInfo) => {
  testInfo.setTimeout(90_000);
  const profileDir = join(process.cwd(), '.chat-live-irc-profile');
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

    // Add the account through the real form.
    await window.getByRole('button', { name: 'Add account' }).click();
    await window.getByLabel('Protocol').selectOption('irc');
    await window.getByLabel('Account name').fill('E2E ergo');
    await window.getByLabel('Nickname').fill(`e2e${String(Date.now()).slice(-8)}`);
    await window.getByLabel('Server host').fill('127.0.0.1');
    await window.getByLabel('Port').fill('6667');
    await window.getByLabel('Connect using TLS').uncheck();
    // No password — ergo allows connecting without SASL.
    await window.getByRole('button', { name: 'Add account' }).click();

    // Connection reaches the server for real — polled through the bridge, same reason as the XMPP
    // spec: a lone account renders no switcher pill to assert visible text on.
    await expect
      .poll(
        () =>
          window.evaluate(async () => {
            type ChatBridge = { listChatAccounts: () => Promise<{ states: Record<string, string> }> };
            const bridge = (window as unknown as { tepegoz: ChatBridge }).tepegoz;
            const snapshot = await bridge.listChatAccounts();
            return Object.values(snapshot.states);
          }),
        { timeout: 20_000 },
      )
      .toContain('online');

    // Join a channel through the real room-browser UI — ergo auto-creates an unregistered channel
    // on JOIN, so this needs no prior server-side setup.
    await window.getByRole('tab', { name: 'Find a room' }).click();
    const channel = `#e2e-${String(Date.now())}`;
    await window.getByLabel('Join by address').fill(channel);
    await window.getByRole('button', { name: 'Join', exact: true }).click();

    const composer = window.getByPlaceholder('Write a message…');
    await expect(composer).toBeVisible({ timeout: 20_000 });

    const body = `hello from a live e2e test ${String(Date.now())}`;
    await composer.fill(body);
    await composer.press('Enter');

    await expect(window.getByText(body)).toBeVisible({ timeout: 20_000 });
  } finally {
    await app.close();
  }
});
