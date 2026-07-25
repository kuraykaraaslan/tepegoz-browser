import { BrowserWindow, type WebContents } from 'electron';
import { z } from 'zod';
import { Logger } from '@tepegoz/libs';
import { IpcChannels, type VideoPlayerPageState } from '@tepegoz/desktop-ipc';
import TabManager from '../tabs';
import videoPlayerHost from './video-player-host.electron';
import { VIDEO_PLAYER_BOOTSTRAP } from './video-player-page-injector-script.electron';
import { VIDEO_PLAYER_EMBED_JS } from './video-player-embed-bundle.electron';

const BINDING = '__tepegozVideoPlayerPost';

const DebuggerPayloadSchema = z.object({ name: z.string(), payload: z.string() });
const BindingPayloadSchema = z.object({
  adopted: z.number().int().min(0).max(500).optional(),
  needBundle: z.boolean().optional(),
  url: z.string().max(4096),
});

const listeners = new WeakMap<WebContents, (event: unknown, method: string, params?: unknown) => void>();
let started = false;

let pageState: VideoPlayerPageState | null = null;

export function getVideoPlayerPageState(): VideoPlayerPageState | null {
  return pageState;
}

function broadcastPageState(state: VideoPlayerPageState | null): void {
  pageState = state;
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(IpcChannels.videoPlayerPageState, state);
  }
}

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function skinOptionsJson(origin: string | null): string {
  return JSON.stringify(videoPlayerHost.skinOptions(origin));
}

async function ensureBinding(wc: WebContents): Promise<void> {
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
  await wc.debugger.sendCommand('Runtime.enable');
  await wc.debugger.sendCommand('Runtime.addBinding', { name: BINDING }).catch(() => undefined);
  if (listeners.has(wc)) return;
  const listener = (_event: unknown, method: string, params?: unknown): void => {
    if (method !== 'Runtime.bindingCalled') return;
    const outer = DebuggerPayloadSchema.safeParse(params);
    if (!outer.success || outer.data.name !== BINDING) return;
    let payload: z.infer<typeof BindingPayloadSchema>;
    try {
      payload = BindingPayloadSchema.parse(JSON.parse(outer.data.payload));
    } catch {
      return;
    }
    const origin = originOf(wc.getURL());
    if (origin === null || !videoPlayerHost.isActiveForPage(origin)) return;
    // The page found an eligible video but the heavy bundle isn't loaded — inject it, then rescan.
    if (payload.needBundle === true) {
      void wc
        .executeJavaScript(VIDEO_PLAYER_EMBED_JS, true)
        .then(() =>
          wc.executeJavaScript(
            'window.__tepegozVideoPlayerRescan&&window.__tepegozVideoPlayerRescan()',
            true,
          ),
        )
        .catch((err) => Logger.warn('Video player bundle injection failed', { err: String(err) }));
    }
    // Only the active tab drives the popup's live "videos on this page" indicator.
    if (wc === TabManager.activeWebContents()) {
      broadcastPageState({
        url: payload.url,
        origin,
        adopted: payload.adopted ?? 0,
        updatedAt: Date.now(),
      });
    }
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
  if (wc.isDestroyed() || !videoPlayerHost.isActiveForPage(url)) return;
  try {
    await ensureBinding(wc);
    await wc.executeJavaScript(VIDEO_PLAYER_BOOTSTRAP, true);
    await wc.executeJavaScript(
      `window.__tepegozVideoPlayerSetEnabled&&window.__tepegozVideoPlayerSetEnabled(true,${skinOptionsJson(originOf(url))})`,
      true,
    );
  } catch (err) {
    Logger.warn('Video player page injection failed', { err: String(err) });
  }
}

async function disableOn(wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return;
  await wc
    .executeJavaScript(
      'window.__tepegozVideoPlayerSetEnabled&&window.__tepegozVideoPlayerSetEnabled(false)',
      true,
    )
    .catch(() => undefined);
  if (wc === TabManager.activeWebContents()) broadcastPageState(null);
}

const VideoPlayerPageInjector = {
  start(): void {
    if (started) return;
    started = true;
    TabManager.onNavigation((url, wc) => {
      void inject(url, wc);
    });
  },

  /** Re-apply the current settings to the active tab: (re)inject + refresh options, or disable. */
  async refreshActive(): Promise<void> {
    const wc = TabManager.activeWebContents();
    if (wc === null || wc.isDestroyed()) return;
    const url = wc.getURL();
    if (videoPlayerHost.isActiveForPage(url)) {
      await inject(url, wc);
      await wc
        .executeJavaScript(
          `window.__tepegozVideoPlayerApplyOptions&&window.__tepegozVideoPlayerApplyOptions(${skinOptionsJson(originOf(url))})`,
          true,
        )
        .catch(() => undefined);
    } else {
      await disableOn(wc);
    }
  },
};

export default VideoPlayerPageInjector;
