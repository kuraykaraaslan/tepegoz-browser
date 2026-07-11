import { useT } from '@tepegoz/i18n/react';
import { typoDict } from './i18n';
import { BOX, BTN_GHOST } from './panel-styles';
import type { TypoHostApi, TypoSettings } from './types';

export function SiteLists({
  api,
  settings,
  onSettings,
}: Readonly<{
  api: TypoHostApi;
  settings: TypoSettings;
  onSettings: (settings: TypoSettings) => void;
}>) {
  const x = useT(typoDict);
  return (
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
                    void api.setTypoSiteEnabled(origin, true).then(onSettings);
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
  );
}
