/**
 * `@tepegoz/process-ui` — the presentational `tepegoz://process` Task Manager surface. The host injects
 * the poll + end-process callbacks; this package owns row shaping and en/tr strings.
 */
export { ProcessPage, type ProcessPageProps } from './process-page';
export {
  DEFAULT_SORT_DIRECTION,
  formatBytes,
  formatCpu,
  SORT_KEYS,
  sortRows,
  sortRowsByColumn,
  totals,
  type SortDirection,
  type SortKey,
  type SortState,
} from './process-page-helpers';
