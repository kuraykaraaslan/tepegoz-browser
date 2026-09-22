import { useRef, useState } from 'react';
import { Button } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { TasksImportResult } from '@tepegoz/tasks';
import { tasksDict } from './i18n';

/** The slice of the host API this control needs (a structural subset of {@link TasksHostApi}). */
export interface TaskBackupApi {
  exportTasks(): Promise<string>;
  importTasks(json: string): Promise<TasksImportResult>;
}

/**
 * Export every saved task's reusable configuration to a JSON file, or restore tasks from one.
 *
 * The renderer stays untrusted: main only ever hands over (export) or receives (import) a STRING — the
 * Blob download and the `<input type=file>` + `File.text()` read happen here, in the trusted chrome
 * document, exactly like the macros / bookmarks / history / preferences backup controls. A task's
 * preapproved-write policy never travels with the file (stripped at the schema boundary in main); an
 * imported task always lands in the safe "notify" mode, same as one the user just created by hand.
 */
export function TaskBackupControls({
  api,
  onImported,
}: Readonly<{ api: TaskBackupApi; onImported?: () => void }>) {
  const t = useT(tasksDict);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleExport(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const json = await api.exportTasks();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tepegoz-tasks.json';
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
      const { imported, skipped } = await api.importTasks(await file.text());
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
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleExport()}>
        {t.exportTasks}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {t.importTasks}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label={t.importTasks}
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
