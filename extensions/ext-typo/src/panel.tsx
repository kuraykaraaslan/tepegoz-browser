import { useEffect, useMemo, useState } from 'react';
import { Toggle } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { typoDict } from './i18n';
import type { TypoStrings } from './i18n';
import type {
  TypoCheckResult,
  TypoDictionaryInfo,
  TypoHostApi,
  TypoIssue,
  TypoLanguage,
  TypoSettings,
} from './types';

export interface TypoSurfaceProps {
  api: TypoHostApi;
  onClose: () => void;
}

const BTN_GHOST =
  'shrink-0 rounded-md border border-border px-2 py-1 text-xs text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';
const BTN_PRIMARY =
  'shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground ' +
  'hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';
const FIELD =
  'w-full rounded-md border border-border bg-surface-base px-2 py-1.5 text-sm text-text-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const BOX = 'rounded-md border border-border px-3 py-2';

const LANGUAGE_OPTIONS: Array<{ value: TypoLanguage; label: string }> = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
];

function originOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function dictionaryStatus(dict: TypoDictionaryInfo, x: TypoStrings): string {
  if (dict.downloading) return x.downloading;
  if (dict.installed) return x.installed;
  if (dict.status === 'error') return x.error;
  return x.available;
}

function IssueList({
  result,
  onIgnore,
}: Readonly<{
  result: TypoCheckResult | null;
  onIgnore?: (issue: TypoIssue) => void;
}>) {
  const x = useT(typoDict);
  if (result === null) return null;
  if (result.issues.length === 0) {
    return <p className="text-sm text-text-secondary">{x.noIssues}</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {x.issues}
        </h3>
        <span className="text-xs text-text-tertiary">
          {x.sources}: {result.sourcesUsed.join(', ')}
        </span>
      </div>
      <ul className="space-y-1.5">
        {result.issues.slice(0, 20).map((issue) => (
          <li key={issue.id} className={BOX}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{issue.text}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{issue.message}</p>
              </div>
              <span className="shrink-0 rounded bg-surface-overlay px-1.5 py-0.5 text-[11px] text-text-tertiary">
                {issue.source}
              </span>
            </div>
            {issue.suggestions.length > 0 ? (
              <p className="mt-2 text-xs text-text-secondary">{issue.suggestions.join(', ')}</p>
            ) : null}
            {onIgnore !== undefined ? (
              <button
                type="button"
                className={`${BTN_GHOST} mt-2`}
                onClick={() => {
                  onIgnore(issue);
                }}
              >
                {x.addIgnored}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DictionaryList({
  dictionaries,
  busyId,
  onDownload,
  onDelete,
  onCancel,
}: Readonly<{
  dictionaries: TypoDictionaryInfo[];
  busyId: string | null;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  onCancel: (id: string) => void;
}>) {
  const x = useT(typoDict);
  return (
    <ul className="space-y-2">
      {dictionaries.map((dict) => (
        <li key={dict.id} className={BOX}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-medium text-text-primary">{dict.name}</p>
                <span className="rounded bg-surface-overlay px-1.5 py-0.5 text-[11px] text-text-tertiary">
                  {dict.language}
                </span>
                {dict.recommended ? (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                    {x.recommended}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {dictionaryStatus(dict, x)} · {x.size}: {formatBytes(dict.sizeBytes)} · {x.license}:{' '}
                {dict.license}
              </p>
              {dict.error !== null ? <p className="mt-1 text-xs text-red-500">{dict.error}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {dict.downloading ? (
                <button
                  type="button"
                  className={BTN_GHOST}
                  onClick={() => {
                    onCancel(dict.id);
                  }}
                >
                  {x.cancel}
                </button>
              ) : dict.installed ? (
                <button
                  type="button"
                  className={BTN_GHOST}
                  disabled={busyId === dict.id}
                  onClick={() => {
                    onDelete(dict.id);
                  }}
                >
                  {x.remove}
                </button>
              ) : (
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={busyId === dict.id}
                  onClick={() => {
                    onDownload(dict.id);
                  }}
                >
                  {x.download}
                </button>
              )}
            </div>
          </div>
          {dict.downloading ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-overlay">
              <div className="h-full bg-primary" style={{ width: `${Math.round(dict.progress * 100)}%` }} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function TypoControls({
  api,
  surface,
}: Readonly<{
  api: TypoHostApi;
  surface: 'popup' | 'page';
}>) {
  const x = useT(typoDict);
  const [settings, setSettings] = useState<TypoSettings | null>(null);
  const [dictionaries, setDictionaries] = useState<TypoDictionaryInfo[]>([]);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sample, setSample] = useState('');
  const [result, setResult] = useState<TypoCheckResult | null>(null);

  const activeOrigin = useMemo(() => originOf(activeUrl), [activeUrl]);
  const sitePaused =
    settings !== null && activeOrigin !== null && settings.disabledOrigins.includes(activeOrigin);

  async function refresh(): Promise<void> {
    const [state, nextUrl] = await Promise.all([api.getTypoState(), api.getActiveTabUrl()]);
    setSettings(state.settings);
    setDictionaries(state.dictionaries);
    setActiveUrl(nextUrl);
  }

  useEffect(() => {
    let alive = true;
    void Promise.all([api.getTypoState(), api.getActiveTabUrl()]).then(
      ([state, nextUrl]) => {
        if (!alive) return;
        setSettings(state.settings);
        setDictionaries(state.dictionaries);
        setActiveUrl(nextUrl);
      },
      () => {
        /* host unavailable */
      },
    );
    const unsubscribe = api.onTypoDictionariesState((items) => {
      if (alive) setDictionaries(items);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [api]);

  async function patch(patchSettings: Partial<TypoSettings>): Promise<void> {
    setSettings(await api.setTypoSettings(patchSettings));
  }

  async function toggleSite(): Promise<void> {
    if (activeOrigin === null) return;
    setSettings(await api.setTypoSiteEnabled(activeOrigin, sitePaused));
  }

  async function check(deep: boolean): Promise<void> {
    const text = sample.trim();
    if (text.length === 0) return;
    setResult(
      await api.checkTypoText({
        text,
        language: settings?.defaultLanguage,
        origin: activeOrigin ?? undefined,
        aiMode: deep ? 'manual' : 'auto',
      }),
    );
  }

  if (settings === null) return <p className="text-sm text-text-secondary">...</p>;

  return (
    <div className="space-y-4">
      <Toggle
        id={`typo-enabled-${surface}`}
        label={x.enabled}
        description={x.enabledHint}
        checked={settings.enabled}
        onChange={(enabled) => {
          void patch({ enabled });
        }}
      />

      <div className={BOX}>
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {x.currentSite}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-text-primary">
            {activeOrigin ?? x.noSite}
          </span>
          <button
            type="button"
            className={BTN_GHOST}
            disabled={activeOrigin === null}
            onClick={() => {
              void toggleSite();
            }}
          >
            {sitePaused ? x.resumeSite : x.pauseSite}
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-text-secondary">
          {x.defaultLanguage}
          <select
            className={`${FIELD} mt-1`}
            value={settings.defaultLanguage}
            onChange={(event) => {
              void patch({ defaultLanguage: event.currentTarget.value });
            }}
          >
            {LANGUAGE_OPTIONS.map((language) => (
              <option key={language.value} value={language.value}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
        <Toggle
          id={`typo-auto-detect-${surface}`}
          label={x.autoDetect}
          checked={settings.autoDetectLanguage}
          onChange={(autoDetectLanguage) => {
            void patch({ autoDetectLanguage });
          }}
        />
      </div>

      {surface === 'page' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            id="typo-local-llm"
            label={x.localLlm}
            description={x.localLlmHint}
            checked={settings.localLlmMode === 'auto'}
            onChange={(enabled) => {
              void patch({ localLlmMode: enabled ? 'auto' : 'off' });
            }}
          />
          <Toggle
            id="typo-external-ai"
            label={x.externalAi}
            description={x.externalAiHint}
            checked={settings.externalAiMode === 'manual'}
            onChange={(enabled) => {
              void patch({ externalAiMode: enabled ? 'manual' : 'off' });
            }}
          />
        </div>
      ) : null}

      <div className={BOX}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {x.quickCheck}
            </h3>
            <p className="mt-1 text-xs text-text-tertiary">{x.description}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={BTN_GHOST}
              onClick={() => {
                void check(false);
              }}
            >
              {x.check}
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => {
                void check(true);
              }}
            >
              {x.deepCheck}
            </button>
          </div>
        </div>
        <textarea
          className={`${FIELD} mt-2 min-h-24 resize-y`}
          value={sample}
          placeholder={x.samplePlaceholder}
          onChange={(event) => {
            setSample(event.currentTarget.value);
          }}
        />
      </div>

      <IssueList
        result={result}
        onIgnore={(issue) => {
          void api.addTypoIgnoredWord(issue.text, issue.language).then(setSettings);
        }}
      />

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {x.dictionaries}
            </h3>
            {surface === 'page' ? (
              <p className="mt-1 text-xs text-text-tertiary">{x.dictionaryHint}</p>
            ) : null}
          </div>
          {surface === 'page' ? (
            <button
              type="button"
              className={BTN_GHOST}
              onClick={() => {
                void api.showTypoDictionariesFolder();
              }}
            >
              {x.showFolder}
            </button>
          ) : null}
        </div>
        <DictionaryList
          dictionaries={dictionaries}
          busyId={busyId}
          onCancel={(id) => {
            api.cancelTypoDictionaryDownload(id);
            void refresh();
          }}
          onDelete={(id) => {
            void (async () => {
              setBusyId(id);
              try {
                await api.deleteTypoDictionary(id);
                await refresh();
              } finally {
                setBusyId(null);
              }
            })();
          }}
          onDownload={(id) => {
            void (async () => {
              setBusyId(id);
              try {
                await api.downloadTypoDictionary(id);
                await refresh();
              } finally {
                setBusyId(null);
              }
            })();
          }}
        />
      </div>

      {surface === 'page' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {x.disabledSites}
            </h3>
            {settings.disabledOrigins.length === 0 ? (
              <p className="mt-1 text-sm text-text-secondary">{x.disabledSitesEmpty}</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {settings.disabledOrigins.map((origin) => (
                  <li key={origin} className={`${BOX} flex items-center justify-between gap-2`}>
                    <span className="min-w-0 truncate font-mono text-xs text-text-primary">
                      {origin}
                    </span>
                    <button
                      type="button"
                      className={BTN_GHOST}
                      onClick={() => {
                        void api.setTypoSiteEnabled(origin, true).then(setSettings);
                      }}
                    >
                      {x.remove}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {x.ignoredWords}
            </h3>
            {settings.ignoredWords.length === 0 ? (
              <p className="mt-1 text-sm text-text-secondary">{x.ignoredEmpty}</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {settings.ignoredWords.slice(0, 80).map((item) => (
                  <li
                    key={`${item.language}:${item.word}`}
                    className="rounded bg-surface-overlay px-2 py-1 text-xs text-text-secondary"
                  >
                    {item.word} · {item.language}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TypoPopup({ api, onClose }: TypoSurfaceProps) {
  const x = useT(typoDict);
  const c = useT(coreDict);
  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-text-primary">{x.title}</h2>
        <button type="button" onClick={onClose} aria-label={c.window.close} className={BTN_GHOST}>
          {c.window.close}
        </button>
      </div>
      <div className="p-3">
        <TypoControls api={api} surface="popup" />
      </div>
    </div>
  );
}

export function TypoPage({ api }: TypoSurfaceProps) {
  const x = useT(typoDict);
  return (
    <div className="flex h-full flex-col bg-surface-base text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <h1 className="mx-auto max-w-4xl text-base font-semibold">{x.title}</h1>
      </div>
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <p className="text-sm text-text-secondary">{x.description}</p>
          <TypoControls api={api} surface="page" />
        </div>
      </div>
    </div>
  );
}
