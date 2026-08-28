import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@tepegoz/ui';
import { coreDict, foldForSearch } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { settingsDict } from './i18n';

const IconSearch = () => (
  <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4" aria-hidden />
);

export interface SettingsSection {
  id: string;
  label: string;
  icon: ReactNode;
  /** Free text matched against the search query to decide this section's visibility. */
  searchText: string;
  content: ReactNode;
  /** Optional sidebar grouping (Chrome/Edge-style headings). Undefined ⇒ ungrouped (flat list). */
  group?: string;
}

export interface SettingsLayoutProps {
  /** Icon shown next to the title in the sidebar header. */
  titleIcon: ReactNode;
  sections: readonly SettingsSection[];
  /** Optional section id selected by the host, e.g. from `tepegoz://settings#privacy`. */
  initialSectionId?: string | undefined;
  /** Optional element rendered above the section content (e.g. an error banner). */
  banner?: ReactNode;
  /** Optional element pinned to the header row beside the search box. Used for transient
   *  write confirmation, which must NOT push the page down the way a banner would. */
  status?: ReactNode;
}

/**
 * `@tepegoz/settings-ui` — the settings shell: a sidebar of sections + a search box that filters across
 * every section + a scrollable content area. Owns its own dictionary (`useT(settingsDict)`); the page
 * title reuses the shared-core `common.settings`. Section content is host-supplied. Extracted from
 * `apps/desktop` per docs/package-map.md.
 */
export function SettingsLayout({
  titleIcon,
  sections,
  initialSectionId,
  banner,
  status,
}: SettingsLayoutProps) {
  const t = useT(settingsDict);
  const title = useT(coreDict).common.settings;
  const firstSectionId = sections[0]?.id ?? '';
  const sectionIds = useMemo(() => new Set(sections.map((section) => section.id)), [sections]);
  const initialActive =
    initialSectionId !== undefined && sectionIds.has(initialSectionId)
      ? initialSectionId
      : firstSectionId;
  const [active, setActive] = useState<string>(initialActive);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActive(initialActive);
    setSearch('');
  }, [initialActive]);

  /**
   * The address bar is the section pointer. Settings is a REAL page now (`tepegoz://settings`), so a
   * section that lives only in React state is a section the back button, a bookmark and "copy a link to
   * this setting" all cannot reach — three affordances the page otherwise looks like it has.
   *
   * `hashchange` covers back/forward; `select` writes the hash and lets that listener move the state,
   * so there is exactly one path into `active` and no chance of the two disagreeing.
   */
  useEffect(() => {
    const onHashChange = (): void => {
      const id = window.location.hash.replace(/^#/, '');
      if (id !== '' && sectionIds.has(id)) {
        setActive(id);
        setSearch('');
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [sectionIds]);

  const select = useCallback((id: string): void => {
    setActive(id);
    setSearch('');
    if (window.location.hash.replace(/^#/, '') !== id) window.location.hash = id;
  }, []);

  /** `/` focuses the search box, the shortcut every list-and-filter surface is expected to have.
   *  Ignored while a field already has focus, so typing a slash into a URL still types a slash. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el instanceof HTMLElement ? el.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (el instanceof HTMLElement && el.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const q = foldForSearch(search.trim());
  const searching = q.length > 0;
  const isVisible = (section: SettingsSection): boolean =>
    searching ? foldForSearch(section.searchText).includes(q) : active === section.id;
  const anyVisible = sections.some(isVisible);

  return (
    <div className="flex h-full bg-surface-system text-text-primary">
      <aside className="w-60 shrink-0 overflow-auto border-r border-border py-4">
        <div className="flex items-center gap-2 px-5 pb-4 text-text-primary">
          {titleIcon}
          <h1 className="text-base font-semibold">{title}</h1>
        </div>
        <nav className="space-y-0.5 px-2">
          {sections.map((sec, i) => {
            // A group heading precedes the first section of each group (Chrome/Edge-style). Ungrouped
            // sections (group === undefined) render with no heading, preserving the old flat list.
            const showHeading = sec.group !== undefined && sec.group !== sections[i - 1]?.group;
            return (
              <Fragment key={sec.id}>
                {showHeading && (
                  <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {sec.group}
                  </p>
                )}
                <button
                  type="button"
                  aria-current={!searching && active === sec.id}
                  onClick={() => {
                    select(sec.id);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    !searching && active === sec.id
                      ? 'bg-surface-overlay font-medium text-text-primary'
                      : 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary',
                  )}
                >
                  <span className="h-4 w-4 shrink-0">{sec.icon}</span>
                  {sec.label}
                </button>
              </Fragment>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-8 py-4">
          <div className="relative mx-auto max-w-2xl">
            {status !== undefined && (
              <div className="pointer-events-none absolute right-0 top-1/2 flex -translate-y-1/2 translate-x-[calc(100%+12px)] items-center">
                {status}
              </div>
            )}
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
              <IconSearch />
            </span>
            <input
              ref={searchRef}
              type="text"
              value={search}
              placeholder={t.search}
              aria-label={t.search}
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearch('');
              }}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              className="h-10 w-full rounded-full border border-border bg-surface-raised pl-10 pr-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="mx-auto max-w-2xl space-y-6">
            {banner}
            {sections.map((sec) =>
              isVisible(sec) ? (
                <div key={sec.id}>
                  {/* While searching, a hit is labelled with the section it came from — otherwise
                      results from three different pages stack into one anonymous column and the
                      reader has to recognise each card to know where the setting lives. */}
                  {searching && (
                    <button
                      type="button"
                      onClick={() => {
                        select(sec.id);
                      }}
                      className="mb-2 flex items-center gap-2 rounded text-xs font-semibold uppercase tracking-wide text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      <span className="h-3.5 w-3.5">{sec.icon}</span>
                      {sec.group === undefined ? sec.label : `${sec.group} · ${sec.label}`}
                    </button>
                  )}
                  {sec.content}
                </div>
              ) : null,
            )}
            {searching && !anyVisible && (
              <p className="text-sm text-text-secondary">{t.noResults}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
