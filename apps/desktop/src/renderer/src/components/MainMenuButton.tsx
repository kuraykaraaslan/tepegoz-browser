import { useEffect, useRef, useState } from 'react';
import { NAV_BTN } from '@tepegoz/nav-toolbar';

/**
 * The three-dots (hamburger) toolbar button. It opens the main menu as a NATIVE popup window (see
 * PopupWindowManager) that floats above the live page — so, unlike a DOM dropdown, it is never occluded
 * by the tab's WebContentsView and the page stays visible. Re-clicking toggles it off; the main-process
 * reopen-guard swallows the click-after-blur, and `onPopupClosed` keeps `aria-expanded` in sync.
 */
export function MainMenuButton({ label, extensionCount }: { label: string; extensionCount: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      window.tepegoz.onPopupClosed((surface) => {
        if (surface === 'main-menu') setOpen(false);
      }),
    [],
  );

  function onClick(): void {
    const el = ref.current;
    if (el === null) return;
    if (open) {
      window.tepegoz.closePopup();
      setOpen(false);
      return;
    }
    const r = el.getBoundingClientRect();
    window.tepegoz.openPopup(
      'main-menu',
      { x: r.x, y: r.y, width: r.width, height: r.height },
      { height: estimateMenuHeight(extensionCount) },
    );
    setOpen(true);
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={onClick}
      className={NAV_BTN}
    >
      <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="3.2" r="1.3" fill="currentColor" />
        <circle cx="8" cy="8" r="1.3" fill="currentColor" />
        <circle cx="8" cy="12.8" r="1.3" fill="currentColor" />
      </svg>
    </button>
  );
}

/** Estimate the menu's content height so main can size the window; main clamps to the work area and the
 *  content scrolls if it overflows, so this only needs to be close. Mirrors main-menu-model's layout. */
function estimateMenuHeight(extensionCount: number): number {
  const ITEM_ROWS = 21; // fixed item rows (excludes the variable extension list)
  const ROW_H = 36;
  const HEADER_H = 37;
  const ZOOM_H = 40;
  const SEP_H = 9;
  const SEP_COUNT = 6;
  const VPAD = 8;
  return (ITEM_ROWS + extensionCount) * ROW_H + HEADER_H + ZOOM_H + SEP_COUNT * SEP_H + VPAD;
}
