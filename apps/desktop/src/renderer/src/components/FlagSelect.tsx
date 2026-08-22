import { useState, useRef, useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as Flags from 'country-flag-icons/react/3x2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faCheck, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { Button, cn } from '@tepegoz/ui';

export type FlagOption = {
  value: string;
  label: string;
  /** ISO 3166-1 alpha-2 code; when omitted (e.g. "System default") a globe is shown instead. */
  iso2?: string | undefined;
  /** Custom bundled flag image URL (for non-ISO regions); takes precedence over `iso2`. */
  flagSrc?: string | undefined;
  /** Muted code shown at the row's right edge; defaults to `iso2` when omitted. */
  code?: string | undefined;
};

/** Renders a flag: a bundled custom image, else the ISO country SVG, else a globe fallback. */
function OptionFlag({
  iso2,
  flagSrc,
}: {
  iso2?: string | undefined;
  flagSrc?: string | undefined;
}) {
  if (flagSrc) {
    return (
      <img
        src={flagSrc}
        alt=""
        className="h-auto w-5 shrink-0 rounded-[2px] object-cover shadow-sm"
      />
    );
  }
  const FlagComp = iso2
    ? (Flags[iso2 as keyof typeof Flags] as
        React.ComponentType<React.SVGProps<SVGSVGElement>> | undefined)
    : undefined;
  if (FlagComp) {
    return <FlagComp className="h-auto w-5 shrink-0 rounded-[2px] shadow-sm" />;
  }
  return (
    <FontAwesomeIcon icon={faGlobe} className="w-5 shrink-0 text-text-secondary" aria-hidden />
  );
}

/**
 * A custom listbox dropdown that shows a flag next to each option — used because a native
 * `<option>` can only render text (and Chromium on Windows renders flag emoji as bare letters).
 * Portals its panel to `document.body` so it escapes the scrolling settings pane.
 */
export function FlagSelect({
  id: idProp,
  label,
  value,
  onChange,
  options,
  searchable = false,
  searchPlaceholder,
  noResultsLabel = 'No results',
  placeholder,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly FlagOption[];
  searchable?: boolean;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  placeholder?: string;
}) {
  const uid = useId();
  const id = idProp ?? uid;
  const portalId = `flag-select-portal-${id.replaceAll(':', '')}`;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const q = search.trim().toLowerCase();
  const filtered =
    searchable && q
      ? options.filter(
          (o) => o.label.toLowerCase().includes(q) || (o.iso2?.toLowerCase().includes(q) ?? false),
        )
      : options;

  function place() {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }

  function toggle() {
    if (!open) {
      place();
      const idx = filtered.findIndex((o) => o.value === value);
      setActive(Math.max(idx, 0));
    }
    setOpen((p) => !p);
  }

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    triggerRef.current?.querySelector('button')?.focus();
  }

  // Reset the highlight to the top whenever the filtered set changes via search.
  useEffect(() => {
    if (open) setActive(0);
  }, [q, open]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    if (searchable) setTimeout(() => searchRef.current?.focus(), 0);

    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !document.getElementById(portalId)?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onScroll() {
      place();
    }
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, portalId, searchable]);

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (open)
      listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(filtered.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) commit(opt.value);
    }
  }

  const panel: ReactNode = open && rect && (
    <div
      id={portalId}
      style={{
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      }}
      className="rounded-md border border-border bg-surface-raised shadow-lg"
      onKeyDown={onKeyDown}
    >
      {searchable && (
        <div className="border-b border-border p-2">
          <input
            ref={searchRef}
            type="text"
            value={search}
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-base px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          />
        </div>
      )}
      <ul ref={listRef} role="listbox" aria-label={label} className="max-h-60 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-sm text-text-secondary">{noResultsLabel}</li>
        )}
        {filtered.map((opt, i) => {
          const isSelected = opt.value === value;
          const isActive = i === active;
          return (
            <li key={opt.value || 'system'}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                data-active={isActive || undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(opt.value)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                  isSelected
                    ? 'bg-primary-subtle font-medium text-primary-on-surface'
                    : 'text-text-primary',
                  isActive && !isSelected && 'bg-surface-overlay',
                )}
              >
                <OptionFlag iso2={opt.iso2} flagSrc={opt.flagSrc} />
                <span className="flex-1 truncate">{opt.label}</span>
                {(opt.code ?? opt.iso2) && (
                  <span className="shrink-0 text-xs text-text-secondary">
                    {opt.code ?? opt.iso2}
                  </span>
                )}
                {isSelected && (
                  <FontAwesomeIcon
                    icon={faCheck}
                    className="h-3 w-3 shrink-0 text-primary"
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div>
      {label !== undefined && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <div ref={triggerRef} className="relative w-full">
        <Button
          id={id}
          variant="outline"
          size="sm"
          fullWidth
          onClick={toggle}
          onKeyDown={onKeyDown}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="h-9 justify-between gap-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <>
                <OptionFlag iso2={selected.iso2} flagSrc={selected.flagSrc} />
                <span className="truncate">{selected.label}</span>
              </>
            ) : (
              <span className="truncate text-text-disabled">{placeholder}</span>
            )}
          </span>
          <FontAwesomeIcon
            icon={faChevronDown}
            className="h-3 w-3 shrink-0 text-text-disabled"
            aria-hidden
          />
        </Button>
      </div>
      {typeof document !== 'undefined' && createPortal(panel, document.body)}
    </div>
  );
}
