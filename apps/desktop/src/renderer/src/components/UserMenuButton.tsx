import { useEffect, useRef, useState } from 'react';
import { NAV_BTN } from '@tepegoz/nav-toolbar';
import { UserAvatar } from './UserAvatar';

/** Open-time height (px) for the (placeholder) user menu (profile card + account rows + "Other profiles"
 *  section). The popup is `resizable:false` — it can SHRINK to its measured content but not GROW — so
 *  this MUST be >= the real content height or the surplus scrolls. Set comfortably above the content;
 *  the renderer reports its measured height and main trims the window to fit (see UserMenuPopup), so no
 *  inner scrollbar appears unless the content truly exceeds the work area (screen too short). */
const USER_MENU_HEIGHT = 620;

/**
 * The profile/avatar toolbar button. Opens the user (profile) menu as a NATIVE popup window (see
 * PopupWindowManager) that floats above the live page. PLACEHOLDER menu for now. Re-clicking toggles it;
 * `onPopupClosed` keeps `aria-expanded` in sync (the main-process reopen-guard swallows click-after-blur).
 */
export function UserMenuButton({
  label,
  name,
  pictureUrl,
}: {
  label: string;
  /** Profile name — its initial backs the placeholder avatar until a real picture is available. */
  name: string;
  /** The signed-in user's photo, when available (null/undefined → letter-avatar placeholder). */
  pictureUrl?: string | null;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      window.tepegoz.onPopupClosed((surface) => {
        if (surface === 'user-menu') setOpen(false);
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
      'user-menu',
      { x: r.x, y: r.y, width: r.width, height: r.height },
      { height: USER_MENU_HEIGHT },
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
      <UserAvatar name={name} pictureUrl={pictureUrl ?? null} className="h-6 w-6 text-[11px]" />
    </button>
  );
}
