import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { pollEvaluate } from './poll-evaluate';

/**
 * The page's own "unsaved changes" prompt, measured in the launched app.
 *
 * This file exists because the defect it locks was the **absence of a call**, the class
 * `docs/threat-model.md` names: with no `will-prevent-unload` listener Electron does not fall back to
 * Chromium's "Leave site?" dialog — it cancels the navigation outright and says nothing. A linter, a
 * type checker and a unit test all read the code that IS there, so only a running app can tell you the
 * listener is missing. The spike that found it read `listenersBefore: 0`, `fired: 1`, `ERR_ABORTED`,
 * URL unchanged.
 *
 * The dialog is `dialog.showMessageBoxSync`, which blocks the main process — no harness can dismiss a
 * native modal. So the answer is stubbed **inside the main process** and the spec measures what the app
 * does with it. That is the point being tested anyway: not that a message box can render, but that the
 * navigation outcome follows the user's answer instead of being decided for them.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

const DIRTY = `<!doctype html><html><head><title>dirty</title></head><body>
<input id="f" />
<script>window.addEventListener('beforeunload', (e) => { e.preventDefault(); e.returnValue = ''; });</script>
</body></html>`;

/** The choice indices the broker uses. Kept here so a reordered button list fails this spec. */
const LEAVE = 0;
const STAY = 1;

test('a page with unsaved changes asks, and the answer is honoured', async () => {
  const server: Server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(req.url === '/other' ? '<!doctype html><title>other</title>other' : DIRTY);
  });
  await new Promise<void>((r) => {
    server.listen(0, '127.0.0.1', () => {
      r();
    });
  });
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const dir = join(process.cwd(), '.beforeunload-profile');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${dir}`, appDir],
    env: guiEnv(),
  });
  try {
    // Registering ANY dialog listener turns Playwright's auto-dismiss off. Without it, Playwright and
    // Electron race for the same CDP dialog and the loser's protocol error takes the spec down.
    app.on('window', (p) => {
      p.on('dialog', () => undefined);
    });
    const window = await app.firstWindow();
    for (const p of app.windows()) p.on('dialog', () => undefined);

    const omnibox = window.getByRole('combobox').first();
    await expect(omnibox).toBeVisible();
    await omnibox.fill(`${origin}/`);
    await omnibox.press('Enter');
    await expect
      .poll(
        () =>
          pollEvaluate(
            () =>
              app.evaluate(
                ({ webContents }, n) =>
                  webContents.getAllWebContents().some((w) => w.getURL().includes(n)),
                '127.0.0.1',
              ),
            false,
          ),
        { timeout: 15_000 },
      )
      .toBe(true);

    const run = async (answer: number): Promise<Record<string, unknown>> => {
      await app.evaluate(
        async (electronModule, args) => {
          const { webContents, dialog } = electronModule;
          const g = globalThis as unknown as Record<string, unknown>;
          const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(args.needle));
          if (wc === undefined) throw new Error('the probe page never became a webContents');
          const out: Record<string, unknown> = { asked: 0 };
          g.__unload = out;

          // The listener the app was missing. Asserted as a COUNT because the whole defect was that
          // there were none — "a handler exists" is the property, not "some code was written".
          out.listeners = wc.listenerCount('will-prevent-unload');

          dialog.showMessageBoxSync = ((...boxArgs: unknown[]) => {
            const options = (boxArgs.length > 1 ? boxArgs[1] : boxArgs[0]) as {
              buttons: string[];
              defaultId: number;
              cancelId: number;
            };
            out.asked = (out.asked as number) + 1;
            out.buttons = options.buttons;
            out.defaultId = options.defaultId;
            out.cancelId = options.cancelId;
            return args.answer;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          }) as any;

          // Chromium ignores `beforeunload` without sticky activation, so the page has to be genuinely
          // interacted with or this spec would pass by never firing the event at all.
          wc.focus();
          wc.sendInputEvent({ type: 'mouseDown', x: 30, y: 20, button: 'left', clickCount: 1 });
          wc.sendInputEvent({ type: 'mouseUp', x: 30, y: 20, button: 'left', clickCount: 1 });
          wc.sendInputEvent({ type: 'char', keyCode: 'a' });
          await new Promise((r) => setTimeout(r, 400));
          out.activated = await wc.executeJavaScript('navigator.userActivation.hasBeenActive');
          out.urlBefore = wc.getURL();
          void wc.loadURL(`${args.origin}/other`).catch(() => undefined);
        },
        { needle: '127.0.0.1', origin, answer },
      );

      await new Promise((r) => setTimeout(r, 4000));

      return (await app.evaluate(({ webContents }, needle) => {
        const g = globalThis as unknown as Record<string, unknown>;
        const out = { ...(g.__unload as Record<string, unknown>) };
        const wc = webContents.getAllWebContents().find((w) => w.getURL().includes(needle));
        out.navigated = (wc?.getURL() ?? '').includes('/other');
        return out;
      }, '127.0.0.1')) as Record<string, unknown>;
    };

    // ── "Stay" ────────────────────────────────────────────────────────────────────────────────────
    const stayed = await run(STAY);
    expect(stayed.activated).toBe(true); // otherwise the event never fired and nothing below means anything
    expect(stayed.listeners).toBeGreaterThanOrEqual(1); // the missing handler, now present
    expect(stayed.asked).toBe(1); // the user was ASKED — this app used to decide for them
    expect(stayed.navigated).toBe(false);
    expect(stayed.urlBefore).not.toContain('/other');

    // The safe answer is what Enter picks and what Escape picks. Leaving discards the user's typing;
    // a destructive answer must never be the one a stray keypress selects.
    expect(stayed.defaultId).toBe(STAY);
    expect(stayed.cancelId).toBe(STAY);
    expect((stayed.buttons as string[]).length).toBe(2);

    // ── "Leave" ───────────────────────────────────────────────────────────────────────────────────
    const left = await run(LEAVE);
    expect(left.asked).toBe(1);
    // The half that was outright broken: before this, answering "leave" was not even possible — the
    // navigation was cancelled no matter what, forever.
    expect(left.navigated).toBe(true);
  } finally {
    await app.close();
    server.close();
  }
});
