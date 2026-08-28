import { settingsDict } from '@tepegoz/settings-ui';
import { Button } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';

/**
 * What a `tepegoz://` settings surface shows while it has no preferences to render.
 *
 * The failed branch exists because the blank one was, for a while, the only branch. A rejected
 * `getPreferences()` left `prefs` at `null` forever and the page rendered an empty ground: no message,
 * no retry, nothing to tell a user whether the screen was loading, broken, or simply had no settings.
 * The code's own comment said that could not happen inside a real `WebContentsView` — and
 * `e2e/tepegoz-settings-page.spec.ts` records the day it did, when `isTrustedAppUrl` had never learned
 * the `tepegoz://` scheme and every internal page's first data fetch was refused with a 403.
 *
 * So the two states are told apart on purpose, and the failed one says the one thing that matters
 * besides "it broke": nothing was written, so nothing needs undoing.
 */
export function InternalPageLoading() {
  const s = useT(settingsDict);
  return (
    <p className="px-6 py-8 text-sm text-text-secondary" role="status">
      {s.loading}
    </p>
  );
}

export function InternalPageLoadFailed({ onRetry }: { onRetry: () => void }) {
  const s = useT(settingsDict);
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center" role="alert">
      <p className="text-base font-semibold text-text-primary">{s.loadFailedTitle}</p>
      <p className="mt-2 text-sm text-text-secondary">{s.loadFailedBody}</p>
      <Button size="sm" variant="outline" className="mt-4" onClick={onRetry}>
        {s.retry}
      </Button>
    </div>
  );
}
