import type { WebContents } from 'electron';
import { AppError } from '@tepegoz/libs';

/**
 * Device emulation for the agent's `browser_update_emulation` tool (AI-agent S3 PR7c / browserskill
 * parity P4).
 *
 * Two fixed presets, not arbitrary width/height/UA: the point is checking a page's mobile-responsive
 * PATH, not becoming an arbitrary browser fingerprint, and a preset can't be crafted into a disruptive
 * viewport. `webContents.enableDeviceEmulation` only overrides viewport/scale — it has no user-agent
 * knob, and a page's mobile layout is decided by BOTH (a responsive breakpoint keys off viewport width;
 * a server-rendered mobile page keys off UA sniffing), so both are set together — a viewport-only
 * emulation would still show the desktop path on any site that branches on UA.
 *
 * Touch-event emulation is deliberately NOT covered by this first pass: it needs a CDP call through
 * `CdpDriver`'s existing debugger session, not a plain `WebContents` method, and most responsive-design
 * and UA-sniffing checks do not key off it. Left as a documented gap, not silently dropped.
 */

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ' +
  'Version/17.5 Mobile/15E148 Safari/604.1';

const MOBILE_VIEWPORT = { width: 390, height: 844 };

/** Each currently-emulated tab's ORIGINAL user agent, so switching back to `'desktop'` restores exactly
 *  what a real request would have sent — never a guessed default. An entry is removed the moment it is
 *  restored, or the moment its tab is destroyed while still emulated (never leaks a closed tab's
 *  WebContents past that point). */
const originalUserAgent = new Map<WebContents, string>();

export function setDeviceEmulation(wc: WebContents, device: 'mobile' | 'desktop'): void {
  if (wc.isDestroyed()) throw new AppError('Tab is no longer open', 404);

  if (device === 'mobile') {
    if (!originalUserAgent.has(wc)) {
      originalUserAgent.set(wc, wc.getUserAgent());
      wc.once('destroyed', () => originalUserAgent.delete(wc));
    }
    wc.enableDeviceEmulation({
      screenPosition: 'mobile',
      screenSize: MOBILE_VIEWPORT,
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: 3,
      viewSize: MOBILE_VIEWPORT,
      scale: 1,
    });
    wc.setUserAgent(MOBILE_UA);
    return;
  }

  wc.disableDeviceEmulation();
  const original = originalUserAgent.get(wc);
  if (original !== undefined) {
    wc.setUserAgent(original);
    originalUserAgent.delete(wc);
  }
}
