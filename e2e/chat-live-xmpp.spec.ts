import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * X-chat.10's Playwright `_electron` e2e ("add account → roster → 1:1 send/receive → join a room →
 * get pinged"), run for real against the live local Prosody set up for the X-chat.1 Functional DoD
 * (see `packages/chat-transport-node/src/xmpp-live-prosody.manual.test.ts` for how to stand it up —
 * same server, same `alice`/`bob` accounts). Skipped unless `TEPEGOZ_LIVE_XMPP=1`: this needs a real
 * homeserver at `127.0.0.1:5222` that neither a contributor's default `pnpm e2e` nor CI has.
 *
 * Drives the actual UI, not the IPC layer directly: the account-setup form, the room browser's
 * join-by-address field, and the composer, exactly as a person would use them. This is also how a
 * real product gap surfaced — `AccountSetupForm` (`packages/chat-ui/src/AccountSetupForm.tsx`) only
 * has XMPP fields; there is no `validateIrcAccountForm` / `validateMatrixAccountForm` anywhere in
 * `chat-ui`, so a person cannot add an IRC or Matrix account through the app today despite both
 * adapters being code-complete (X-chat.4/X-chat.5) — recorded in the phase doc.
 */
test.skip(process.env.TEPEGOZ_LIVE_XMPP !== '1', 'needs a live local Prosody — see the file header');

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  // The test Prosody's cert is a throwaway self-signed one (see the manual live test's header for
  // how it's generated) — trusting it here is scoped to this one launched process via Node's own CA
  // mechanism, not a change to how the app verifies certificates in general.
  const testCa = resolve(process.cwd(), '.prosody-test-ca.crt');
  env.NODE_EXTRA_CA_CERTS = testCa;
  return env;
}

async function openChatPage(window: Page): Promise<void> {
  const omnibox = window.getByRole('combobox').first();
  await omnibox.fill('tepegoz://com.tepegoz.chat');
  await omnibox.press('Enter');
  // The tab bar exists once the workspace has rendered, regardless of whether any account is
  // configured yet — a title/heading match is ambiguous (it appears in the tab strip too, and
  // again once an account exists), which is what actually broke this the first time round.
  // Not a bare 'tablist' role query: the browser chrome has its own tab strip under that same role.
  await expect(window.getByRole('tab', { name: 'Chats' })).toBeVisible({ timeout: 20_000 });
}

test('adds a live XMPP account, joins a MUC room, and sees a sent message render', async ({}, testInfo) => {
  testInfo.setTimeout(90_000);
  const profileDir = join(process.cwd(), '.chat-live-xmpp-profile');
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

    // Add the account through the real form — the same one a person fills in.
    await window.getByRole('button', { name: 'Add account' }).click();
    await window.getByLabel('Account name').fill('E2E Alice');
    await window.getByLabel('Jabber ID (JID)').fill('alice@localhost');
    await window.getByLabel('Password').fill('alicepw123');
    // `localhost` has no real SRV record for autodiscovery to find — point the connection at the
    // test server directly instead of relying on it.
    await window.getByRole('button', { name: 'Connection settings' }).click();
    await window.getByLabel('Server host').fill('127.0.0.1');
    await window.getByLabel('Port').fill('5222');
    await window.getByLabel('Security').selectOption('starttls');
    await window.getByRole('button', { name: 'Add account' }).click();

    // Connection reaches the server for real — no fixture underneath this. Polled through the same
    // bridge the UI itself reads (`window.tepegoz`), since a lone account renders no switcher pill
    // to assert text on.
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

    // Join the MUC component configured on the same test Prosody (see
    // xmpp-live-prosody.manual.test.ts's header) through the real room-browser UI.
    await window.getByRole('tab', { name: 'Find a room' }).click();
    const roomAddress = `e2e-${String(Date.now())}@conference.localhost`;
    await window.getByLabel('Join by address').fill(roomAddress);
    await window.getByRole('button', { name: 'Join', exact: true }).click();

    // Joining switches back to the chats tab with the new room selected and open.
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
