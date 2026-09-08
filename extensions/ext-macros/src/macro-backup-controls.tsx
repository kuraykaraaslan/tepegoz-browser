import { useRef, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import type { MacrosImportResult } from '@tepegoz/shared-types';
import { macrosDict } from './i18n';
import { BTN_GHOST } from './macro-step-helpers';

/** The slice of the host API this control needs (a structural subset of {@link MacrosHostApi}). */
export interface MacroBackupApi {
  exportMacros(): Promise<string>;
  importMacros(json: string): Promise<MacrosImportResult>;
}

/**
 * Export every saved macro to a JSON file, or restore macros from one.
 *
 * The renderer stays untrusted: main only ever hands over (export) or receives (import) a STRING —
 * the Blob download and the `<input type=file>` + `File.text()` read happen here, in the trusted
 * chrome document, exactly like bookmarks / history / preferences backup. Macros carry no secrets.
 */
export function MacroBackupControls({
  api,
  onImported,
}: Readonly<{ api: MacroBackupApi; onImported?: () => void }>) {
  const t = useT(macrosDict);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleExport(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const json = await api.exportMacros();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tepegoz-macros.json';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const { imported, skipped } = await api.importMacros(await file.text());
      const parts = [t.importDone.replace('{imported}', String(imported))];
      if (skipped > 0) parts.push(t.importSkipped.replace('{skipped}', String(skipped)));
      setStatus(parts.join(' '));
      onImported?.();
    } catch {
      setStatus(t.importFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={BTN_GHOST}
        disabled={busy}
        onClick={() => void handleExport()}
      >
        {t.exportMacros}
      </button>
      <button
        type="button"
        className={BTN_GHOST}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {t.importMacros}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label={t.importMacros}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImport(file);
          e.target.value = '';
        }}
      />
      {status !== null && <span className="text-xs text-text-secondary">{status}</span>}
    </div>
  );
}
