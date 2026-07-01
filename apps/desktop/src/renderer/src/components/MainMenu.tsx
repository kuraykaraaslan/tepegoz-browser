import { DropdownMenu, type DropdownItem } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';

/**
 * Chrome-style main menu (L9), built on the KUIreact `DropdownMenu` atom. Phase 1a: only WIRED
 * actions are listed — History / Downloads / Bookmarks / Extensions / Zoom / Print etc. arrive in
 * later phases and are intentionally omitted rather than shown as dead entries.
 */
interface MainMenuProps {
  t: Resources;
  onOpenSettings: () => void;
  onOpenAgent: () => void;
}

const ICON = 'h-4 w-4';

function IconNewTab() {
  return (
    <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 6v4M6 8h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function IconReload() {
  return (
    <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13 8 A5 5 0 1 1 11.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M13 2 V5 H10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconAgent() {
  return (
    <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2 l1.4 3.2 L12.6 6.6 9.4 8 8 11.2 6.6 8 3.4 6.6 6.6 5.2 Z" fill="currentColor" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.5 v2 M8 12.5 v2 M1.5 8 h2 M12.5 8 h2 M3.4 3.4 l1.4 1.4 M11.2 11.2 l1.4 1.4 M12.6 3.4 l-1.4 1.4 M4.8 11.2 l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconExit() {
  return (
    <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 2 H3 a1 1 0 0 0-1 1 v10 a1 1 0 0 0 1 1 h3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 5 l3 3 -3 3 M12 8 H6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TRIGGER =
  'flex h-8 w-8 items-center justify-center rounded-md text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

export function MainMenu({ t, onOpenSettings, onOpenAgent }: MainMenuProps) {
  const items: DropdownItem[] = [
    {
      label: t.browser.newTab,
      icon: <IconNewTab />,
      shortcut: 'Ctrl+T',
      onClick: () => {
        window.tepegoz.createTab();
      },
    },
    {
      label: t.browser.reload,
      icon: <IconReload />,
      shortcut: 'Ctrl+R',
      onClick: () => {
        window.tepegoz.tabReload();
      },
    },
    { type: 'separator' },
    { label: t.agentConsole.open, icon: <IconAgent />, onClick: onOpenAgent },
    { label: t.browser.settings, icon: <IconSettings />, shortcut: 'Ctrl+,', onClick: onOpenSettings },
    { type: 'separator' },
    {
      label: t.browser.exit,
      icon: <IconExit />,
      onClick: () => {
        window.tepegoz.closeWindow();
      },
    },
  ];

  return (
    <DropdownMenu
      align="right"
      triggerAriaLabel={t.browser.menu}
      triggerClassName={TRIGGER}
      trigger={
        <svg className={ICON} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="3.2" r="1.3" fill="currentColor" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
          <circle cx="8" cy="12.8" r="1.3" fill="currentColor" />
        </svg>
      }
      items={items}
    />
  );
}
