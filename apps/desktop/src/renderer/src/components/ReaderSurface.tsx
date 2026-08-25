import { useT } from '@tepegoz/i18n/react';
import { ReaderView, readerDict } from '@tepegoz/reader/view';
import { Button } from '@tepegoz/ui';
import type { ReaderState } from '../app-reader';

/**
 * The reading view as it appears over the content area, plus the two states that are not an article.
 *
 * "Nothing to read here" names the PAGE as the reason rather than the feature. "Reader mode failed"
 * reads like a bug and sends someone looking for one; "this page does not look like an article" is a
 * fact they can act on, and it is almost always the true one — extraction declines on search results,
 * dashboards and apps by design.
 */
export function ReaderSurface({ reader, onClose }: { reader: ReaderState; onClose: () => void }) {
  const t = useT(readerDict);
  if (reader.status === 'off') return null;

  return (
    <div className="absolute inset-0 overflow-y-auto bg-surface-system">
      <div className="sticky top-0 z-10 flex justify-end bg-surface-system/90 px-4 py-2 backdrop-blur">
        <Button size="sm" variant="outline" onClick={onClose}>
          {t.exit}
        </Button>
      </div>
      {reader.status === 'working' && (
        <p className="mx-auto max-w-[42rem] px-6 py-10 text-sm text-text-secondary">{t.working}</p>
      )}
      {reader.status === 'none' && (
        <div className="mx-auto max-w-[42rem] px-6 py-10">
          <h1 className="mb-2 text-xl font-semibold text-text-primary">{t.noArticleTitle}</h1>
          <p className="text-sm text-text-secondary">{t.noArticleBody}</p>
        </div>
      )}
      {reader.status === 'article' && <ReaderView article={reader.article} />}
    </div>
  );
}
