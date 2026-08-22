import { useMemo, useRef, useState } from 'react';
import { useT } from '@tepegoz/i18n/react';
import { coreDict } from '@tepegoz/i18n';
import { Badge, BrandMark, Button, cn } from '@tepegoz/ui';
import { captionLayout, WindowControls } from '@tepegoz/window-controls';
import type {
  BookmarkImportResult,
  BrowserImportSource,
  LoginImportResult,
} from '@tepegoz/desktop-ipc';
import { onboardingDict } from './i18n';
import { AccountStep, FinishStep, WelcomeStep } from './onboarding-surface-steps';
import { ImportStep } from './onboarding-surface-import';
import {
  emptyBookmarkState,
  emptyPasswordState,
  type ImportKind,
  type ImportState,
  type OnboardingSurfaceProps,
  type StepId,
} from './onboarding-surface-types';

export type { OnboardingSurfaceProps } from './onboarding-surface-types';

export function OnboardingSurface({
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose,
  importBookmarks,
  importLogins,
  completeOnboarding,
  platform,
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

  const caption = captionLayout(platform);

  return (
    <div className="flex h-screen flex-col bg-surface-base text-text-primary">
      <header className="app-drag flex h-9 shrink-0 select-none items-stretch border-b border-border bg-surface-raised pl-3">
        {/* Reserve the macOS traffic lights' width; zero on every other platform. */}
        {caption.leadingInset > 0 && (
          <div style={{ width: caption.leadingInset }} aria-hidden className="shrink-0" />
        )}
        <div className="flex flex-1 items-center gap-2 text-sm font-semibold">
          <BrandMark className="h-5 w-5" />
          <span>{core.common.appName}</span>
        </div>
        {caption.showControls && (
          <WindowControls
            isMaximized={isMaximized}
            labels={core.window}
            onMinimize={onMinimize}
            onToggleMaximize={onToggleMaximize}
            onClose={onClose}
          />
        )}
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
                  // The bar stays 8px; the BUTTON is 24px tall so the target meets WCAG 2.2's 2.5.8
                  // minimum. An 8px-high control is a coin toss for anyone without fine pointer
                  // control, and it costs nothing to make the hit area bigger than the paint.
                  className={cn(
                    'flex h-6 items-center',
                    i > index + 1 && 'cursor-not-allowed opacity-60',
                  )}
                  aria-label={t.steps[id].title}
                >
                  <span
                    className={cn(
                      'h-2 w-full rounded-full transition-colors',
                      i <= index ? 'bg-primary' : 'bg-surface-sunken',
                    )}
                  />
                </button>
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
