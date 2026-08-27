/**
 * `@tepegoz/process-ui` — the presentational `tepegoz://process` Task Manager surface. The host injects
 * the poll + end-process callbacks; this package owns row shaping and en/tr strings.
 */
export { ProcessPage, type ProcessPageProps } from './process-page';
export { formatBytes, formatCpu, sortRows, totals } from './process-page-helpers';
