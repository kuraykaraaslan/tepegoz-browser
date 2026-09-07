import { useEffect, useMemo, useState } from 'react';
import { CommandPalette } from '@tepegoz/ext-agent/command-palette';
import type { PaletteCommand, PaletteSources } from '@tepegoz/ext-agent/command-palette-core';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { browserDict } from '../../i18n';
import { INTERNAL_SETTINGS_URL } from '@tepegoz/desktop-ipc';

/**
 * Wires the Command Palette (Ctrl+K) to the app.
 *
 * The palette itself is presentational and knows nothing about the browser — it takes commands per mode
 * and runs them. This is the only place that knows what a command IS, which keeps the palette testable
 * without an Electron bridge and keeps the app free to change what it offers.
 *
 * Ctrl+K is caught in the MAIN process (`@tepegoz/shortcuts` `commandPalette`, `main` scope) and
 * forwarded here over `commandPaletteOpen` — the same shape as `find` and `focusAddressBar`. A renderer
 * `keydown` binding only fired while the chrome had focus, which is a minority of a browser's life; the
 * main path works whether a PAGE or the chrome has focus. The chrome still owns the toggle.
 */
export function CommandPaletteHost({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(browserDict);
  const core = useT(coreDict);

  const sources: PaletteSources = useMemo(() => {
    const chat: PaletteCommand[] = [
      {
        id: 'tab.new',
        title: t.newTab,
        run: () => {
          window.tepegoz.createTab();
        },
      },
      {
        id: 'tab.reopen',
        title: t.reopenTab,
        run: () => {
          window.tepegoz.reopenClosedTab();
        },
      },
      {
        id: 'tab.reload',
        title: t.reload,
        run: () => {
          window.tepegoz.tabReload();
        },
      },
      {
        id: 'app.settings',
        title: core.common.settings,
        run: () => {
          window.tepegoz.navigateTab(INTERNAL_SETTINGS_URL);
        },
      },
    ];
    // Do / Make / Tasks are the agent's modes; they fill in as those surfaces expose commands. Shown as
    // empty rather than hidden, because a mode that appears only sometimes is harder to learn than one
    // that is visibly empty.
    return { chat, do: [], make: [], tasks: [] };
  }, [t]);

  return <CommandPalette open={open} onClose={onClose} sources={sources} />;
}

/** Ctrl/Cmd+K toggles the palette (main forwards the key); the palette also closes itself. */
export function useCommandPalette(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      window.tepegoz.onCommandPaletteOpen(() => {
        // A toggle, not just an open: `before-input-event` fires in every focus context, so a second
        // Ctrl+K while the palette is up closes it — the behaviour the old renderer binding had.
        setOpen((cur) => !cur);
      }),
    [],
  );
  return { open, setOpen };
}
