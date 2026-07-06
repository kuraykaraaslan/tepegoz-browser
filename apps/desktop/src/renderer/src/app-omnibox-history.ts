import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { buildOmniboxSuggestions, parseOmniboxQuery, type OmniboxSuggestion } from '@tepegoz/omnibox';
import type { TabsState } from '@tepegoz/desktop-ipc';

export interface OmniboxSuggestLabels {
  search: string;
  switchToTab: string;
  bookmark: string;
}

export interface OmniboxHistoryResult {
  onOmniboxSuggest: (query: string) => Promise<OmniboxSuggestion[]>;
  onActivateTabFromOmnibox: (tabId: string) => void;
  historyList: (q: string, offset: number) => ReturnType<typeof window.tepegoz.getHistory>;
  historyRemove: (url: string) => ReturnType<typeof window.tepegoz.deleteHistory>;
  historyClear: () => ReturnType<typeof window.tepegoz.clearHistory>;
}

/**
 * Omnibox suggestions (history + bookmarks + open tabs + navigate/search) and the `tepegoz://history`
 * page's data-source bindings. Split out of `App.tsx` (ADR-0010 250-line cap).
 */
export function useOmniboxAndHistory(
  tabsRef: MutableRefObject<TabsState>,
  labels: OmniboxSuggestLabels,
  bookmarksRef: MutableRefObject<{ url: string; title: string }[]>,
  onCloseSurface: () => void,
): OmniboxHistoryResult {
  // Ref keeps the injected callback stable so the Omnibox effect doesn't refetch every render; mirrors
  // latest state.
  const suggestLabelsRef = useRef(labels);
  useEffect(() => {
    suggestLabelsRef.current = labels;
  }, [labels]);

  const onOmniboxSuggest = useCallback(
    async (query: string): Promise<OmniboxSuggestion[]> => {
      const { term } = parseOmniboxQuery(query);
      let history: Awaited<ReturnType<typeof window.tepegoz.searchHistory>> = [];
      try {
        history = term.length > 0 ? await window.tepegoz.searchHistory({ query: term }) : [];
      } catch {
        history = []; // history unavailable → still surface tabs/bookmarks + the navigate/search action
      }
      const state = tabsRef.current;
      return buildOmniboxSuggestions(
        query,
        {
          // Don't offer switching to the tab that's already active.
          tabs: state.tabs
            .filter((tb) => tb.id !== state.activeId)
            .map((tb) => ({ id: tb.id, title: tb.title, url: tb.url })),
          history: history.map((h) => ({ url: h.url, title: h.title, visitCount: h.visitCount })),
          bookmarks: bookmarksRef.current,
        },
        suggestLabelsRef.current,
      );
    },
    [tabsRef, bookmarksRef],
  );

  const onActivateTabFromOmnibox = useCallback(
    (tabId: string): void => {
      onCloseSurface();
      window.tepegoz.activateTab(tabId);
    },
    [onCloseSurface],
  );

  // Stable data-source bindings for HistoryPage — it refetches when `list` changes identity.
  const historyList = useCallback(
    (q: string, offset: number) =>
      q.length === 0
        ? window.tepegoz.getHistory({ offset })
        : window.tepegoz.searchHistory({ query: q, offset }),
    [],
  );
  const historyRemove = useCallback((url: string) => window.tepegoz.deleteHistory(url), []);
  const historyClear = useCallback(() => window.tepegoz.clearHistory(), []);

  return { onOmniboxSuggest, onActivateTabFromOmnibox, historyList, historyRemove, historyClear };
}
