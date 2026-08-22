/**
 * Where the window's caption controls come from, per platform.
 *
 * The app is frameless on every platform and draws its own minimize/maximize/close on the right. That
 * is correct on Windows and Linux and wrong on macOS twice over: the close/minimize/zoom buttons belong
 * top-LEFT, and `frame: false` on macOS removes the traffic lights entirely — so the previous build
 * shipped a Mac window with Windows-style buttons on the right and no native ones at all. Users notice
 * this immediately; it is the single clearest "this is not a real Mac app" tell.
 *
 * macOS therefore keeps its native controls (`titleBarStyle: 'hidden'` retains the traffic lights over
 * a frameless-looking window), the renderer draws none, and the title row reserves space on the left so
 * the tab strip does not slide under them.
 *
 * A pure function of the platform string so it is testable from any machine — the layout decision can
 * be checked on Windows CI even though the appearance it produces cannot.
 */
export interface CaptionLayout {
  /** Draw our own minimize/maximize/close on the trailing edge. False on macOS: the OS draws them. */
  showControls: boolean;
  /** Pixels to reserve on the LEADING edge for OS-drawn controls. 0 where the OS draws none. */
  leadingInset: number;
}

/**
 * Width reserved for the macOS traffic lights.
 *
 * 78px is the standard cluster (3 × 12px buttons, 8px apart, ~20px from the window edge) plus a small
 * gap. Reserving too little is the visible failure — the first tab renders underneath the buttons.
 */
const MACOS_TRAFFIC_LIGHTS = 78;

export function captionLayout(platform: string): CaptionLayout {
  return platform === 'darwin'
    ? { showControls: false, leadingInset: MACOS_TRAFFIC_LIGHTS }
    : { showControls: true, leadingInset: 0 };
}
