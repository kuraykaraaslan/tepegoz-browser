import type { WebContents } from 'electron';
import { z } from 'zod';
import type { StyleProbe } from '@tepegoz/browser-tools';
import { buildStyleProbeExpression } from './style-probe-script.js';
import type { RefTarget } from './cdp-driver-schemas.electron.js';

/**
 * P3-d — the style/box-model half of the read-only dev-diagnostics trio, behind `browser_get_styles`.
 *
 * Deliberately the ODD ONE OUT among the three: `console-recorder.electron.ts` subscribes to an ordinary
 * `webContents` event, and `cdp-driver-network.electron.ts` rings the CDP `Network` domain that
 * click/fill already need attached anyway — but reading ONE already-identified element's computed style
 * needs neither. This file never touches `webContents.debugger` — no attach, no enabled domain, no CDP
 * command of any kind — so ADR-0029 is not merely "untouched" the way it is for the console reader, there
 * is nothing here that COULD touch it. The read runs via `executeJavaScriptInIsolatedWorld`, Electron's
 * own per-frame API, entirely separate from the DevTools protocol.
 *
 * The element is addressed by the SAME `ref` space `browser_update_page` acts on: `target` is the
 * `RefTarget` the driver's last render-DOM snapshot stored for that ref (read as plain data by the
 * caller, via `CdpDriver.refTargetFor` — no CDP call). Only a `path`-carrying target (render-DOM
 * perception, the default) can be resolved here; a `backendNodeId`-only target (the accessibility-tree
 * fallback, `TEPEGOZ_PERCEPTION=a11y`) carries no such path, and this honestly returns `null` rather than
 * reaching for CDP to make it work.
 */

const STYLE_PROBE_WORLD_ID = 1000;

/** The page's own probe result, `safeParse`d at this boundary like every other page-controlled payload —
 *  a malformed shape (an old/mismatched injected script, a hostile page redefining a global) degrades to
 *  "not found" rather than throwing or being trusted as-is. */
const StyleProbeResultSchema = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false) }),
  z.object({
    found: z.literal(true),
    display: z.string(),
    visibility: z.string(),
    opacity: z.string(),
    position: z.string(),
    zIndex: z.string(),
    color: z.string(),
    backgroundColor: z.string(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    visible: z.boolean(),
  }),
]);

/**
 * Probe one element's computed style + box model, or `null` when it cannot be resolved WITHOUT CDP
 * (unknown/stale ref, a target with no child-index path, a destroyed tab, or a malformed page result).
 * Never throws — a diagnostics nicety must not be able to break driving.
 */
export async function styleOfRef(
  wc: WebContents,
  target: RefTarget | undefined,
): Promise<StyleProbe | null> {
  if (target === undefined || !('path' in target)) return null;
  if (wc.isDestroyed()) return null;
  try {
    const raw: unknown = await wc.executeJavaScriptInIsolatedWorld(STYLE_PROBE_WORLD_ID, [
      { code: buildStyleProbeExpression(target.path) },
    ]);
    const parsed = StyleProbeResultSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.found) return null;
    const data = parsed.data;
    return {
      display: data.display,
      visibility: data.visibility,
      opacity: data.opacity,
      position: data.position,
      zIndex: data.zIndex,
      color: data.color,
      backgroundColor: data.backgroundColor,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      visible: data.visible,
    };
  } catch {
    return null;
  }
}
