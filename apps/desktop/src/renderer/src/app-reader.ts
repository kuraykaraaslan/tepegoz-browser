import { useCallback, useEffect, useState } from 'react';
import type { ReaderArticle } from '@tepegoz/reader';

/**
 * Reading-view state for the chrome.
 *
 * The view is an OVERLAY over the content area, not a navigation. The tab keeps its URL, its history
 * and its scroll position, so leaving the reading view puts the user back exactly where they were —
 * and a reading view that had navigated somewhere would break Back in a way nobody expects from a
 * display toggle.
 *
 * Extraction re-runs per toggle rather than being cached across navigations. A cached article would
 * outlive the page it came from, and showing yesterday's text over today's URL is the kind of quiet
 * wrongness that is hard to notice and impossible to explain.
 */

export type ReaderState =
  | { status: 'off' }
  | { status: 'working' }
  | { status: 'article'; article: ReaderArticle }
  /** The page has no article. A real answer with its own copy — not an error. */
  | { status: 'none' };

export interface ReaderResult {
  reader: ReaderState;
  /** Toggle the reading view for the active tab. */
  toggleReader: () => void;
  closeReader: () => void;
}

export function useReader(activeTabId: string | null, activeUrl: string): ReaderResult {
  const [reader, setReader] = useState<ReaderState>({ status: 'off' });

  // Any navigation, or any switch to another tab, closes the view. The article on screen belongs to a
  // page that is no longer in front of the user, and leaving it up would misattribute it to the new one.
  useEffect(() => {
    setReader({ status: 'off' });
  }, [activeTabId, activeUrl]);

  const closeReader = useCallback((): void => {
    setReader({ status: 'off' });
  }, []);

  const toggleReader = useCallback((): void => {
    setReader((current) => {
      if (current.status !== 'off') return { status: 'off' };
      void window.tepegoz.extractArticle().then(
        (article) => {
          setReader(article === null ? { status: 'none' } : { status: 'article', article });
        },
        () => {
          // A failed extraction and a page with no article are the same thing to the reader: there is
          // nothing to show. Surfacing an error here would send the user looking for a bug in the
          // browser when the answer is about the page.
          setReader({ status: 'none' });
        },
      );
      return { status: 'working' };
    });
  }, []);

  return { reader, toggleReader, closeReader };
}
