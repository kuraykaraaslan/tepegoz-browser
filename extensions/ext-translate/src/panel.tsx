import { useEffect, useState } from 'react';
import { Toggle } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { translateDict } from './i18n';
import type {
  TranslateCloudFallbackRequest,
  TranslateGlossaryTerm,
  TranslateHostApi,
  TranslatePageState,
  TranslateSettings,
  TranslateTextResult,
} from './types';

export interface TranslateSurfaceProps {
  api: TranslateHostApi;
  onClose: () => void;
}

const BTN_PRIMARY =
  'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground ' +
  'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const BTN_GHOST =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const INPUT =
  'w-full rounded-md border border-border bg-surface-base px-2 py-1.5 text-sm text-text-primary ' +
  'placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

function originOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

function statusText(page: TranslatePageState | null): string {
  if (page === null) return 'idle';
  if (page.error !== null) return page.error;
  return `${page.status} · ${page.translatedItems}/${page.totalItems}`;
}

function CloudFallbackPrompt({
  request,
  api,
  onDone,
}: Readonly<{
  request: TranslateCloudFallbackRequest;
  api: TranslateHostApi;
  onDone: () => void;
}>) {
  const x = useT(translateDict);
  const [remember, setRemember] = useState(true);
  function answer(allow: boolean): void {
    api.respondTranslateCloudFallback({ requestId: request.requestId, allow, remember });
    onDone();
  }
  return (
    <div className="rounded-md border border-border bg-surface-raised px-3 py-2">
      <p className="text-sm font-medium text-text-primary">{x.cloudPromptTitle}</p>
      <p className="mt-0.5 text-xs text-text-secondary">
        {`${x.cloudPromptText} ${request.origin} (${request.textCharCount.toLocaleString()} ${x.characters})`}
      </p>
      <label className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => {
            setRemember(event.currentTarget.checked);
          }}
        />
        {x.rememberChoice}
      </label>
      <div className="mt-2 flex gap-2">
        <button type="button" className={BTN_PRIMARY} onClick={() => answer(true)}>
          {x.allowCloud}
        </button>
        <button type="button" className={BTN_GHOST} onClick={() => answer(false)}>
          {x.denyCloud}
        </button>
      </div>
    </div>
  );
}

function GlossaryEditor({
  settings,
  api,
  onSettings,
}: Readonly<{
  settings: TranslateSettings;
  api: TranslateHostApi;
  onSettings: (settings: TranslateSettings) => void;
}>) {
  const x = useT(translateDict);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');

  async function add(): Promise<void> {
    const s = source.trim();
    const t = target.trim();
    if (s.length === 0 || t.length === 0) return;
    onSettings(
      await api.addTranslateGlossaryTerm({
        source: s,
        target: t,
        caseSensitive: false,
      }),
    );
    setSource('');
    setTarget('');
  }

  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">{x.glossary}</h3>
      <p className="mt-1 text-xs text-text-tertiary">{x.glossaryHint}</p>
      <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
        <input
          className={INPUT}
          value={source}
          placeholder={x.sourceTerm}
          onChange={(event) => {
            setSource(event.currentTarget.value);
          }}
        />
        <input
          className={INPUT}
          value={target}
          placeholder={x.targetTerm}
          onChange={(event) => {
            setTarget(event.currentTarget.value);
          }}
        />
        <button type="button" className={BTN_PRIMARY} onClick={() => void add()}>
          {x.addTerm}
        </button>
      </div>
      {settings.glossaryTerms.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">{x.glossaryEmpty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {settings.glossaryTerms.map((term: TranslateGlossaryTerm) => (
            <li
              key={term.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5"
            >
              <span className="min-w-0 truncate text-sm text-text-primary">
                {term.source} → {term.target}
              </span>
              <button
                type="button"
                className={BTN_GHOST}
                onClick={() => {
                  void api.removeTranslateGlossaryTerm(term.id).then(onSettings);
                }}
              >
                {x.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TranslateControls({
  api,
  surface,
}: Readonly<{
  api: TranslateHostApi;
  surface: 'popup' | 'page';
}>) {
  const x = useT(translateDict);
  const [settings, setSettings] = useState<TranslateSettings | null>(null);
  const [page, setPage] = useState<TranslatePageState | null>(null);
  const [activeOrigin, setActiveOrigin] = useState<string | null>(null);
  const [pendingCloud, setPendingCloud] = useState<TranslateCloudFallbackRequest | null>(null);
  const [sample, setSample] = useState('');
  const [result, setResult] = useState<TranslateTextResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([api.getTranslateState(), api.getActiveTabUrl()]).then(([state, url]) => {
      if (!alive) return;
      setSettings(state.settings);
      setPage(state.activePage);
      setActiveOrigin(originOf(url));
    });
    const offPage = api.onTranslatePageState((next) => {
      setPage(next);
    });
    const offCloud = api.onTranslateCloudFallbackRequest((request) => {
      setPendingCloud(request);
    });
    return () => {
      alive = false;
      offPage();
      offCloud();
    };
  }, [api]);

  async function patch(patchSettings: Partial<TranslateSettings>): Promise<void> {
    setSettings(await api.setTranslateSettings(patchSettings));
  }

  async function translatePage(): Promise<void> {
    setBusy(true);
    try {
      setPage(await api.startPageTranslation());
    } finally {
      setBusy(false);
    }
  }

  async function restorePage(): Promise<void> {
    setBusy(true);
    try {
      setPage(await api.restorePageOriginal());
    } finally {
      setBusy(false);
    }
  }

  async function quickTranslate(): Promise<void> {
    const text = sample.trim();
    if (text.length === 0) return;
    setBusy(true);
    try {
      setResult(await api.translateText({ text, reason: 'manual' }));
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  if (settings === null) return <p className="text-sm text-text-secondary">...</p>;
  const sitePaused = activeOrigin !== null && settings.disabledOrigins.includes(activeOrigin);

  return (
    <div className="space-y-4">
      {pendingCloud !== null && (
        <CloudFallbackPrompt
          request={pendingCloud}
          api={api}
          onDone={() => {
            setPendingCloud(null);
          }}
        />
      )}

      <Toggle
        id={`translate-enabled-${surface}`}
        label={x.enabled}
        description={x.enabledHint}
        checked={settings.enabled}
        onChange={(enabled) => {
          void patch({ enabled });
        }}
      />
      <Toggle
        id={`translate-auto-${surface}`}
        label={x.autoTranslate}
        checked={settings.autoTranslateForeignPages}
        onChange={(autoTranslateForeignPages) => {
          void patch({ autoTranslateForeignPages });
        }}
      />

      <div className="grid gap-2 rounded-md border border-border px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-text-secondary">{x.currentSite}</span>
          <span className="min-w-0 truncate font-mono text-xs text-text-primary">
            {activeOrigin ?? x.noSite}
          </span>
        </div>
        {activeOrigin !== null && (
          <button
            type="button"
            className={BTN_GHOST}
            onClick={() => {
              void api.setTranslateSiteEnabled(activeOrigin, sitePaused).then(setSettings);
            }}
          >
            {sitePaused ? x.resumeSite : x.pauseSite}
          </button>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">{x.page}</h3>
        <p className="text-sm text-text-secondary">{x.status}: {statusText(page)}</p>
        <p className="text-xs text-text-tertiary">
          {x.targetLanguage}: {page?.targetLanguage ?? 'app'} · {x.engine}: {page?.engine ?? x.localFirst}
        </p>
        <div className="flex gap-2">
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void translatePage()}>
            {x.translatePage}
          </button>
          <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => void restorePage()}>
            {x.restoreOriginal}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {x.quickTranslate}
        </h3>
        <textarea
          className={`${INPUT} min-h-24 resize-y`}
          value={sample}
          placeholder={x.sourcePlaceholder}
          onChange={(event) => {
            setSample(event.currentTarget.value);
          }}
        />
        <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void quickTranslate()}>
          {x.translate}
        </button>
        {result !== null && (
          <p className="whitespace-pre-wrap rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary">
            {result.translatedText}
          </p>
        )}
      </div>

      {surface === 'page' && (
        <>
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {x.cloudFallback}
            </h3>
            <select
              className={`${INPUT} mt-2`}
              value={settings.cloudFallbackMode}
              onChange={(event) => {
                void patch({ cloudFallbackMode: event.currentTarget.value as TranslateSettings['cloudFallbackMode'] });
              }}
            >
              <option value="ask">{x.ask}</option>
              <option value="allow">{x.allow}</option>
              <option value="deny">{x.deny}</option>
            </select>
          </div>
          <GlossaryEditor settings={settings} api={api} onSettings={setSettings} />
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              {x.disabledSites}
            </h3>
            {settings.disabledOrigins.length === 0 ? (
              <p className="mt-1 text-sm text-text-secondary">{x.disabledSitesEmpty}</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {settings.disabledOrigins.map((origin) => (
                  <li
                    key={origin}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
                  >
                    <span className="min-w-0 truncate font-mono text-xs text-text-primary">{origin}</span>
                    <button
                      type="button"
                      className={BTN_GHOST}
                      onClick={() => {
                        void api.setTranslateSiteEnabled(origin, true).then(setSettings);
                      }}
                    >
                      {x.remove}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function TranslatePopup({ api, onClose }: TranslateSurfaceProps) {
  const x = useT(translateDict);
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
        <TranslateControls api={api} surface="popup" />
      </div>
    </div>
  );
}

export function TranslatePage({ api }: TranslateSurfaceProps) {
  const x = useT(translateDict);
  return (
    <div className="flex h-full flex-col bg-surface-base text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <h1 className="mx-auto max-w-2xl text-base font-semibold">{x.title}</h1>
      </div>
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <p className="text-sm text-text-secondary">{x.description}</p>
          <TranslateControls api={api} surface="page" />
        </div>
      </div>
    </div>
  );
}
