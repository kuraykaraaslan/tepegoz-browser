/**
 * `@tepegoz/tab-strip` — the browser tab strip (favicon fallback, wheel→horizontal scroll,
 * container-query collapse, keyboard + middle-click). Selection/close/context-menu/new-tab are
 * injected via callbacks. Extracted from `apps/desktop` per docs/package-map.md.
 */
export {
  TabStrip,
  type TabDescriptor,
  type TabGroupDescriptor,
  type TabStripGeometryReport,
  type TabStripLabels,
  type TabStripProps,
  type TabTearBegin,
  type TabTearItem,
  type TabTearPoint,
} from './tab-strip';
