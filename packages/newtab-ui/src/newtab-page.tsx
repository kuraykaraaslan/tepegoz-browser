import { useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMagnifyingGlass,
  faWandMagicSparkles,
  faPlus,
  faSliders,
} from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import type { NewTabBackground, NewTabShortcut } from '@tepegoz/desktop-ipc';
import { newtabDict } from './i18n';
import { TepegozLogo } from './tepegoz-logo';
import { NewTabBackgroundLayer, type ResolvedNewTabBackground } from './backgrounds';
import { CustomizePanel } from './customize-panel';
import {
  MAX_SHORTCUTS,
  hostOf,
  initialOf,
  type DialogState,
  type MenuState,
} from './newtab-page-helpers';
import { ShortcutMenu } from './newtab-page-shortcut-menu';
import { ShortcutDialog } from './newtab-page-shortcut-dialog';

export type { NewTabShortcut };

export interface NewTabPageProps {
  /** The user's shortcut tiles (independent of bookmarks). */
  shortcuts: readonly NewTabShortcut[];
  /** Open a shortcut's URL in the current tab. */
  onOpenShortcut: (url: string) => void;
  /** Submit the search box: a URL or a search query (the chrome resolves + navigates). */
  onSearch: (query: string) => void;
  /** Open the Agent Console (the corner "AI" button). */
  onOpenAgent: () => void;
  /** Create a new shortcut. Omit to hide the "Add shortcut" tile. */
  onAddShortcut?: (title: string, url: string) => void;
  /** Edit an existing shortcut (name and/or URL) by id. */
  onEditShortcut?: (id: string, title: string, url: string) => void;
  /** Delete a shortcut by id. */
  onRemoveShortcut?: (id: string) => void;
  /** The current background (with any uploaded image resolved to a data URL). */
  background: ResolvedNewTabBackground;
  /** Apply a partial background change (host persists it). */
  onChangeBackground: (patch: Partial<NewTabBackground>) => void;
  /** Open the native image picker; resolves to the stored ref (+ data URL) or null when cancelled. */
  onPickBackgroundImage: () => Promise<{ ref: string; dataUrl: string } | null>;
}

/**
 * The `tepegoz://newtab` start page — a Chrome-style new-tab page: the Tepegöz logo, a big centred
 * search box, a shortcuts grid of the user's tiles (each editable via right-click, plus an "Add
 * shortcut" tile), a corner AI button that opens the agent, and a corner "Customize" button that opens
 * the background picker. Presentational leaf — shortcut data, the background, and the search/agent/
 * navigation/shortcut actions are injected by the desktop chrome (App.tsx).
 */
export function NewTabPage({
  shortcuts,
  onOpenShortcut,
  onSearch,
  onOpenAgent,
  onAddShortcut,
  onEditShortcut,
  onRemoveShortcut,
  background,
  onChangeBackground,
  onPickBackgroundImage,
}: Readonly<NewTabPageProps>) {
  const t = useT(newtabDict);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [customizing, setCustomizing] = useState(false);

  const tiles = shortcuts.slice(0, MAX_SHORTCUTS);
  const canEdit = Boolean(onEditShortcut || onRemoveShortcut);
  const canAdd = Boolean(onAddShortcut) && tiles.length < MAX_SHORTCUTS;

  function submitSearch(e: FormEvent): void {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length > 0) onSearch(trimmed);
  }

  function saveDialog(title: string, url: string): void {
    if (dialog === null) return;
    if (dialog.mode === 'add') onAddShortcut?.(title, url);
    else onEditShortcut?.(dialog.shortcut.id, title, url);
    setDialog(null);
  }

  const showEmpty = tiles.length === 0 && !canAdd;

  return (
    <div className="relative flex h-full flex-col overflow-auto bg-surface-system text-text-primary">
      <NewTabBackgroundLayer background={background} />

      {/* Corner AI entry point (Chrome puts profile/labs here). Opens the Agent Console. */}
      <div className="relative z-10 flex shrink-0 justify-end p-4">
        <button
          type="button"
          onClick={onOpenAgent}
          title={t.aiHint}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-base px-3.5 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <FontAwesomeIcon
            icon={faWandMagicSparkles}
            className="h-3.5 w-3.5 text-primary"
            aria-hidden
          />
          {t.aiButton}
        </button>
      </div>

      {/* Centred hero: logo + wordmark + fakebox + shortcuts. */}
      <div className="relative z-10 flex flex-1 flex-col items-center px-6 pb-16">
        <div className="flex w-full max-w-xl flex-col items-center pt-[8vh]">
          <TepegozLogo label={t.logoAlt} className="text-text-primary" />

          <form onSubmit={submitSearch} className="mt-10 w-full" role="search">
            <div className="flex items-center gap-3 rounded-full border border-border bg-surface-base px-5 py-3 shadow-sm transition-colors focus-within:border-border-focus focus-within:bg-surface-raised">
              <FontAwesomeIcon
                icon={faMagnifyingGlass}
                className="h-4 w-4 shrink-0 text-text-secondary"
                aria-hidden
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.search}
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
              />
            </div>
          </form>

          {showEmpty ? (
            <p className="mt-10 text-center text-sm text-text-secondary">{t.favorites.empty}</p>
          ) : (
            <ul className="mt-10 grid w-full grid-cols-5 gap-2">
              {tiles.map((shortcut) => (
                <li key={shortcut.id}>
                  <button
                    type="button"
                    onClick={() => onOpenShortcut(shortcut.url)}
                    onContextMenu={
                      canEdit
                        ? (e) => {
                            e.preventDefault();
                            setMenu({ shortcut, x: e.clientX, y: e.clientY });
                          }
                        : undefined
                    }
                    title={shortcut.url}
                    className="group flex w-full flex-col items-center gap-2 rounded-xl px-1 py-3 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-overlay text-base font-semibold text-text-secondary group-hover:text-text-primary">
                      {initialOf(shortcut)}
                    </span>
                    <span className="w-full truncate text-center text-xs text-text-secondary group-hover:text-text-primary">
                      {shortcut.title || hostOf(shortcut.url)}
                    </span>
                  </button>
                </li>
              ))}
              {canAdd && (
                <li>
                  <button
                    type="button"
                    onClick={() => setDialog({ mode: 'add' })}
                    title={t.favorites.add}
                    className="group flex w-full flex-col items-center gap-2 rounded-xl px-1 py-3 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-overlay text-text-secondary group-hover:text-text-primary">
                      <FontAwesomeIcon icon={faPlus} className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="w-full truncate text-center text-xs text-text-secondary group-hover:text-text-primary">
                      {t.favorites.add}
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Corner "Customize" entry point (Chrome's pencil). Toggles the background picker panel. */}
      <button
        type="button"
        onClick={() => setCustomizing((v) => !v)}
        title={t.customize.button}
        aria-label={t.customize.button}
        aria-pressed={customizing}
        className="absolute bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full border border-border bg-surface-base px-3.5 py-1.5 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <FontAwesomeIcon icon={faSliders} className="h-3.5 w-3.5" aria-hidden />
        {t.customize.button}
      </button>

      {customizing && (
        <CustomizePanel
          background={background}
          onChange={onChangeBackground}
          onPickImage={onPickBackgroundImage}
          onClose={() => setCustomizing(false)}
        />
      )}

      {menu && (
        <ShortcutMenu
          x={menu.x}
          y={menu.y}
          canEdit={Boolean(onEditShortcut)}
          canRemove={Boolean(onRemoveShortcut)}
          labels={{ edit: t.favorites.edit, remove: t.favorites.remove }}
          onEdit={() => {
            setDialog({ mode: 'edit', shortcut: menu.shortcut });
            setMenu(null);
          }}
          onRemove={() => {
            onRemoveShortcut?.(menu.shortcut.id);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {dialog && (
        <ShortcutDialog
          title={dialog.mode === 'add' ? t.favorites.addTitle : t.favorites.editTitle}
          initialName={dialog.mode === 'edit' ? dialog.shortcut.title : ''}
          initialUrl={dialog.mode === 'edit' ? dialog.shortcut.url : ''}
          labels={{
            name: t.favorites.nameLabel,
            url: t.favorites.urlLabel,
            save: t.favorites.save,
            cancel: t.favorites.cancel,
          }}
          onCancel={() => setDialog(null)}
          onSave={saveDialog}
        />
      )}
    </div>
  );
}
