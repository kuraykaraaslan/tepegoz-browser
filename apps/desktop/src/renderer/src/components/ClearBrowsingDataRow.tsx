import { useState } from 'react';
import { Button, Modal } from '@tepegoz/ui';
import type { SettingsStrings } from '@tepegoz/settings-ui';
import {
  BROWSING_DATA_CATEGORIES,
  BROWSING_DATA_RANGES,
  isTimeRangeable,
  type BrowsingDataCategory,
  type BrowsingDataClearResult,
  type BrowsingDataRange,
} from '@tepegoz/shared-types';

/**
 * The unified "Clear browsing data" dialog (Phase 2c L8).
 *
 * Before this, clearing was three controls in three places: clear history here, clear the download
 * list in the downloads panel, forget one site below. Every other browser puts the set behind one
 * dialog with a time range, and the reason is not tidiness — someone who wants the last hour gone will
 * otherwise clear one of the three and believe they cleared all of it.
 *
 * Two honesty rules the layout exists to serve:
 *
 *  - **The time range does not reach cookies or the cache**, because Electron's session API exposes no
 *    "since" parameter at any version. Those two rows say so next to themselves rather than in a
 *    footnote, since a control whose real scope is wider than its label is worse than a blunt one.
 *  - **The result is counts, not "Done".** A clear that reports success with nothing behind it is the
 *    exact reassurance this dialog must never give, and a category that failed is named.
 */
const DEFAULT_SELECTION: BrowsingDataCategory[] = ['history', 'cookies', 'cache'];

/**
 * "Clear when Tepegöz closes" — the same category vocabulary, applied on the way out.
 *
 * The note under it is not filler. Every other browser runs this in a quit handler, so a crash or a
 * `kill` leaves everything behind: the setting silently does nothing on the one exit the user did not
 * choose. This one is finished at the next launch when that happens, and saying so is what makes the
 * difference worth having.
 */
export function ClearOnExitRow({
  s,
  selected,
  onChange,
}: {
  s: SettingsStrings;
  selected: readonly BrowsingDataCategory[];
  onChange: (next: BrowsingDataCategory[]) => void;
}) {
  const t = s.clearData;
  return (
    <div>
      <p className="text-sm font-medium text-text-primary">{t.onExitTitle}</p>
      <p className="mb-2 text-xs text-text-secondary">{t.onExitDesc}</p>
      <div className="grid gap-1.5">
        {BROWSING_DATA_CATEGORIES.map((category) => (
          <label key={category} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(category)}
              onChange={() => {
                onChange(
                  selected.includes(category)
                    ? selected.filter((c) => c !== category)
                    : [...selected, category],
                );
              }}
            />
            <span className="text-text-primary">{t.categories[category]}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-text-secondary">{t.onExitNote}</p>
    </div>
  );
}

export function ClearBrowsingDataRow({ s }: { s: SettingsStrings }) {
  const t = s.clearData;
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<BrowsingDataRange>('last-hour');
  const [selected, setSelected] = useState<BrowsingDataCategory[]>(DEFAULT_SELECTION);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BrowsingDataClearResult | null>(null);
  const [error, setError] = useState(false);

  const toggle = (category: BrowsingDataCategory): void => {
    setResult(null);
    setSelected((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const clear = (): void => {
    setBusy(true);
    setError(false);
    setResult(null);
    void window.tepegoz.clearBrowsingData({ range, categories: selected }).then(
      (cleared) => {
        setBusy(false);
        setResult(cleared);
      },
      () => {
        setBusy(false);
        setError(true);
      },
    );
  };

  return (
    <div>
      <p className="text-sm font-medium text-text-primary">{t.title}</p>
      <p className="mb-2 text-xs text-text-secondary">{t.desc}</p>
      <Button
        variant="secondary"
        onClick={() => {
          setResult(null);
          setError(false);
          setOpen(true);
        }}
      >
        {t.open}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={t.title} size="md">
        <div className="space-y-4">
          <div>
            <label htmlFor="clear-data-range" className="text-sm font-medium">
              {t.rangeLabel}
            </label>
            <select
              id="clear-data-range"
              value={range}
              onChange={(e) => {
                setResult(null);
                setRange(e.target.value as BrowsingDataRange);
              }}
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {BROWSING_DATA_RANGES.map((id) => (
                <option key={id} value={id}>
                  {t.ranges[id]}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t.categoriesLabel}</legend>
            {BROWSING_DATA_CATEGORIES.map((category) => (
              <label key={category} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(category)}
                  onChange={() => toggle(category)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-text-primary">{t.categories[category]}</span>
                  {!isTimeRangeable(category) && (
                    // Said next to the row it applies to. The engine has no time-scoped clear for
                    // these, and a dialog that let the range appear to cover them would be lying in
                    // the direction that costs the user data.
                    <span className="block text-xs text-text-secondary">{t.allTimeOnly}</span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>

          {result !== null && (
            <p className="text-xs text-text-secondary">
              {t.cleared
                .replace('{history}', String(result.historyEntries))
                .replace('{downloads}', String(result.downloadEntries))
                .replace('{agent}', String(result.agentConversations))}
              {result.failed.length > 0 && (
                <span className="mt-1 block text-danger">
                  {t.failed.replace(
                    '{categories}',
                    result.failed.map((c) => t.categories[c]).join(', '),
                  )}
                </span>
              )}
            </p>
          )}
          {error && <p className="text-xs text-danger">{t.error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {s.cancel}
            </Button>
            <Button variant="danger" disabled={busy || selected.length === 0} onClick={clear}>
              {busy ? t.clearing : t.confirm}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
