/**
 * Chromium/Electron command-line switches shared by the shipping app and the eval harness, kept in one
 * place so the two can never drift. Pure string data (no Electron import) — the consumer decides how to
 * apply it: the main process via `app.commandLine.appendSwitch` (see apps/desktop main), the eval
 * launcher via `electron.launch({ args })` (see @tepegoz/agent-eval).
 */

/** A Chromium switch: a bare flag (`--name`) or a valued flag (`--name=value`). */
export interface ChromiumSwitch {
  readonly name: string;
  readonly value?: string;
}

/**
 * Keep the renderer compositing even when a window/view is occluded, backgrounded, or hidden. Without
 * these, Chromium pauses the compositor for a non-visible surface, which blinds the agent's render-DOM
 * perception (`document.elementFromPoint` returns null → zero actionable elements) and returns empty
 * screenshots. Required so a hidden tab (kept attached-but-occluded) and a tray-hidden window stay
 * perceivable and drivable by the agent. `CalculateNativeWinOcclusion` is Windows-only; the other two
 * are cross-platform. MUST be applied before the app is ready (Chromium reads switches at startup).
 */
export const KEEP_RENDERING_SWITCHES: readonly ChromiumSwitch[] = [
  { name: 'disable-features', value: 'CalculateNativeWinOcclusion' },
  { name: 'disable-backgrounding-occluded-windows' },
  { name: 'disable-renderer-backgrounding' },
];

/** The same switches rendered as CLI args (`--name` / `--name=value`) for spawning Electron externally. */
export const KEEP_RENDERING_SWITCH_ARGS: readonly string[] = KEEP_RENDERING_SWITCHES.map((s) =>
  s.value === undefined ? `--${s.name}` : `--${s.name}=${s.value}`,
);
