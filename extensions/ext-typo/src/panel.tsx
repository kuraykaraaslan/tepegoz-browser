import { Toggle } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { typoDict } from './i18n';
import { DictionaryList } from './panel-dictionary-list';
import { IssueList } from './panel-issue-list';
import { SiteLists } from './panel-site-lists';
import { BOX, BTN_GHOST, BTN_PRIMARY, FIELD, LANGUAGE_OPTIONS } from './panel-styles';
import { useTypoControls } from './panel-use-controls';
import type { TypoHostApi } from './types';

export interface TypoSurfaceProps {
  api: TypoHostApi;
  onClose: () => void;
}

export function TypoControls({
  api,
  surface,
}: Readonly<{
  api: TypoHostApi;
  surface: 'popup' | 'page';
}>) {
  const x = useT(typoDict);
  const {
    settings,
    setSettings,
    dictionaries,
    busyId,
    setBusyId,
    sample,
    setSample,
    result,
    activeOrigin,
    sitePaused,
    refresh,
    patch,
    toggleSite,
    check,
  } = useTypoControls(api);

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
        <SiteLists api={api} settings={settings} onSettings={setSettings} />
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
