import { useMemo, useRef, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import { coreDict } from '@tepegoz/i18n';
import { Badge, BrandMark, Button, cn } from '@tepegoz/ui';
import { WindowControls } from '@tepegoz/window-controls';
import type {
  BookmarkImportInput,
  BookmarkImportResult,
  BrowserImportSource,
  LoginImportResult,
} from '@tepegoz/desktop-ipc';
import { onboardingDict, type OnboardingStrings } from './i18n';

type StepId = 'welcome' | 'account' | 'import' | 'finish';
type ImportKind = 'bookmarks' | 'passwords';

interface ImportState<T> {
  busy: boolean;
  result: T | null;
  error: string | null;
}

export interface OnboardingSurfaceProps {
  isMaximized: boolean;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  importBookmarks: (input: BookmarkImportInput) => Promise<BookmarkImportResult>;
  importLogins: (data: string, format: string) => Promise<LoginImportResult>;
  completeOnboarding: () => Promise<void>;
}

const SOURCES: BrowserImportSource[] = ['chrome', 'edge', 'firefox', 'brave', 'other'];

const emptyBookmarkState: ImportState<BookmarkImportResult> = {
  busy: false,
  result: null,
  error: null,
};
const emptyPasswordState: ImportState<LoginImportResult> = {
  busy: false,
  result: null,
  error: null,
};

export function OnboardingSurface({
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose,
  importBookmarks,
  importLogins,
  completeOnboarding,
}: OnboardingSurfaceProps) {
  const t = useT(onboardingDict);
  const core = useT(coreDict);
  const steps = useMemo<StepId[]>(() => ['welcome', 'account', 'import', 'finish'], []);
  const [step, setStep] = useState<StepId>('welcome');
  const [source, setSource] = useState<BrowserImportSource>('chrome');
  const [bookmarks, setBookmarks] = useState<ImportState<BookmarkImportResult>>(emptyBookmarkState);
  const [passwords, setPasswords] = useState<ImportState<LoginImportResult>>(emptyPasswordState);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const bookmarkInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const index = steps.indexOf(step);
  const canGoBack = index > 0 && !finishing;
  const canContinue = !bookmarks.busy && !passwords.busy && !finishing;

  function goNext(): void {
    const next = steps[Math.min(index + 1, steps.length - 1)] ?? 'finish';
    setStep(next);
  }

  function goBack(): void {
    const prev = steps[Math.max(index - 1, 0)] ?? 'welcome';
    setStep(prev);
  }

  async function handleImport(kind: ImportKind, file: File): Promise<void> {
    if (kind === 'bookmarks') setBookmarks({ busy: true, result: null, error: null });
    else setPasswords({ busy: true, result: null, error: null });

    try {
      const data = await file.text();
      if (kind === 'bookmarks') {
        const result = await importBookmarks({ source, format: 'html', data });
        setBookmarks({ busy: false, result, error: null });
      } else {
        const result = await importLogins(data, 'generic-csv');
        setPasswords({ busy: false, result, error: null });
      }
    } catch {
      const error = kind === 'bookmarks' ? t.importBookmarksFailed : t.importPasswordsFailed;
      if (kind === 'bookmarks') setBookmarks({ busy: false, result: null, error });
      else setPasswords({ busy: false, result: null, error });
    }
  }

  async function finish(): Promise<void> {
    setFinishing(true);
    setFinishError(null);
    try {
      await completeOnboarding();
    } catch {
      setFinishing(false);
      setFinishError(core.errors.upstreamDown);
    }
  }

  const sourceLabel = t.sources[source];

  return (
    <div className="flex h-screen flex-col bg-surface-base text-text-primary">
      <header className="app-drag flex h-9 shrink-0 select-none items-stretch border-b border-border bg-surface-raised pl-3">
        <div className="flex flex-1 items-center gap-2 text-sm font-semibold">
          <BrandMark className="h-5 w-5" />
          <span>{core.common.appName}</span>
        </div>
        <WindowControls
          isMaximized={isMaximized}
          labels={core.window}
          onMinimize={onMinimize}
          onToggleMaximize={onToggleMaximize}
          onClose={onClose}
        />
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(19rem,0.82fr)_minmax(28rem,1.18fr)] overflow-hidden bg-surface-system max-lg:grid-cols-1">
        <section className="relative flex min-h-0 flex-col justify-between overflow-hidden border-r border-border bg-secondary px-8 py-8 text-secondary-fg max-lg:hidden">
          <div className="absolute inset-x-0 bottom-0 h-48 bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--primary)_30%,transparent))]" />
          <div className="relative">
            <div className="mb-8 inline-flex items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2">
              <BrandMark className="h-9 w-9" />
              <div>
                <p className="text-sm font-semibold">{t.heroEyebrow}</p>
                <p className="text-xs text-white/70">{t.heroHint}</p>
              </div>
            </div>
            <h1 className="max-w-md text-4xl font-semibold leading-tight">{t.heroTitle}</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/75">{t.heroBody}</p>
          </div>
          <div className="relative grid gap-3">
            {t.featureCards.map((item) => (
              <div key={item.title} className="rounded-lg border border-white/15 bg-white/10 p-4">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-white/70">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border bg-surface-base px-8 py-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-text-secondary">{t.stepLabel}</p>
                <h2 className="mt-1 text-2xl font-semibold">{t.steps[step].title}</h2>
              </div>
              <Badge variant="info">
                {t.stepCount
                  .replace('{current}', String(index + 1))
                  .replace('{total}', String(steps.length))}
              </Badge>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {steps.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  disabled={i > index + 1 || finishing}
                  onClick={() => setStep(id)}
                  className={cn(
                    'h-2 rounded-full transition-colors',
                    i <= index ? 'bg-primary' : 'bg-surface-sunken',
                    i > index + 1 && 'cursor-not-allowed opacity-60',
                  )}
                  aria-label={t.steps[id].title}
                />
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-8 py-7">
            <div className="mx-auto max-w-2xl">
              {step === 'welcome' && <WelcomeStep />}
              {step === 'account' && <AccountStep />}
              {step === 'import' && (
                <ImportStep
                  source={source}
                  sourceLabel={sourceLabel}
                  setSource={setSource}
                  bookmarks={bookmarks}
                  passwords={passwords}
                  onPickBookmarks={() => bookmarkInputRef.current?.click()}
                  onPickPasswords={() => passwordInputRef.current?.click()}
                  onImport={handleImport}
                />
              )}
              {step === 'finish' && (
                <FinishStep
                  bookmarkResult={bookmarks.result}
                  passwordResult={passwords.result}
                  finishError={finishError}
                />
              )}
            </div>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface-base px-8 py-4">
            <Button variant="ghost" disabled={!canGoBack} onClick={goBack}>
              {t.back}
            </Button>
            <div className="flex items-center gap-2">
              {step === 'import' && (
                <Button variant="ghost" disabled={!canContinue} onClick={goNext}>
                  {t.skipImport}
                </Button>
              )}
              {step === 'finish' ? (
                <Button disabled={!canContinue} loading={finishing} onClick={() => void finish()}>
                  {t.startBrowsing}
                </Button>
              ) : (
                <Button disabled={!canContinue} onClick={goNext}>
                  {step === 'welcome' ? t.begin : t.continue}
                </Button>
              )}
            </div>
          </footer>
        </section>
      </main>

      <input
        ref={bookmarkInputRef}
        type="file"
        accept=".html,.htm,text/html"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImport('bookmarks', file);
          e.target.value = '';
        }}
      />
      <input
        ref={passwordInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImport('passwords', file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function WelcomeStep() {
  const t = useT(onboardingDict);
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-surface-raised p-6">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-primary-subtle">
          <BrandMark className="h-10 w-10" />
        </div>
        <h3 className="text-xl font-semibold">{t.welcomeTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{t.welcomeBody}</p>
      </div>
      <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1">
        {t.welcomeTiles.map((tile) => (
          <div key={tile.title} className="rounded-lg border border-border bg-surface-base p-4">
            <p className="text-sm font-semibold">{tile.title}</p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">{tile.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountStep() {
  const t = useT(onboardingDict);
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-border bg-surface-raised p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{t.accountTitle}</h3>
            <p className="mt-1 text-sm text-text-secondary">{t.accountBody}</p>
          </div>
          <Badge variant="warning">{t.soon}</Badge>
        </div>
        <Button disabled fullWidth variant="secondary">
          {t.signIn}
        </Button>
      </div>
      <button
        type="button"
        className="rounded-lg border border-border-focus bg-primary-subtle p-5 text-left ring-2 ring-border-focus"
      >
        <p className="text-sm font-semibold text-text-primary">{t.localSessionTitle}</p>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{t.localSessionBody}</p>
      </button>
    </div>
  );
}

function ImportStep({
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

function FinishStep({
  bookmarkResult,
  passwordResult,
  finishError,
}: {
  bookmarkResult: BookmarkImportResult | null;
  passwordResult: LoginImportResult | null;
  finishError: string | null;
}) {
  const t = useT(onboardingDict);
  return (
    <div className="rounded-lg border border-border bg-surface-raised p-6">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-fg">
        <BrandMark className="h-10 w-10" />
      </div>
      <h3 className="text-xl font-semibold">{t.finishTitle}</h3>
      <p className="mt-2 text-sm leading-6 text-text-secondary">{t.finishBody}</p>
      <div className="mt-5 grid gap-3">
        <SummaryRow label={t.summaryAccount} value={t.summaryLocal} />
        <SummaryRow
          label={t.summaryBookmarks}
          value={bookmarkResult ? String(bookmarkResult.imported) : t.summarySkipped}
        />
        <SummaryRow
          label={t.summaryPasswords}
          value={passwordResult ? String(passwordResult.imported) : t.summarySkipped}
        />
      </div>
      {finishError !== null && <p className="mt-4 text-sm text-error">{finishError}</p>}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-surface-base px-3 py-2 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
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
