import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { agentDict } from './i18n';
import {
  PALETTE_MODES,
  clampSelection,
  cycleMode,
  filterCommands,
  moveSelection,
  scrollToIndex,
  visibleWindow,
  type PaletteMode,
  type PaletteSources,
} from './command-palette-core';

/**
 * Command Palette (Ctrl+K) — Chat · Do · Make · Tasks.
 *
 * Presentational: it takes its commands per mode from the host and knows nothing about the app. Every
 * decision that can be silently wrong (what Enter runs after the list re-filters, where ↓ goes at the
 * bottom, which rows are actually in the DOM) lives in `command-palette-core.ts` and is tested there.
 *
 * The list is windowed by hand rather than with a library: it is one fixed-height row repeated, which
 * is the single case where virtualization is a few lines of arithmetic, and a dependency here would be
 * carried by every surface that imports the palette.
 */
const ROW_HEIGHT = 44;
const VIEWPORT_HEIGHT = 320;

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  sources: PaletteSources;
  /** Mode to open in. Defaults to chat. */
  initialMode?: PaletteMode;
}

export function CommandPalette({ open, onClose, sources, initialMode }: CommandPaletteProps) {
  const t = useT(agentDict).commandPalette;
  const [mode, setMode] = useState<PaletteMode>(initialMode ?? 'chat');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(() => filterCommands(sources[mode], query), [sources, mode, query]);

  // Re-filtering must not leave the highlight pointing at a row the user never saw.
  const cursor = clampSelection(selected, results.length);

  // A fresh open is a fresh question: keep nothing from last time.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode ?? 'chat');
    setQuery('');
    setSelected(0);
    setScrollTop(0);
    inputRef.current?.focus();
  }, [open, initialMode]);

  // Keep the highlighted row on screen when it moves by keyboard.
  useEffect(() => {
    const next = scrollToIndex(cursor, scrollTop, VIEWPORT_HEIGHT, ROW_HEIGHT);
    if (next !== null && listRef.current !== null) listRef.current.scrollTop = next;
  }, [cursor, scrollTop]);

  const runSelected = useCallback((): void => {
    const command = results[cursor];
    if (command === undefined) return;
    // Close FIRST: a command that opens another surface should not fight the palette for focus.
    onClose();
    command.run();
  }, [results, cursor, onClose]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected(moveSelection(cursor, e.key === 'ArrowDown' ? 1 : -1, results.length));
        return;
      }
      if (e.key === 'Tab') {
        // Tab cycles MODE rather than moving focus: there is one input and one list, so the browser
        // default has nowhere useful to go, and mode is the thing a user actually wants to switch.
        e.preventDefault();
        setMode((m) => cycleMode(m, e.shiftKey ? -1 : 1));
        setSelected(0);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        runSelected();
      }
    },
    [cursor, results.length, runSelected],
  );

  const win = visibleWindow(results.length, scrollTop, VIEWPORT_HEIGHT, ROW_HEIGHT);
  const rows = results.slice(win.start, win.end);

  return (
    <Modal open={open} onClose={onClose} ariaLabel={t.placeholder} size="md">
      <div onKeyDown={onKeyDown}>
        <div role="tablist" aria-label={t.modes} className="mb-2 flex gap-1">
          {PALETTE_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={m === mode}
              className={
                m === mode
                  ? 'rounded bg-surface-raised px-3 py-1 text-sm text-text-primary'
                  : 'rounded px-3 py-1 text-sm text-text-secondary'
              }
              onClick={() => {
                setMode(m);
                setSelected(0);
              }}
            >
              {t[`mode${m.charAt(0).toUpperCase()}${m.slice(1)}` as keyof typeof t]}
            </button>
          ))}
        </div>

        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded
          aria-controls="command-palette-list"
          aria-activedescendant={
            results[cursor] === undefined ? undefined : `cp-${results[cursor].id}`
          }
          className="w-full rounded border border-border bg-surface-base px-3 py-2 text-text-primary"
          placeholder={t.placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
            setScrollTop(0);
          }}
        />

        {results.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-text-secondary">{t.noResults}</p>
        ) : (
          <div
            id="command-palette-list"
            role="listbox"
            ref={listRef}
            className="mt-2 overflow-y-auto"
            style={{ height: VIEWPORT_HEIGHT }}
            onScroll={(e) => {
              setScrollTop(e.currentTarget.scrollTop);
            }}
          >
            {/* Spacers above and below keep the scrollbar sized for the WHOLE list while only the
                visible slice is in the DOM. */}
            <div style={{ height: win.totalHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', top: win.offsetTop, left: 0, right: 0 }}>
                {rows.map((c, i) => {
                  const index = win.start + i;
                  return (
                    <button
                      key={c.id}
                      id={`cp-${c.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === cursor}
                      style={{ height: ROW_HEIGHT }}
                      className={
                        index === cursor
                          ? 'flex w-full flex-col justify-center bg-surface-raised px-3 text-left'
                          : 'flex w-full flex-col justify-center px-3 text-left'
                      }
                      onMouseEnter={() => {
                        setSelected(index);
                      }}
                      onClick={() => {
                        onClose();
                        c.run();
                      }}
                    >
                      <span className="truncate text-sm text-text-primary">{c.title}</span>
                      {c.subtitle !== undefined && (
                        <span className="truncate text-xs text-text-secondary">{c.subtitle}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
