import { useEffect, useMemo, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Card, cn, Toggle } from '@tepegoz/ui';
import { DATE_FORMAT_IDS, formatDateByFormat, type DateFormatId } from '@tepegoz/i18n';
import { useLocale, useT } from '@tepegoz/i18n/react';
import type { LocalePref, Preferences, ThemePref } from '@tepegoz/desktop-ipc';
import { getCountryDataList } from 'countries-list';
import { FlagSelect, type FlagOption } from './FlagSelect';
import { TURKIC_REGIONS, TURKIC_REGION_BASE_ISO, turkicFlagFor } from '../data/turkic-regions';
import { AA_NON_TEXT, AA_TEXT } from '@tepegoz/ui';
import { describeThemeColor } from '../lib/theme';
import { useCommitOnPause } from '../lib/use-commit-on-pause';
import { LOCALES, Select, THEMES } from './settings-shared';

/**
 * Appearance (theme + accent color) and language/region section content. Split out of
 * `SettingsPage.tsx` (ADR-0010 250-line cap).
 */

/** Every country's ISO 3166-1 alpha-2 (flag + Intl) and alpha-3 (stored value + shown code). */
const COUNTRIES: readonly { iso2: string; iso3: string }[] = getCountryDataList().map((c) => ({
  iso2: c.iso2,
  iso3: c.iso3,
}));
/** alpha-3 → alpha-2, so alpha-3 region values still format via Intl (which needs alpha-2). */
const ISO3_TO_ISO2: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.iso3, c.iso2]),
);
/** Per-locale display-name overrides where the CLDR/Intl label isn't wanted (TR → "Turkey" in English). */
const REGION_NAME_OVERRIDES: Record<string, Partial<Record<LocalePref, string>>> = {
  TR: { en: 'Turkey' },
};
/** Flag shown next to each UI language (a language is not a country, so this is a sensible mapping). */
const LOCALE_FLAG: Record<LocalePref, string | undefined> = {
  system: undefined,
  en: 'GB',
  tr: 'TR',
};
/** The named preset colors (name shown as a hover tooltip); keys map to `settingsDict.themeColorNames`. */
type ThemeColorName =
  'slate' | 'steel' | 'graphite' | 'turquoise' | 'violet' | 'maroon' | 'amber' | 'forest';
/** Preset single-color themes — muted, dark tones (no eye-searing brights). Incl. a brand turquoise. */
export const THEME_PRESETS: readonly { color: string; name: ThemeColorName }[] = [
  { color: '#1e293b', name: 'slate' },
  { color: '#334155', name: 'steel' },
  { color: '#3f3f46', name: 'graphite' },
  { color: '#0d7377', name: 'turquoise' },
  { color: '#4c1d95', name: 'violet' },
  { color: '#7f1d1d', name: 'maroon' },
  { color: '#78350f', name: 'amber' },
  { color: '#14532d', name: 'forest' },
];
const DEFAULT_CUSTOM_COLOR = '#334155';

const THEME_PREVIEW: Record<
  ThemePref,
  { bg: string; surface: string; text: string; accent: string }
> = {
  light: { bg: '#f3f4f6', surface: '#ffffff', text: '#111827', accent: '#0ea5e9' },
  dark: { bg: '#0b1220', surface: '#131c31', text: '#e5e7eb', accent: '#38bdf8' },
  // Neutral mid palette; the split background hints at "follows the OS".
  system: { bg: '#334155', surface: '#475569', text: '#f8fafc', accent: '#818cf8' },
};

/** A tiny mock-window swatch that previews a theme's palette (independent of the active theme). */
function ThemePreview({ theme }: { theme: ThemePref }) {
  const p = THEME_PREVIEW[theme];
  const bg =
    theme === 'system'
      ? { background: 'linear-gradient(135deg, #f3f4f6 0 50%, #0b1220 50% 100%)' }
      : { backgroundColor: p.bg };
  return (
    <div className="h-16 w-full overflow-hidden rounded-md border border-border" style={bg}>
      <div className="mx-2 mt-2 rounded" style={{ backgroundColor: p.surface, height: 10 }} />
      <div className="mx-2 mt-1 flex gap-1">
        <span style={{ backgroundColor: p.accent, width: 18, height: 6, borderRadius: 2 }} />
        <span
          style={{ backgroundColor: p.text, opacity: 0.4, width: 44, height: 6, borderRadius: 2 }}
        />
      </div>
    </div>
  );
}

/** A tiny white crescent-and-star (ay-yıldız) for the turquoise swatch. `bg` = the swatch color, used
 *  to "bite" the crescent so it blends with the button background regardless of the exact tone. */
function CrescentStar({ bg }: { bg: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 drop-shadow" aria-hidden>
      <circle cx="10.5" cy="12" r="6" fill="#ffffff" />
      <circle cx="13" cy="11" r="5.1" fill={bg} />
      <polygon
        fill="#ffffff"
        points="15.5,9.4 16.12,11.15 17.97,11.2 16.5,12.32 17.03,14.1 15.5,13.05 13.97,14.1 14.5,12.32 13.03,11.2 14.88,11.15"
      />
    </svg>
  );
}

/** Theme presets (system/light/dark) + a custom single-accent-color picker. */
export function AppearanceSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  // Glass (Win11 Mica) is OS-gated — only offer the toggle where the material can actually render.
  const [glassAvailable, setGlassAvailable] = useState(false);
  useEffect(() => {
    void window.tepegoz.getAppInfo().then(
      (info) => setGlassAvailable(info.glassAvailable),
      () => setGlassAvailable(false),
    );
  }, []);
  const themeLabel: Record<ThemePref, string> = {
    system: s.themeSystem,
    light: s.themeLight,
    dark: s.themeDark,
  };
  // The custom color picker is "active" when a color is set that isn't one of the presets.
  const customColorActive =
    prefs.themeColor !== '' &&
    !THEME_PRESETS.some((p) => p.color === prefs.themeColor.toLowerCase());

  // `<input type="color">` fires `change` continuously while the swatch is dragged. Bound straight to
  // `setPref`, one drag was an IPC round trip and a disk write per animation frame.
  const custom = useCommitOnPause(
    prefs.themeColor !== '' ? prefs.themeColor : DEFAULT_CUSTOM_COLOR,
    (value) => {
      setPref({ themeColor: value });
    },
    250,
  );
  const report = describeThemeColor(prefs.themeColor);
  const ratio = (n: number): string => `${n.toFixed(1)}:1`;

  return (
    <Card title={s.appearanceTitle}>
      <p className="mb-3 text-sm text-text-secondary">{s.themePreviewHint}</p>
      <div className="grid grid-cols-3 gap-3">
        {THEMES.map((th) => {
          const active = prefs.themeColor === '' && prefs.theme === th;
          return (
            <button
              key={th}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setPref({ theme: th, themeColor: '' });
              }}
              className={cn(
                'rounded-lg border p-2 text-left transition-colors',
                active
                  ? 'border-border-focus ring-2 ring-border-focus'
                  : 'border-border hover:border-border-focus',
              )}
            >
              <ThemePreview theme={th} />
              <span className="mt-2 block text-sm text-text-primary">{themeLabel[th]}</span>
            </button>
          );
        })}
      </div>

      <p className="mb-1 mt-5 text-sm font-medium text-text-primary">{s.colorTheme}</p>
      <p className="mb-3 text-xs text-text-secondary">{s.colorThemeHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        {THEME_PRESETS.map((preset) => {
          const active = prefs.themeColor.toLowerCase() === preset.color;
          const name = s.themeColorNames[preset.name];
          return (
            <button
              key={preset.color}
              type="button"
              title={name}
              aria-label={name}
              aria-pressed={active}
              onClick={() => {
                setPref({ themeColor: preset.color });
              }}
              style={{ backgroundColor: preset.color }}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border border-border transition-transform hover:scale-110',
                active && 'ring-2 ring-offset-2 ring-border-focus ring-offset-surface-raised',
              )}
            >
              {preset.name === 'turquoise' && <CrescentStar bg={preset.color} />}
            </button>
          );
        })}
        <label
          className={cn(
            // `relative` contains the `sr-only` (position:absolute) colour input below — without it the
            // input's containing block is the page surface, so it escapes the settings scroll area and
            // extends the document's scroll height (see DataTable.tsx for the same trap).
            'relative flex h-8 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm text-text-primary',
            customColorActive && 'ring-2 ring-border-focus',
          )}
        >
          <span
            className="h-4 w-4 rounded-full border border-border"
            style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
            aria-hidden
          />
          {s.customColor}
          <input
            type="color"
            className="sr-only"
            value={custom.draft}
            onChange={(e) => {
              custom.set(e.target.value);
            }}
            onBlur={custom.flush}
          />
        </label>
      </div>

      {report !== null && (
        // The derivation, read out. `applyTheme` solves each token for a WCAG threshold rather than
        // guessing a shade amount, and this is that result — so "contrast is chosen automatically"
        // becomes something the user can check rather than something they have to believe.
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
          <span
            className="flex h-9 items-center gap-2 rounded px-2 text-xs"
            style={{ backgroundColor: report.surface, color: report.text }}
          >
            {s.contrastSample}
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: report.accent }}
              aria-hidden
            />
          </span>
          <span className="text-xs text-text-secondary">
            {s.contrastText}: <span className="font-mono">{ratio(report.textRatio)}</span>
            {' · '}
            {s.contrastAccent}: <span className="font-mono">{ratio(report.accentRatio)}</span>
            {' · '}
            {s.contrastAccentLabel}:{' '}
            <span className="font-mono">{ratio(report.accentLabelRatio)}</span>
          </span>
          <span className="text-xs text-text-disabled">
            {s.contrastTargets
              .replace('{text}', ratio(AA_TEXT))
              .replace('{nonText}', ratio(AA_NON_TEXT))}
          </span>
        </div>
      )}

      {glassAvailable && (
        <div className="mt-5 border-t border-border pt-4">
          <Toggle
            id="glass-chrome"
            label={s.glassTitle}
            description={s.glassHint}
            checked={prefs.glassChrome}
            onChange={(v) => {
              setPref({ glassChrome: v });
            }}
          />
        </div>
      )}
    </Card>
  );
}

/** Language, region, and date-format pickers with a live date preview. */
export function LanguageRegionSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const uiLocale = useLocale();
  const localeLabel: Record<LocalePref, string> = {
    system: s.langSystem,
    en: 'English',
    tr: 'Türkçe',
  };
  const dateFormatLabel: Record<DateFormatId, string> = {
    short: s.dateShort,
    medium: s.dateMedium,
    long: s.dateLong,
    full: s.dateFull,
    iso: s.dateIso,
    'dmy-slash': s.dateDmySlash,
    'mdy-slash': s.dateMdySlash,
    'dmy-dot': s.dateDmyDot,
    'd-mmm-y': s.dateShortMonth,
  };

  // Build a BCP-47 tag from language + region so date examples follow the chosen language + region.
  // Custom (non-ISO) regions map to a base ISO region so the tag stays valid for Intl.
  const lang = prefs.locale === 'system' ? uiLocale : prefs.locale;
  const fmtRegion =
    TURKIC_REGION_BASE_ISO[prefs.region] ?? ISO3_TO_ISO2[prefs.region] ?? prefs.region;
  const tag = fmtRegion.length > 0 ? `${lang}-${fmtRegion}` : lang;
  const SAMPLE_DATE = new Date(2026, 0, 15);
  const dateFormat: DateFormatId = (DATE_FORMAT_IDS as readonly string[]).includes(prefs.dateFormat)
    ? (prefs.dateFormat as DateFormatId)
    : 'medium';
  function dateExample(id: DateFormatId): string {
    try {
      return formatDateByFormat(SAMPLE_DATE, tag, id);
    } catch {
      return '';
    }
  }
  const preview = dateExample(dateFormat);
  /**
   * Numbers follow the same language+region tag as dates, and get grouped and pointed differently
   * because of it — `1.234.567,89` in Turkish, `1,234,567.89` in English. The page was previewing only
   * the date, so the half of the choice that changes every figure in the app went unshown.
   */
  const numberPreview = ((): string => {
    try {
      return new Intl.NumberFormat(tag).format(1234567.89);
    } catch {
      return '';
    }
  })();

  const languageOptions: FlagOption[] = LOCALES.map((lc) => ({
    value: lc,
    label: localeLabel[lc],
    iso2: LOCALE_FLAG[lc],
  }));

  // Localize every country name via Intl.DisplayNames (Turkish-first), then sort by that name.
  // Memoized because it builds ~250 entries and only depends on the UI locale + the "system" label.
  const regionOptions = useMemo<FlagOption[]>(() => {
    let dn: Intl.DisplayNames | null = null;
    try {
      dn = new Intl.DisplayNames([uiLocale], { type: 'region' });
    } catch {
      dn = null;
    }
    const countries: FlagOption[] = COUNTRIES.map(({ iso2, iso3 }) => ({
      value: iso3,
      iso2,
      code: iso3,
      label: REGION_NAME_OVERRIDES[iso2]?.[uiLocale] ?? dn?.of(iso2) ?? iso2,
    }));
    // Turkic regions/peoples that are not ISO countries: bundled flag + 3-letter code, mixed in by name.
    const turkic: FlagOption[] = TURKIC_REGIONS.map((r) => ({
      value: r.code,
      code: r.code,
      iso2: r.iso2,
      flagSrc: turkicFlagFor(r.code),
      label: uiLocale === 'tr' ? r.tr : r.en,
    }));
    const merged = [...countries, ...turkic].sort((a, b) =>
      a.label.localeCompare(b.label, uiLocale),
    );
    return [{ value: '', label: s.regionSystem }, ...merged];
  }, [uiLocale, s.regionSystem]);

  return (
    <Card title={s.languageRegionTitle}>
      <div className="space-y-4">
        <FlagSelect
          id="language"
          label={s.languageLabel}
          value={prefs.locale}
          onChange={(v) => {
            setPref({ locale: v as LocalePref });
          }}
          options={languageOptions}
          searchable
          searchPlaceholder={s.languageSearchPlaceholder}
          noResultsLabel={s.searchNoResults}
        />

        <FlagSelect
          id="region"
          label={s.regionLabel}
          value={prefs.region}
          onChange={(v) => {
            setPref({ region: v });
          }}
          options={regionOptions}
          searchable
          searchPlaceholder={s.regionSearchPlaceholder}
          noResultsLabel={s.searchNoResults}
        />

        <Select
          id="date-format"
          label={s.dateFormatLabel}
          value={dateFormat}
          onChange={(v) => {
            setPref({ dateFormat: v });
          }}
        >
          {DATE_FORMAT_IDS.map((id) => (
            <option key={id} value={id}>
              {dateFormatLabel[id]} — {dateExample(id)}
            </option>
          ))}
        </Select>

        {preview.length > 0 && (
          <p className="text-sm text-text-secondary">
            {s.previewLabel}: <span className="text-text-primary">{preview}</span>
            {numberPreview !== '' && (
              <>
                {' · '}
                <span className="text-text-primary">{numberPreview}</span>
              </>
            )}
          </p>
        )}
      </div>
    </Card>
  );
}
