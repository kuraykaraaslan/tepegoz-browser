import { useEffect, useRef, useState } from 'react';
import { NAV_BTN } from '@tepegoz/nav-toolbar';
import { Icon } from '@tepegoz/ui';

/** Open-time height (px) for the main menu. The popup is `resizable:false`, which on Windows lets the
 *  window SHRINK to its measured content but not GROW — so this MUST be >= the real content height, or
 *  the surplus scrolls. Set comfortably above the actual content (all locales); the renderer reports its
 *  measured height and main trims the window down to fit (see MainMenuPopup), so no inner scrollbar
 *  appears unless the content truly exceeds the work area (screen too short). Extensions/History are
 *  overlay submenus, so list length never affects this. */
const MENU_HEIGHT = 800;

/**
 * The three-dots (hamburger) toolbar button. It opens the main menu as a NATIVE popup window (see
 * PopupWindowManager) that floats above the live page — so, unlike a DOM dropdown, it is never occluded
 * by the tab's WebContentsView and the page stays visible. Re-clicking toggles it off; the main-process
 * reopen-guard swallows the click-after-blur, and `onPopupClosed` keeps `aria-expanded` in sync.
 */
export function MainMenuButton({ label }: { label: string }) {
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
      { height: MENU_HEIGHT },
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
      <Icon name="ellipsisVertical" />
    </button>
  );
}
