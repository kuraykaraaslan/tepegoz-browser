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
 * Ctrl+K is bound here rather than in the main process because the main-process shortcut path
 * (`keyboard-shortcuts.ts` → a new IPC channel) runs through `channels.ts` and the preload tab API,
 * both of which currently carry in-flight work. Binding in the renderer covers the case where the chrome
 * has focus, which is where a palette is normally summoned; extending it to fire while a PAGE has focus
 * is the same one-line addition Ctrl+F already makes, and is listed as owed in the phase file.
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

/** Ctrl/Cmd+K opens the palette; the palette closes itself. */
export function useCommandPalette(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey)
        return;
      e.preventDefault();
      setOpen((cur) => !cur);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return { open, setOpen };
}
