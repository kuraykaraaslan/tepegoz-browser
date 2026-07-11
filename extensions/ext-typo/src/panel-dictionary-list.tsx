import { useT } from '@tepegoz/i18n/react';
import { typoDict } from './i18n';
import { dictionaryStatus, formatBytes } from './panel-helpers';
import { BOX, BTN_GHOST, BTN_PRIMARY } from './panel-styles';
import type { TypoDictionaryInfo } from './types';

export function DictionaryList({
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
