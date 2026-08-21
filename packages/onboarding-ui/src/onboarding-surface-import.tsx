import { useT } from '@tepegoz/i18n/react';
import type {
  BookmarkImportResult,
  BrowserImportSource,
  LoginImportResult,
} from '@tepegoz/desktop-ipc';
import { onboardingDict, type OnboardingStrings } from './i18n';
import { SOURCES, type ImportKind, type ImportState } from './onboarding-surface-types';

export function ImportStep({
  source,
  sourceLabel,
  setSource,
  bookmarks,
  passwords,
  onPickBookmarks,
  onPickPasswords,
  onImport,
}: {
  source: BrowserImportSource;
  sourceLabel: string;
  setSource: (source: BrowserImportSource) => void;
  bookmarks: ImportState<BookmarkImportResult>;
  passwords: ImportState<LoginImportResult>;
  onPickBookmarks: () => void;
  onPickPasswords: () => void;
  onImport: (kind: ImportKind, file: File) => Promise<void>;
}) {
  const t = useT(onboardingDict);
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-surface-raised p-5">
        <label htmlFor="browser-source" className="text-sm font-medium">
          {t.importSource}
        </label>
        <select
          id="browser-source"
          value={source}
          onChange={(e) => setSource(e.target.value as BrowserImportSource)}
          className="mt-2 h-10 w-full rounded-md border border-border bg-surface-base px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          {SOURCES.map((id) => (
            <option key={id} value={id}>
              {t.sources[id]}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-text-secondary">
          {t.importSourceHint.replace('{browser}', sourceLabel)}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ImportCard
          title={t.bookmarksTitle}
          body={t.bookmarksBody}
          button={t.chooseBookmarks}
          accept={t.bookmarksAccept}
          busy={bookmarks.busy}
          status={formatBookmarkResult(t, bookmarks)}
          onPick={onPickBookmarks}
          onDrop={(file) => onImport('bookmarks', file)}
        />
        <ImportCard
          title={t.passwordsTitle}
          body={t.passwordsBody}
          button={t.choosePasswords}
          accept={t.passwordsAccept}
          busy={passwords.busy}
          status={formatPasswordResult(t, passwords)}
          onPick={onPickPasswords}
          onDrop={(file) => onImport('passwords', file)}
        />
      </div>
    </div>
  );
}

function ImportCard({
  title,
  body,
  button,
  accept,
  busy,
  status,
  onPick,
  onDrop,
}: {
  title: string;
  body: string;
  button: string;
  accept: string;
  busy: boolean;
  status: string | null;
  onPick: () => void;
  onDrop: (file: File) => Promise<void>;
}) {
  const t = useT(onboardingDict);
  return (
    <div className="rounded-lg border border-border bg-surface-base p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 min-h-12 text-sm leading-6 text-text-secondary">{body}</p>
      <button
        type="button"
        disabled={busy}
        onClick={onPick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void onDrop(file);
        }}
        className="mt-4 flex min-h-32 w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-raised px-4 py-6 text-center text-sm text-text-secondary transition-colors hover:border-border-focus hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
      >
        <span className="font-medium text-text-primary">{busy ? t.importing : button}</span>
        <span className="mt-1 text-xs">{accept}</span>
      </button>
      {status !== null && <p className="mt-3 text-xs leading-5 text-text-secondary">{status}</p>}
    </div>
  );
}

function formatBookmarkResult(
  t: OnboardingStrings,
  state: ImportState<BookmarkImportResult>,
): string | null {
  if (state.error !== null) return state.error;
  if (state.result === null) return null;
  return t.bookmarksImported
    .replace('{imported}', String(state.result.imported))
    .replace('{skipped}', String(state.result.skipped));
}

function formatPasswordResult(
  t: OnboardingStrings,
  state: ImportState<LoginImportResult>,
): string | null {
  if (state.error !== null) return state.error;
  if (state.result === null) return null;
  return t.passwordsImported
    .replace('{imported}', String(state.result.imported))
    .replace('{skipped}', String(state.result.skipped));
}
