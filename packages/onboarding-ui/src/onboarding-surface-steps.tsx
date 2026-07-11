import { useT } from '@tepegoz/i18n/react';
import { Badge, BrandMark, Button } from '@tepegoz/ui';
import type { BookmarkImportResult, LoginImportResult } from '@tepegoz/desktop-ipc';
import { onboardingDict } from './i18n';

export function WelcomeStep() {
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

export function AccountStep() {
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

export function FinishStep({
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
