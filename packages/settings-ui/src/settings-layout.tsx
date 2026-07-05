import { Fragment, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
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
  /** Optional element rendered above the section content (e.g. transient feedback). */
  banner?: ReactNode;
}

/**
 * `@tepegoz/settings-ui` — the settings shell: a sidebar of sections + a search box that filters across
 * every section + a scrollable content area. Owns its own dictionary (`useT(settingsDict)`); the page
 * title reuses the shared-core `common.settings`. Section content is host-supplied. Extracted from
 * `apps/desktop` per docs/package-map.md.
 */
export function SettingsLayout({ titleIcon, sections, banner }: SettingsLayoutProps) {
  const t = useT(settingsDict);
  const title = useT(coreDict).common.settings;
  const [active, setActive] = useState<string>(sections[0]?.id ?? '');
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  const isVisible = (section: SettingsSection): boolean =>
    searching ? section.searchText.toLowerCase().includes(q) : active === section.id;
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
                    setActive(sec.id);
                    setSearch('');
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
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
              <IconSearch />
            </span>
            <input
              type="text"
              value={search}
              placeholder={t.search}
              aria-label={t.search}
              spellCheck={false}
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
            {sections.map((sec) => (isVisible(sec) ? <div key={sec.id}>{sec.content}</div> : null))}
            {searching && !anyVisible && (
              <p className="text-sm text-text-secondary">{t.noResults}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
