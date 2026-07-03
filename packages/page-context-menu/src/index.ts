/**
 * `@tepegoz/page-context-menu` — the model for the Chrome-style web-page right-click menu. It builds a
 * generic `MenuItem[]` (rendered by `@tepegoz/browser-menu`'s `<Menu>`); the host injects the wired
 * actions + navigation state and hosts the popup window. Owns its own content strings (see ./i18n).
 */
export { buildPageContextMenuModel } from './model';
export type {
  PageContextMenuContext,
  PageContextMenuActions,
  PageContextMenuMediaType,
} from './model';
