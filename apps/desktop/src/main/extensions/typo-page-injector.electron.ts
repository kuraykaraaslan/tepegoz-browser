import { z } from 'zod';
import { type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import TabManager from '../tabs';
import typoHost from './typo-host.electron';
import { typoCss } from './typo-page-injector-theme.electron';
import { TYPO_SCRIPT_HEAD } from './typo-page-injector-script-head.electron';
import { TYPO_SCRIPT_TAIL } from './typo-page-injector-script-tail.electron';

const BINDING = '__tepegozTypoPost';

const TYPO_SCRIPT = `${TYPO_SCRIPT_HEAD}${TYPO_SCRIPT_TAIL}`;

const BindingPayloadSchema = z.object({
  requestId: z.string().min(1).max(64),
  text: z.string().min(1).max(50_000),
  language: z.string().min(1).max(16).optional(),
});

const DebuggerPayloadSchema = z.object({
  name: z.string(),
  payload: z.string(),
});

const listeners = new WeakMap<WebContents, (event: unknown, method: string, params?: unknown) => void>();
let started = false;

function originOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

async function ensureBinding(wc: WebContents): Promise<void> {
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Runtime.enable');
  await wc.debugger.sendCommand('Runtime.addBinding', { name: BINDING }).catch(() => undefined);
  if (listeners.has(wc)) return;
  const listener = (_event: unknown, method: string, params?: unknown): void => {
    if (method !== 'Runtime.bindingCalled') return;
    const parsed = DebuggerPayloadSchema.safeParse(params);
    if (!parsed.success || parsed.data.name !== BINDING) return;
    let payload: z.infer<typeof BindingPayloadSchema>;
    try {
      payload = BindingPayloadSchema.parse(JSON.parse(parsed.data.payload));
    } catch {
      return;
    }
    const origin = originOf(wc.getURL());
    if (origin === undefined || !typoHost.isActiveForPage(origin)) return;
    void typoHost
      .check({ text: payload.text, language: payload.language, origin, aiMode: 'auto' })
      .then((result) => {
        if (wc.isDestroyed()) return;
        const message = JSON.stringify({ requestId: payload.requestId, result });
        return wc.executeJavaScript(`window.__tepegozTypoReceive?.(${message});`, true);
      })
      .catch((err) => {
        Logger.warn('Typo page check failed', { err: String(err) });
      });
  };
  listeners.set(wc, listener);
  wc.debugger.on('message', listener);
  wc.once('destroyed', () => {
    const installed = listeners.get(wc);
    if (installed !== undefined) {
      // The wc is already gone here — its native debugger/message listener is torn down with it.
      // Touching wc.debugger on a destroyed WebContents throws "Object has been destroyed".
      if (!wc.isDestroyed()) wc.debugger.removeListener('message', installed);
      listeners.delete(wc);
    }
  });
}

async function inject(url: string, wc: WebContents): Promise<void> {
  if (wc.isDestroyed() || !typoHost.isActiveForPage(url)) return;
  try {
    await ensureBinding(wc);
    await wc.insertCSS(typoCss()).catch(() => undefined);
    await wc.executeJavaScript(TYPO_SCRIPT, true);
  } catch (err) {
    Logger.warn('Typo page injection failed', { err: String(err) });
  }
}

const TypoPageInjector = {
  start(): void {
    if (started) return;
    started = true;
    TabManager.onNavigation((url, wc) => {
      void inject(url, wc);
    });
  },
};

export default TypoPageInjector;
