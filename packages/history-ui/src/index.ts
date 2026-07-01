/**
 * `@tepegoz/history-ui` — the browsing-history manager (search + newest-first list + delete/clear).
 * Owns its search/list state; the data source is injected. Extracted from `apps/desktop` per
 * docs/package-map.md.
 */
export {
  HistoryPage,
  type HistoryPageProps,
  type HistoryUiLabels,
  type HistoryItem,
} from './history-ui';
