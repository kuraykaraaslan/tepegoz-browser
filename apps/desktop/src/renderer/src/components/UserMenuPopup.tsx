import { useEffect, useRef, useState } from 'react';
import { resolveLocale, type Locale } from '@tepegoz/i18n';
import { I18nProvider, useT } from '@tepegoz/i18n/react';
import { Icon } from '@tepegoz/ui';
import { Menu, type MenuItem } from '@tepegoz/browser-menu';
import { userMenuDict } from '../../../i18n';
import { applyTheme } from '../lib/theme';
import { UserAvatar } from './UserAvatar';

/**
 * Standalone render target for the user (profile) menu popup window (`?surface=user-menu`). Mirrors the
 * MainMenuPopup structure. PLACEHOLDER for now: it reproduces Chrome's profile-menu layout (header card +
 * account/profile actions) but every item is disabled — nothing is wired yet.
 */
export function UserMenuPopup() {
  const [locale, setLocale] = useState<Locale>('en');
  const contentRef = useRef<HTMLDivElement>(null);

  // Shrink the native popup window to the menu's natural content height, removing the empty strip left
  // by the open-time height estimate. Re-measures on content changes (e.g. locale load). Content height
  // is independent of the window height, so reporting it never feeds back into a resize loop. The
  // measured box is `flow-root` (a block-formatting context) so the profile card's top/bottom margins are
  // contained in its bounding rect rather than collapsing out and being under-measured — otherwise the
  // window shrank ~15px too short and the surplus scrolled.
  useEffect(() => {
    const el = contentRef.current;
    if (el === null) return;
    const report = (): void => window.tepegoz.resizePopup(Math.ceil(el.getBoundingClientRect().height));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void window.tepegoz.getPreferences().then(
      (p) => {
        applyTheme(p.theme, p.themeColor);
        setLocale(p.locale === 'en' || p.locale === 'tr' ? p.locale : resolveLocale(navigator.language));
      },
      () => {
        /* bridge unavailable — fall back to defaults */
      },
    );
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.tepegoz.closePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <I18nProvider locale={locale}>
      <div className="flex h-screen flex-col overflow-hidden bg-surface-base text-text-primary">
        <div className="min-h-0 flex-1 overflow-auto">
          <div ref={contentRef} className="flow-root">
            <UserMenuBody />
          </div>
        </div>
      </div>
    </I18nProvider>
  );
}

function UserMenuBody() {
  const t = useT(userMenuDict);

  // Every row is a disabled placeholder for now (nothing wired). Mirrors Chrome's profile menu.
  const items: MenuItem[] = [
    { id: 'passwords', label: t.passwords, icon: <Icon name="key" />, disabled: true },
    { id: 'manage-account', label: t.manageAccount, icon: <Icon name="user" />, disabled: true },
    { id: 'customize', label: t.customizeProfile, icon: <Icon name="edit" />, disabled: true },
    { id: 'sync', label: t.sync, icon: <Icon name="sync" />, disabled: true },
    { id: 'close-profile', label: t.closeProfile, icon: <Icon name="close" />, disabled: true },
    { kind: 'separator' },
    { kind: 'label', id: 'other', text: t.otherProfiles },
    { id: 'add-profile', label: t.addProfile, icon: <Icon name="userPlus" />, disabled: true },
    { id: 'guest', label: t.guestProfile, icon: <Icon name="incognito" />, disabled: true },
    { id: 'manage-profiles', label: t.manageProfiles, icon: <Icon name="users" />, disabled: true },
  ];

  return (
    <div>
      {/* Profile card (aesthetic header) — a raised card with a ringed avatar, name, and email. */}
      <div className="mx-2 mb-1 mt-2 flex flex-col items-center gap-2.5 rounded-xl border border-border bg-surface-raised px-4 pb-4 pt-5">
        <UserAvatar name={t.name} className="h-16 w-16 text-2xl shadow-sm ring-2 ring-border/70" />
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-text-primary">{t.name}</span>
          <span className="mt-0.5 text-xs text-text-secondary">{t.email}</span>
        </div>
      </div>
      <Menu items={items} ariaLabel={t.name} />
    </div>
  );
}
