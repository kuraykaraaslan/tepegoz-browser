import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell,
  faCircleInfo,
  faCreditCard,
  faDesktop,
  faDownload,
  faGauge,
  faGear,
  faGlobe,
  faGripVertical,
  faKey,
  faLock,
  faMagnifyingGlass,
  faPalette,
  faPlug,
  faRotateLeft,
  faShield,
  faSliders,
  faUniversalAccess,
} from '@fortawesome/free-solid-svg-icons';
import {
  ComingSoonCard,
  SettingsLayout,
  settingsDict,
  type SettingsSection,
} from '@tepegoz/settings-ui';
import { AlertBanner, Badge, Button, Card, cn, Input, Toggle } from '@tepegoz/ui';
import { coreDict, DATE_FORMAT_IDS, formatDateByFormat, type DateFormatId } from '@tepegoz/i18n';
import { useLocale, useT } from '@tepegoz/i18n/react';
import { DEFAULT_SEARCH_ENGINE_ID, SEARCH_ENGINES } from '@tepegoz/shared-types/search-engines';
import { isRunnableProvider, LOCALE_PREFS, PROVIDER_IDS, THEME_PREFS } from '@tepegoz/desktop-ipc';
import type {
  AppInfo,
  CredentialsStatus,
  LocalePref,
  LoginCredentialMeta,
  LoginImportResult,
  McpServerState,
  McpServerStatusInfo,
  Preferences,
  ProviderId,
  ProviderKeyMeta,
  ThemePref,
} from '@tepegoz/desktop-ipc';
import { CredentialsSettings, ImportExportPanel } from '@tepegoz/password-ui';
import { getCountryDataList } from 'countries-list';
import { FlagSelect, type FlagOption } from './FlagSelect';
import { TURKIC_REGIONS, TURKIC_REGION_BASE_ISO, turkicFlagFor } from '../data/turkic-regions';

// Reuse the canonical value lists (single source in @tepegoz/desktop-ipc / @tepegoz/shared-types) so
// the picker never drifts from the schema — no locally duplicated provider/theme/locale arrays.
const PROVIDERS: readonly ProviderId[] = PROVIDER_IDS;
const THEMES: readonly ThemePref[] = THEME_PREFS;
const LOCALES: readonly LocalePref[] = LOCALE_PREFS;
/** Every country's ISO 3166-1 alpha-2 (flag + Intl) and alpha-3 (stored value + shown code). */
const COUNTRIES: readonly { iso2: string; iso3: string }[] = getCountryDataList().map((c) => ({
  iso2: c.iso2,
  iso3: c.iso3,
}));
/** alpha-3 → alpha-2, so alpha-3 region values still format via Intl (which needs alpha-2). */
const ISO3_TO_ISO2: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.iso3, c.iso2]));
/** Per-locale display-name overrides where the CLDR/Intl label isn't wanted (TR → "Turkey" in English). */
const REGION_NAME_OVERRIDES: Record<string, Partial<Record<LocalePref, string>>> = {
  TR: { en: 'Turkey' },
};
/** Flag shown next to each UI language (a language is not a country, so this is a sensible mapping). */
const LOCALE_FLAG: Record<LocalePref, string | undefined> = { system: undefined, en: 'GB', tr: 'TR' };
/** The named preset colors (name shown as a hover tooltip); keys map to `settingsDict.themeColorNames`. */
type ThemeColorName =
  | 'slate'
  | 'steel'
  | 'graphite'
  | 'turquoise'
  | 'violet'
  | 'maroon'
  | 'amber'
  | 'forest';
/** Preset single-color themes — muted, dark tones (no eye-searing brights). Incl. a brand turquoise. */
const THEME_PRESETS: readonly { color: string; name: ThemeColorName }[] = [
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

const ICON = 'h-4 w-4';
const IconKey = () => <FontAwesomeIcon icon={faKey} className={ICON} aria-hidden />;
const IconPalette = () => <FontAwesomeIcon icon={faPalette} className={ICON} aria-hidden />;
const IconGlobe = () => <FontAwesomeIcon icon={faGlobe} className={ICON} aria-hidden />;
const IconShield = () => <FontAwesomeIcon icon={faShield} className={ICON} aria-hidden />;
const IconGauge = () => <FontAwesomeIcon icon={faGauge} className={ICON} aria-hidden />;
const IconBell = () => <FontAwesomeIcon icon={faBell} className={ICON} aria-hidden />;
const IconPlug = () => <FontAwesomeIcon icon={faPlug} className={ICON} aria-hidden />;
const IconLock = () => <FontAwesomeIcon icon={faLock} className={ICON} aria-hidden />;
const IconSearch = () => <FontAwesomeIcon icon={faMagnifyingGlass} className={ICON} aria-hidden />;
const IconDownload = () => <FontAwesomeIcon icon={faDownload} className={ICON} aria-hidden />;
const IconA11y = () => <FontAwesomeIcon icon={faUniversalAccess} className={ICON} aria-hidden />;
const IconSliders = () => <FontAwesomeIcon icon={faSliders} className={ICON} aria-hidden />;
const IconCard = () => <FontAwesomeIcon icon={faCreditCard} className={ICON} aria-hidden />;
const IconDesktop = () => <FontAwesomeIcon icon={faDesktop} className={ICON} aria-hidden />;
const IconReset = () => <FontAwesomeIcon icon={faRotateLeft} className={ICON} aria-hidden />;
const IconInfo = () => <FontAwesomeIcon icon={faCircleInfo} className={ICON} aria-hidden />;
const IconGear = () => <FontAwesomeIcon icon={faGear} className="h-5 w-5" aria-hidden />;

type Notify = (variant: 'success' | 'error', message: string) => void;

/** A minimal styled native <select> (no Select atom in @tepegoz/ui yet). */
function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="block">
      {label !== undefined && (
        <span className="mb-1 block text-sm font-medium text-text-primary">{label}</span>
      )}
      <select
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="h-9 w-full rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        {children}
      </select>
    </label>
  );
}

const THEME_PREVIEW: Record<ThemePref, { bg: string; surface: string; text: string; accent: string }> = {
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
        <span style={{ backgroundColor: p.text, opacity: 0.4, width: 44, height: 6, borderRadius: 2 }} />
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

/** Read-only list of configured MCP servers + their live connection state (polled while open). */
function McpConnectionsSection({
  getMcpStatus,
  labels,
}: {
  getMcpStatus: () => Promise<McpServerStatusInfo[]>;
  labels: {
    empty: string;
    tools: string;
    stateLabel: Record<McpServerState, string>;
  };
}) {
  const [servers, setServers] = useState<McpServerStatusInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void getMcpStatus().then(
        (s) => {
          if (alive) setServers(s);
        },
        () => {
          /* status unavailable — leave the list as-is */
        },
      );
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [getMcpStatus]);

  if (servers.length === 0) {
    return <p className="text-sm text-text-secondary">{labels.empty}</p>;
  }
  return (
    <div className="space-y-3">
      {servers.map((srv) => (
        <div key={srv.id} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-sm font-medium text-text-primary">{srv.label}</span>
            <span className="ml-2 text-xs text-text-secondary">
              {srv.transport}
              {srv.state === 'ready' ? ` · ${String(srv.toolCount)} ${labels.tools}` : ''}
            </span>
          </div>
          <Badge
            variant={srv.state === 'ready' ? 'success' : srv.state === 'error' ? 'error' : 'neutral'}
            dot
          >
            {labels.stateLabel[srv.state]}
          </Badge>
        </div>
      ))}
    </div>
  );
}

/**
 * Providers & API keys. One "add" row (provider dropdown + label + key) feeds a SINGLE drag-reorderable
 * list of every stored key. Priority is order: the topmost key is the default (its provider becomes the
 * default provider). The raw key never returns — a row shows only its label + a non-secret `…last4`.
 */
function ProvidersSection({
  keys,
  encryptionAvailable,
  onAdd,
  onRemoveById,
  onRename,
  onReorder,
  notify,
}: {
  keys: ProviderKeyMeta[];
  encryptionAvailable: boolean;
  onAdd: (provider: ProviderId, label: string, apiKey: string) => Promise<void>;
  onRemoveById: (id: string) => Promise<void>;
  onRename: (id: string, label: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  notify: Notify;
}) {
  const s = useT(settingsDict);
  const c = useT(coreDict);
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [label, setLabel] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  async function add(): Promise<void> {
    const key = keyValue.trim();
    if (key.length === 0) return;
    const lbl = label.trim().length > 0 ? label.trim() : s.providerNames[provider];
    try {
      await onAdd(provider, lbl, key);
      setLabel('');
      setKeyValue('');
      notify('success', s.keyAdded);
    } catch {
      notify('error', c.errors.upstreamDown);
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await onRemoveById(id);
      notify('success', s.keyRemoved);
    } catch {
      notify('error', c.errors.upstreamDown);
    }
  }

  async function commitRename(id: string): Promise<void> {
    const lbl = renameDraft.trim();
    if (lbl.length === 0) return;
    try {
      await onRename(id, lbl);
      setRenamingId(null);
      notify('success', s.keyRenamed);
    } catch {
      notify('error', c.errors.upstreamDown);
    }
  }

  function drop(targetId: string): void {
    const from = keys.findIndex((k) => k.id === dragId);
    const to = keys.findIndex((k) => k.id === targetId);
    setDragId(null);
    if (from < 0 || to < 0 || from === to) return;
    const ids = keys.map((k) => k.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    void onReorder(ids).then(
      () => {
        notify('success', s.keysReordered);
      },
      () => {
        notify('error', c.errors.upstreamDown);
      },
    );
  }

  return (
    <Card title={s.providersTitle} subtitle={s.providersSubtitle}>
      {!encryptionAvailable && (
        <AlertBanner variant="error" message={s.encryptionUnavailable} className="mb-4" />
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="w-44">
          <Select
            id="provider-select"
            label={s.providerSelectLabel}
            value={provider}
            onChange={(v) => {
              setProvider(v as ProviderId);
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {s.providerNames[p]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-36">
          <Input
            id="key-label"
            label={s.keyLabel}
            placeholder={s.keyLabelPlaceholder}
            value={label}
            disabled={!encryptionAvailable}
            onChange={(e) => {
              setLabel(e.target.value);
            }}
          />
        </div>
        <div className="min-w-48 flex-1">
          <Input
            id="key-value"
            label={s.apiKey}
            type="password"
            placeholder={s.apiKeyPlaceholder}
            value={keyValue}
            disabled={!encryptionAvailable}
            showPasswordLabel={c.common.showPassword}
            hidePasswordLabel={c.common.hidePassword}
            onChange={(e) => {
              setKeyValue(e.target.value);
            }}
          />
        </div>
        {/* h-[38px] + mb-1 aligns the button box with the Input/Select boxes, whose wrappers
            add a label above and a ~4px hint gap below (space-y-1). */}
        <Button
          type="submit"
          size="sm"
          className="mb-1 h-[38px]"
          disabled={!encryptionAvailable || keyValue.trim().length === 0}
        >
          {s.addKey}
        </Button>
      </form>

      {keys.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{s.noKeysYet}</p>
      ) : (
        <>
          <p className="mb-2 mt-5 text-xs text-text-secondary">{s.reorderHint}</p>
          <ul className="space-y-1.5">
            {keys.map((k, index) => {
              const isRenaming = renamingId === k.id;
              return (
                <li
                  key={k.id}
                  draggable={!isRenaming}
                  onDragStart={() => {
                    setDragId(k.id);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={() => {
                    drop(k.id);
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-md border border-border px-3 py-2',
                    dragId === k.id && 'opacity-50',
                  )}
                >
                  <span className="cursor-grab text-text-secondary" aria-hidden>
                    <FontAwesomeIcon icon={faGripVertical} className="h-3.5 w-3.5" />
                  </span>
                  {isRenaming ? (
                    <form
                      className="flex flex-1 items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void commitRename(k.id);
                      }}
                    >
                      <Input
                        id={`rename-${k.id}`}
                        label={s.keyLabel}
                        value={renameDraft}
                        onChange={(e) => {
                          setRenameDraft(e.target.value);
                        }}
                      />
                      <Button type="submit" size="sm" disabled={renameDraft.trim().length === 0}>
                        {c.common.save}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRenamingId(null);
                        }}
                      >
                        {s.cancel}
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-text-primary">{k.label}</span>
                        {k.last4.length > 0 && (
                          <span className="ml-2 font-mono text-xs text-text-secondary">
                            …{k.last4}
                          </span>
                        )}
                        <span className="ml-2 text-xs text-text-secondary">
                          {s.providerNames[k.provider]}
                        </span>
                        {k.provider !== undefined && !isRunnableProvider(k.provider) && (
                          <span className="ml-2 text-xs text-text-disabled">
                            {s.providerNotUsableYet}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {index === 0 && (
                          <Badge variant="success" dot>
                            {s.defaultBadge}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRenamingId(k.id);
                            setRenameDraft(k.label);
                          }}
                        >
                          {s.rename}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void remove(k.id)}>
                          {s.remove}
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

/** Language, region, and date-format pickers with a live date preview. */
/**
 * Homepage URL + default/custom search engines. The homepage drives new tabs, the Home button, and a
 * blank omnibox submit; the search engine (built-in or user-added) resolves typed omnibox queries.
 * Custom engines are persisted in `prefs.customSearchEngines` and merged with the built-in list.
 */
function SearchStartupSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const engines = [...SEARCH_ENGINES, ...prefs.customSearchEngines];
  const urlInvalid = url.length > 0 && !url.includes('{q}');
  const canAdd = name.trim().length > 0 && url.trim().length > 0 && !urlInvalid;

  function addEngine(): void {
    if (!canAdd) return;
    const engine = { id: `custom-${crypto.randomUUID()}`, name: name.trim(), searchUrlTemplate: url.trim() };
    setPref({ customSearchEngines: [...prefs.customSearchEngines, engine] });
    setName('');
    setUrl('');
  }

  function removeEngine(id: string): void {
    setPref({
      customSearchEngines: prefs.customSearchEngines.filter((e) => e.id !== id),
      // If the removed engine was the selected default, fall back to the built-in default.
      ...(prefs.searchEngineId === id ? { searchEngineId: DEFAULT_SEARCH_ENGINE_ID } : {}),
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <Input
          id="homepage-url"
          label={s.homepageLabel}
          hint={s.homepageDesc}
          placeholder={s.homepagePlaceholder}
          value={prefs.homepageUrl}
          onChange={(e) => {
            setPref({ homepageUrl: e.target.value });
          }}
        />
      </Card>

      <Card title={s.searchEngineLabel} subtitle={s.searchEngineDesc}>
        <Select
          id="search-engine"
          value={prefs.searchEngineId}
          onChange={(v) => {
            setPref({ searchEngineId: v });
          }}
        >
          {engines.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>

        {prefs.customSearchEngines.length > 0 && (
          <ul className="mt-4 space-y-2">
            {prefs.customSearchEngines.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary">{e.name}</div>
                  <div className="truncate text-xs text-text-secondary">{e.searchUrlTemplate}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    removeEngine(e.id);
                  }}
                >
                  {s.searchEngineRemove}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-2">
          <span className="block text-sm font-medium text-text-primary">{s.searchEngineCustom}</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              id="custom-engine-name"
              label={s.searchEngineCustomName}
              placeholder={s.searchEngineCustomName}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
            <Input
              id="custom-engine-url"
              label={s.searchEngineCustomUrl}
              placeholder={s.searchEngineCustomUrlPlaceholder}
              value={url}
              {...(urlInvalid ? { error: s.searchEngineCustomInvalid } : {})}
              onChange={(e) => {
                setUrl(e.target.value);
              }}
            />
            <Button size="sm" variant="outline" disabled={!canAdd} onClick={addEngine}>
              {s.searchEngineCustomAdd}
            </Button>
          </div>
          <p className="text-xs text-text-secondary">{s.searchEngineCustomUrlHint}</p>
        </div>
      </Card>
    </div>
  );
}

function LanguageRegionSection({
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
    const merged = [...countries, ...turkic].sort((a, b) => a.label.localeCompare(b.label, uiLocale));
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
          </p>
        )}
      </div>
    </Card>
  );
}

/** Per-origin web-capability permissions (currently notifications consent), with a per-origin reset. */
function SitePermissionsSection({
  sitePermissions,
  onReset,
}: {
  sitePermissions: Preferences['sitePermissions'];
  onReset: (origin: string) => void;
}) {
  const s = useT(settingsDict);
  const entries = Object.entries(sitePermissions);
  return (
    <Card title={s.sitePermissionsTitle} subtitle={s.sitePermissionsSubtitle}>
      {entries.length === 0 ? (
        <p className="text-sm text-text-secondary">{s.sitePermissionsEmpty}</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map(([origin, perms]) => (
            <li
              key={origin}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <span className="truncate font-mono text-xs text-text-primary">{origin}</span>
                {perms.notifications !== undefined && (
                  <span className="ml-2 text-xs text-text-secondary">
                    {s.sitePermissionNotifications}: {perms.notifications}
                  </span>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => onReset(origin)}>
                {s.permissionReset}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** About: project blurb + app info + the author's links (open in a new tab). */
function AboutSection() {
  const s = useT(settingsDict);
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.tepegoz.getAppInfo().then(setInfo, () => {
      /* leave null */
    });
  }, []);
  const open = (url: string): void => {
    window.tepegoz.createTab(url);
  };
  return (
    <div className="space-y-6">
      <Card title={s.aboutProjectTitle}>
        <p className="text-sm text-text-secondary">{s.aboutProjectDesc}</p>
        {info !== null && (
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-text-secondary">{s.aboutName}</dt>
            <dd className="text-text-primary">{info.name}</dd>
            <dt className="text-text-secondary">{s.aboutVersion}</dt>
            <dd className="font-mono text-text-primary">{info.version}</dd>
            <dt className="text-text-secondary">{s.aboutPlatform}</dt>
            <dd className="font-mono text-text-primary">{info.platform}</dd>
          </dl>
        )}
      </Card>
      <Card title={s.aboutAuthorTitle}>
        <p className="mb-3 text-sm font-medium text-text-primary">{s.authorName}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => open('https://kuray.dev')}>
            {s.aboutWebsite}
          </Button>
          <Button size="sm" variant="outline" onClick={() => open('https://github.com/kuraykaraaslan')}>
            {s.aboutGithub}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => open('https://www.linkedin.com/in/kuraykaraaslan')}
          >
            {s.aboutLinkedin}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => open('https://www.instagram.com/kuraykaraaslan')}
          >
            {s.aboutInstagram}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PasswordsSection({
  credentials,
  onMount,
  onAdd,
  onRemove,
  onImport,
  onExport,
}: {
  credentials: LoginCredentialMeta[];
  onMount: () => Promise<void>;
  onAdd: (c: { url: string; username: string; password: string; title?: string; notes?: string }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onImport: (data: string, format: string) => Promise<LoginImportResult>;
  onExport: (format: string) => Promise<string>;
}) {
  const s = useT(settingsDict);
  useEffect(() => {
    void onMount();
  }, []);

  return (
    <Card title={s.passwordsTitle}>
      <div className="space-y-4">
        <CredentialsSettings credentials={credentials} onAdd={onAdd} onRemove={onRemove} />
        <ImportExportPanel onImport={onImport} onExport={onExport} />
      </div>
    </Card>
  );
}

interface SettingsPageProps {
  prefs: Preferences;
  status: CredentialsStatus;
  onUpdatePrefs: (patch: Partial<Preferences>) => Promise<void>;
  /** Reset every preference to its default (leaves stored credentials untouched). */
  onResetPrefs: () => Promise<void>;
  onAddKey: (provider: ProviderId, label: string, apiKey: string) => Promise<void>;
  onRemoveKeyById: (id: string) => Promise<void>;
  onRenameKey: (id: string, label: string) => Promise<void>;
  onReorderKeys: (orderedIds: string[]) => Promise<void>;
  getMcpStatus: () => Promise<McpServerStatusInfo[]>;
  loginCredentials: LoginCredentialMeta[];
  onLoginSectionMount: () => Promise<void>;
  onAddLogin: (c: { url: string; username: string; password: string; title?: string; notes?: string }) => Promise<void>;
  onRemoveLogin: (id: string) => Promise<void>;
  onImportLogins: (data: string, format: string) => Promise<LoginImportResult>;
  onExportLogins: (format: string) => Promise<string>;
}

export function SettingsPage({
  prefs,
  status,
  onUpdatePrefs,
  onResetPrefs,
  onAddKey,
  onRemoveKeyById,
  onRenameKey,
  onReorderKeys,
  getMcpStatus,
  loginCredentials,
  onLoginSectionMount,
  onAddLogin,
  onRemoveLogin,
  onImportLogins,
  onExportLogins,
}: SettingsPageProps) {
  const s = useT(settingsDict);
  const c = useT(coreDict);
  const [feedback, setFeedback] = useState<{
    variant: 'success' | 'error';
    message: string;
  } | null>(null);
  const [feedbackKey, setFeedbackKey] = useState(0);

  function notify(variant: 'success' | 'error', message: string): void {
    setFeedback({ variant, message });
    setFeedbackKey((k) => k + 1);
  }

  // Transient feedback auto-dismisses — no manual close button (avoids a non-localized control).
  useEffect(() => {
    if (feedbackKey === 0) return undefined;
    const id = setTimeout(() => {
      setFeedback(null);
    }, 4000);
    return () => {
      clearTimeout(id);
    };
  }, [feedbackKey]);

  const themeLabel: Record<ThemePref, string> = {
    system: s.themeSystem,
    light: s.themeLight,
    dark: s.themeDark,
  };
  // The custom color picker is "active" when a color is set that isn't one of the presets.
  const customColorActive =
    prefs.themeColor !== '' &&
    !THEME_PRESETS.some((p) => p.color === prefs.themeColor.toLowerCase());

  function setPref(patch: Partial<Preferences>): void {
    void onUpdatePrefs(patch).catch(() => {
      notify('error', c.errors.upstreamDown);
    });
  }

  function resetSitePermission(origin: string): void {
    const next = { ...prefs.sitePermissions };
    delete next[origin];
    setPref({ sitePermissions: next });
  }

  function clearBrowsingHistory(): void {
    void window.tepegoz.clearHistory().then(
      () => {
        notify('success', s.historyCleared);
      },
      () => {
        notify('error', c.errors.upstreamDown);
      },
    );
  }

  function resetToDefaults(): void {
    if (!window.confirm(s.resetConfirm)) return;
    void onResetPrefs().then(
      () => {
        notify('success', s.resetDone);
      },
      () => {
        notify('error', c.errors.upstreamDown);
      },
    );
  }

  const G_GENERAL = s.groupGeneral;
  const G_AI = s.groupAiAgent;
  const G_PRIVACY = s.groupPrivacy;
  const G_ADVANCED = s.groupAdvanced;
  const G_ABOUT = s.groupAbout;

  const sections: SettingsSection[] = [
    // ---------- General ----------
    {
      id: 'appearance',
      group: G_GENERAL,
      label: s.appearanceTitle,
      icon: <IconPalette />,
      searchText: `${s.appearanceTitle} ${s.theme} ${s.themeSystem} ${s.themeLight} ${s.themeDark}`,
      content: (
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
                'flex h-8 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm text-text-primary',
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
                value={prefs.themeColor !== '' ? prefs.themeColor : DEFAULT_CUSTOM_COLOR}
                onChange={(e) => {
                  setPref({ themeColor: e.target.value });
                }}
              />
            </label>
          </div>
        </Card>
      ),
    },
    {
      id: 'language',
      group: G_GENERAL,
      label: s.languageRegionTitle,
      icon: <IconGlobe />,
      searchText: `${s.languageRegionTitle} ${s.languageLabel} ${s.regionLabel} ${s.dateFormatLabel}`,
      content: <LanguageRegionSection prefs={prefs} setPref={setPref} />,
    },
    {
      id: 'preferences',
      group: G_GENERAL,
      label: s.preferencesTitle,
      icon: <IconSearch />,
      searchText: `${s.preferencesTitle} ${s.searchEngineLabel} ${s.coming.onStartup.title} ${SEARCH_ENGINES.map((e) => e.name).join(' ')}`,
      content: (
        <div className="space-y-6">
          <ComingSoonCard
            title={s.coming.onStartup.title}
            description={s.coming.onStartup.description}
            items={s.coming.onStartup.items}
          />
          <SearchStartupSection prefs={prefs} setPref={setPref} />
        </div>
      ),
    },
    {
      id: 'downloads',
      group: G_GENERAL,
      label: s.coming.downloads.title,
      icon: <IconDownload />,
      searchText: `${s.coming.downloads.title} ${s.coming.downloads.description}`,
      content: (
        <ComingSoonCard
          title={s.coming.downloads.title}
          description={s.coming.downloads.description}
          items={s.coming.downloads.items}
        />
      ),
    },
    {
      id: 'accessibility',
      group: G_GENERAL,
      label: s.coming.accessibility.title,
      icon: <IconA11y />,
      searchText: `${s.coming.accessibility.title} ${s.coming.accessibility.description}`,
      content: (
        <ComingSoonCard
          title={s.coming.accessibility.title}
          description={s.coming.accessibility.description}
        />
      ),
    },
    {
      id: 'notifications',
      group: G_GENERAL,
      label: s.notificationsTitle,
      icon: <IconBell />,
      searchText: `${s.notificationsTitle} ${s.notifications} ${s.notificationsDesc}`,
      content: (
        <Card title={s.notificationsTitle}>
          <Toggle
            id="notifications-enabled"
            label={s.notifications}
            description={s.notificationsDesc}
            checked={prefs.notificationsEnabled}
            onChange={(v) => {
              setPref({ notificationsEnabled: v });
            }}
          />
        </Card>
      ),
    },
    // ---------- AI & Agent ----------
    {
      id: 'providers',
      group: G_AI,
      label: s.providersTitle,
      icon: <IconKey />,
      searchText: `${s.providersTitle} ${s.providersSubtitle} ${s.apiKey} ${s.addKey} ${PROVIDERS.map((p) => s.providerNames[p]).join(' ')}`,
      content: (
        <ProvidersSection
          keys={status.keys}
          encryptionAvailable={status.encryptionAvailable}
          onAdd={onAddKey}
          onRemoveById={onRemoveKeyById}
          onRename={onRenameKey}
          onReorder={onReorderKeys}
          notify={notify}
        />
      ),
    },
    {
      id: 'cost',
      group: G_AI,
      label: s.costTitle,
      icon: <IconGauge />,
      searchText: `${s.costTitle} ${s.localModel} ${s.localModelDesc}`,
      content: (
        <Card title={s.costTitle}>
          <Toggle
            id="local-model"
            label={s.localModel}
            description={s.localModelDesc}
            checked={prefs.useLocalModelForSimpleTasks}
            onChange={(v) => {
              setPref({ useLocalModelForSimpleTasks: v });
            }}
          />
        </Card>
      ),
    },
    {
      id: 'connections',
      group: G_AI,
      label: s.connectionsTitle,
      icon: <IconPlug />,
      searchText: `${s.connectionsTitle} ${s.connectionsSubtitle} MCP`,
      content: (
        <Card title={s.connectionsTitle} subtitle={s.connectionsSubtitle}>
          <McpConnectionsSection
            getMcpStatus={getMcpStatus}
            labels={{
              empty: s.mcpNoServers,
              tools: s.mcpToolCount,
              stateLabel: {
                idle: s.mcpStateIdle,
                connecting: s.mcpStateConnecting,
                ready: s.mcpStateReady,
                error: s.mcpStateError,
              },
            }}
          />
        </Card>
      ),
    },
    {
      id: 'agent-controls',
      group: G_AI,
      label: s.coming.agentControls.title,
      icon: <IconSliders />,
      searchText: `${s.coming.agentControls.title} ${s.coming.agentControls.description}`,
      content: (
        <ComingSoonCard
          title={s.coming.agentControls.title}
          description={s.coming.agentControls.description}
          items={s.coming.agentControls.items}
        />
      ),
    },
    // ---------- Privacy & security ----------
    {
      id: 'privacy',
      group: G_PRIVACY,
      label: s.privacyTitle,
      icon: <IconShield />,
      searchText: `${s.privacyTitle} ${s.telemetry} ${s.telemetryDesc} ${s.clearHistoryLabel}`,
      content: (
        <Card title={s.privacyTitle}>
          <div className="space-y-4">
            <Toggle
              id="telemetry"
              label={s.telemetry}
              description={s.telemetryDesc}
              checked={prefs.telemetryEnabled}
              onChange={(v) => {
                setPref({ telemetryEnabled: v });
              }}
            />
            <div>
              <p className="text-sm font-medium text-text-primary">{s.clearHistoryLabel}</p>
              <p className="mb-2 text-xs text-text-secondary">{s.clearHistoryDesc}</p>
              <Button size="sm" variant="outline" onClick={clearBrowsingHistory}>
                {s.clearHistoryButton}
              </Button>
            </div>
          </div>
        </Card>
      ),
    },
    {
      id: 'site-permissions',
      group: G_PRIVACY,
      label: s.sitePermissionsTitle,
      icon: <IconLock />,
      searchText: `${s.sitePermissionsTitle} ${s.sitePermissionsSubtitle} ${s.sitePermissionNotifications}`,
      content: (
        <SitePermissionsSection
          sitePermissions={prefs.sitePermissions}
          onReset={resetSitePermission}
        />
      ),
    },
    {
      id: 'passwords',
      group: G_PRIVACY,
      label: s.passwordsTitle,
      icon: <IconLock />,
      searchText: `${s.passwordsTitle} logins autofill credentials import export Google CSV`,
      content: (
        <PasswordsSection
          credentials={loginCredentials}
          onMount={onLoginSectionMount}
          onAdd={onAddLogin}
          onRemove={onRemoveLogin}
          onImport={onImportLogins}
          onExport={onExportLogins}
        />
      ),
    },
    {
      id: 'autofill',
      group: G_PRIVACY,
      label: s.coming.autofill.title,
      icon: <IconCard />,
      searchText: `${s.coming.autofill.title} ${s.coming.autofill.description}`,
      content: (
        <ComingSoonCard
          title={s.coming.autofill.title}
          description={s.coming.autofill.description}
          items={s.coming.autofill.items}
        />
      ),
    },
    // ---------- Advanced ----------
    {
      id: 'system',
      group: G_ADVANCED,
      label: s.coming.system.title,
      icon: <IconDesktop />,
      searchText: `${s.coming.system.title} ${s.coming.system.description}`,
      content: (
        <ComingSoonCard
          title={s.coming.system.title}
          description={s.coming.system.description}
          items={s.coming.system.items}
        />
      ),
    },
    {
      id: 'reset',
      group: G_ADVANCED,
      label: s.resetTitle,
      icon: <IconReset />,
      searchText: `${s.resetTitle} ${s.resetDesc}`,
      content: (
        <Card title={s.resetTitle}>
          <p className="mb-3 text-sm text-text-secondary">{s.resetDesc}</p>
          <Button size="sm" variant="outline" onClick={resetToDefaults}>
            {s.resetButton}
          </Button>
        </Card>
      ),
    },
    // ---------- About ----------
    {
      id: 'about',
      group: G_ABOUT,
      label: s.aboutTitle,
      icon: <IconInfo />,
      searchText: `${s.aboutTitle} ${s.aboutProjectTitle} ${s.aboutVersion} ${s.aboutPlatform}`,
      content: <AboutSection />,
    },
  ];

  return (
    <SettingsLayout
      titleIcon={<IconGear />}
      sections={sections}
      banner={
        feedback ? (
          <AlertBanner key={feedbackKey} variant={feedback.variant} message={feedback.message} />
        ) : null
      }
    />
  );
}
