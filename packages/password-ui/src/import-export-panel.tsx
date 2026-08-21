import { useRef, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import type { LoginImportResult } from '@tepegoz/desktop-ipc';
import { passwordUiDict } from './i18n';

export interface ImportExportPanelProps {
  onImport: (data: string, format: string) => Promise<LoginImportResult>;
  onExport: (format: string) => Promise<string>;
}

const BTN_OUTLINE =
  'shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-overlay ' +
  'disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

export function ImportExportPanel({ onImport, onExport }: Readonly<ImportExportPanelProps>) {
  const t = useT(passwordUiDict);
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleImport(file: File): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      const res = await onImport(text, 'google-csv');
      const msg = [
        t.importSuccess.replace('{count}', String(res.imported)),
        res.skipped > 0 ? t.importSkipped.replace('{count}', String(res.skipped)) : '',
        res.errors.length > 0 ? t.importErrors.replace('{count}', String(res.errors.length)) : '',
      ]
        .filter(Boolean)
        .join(' ');
      setResult(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(): Promise<void> {
    setBusy(true);
    setResult(null);
    try {
      const csv = await onExport('google-csv');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tepegoz-passwords.csv';
      a.click();
      URL.revokeObjectURL(url);
      setResult(t.exportSuccess);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-sm font-medium text-text-primary">{t.importExport}</p>

      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-surface-base px-4 py-6 text-center text-sm text-text-secondary transition-colors hover:border-border-focus hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void handleImport(file);
        }}
      >
        {t.dropCsvHere}
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImport(file);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        className={BTN_OUTLINE}
        disabled={busy}
        onClick={() => void handleExport()}
      >
        {t.exportToGoogle}
      </button>

      {result !== null && <p className="text-xs text-text-secondary">{result}</p>}
    </div>
  );
}
