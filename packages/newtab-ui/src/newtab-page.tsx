import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faWandMagicSparkles, faPlus, faPen, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import { newtabDict } from './i18n';
import { TepegozLogo } from './tepegoz-logo';

/** A single saved page shown in the shortcuts grid. Data is injected — this leaf never reaches for it. */
export interface NewTabFavorite {
  /** Stable id (the backing bookmark's id) — needed to edit/remove the shortcut. */
  readonly id: string;
  readonly title: string;
  readonly url: string;
}

export interface NewTabPageProps {
  /** Load the user's favorites (bookmarks). Called on mount and whenever `refreshKey` changes. */
  listFavorites: () => Promise<readonly NewTabFavorite[]>;
  /** Open a favorite's URL in the current tab. */
  onOpenFavorite: (url: string) => void;
  /** Submit the search box: a URL or a search query (the chrome resolves + navigates). */
  onSearch: (query: string) => void;
  /** Open the Agent Console (the corner "AI" button). */
  onOpenAgent: () => void;
  /** Create a new shortcut. Omit to hide the "Add shortcut" tile. */
  onAddShortcut?: (title: string, url: string) => void;
  /** Edit an existing shortcut (name and/or URL). `previousUrl` lets the host detect a URL change. */
  onEditShortcut?: (id: string, title: string, url: string, previousUrl: string) => void;
  /** Delete a shortcut. */
  onRemoveShortcut?: (id: string) => void;
  /** Bump to re-fetch favorites (e.g. after a bookmark changes). */
  refreshKey?: number;
}

/** How many shortcuts the grid shows (one Chrome-style row-of-five, two rows). */
const MAX_SHORTCUTS = 10;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function initialOf(fav: NewTabFavorite): string {
  const base = fav.title.trim() || hostOf(fav.url);
  return (base[0] ?? '?').toUpperCase();
}

/** Prepend a scheme if the user typed a bare host (`avantleap.com` → `https://avantleap.com`). Returns
 *  the trimmed input unchanged when it already has one, or is empty. Final validity is the host's call. */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith('tepegoz://')) return trimmed;
  return `https://${trimmed}`;
}

type DialogState = { mode: 'add' } | { mode: 'edit'; fav: NewTabFavorite };
type MenuState = { fav: NewTabFavorite; x: number; y: number };

/**
 * The `tepegoz://newtab` start page — a Chrome-style new-tab page: the Tepegöz logo, a big centred
 * search box, a shortcuts grid of the user's favorites (each editable via right-click, plus an
 * "Add shortcut" tile), and a corner AI button that opens the agent. Presentational leaf — favorites
 * data and the search/agent/navigation/shortcut actions are injected by the desktop chrome (App.tsx).
 */
export function NewTabPage({
  listFavorites,
  onOpenFavorite,
  onSearch,
  onOpenAgent,
  onAddShortcut,
  onEditShortcut,
  onRemoveShortcut,
  refreshKey,
}: Readonly<NewTabPageProps>) {
  const t = useT(newtabDict);
  const [favorites, setFavorites] = useState<readonly NewTabFavorite[]>([]);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const canEdit = Boolean(onEditShortcut || onRemoveShortcut);
  const canAdd = Boolean(onAddShortcut) && favorites.length < MAX_SHORTCUTS;

  useEffect(() => {
    let cancelled = false;
    void listFavorites().then(
      (items) => {
        if (!cancelled) setFavorites(items.slice(0, MAX_SHORTCUTS));
      },
      () => {
        if (!cancelled) setFavorites([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [listFavorites, refreshKey]);

  function submitSearch(e: FormEvent): void {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length > 0) onSearch(trimmed);
  }

  function saveDialog(title: string, url: string): void {
    if (dialog === null) return;
    if (dialog.mode === 'add') onAddShortcut?.(title, url);
    else onEditShortcut?.(dialog.fav.id, title, url, dialog.fav.url);
    setDialog(null);
  }

  const showEmpty = favorites.length === 0 && !canAdd;

  return (
    <div className="relative flex h-full flex-col overflow-auto bg-surface-system text-text-primary">
      {/* Corner AI entry point (Chrome puts profile/labs here). Opens the Agent Console. */}
      <div className="flex shrink-0 justify-end p-4">
        <button
          type="button"
          onClick={onOpenAgent}
          title={t.aiHint}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-base px-3.5 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <FontAwesomeIcon icon={faWandMagicSparkles} className="h-3.5 w-3.5 text-primary" aria-hidden />
          {t.aiButton}
        </button>
      </div>

      {/* Centred hero: logo + wordmark + fakebox + shortcuts. */}
      <div className="flex flex-1 flex-col items-center px-6 pb-16">
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
              {favorites.map((fav) => (
                <li key={fav.id}>
                  <button
                    type="button"
                    onClick={() => onOpenFavorite(fav.url)}
                    onContextMenu={
                      canEdit
                        ? (e) => {
                            e.preventDefault();
                            setMenu({ fav, x: e.clientX, y: e.clientY });
                          }
                        : undefined
                    }
                    title={fav.url}
                    className="group flex w-full flex-col items-center gap-2 rounded-xl px-1 py-3 hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-overlay text-base font-semibold text-text-secondary group-hover:text-text-primary">
                      {initialOf(fav)}
                    </span>
                    <span className="w-full truncate text-center text-xs text-text-secondary group-hover:text-text-primary">
                      {fav.title || hostOf(fav.url)}
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

      {menu && (
        <ShortcutMenu
          x={menu.x}
          y={menu.y}
          canEdit={Boolean(onEditShortcut)}
          canRemove={Boolean(onRemoveShortcut)}
          labels={{ edit: t.favorites.edit, remove: t.favorites.remove }}
          onEdit={() => {
            setDialog({ mode: 'edit', fav: menu.fav });
            setMenu(null);
          }}
          onRemove={() => {
            onRemoveShortcut?.(menu.fav.id);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {dialog && (
        <ShortcutDialog
          title={dialog.mode === 'add' ? t.favorites.addTitle : t.favorites.editTitle}
          initialName={dialog.mode === 'edit' ? dialog.fav.title : ''}
          initialUrl={dialog.mode === 'edit' ? dialog.fav.url : ''}
          labels={{ name: t.favorites.nameLabel, url: t.favorites.urlLabel, save: t.favorites.save, cancel: t.favorites.cancel }}
          onCancel={() => setDialog(null)}
          onSave={saveDialog}
        />
      )}
    </div>
  );
}

/** Right-click menu on a shortcut tile — Edit / Remove. A transparent full-screen backdrop catches the
 *  next click (and right-click) to dismiss; Escape closes too. */
function ShortcutMenu({
  x,
  y,
  canEdit,
  canRemove,
  labels,
  onEdit,
  onRemove,
  onClose,
}: Readonly<{
  x: number;
  y: number;
  canEdit: boolean;
  canRemove: boolean;
  labels: { edit: string; remove: string };
  onEdit: () => void;
  onRemove: () => void;
  onClose: () => void;
}>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        role="menu"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
        className="fixed min-w-40 overflow-hidden rounded-lg border border-border bg-surface-base py-1 text-sm text-text-primary shadow-lg"
      >
        {canEdit && (
          <button
            type="button"
            role="menuitem"
            onClick={onEdit}
            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-raised"
          >
            <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5 text-text-secondary" aria-hidden />
            {labels.edit}
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            role="menuitem"
            onClick={onRemove}
            className="flex w-full items-center gap-3 px-3 py-2 text-left text-error hover:bg-surface-raised"
          >
            <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" aria-hidden />
            {labels.remove}
          </button>
        )}
      </div>
    </div>
  );
}

/** The add/edit-shortcut modal — a Name + URL form (Chrome-style). Done is disabled until the URL is
 *  non-empty; the host normalizes + validates the final URL. */
function ShortcutDialog({
  title,
  initialName,
  initialUrl,
  labels,
  onCancel,
  onSave,
}: Readonly<{
  title: string;
  initialName: string;
  initialUrl: string;
  labels: { name: string; url: string; save: string; cancel: string };
  onCancel: () => void;
  onSave: (name: string, url: string) => void;
}>) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState(initialUrl);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function submit(e: FormEvent): void {
    e.preventDefault();
    const finalUrl = normalizeUrl(url);
    if (finalUrl.length === 0) return;
    onSave(name.trim(), finalUrl);
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-surface-base px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-base p-6 shadow-xl"
      >
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>

        <label className="mt-5 block">
          <span className="text-xs font-medium text-text-secondary">{labels.name}</span>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-text-secondary">{labels.url}</span>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            inputMode="url"
            className={`mt-1.5 ${inputClass}`}
          />
        </label>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {labels.cancel}
          </button>
          <button
            type="submit"
            disabled={normalizeUrl(url).length === 0}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
          >
            {labels.save}
          </button>
        </div>
      </form>
    </div>
  );
}
