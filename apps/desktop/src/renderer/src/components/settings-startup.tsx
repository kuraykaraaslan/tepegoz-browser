import { settingsDict } from '@tepegoz/settings-ui';
import { Card, Input, Toggle } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { isNavigableWebUrl, normalizeWebUrlInput } from '@tepegoz/shared-types';
import type { Preferences, StartupMode, StartupTabs } from '@tepegoz/desktop-ipc';
import { useCommitOnPause } from '../lib/use-commit-on-pause';
import { OptionList } from './settings-shared';

/**
 * On startup — what happens when Tepegöz launches.
 *
 * These three preferences were real and working, but they lived under "System tray & power" while the
 * page a user actually opens to change them, Preferences → On startup, was a `ComingSoonCard`. Someone
 * looking for startup behaviour found a placeholder saying it did not exist yet. Moving the controls to
 * the page named after them is the whole fix; nothing about how they work changed.
 *
 * Closing-to-tray, keep-awake, sleep and tab discarding stay behind — they are power behaviour, not
 * startup behaviour, and they are what that page is now only about.
 */
const MAX_STARTUP_PAGES = 10;

/** The non-blank, trimmed, normalized lines of the pages box. */
function parsePageLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => normalizeWebUrlInput(l.trim()))
    .filter((l) => l !== '');
}

export function StartupSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const t = s.tray;
  const st = s.startup;

  // Committed on pause/blur rather than per keystroke: `prefs:set` validates, writes to disk and runs
  // this key's reconcilers, and a URL is ~25 keystrokes.
  const kiosk = useCommitOnPause(prefs.kioskUrl, (value) => {
    const normalized = normalizeWebUrlInput(value);
    // An address that cannot be navigated is not stored: `PreferencesSchema` would refuse it anyway,
    // and letting the write fail silently would leave the field showing a value that is not saved.
    if (normalized === '' || isNavigableWebUrl(normalized)) setPref({ kioskUrl: normalized });
  });
  const kioskInvalid =
    kiosk.draft.trim() !== '' && !isNavigableWebUrl(normalizeWebUrlInput(kiosk.draft));

  // One address per line; committed when typing pauses. Blank lines are ignored, and nothing is stored
  // while any line is not a navigable address (the schema would refuse it, and a silent failed write
  // would leave the box showing text that is not saved).
  const pages = useCommitOnPause(prefs.startupPages.join('\n'), (value) => {
    const lines = parsePageLines(value);
    if (lines.every((l) => isNavigableWebUrl(l)) && lines.length <= MAX_STARTUP_PAGES) {
      setPref({ startupPages: lines });
    }
  });
  const pageLines = parsePageLines(pages.draft);
  const pagesInvalid =
    pageLines.some((l) => !isNavigableWebUrl(l)) || pageLines.length > MAX_STARTUP_PAGES;

  const modeOptions: { value: StartupMode; title: string; desc: string }[] = [
    { value: 'window', title: t.modeWindow, desc: st.modeWindowDesc },
    { value: 'background', title: t.modeBackground, desc: st.modeBackgroundDesc },
    { value: 'kiosk', title: t.modeKiosk, desc: st.modeKioskDesc },
  ];

  return (
    <Card title={st.title} subtitle={t.startupModeDesc}>
      <div className="space-y-5">
        <Toggle
          id="launch-at-login"
          label={t.launchAtLogin}
          description={t.launchAtLoginDesc}
          checked={prefs.launchAtLogin}
          onChange={(value) => {
            setPref({ launchAtLogin: value });
          }}
        />

        <div>
          <p className="mb-2 text-sm font-medium text-text-primary">{t.startupMode}</p>
          <OptionList<StartupMode>
            name="startup-mode"
            value={prefs.startupMode}
            options={modeOptions}
            onChange={(mode) => {
              setPref({ startupMode: mode });
            }}
          />
        </div>

        {prefs.startupMode !== 'kiosk' && (
          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">{st.tabsTitle}</p>
            <OptionList<StartupTabs>
              name="startup-tabs"
              value={prefs.startupTabs}
              options={[
                { value: 'restore', title: st.tabsRestore, desc: st.tabsRestoreDesc },
                { value: 'newtab', title: st.tabsNewTab, desc: st.tabsNewTabDesc },
                { value: 'pages', title: st.tabsPages, desc: st.tabsPagesDesc },
              ]}
              onChange={(tabs) => {
                setPref({ startupTabs: tabs });
              }}
            />
          </div>
        )}

        {prefs.startupMode !== 'kiosk' && prefs.startupTabs === 'pages' && (
          <div className="space-y-1">
            <label htmlFor="startup-pages" className="block text-sm font-medium text-text-primary">
              {st.pagesLabel}
            </label>
            <textarea
              id="startup-pages"
              rows={4}
              spellCheck={false}
              className={`w-full resize-y rounded-md border bg-surface-raised px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${pagesInvalid ? 'border-error' : 'border-border'}`}
              placeholder={st.pagesPlaceholder}
              value={pages.draft}
              aria-invalid={pagesInvalid}
              aria-describedby="startup-pages-hint"
              onChange={(e) => {
                pages.set(e.target.value);
              }}
              onBlur={pages.flush}
            />
            <p
              id="startup-pages-hint"
              className={`text-xs ${pagesInvalid ? 'text-error-fg' : 'text-text-secondary'}`}
            >
              {pagesInvalid
                ? st.pagesInvalid
                : st.pagesHint.replace('{max}', String(MAX_STARTUP_PAGES))}
            </p>
          </div>
        )}

        {prefs.startupMode === 'kiosk' && (
          <Input
            id="kiosk-url"
            type="url"
            label={t.kioskUrl}
            hint={st.kioskUrlHint}
            placeholder={t.kioskUrlPlaceholder}
            value={kiosk.draft}
            {...(kioskInvalid ? { error: st.urlInvalid } : {})}
            onChange={(e) => {
              kiosk.set(e.target.value);
            }}
            onBlur={kiosk.flush}
          />
        )}
      </div>
    </Card>
  );
}
