import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Button, Card } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useLocale, useT } from '@tepegoz/i18n/react';
import type { LocalModelInfo } from '@tepegoz/desktop-ipc';
import { ConfirmAction } from './settings-confirm';

/**
 * AI & Agent settings panels: on-device models. Split out of `settings-ai-panels.tsx` (ADR-0010
 * 250-line cap). The cloud model pin is NOT here — it lives on each key, in Providers & API keys.
 *
 * Three things this panel used to get wrong, all of them about telling the user what a click costs:
 *  - it showed parameter count and context length but never a download SIZE, so "Download" was a
 *    button you pressed without knowing whether it would pull 600 MB or 8 GB;
 *  - `.catch(() => undefined)` swallowed every failure, including the localized `modelDownloadFailed`
 *    main already raises, so a dead link looked exactly like a click that did nothing;
 *  - Delete fired on the first press, discarding gigabytes that then have to come down again.
 *
 * Where the size is genuinely unknown it SAYS unknown. The catalog carries a measured size only when
 * someone has measured it, and the live total arrives from the server once a transfer starts —
 * inventing a figure in between would be the one failure worse than the gap.
 */

/** Bytes → a short human figure in the UI locale. `undefined` ⇒ the caller renders "unknown". */
function formatBytes(bytes: number | undefined, locale: string): string | undefined {
  if (bytes === undefined || bytes <= 0) return undefined;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1;
  return `${value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${units[unit] ?? 'B'}`;
}

export function LocalModelsSection() {
  const s = useT(settingsDict);
  const c = useT(coreDict);
  const locale = useLocale();
  const [models, setModels] = useState<LocalModelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.tepegoz.listLocalModels().then(setModels, () => {
      setModels([]);
    });
    return window.tepegoz.onLocalModelsState(setModels);
  }, []);

  /** Report what main said. The boundary already localizes its own error codes, so the message is the
   *  user's language and does not leak internals — dropping it was pure loss. */
  function run(action: Promise<unknown>): void {
    setError(null);
    void action.then(
      () => undefined,
      (err: unknown) => {
        setError(err instanceof Error && err.message !== '' ? err.message : c.errors.upstreamDown);
      },
    );
  }

  /** What a row can honestly say about size, in order of certainty. */
  function sizeLine(m: LocalModelInfo): string {
    if (m.downloading) {
      const done = formatBytes(m.downloadedBytes, locale);
      const total = formatBytes(m.totalBytes, locale);
      if (done !== undefined && total !== undefined) return `${done} / ${total}`;
      if (done !== undefined) return done;
      return s.localModels.sizeUnknown;
    }
    const onDisk = formatBytes(m.installedBytes, locale);
    if (onDisk !== undefined) return onDisk;
    const catalogued = formatBytes(m.sizeBytes, locale);
    return catalogued ?? s.localModels.sizeUnknown;
  }

  return (
    <Card title={s.localModels.title} subtitle={s.localModels.hint}>
      {models.length === 0 ? (
        <p className="text-sm text-text-secondary">{s.localModels.empty}</p>
      ) : (
        <ul className="space-y-2">
          {models.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{m.name}</span>
                  {m.recommended && (
                    <Badge variant="success" size="sm">
                      {s.localModels.recommended}
                    </Badge>
                  )}
                  {m.selected && (
                    <Badge variant="primary" size="sm" dot>
                      {s.localModels.selected}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-text-secondary">
                  {[
                    `${String(m.paramsB)}${s.localModels.paramsUnit}`,
                    `${m.ctx.toLocaleString(locale)} ${s.localModels.ctxUnit}`,
                    sizeLine(m),
                    ...(m.license === '' ? [] : [m.license]),
                  ].join(' · ')}
                </span>
                {m.downloading && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="h-full bg-primary transition-[width] duration-300"
                      style={{ width: `${String(Math.round(m.progress * 100))}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {m.downloading ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.tepegoz.cancelLocalModelDownload(m.id);
                    }}
                  >
                    {c.common.cancel}
                  </Button>
                ) : m.installed ? (
                  <>
                    {!m.selected && (
                      <Button
                        size="sm"
                        onClick={() => {
                          run(
                            window.tepegoz
                              .selectLocalModel(m.id)
                              .then(() => window.tepegoz.listLocalModels())
                              .then(setModels),
                          );
                        }}
                      >
                        {s.localModels.use}
                      </Button>
                    )}
                    <ConfirmAction
                      label={s.localModels.delete}
                      title={s.localModels.deleteTitle}
                      body={s.localModels.deleteBody
                        .replace('{name}', m.name)
                        .replace('{size}', sizeLine(m))}
                      confirmLabel={s.localModels.delete}
                      onConfirm={() => {
                        run(window.tepegoz.deleteLocalModel(m.id));
                      }}
                    />
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      run(window.tepegoz.downloadLocalModel(m.id));
                    }}
                  >
                    {s.localModels.download}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error !== null && <p className="mt-3 text-xs text-error">{error}</p>}
    </Card>
  );
}
