/**
 * Public entry for the L0 tab model — re-exports ONLY.
 *
 * `WindowTabs` used to be declared in this file while `tabs-manager-base.ts` imported it back out of
 * here, and `tabs-manager.ts` is re-exported from here in turn: a real cycle
 * (`tabs -> tabs-manager -> tabs-manager-base -> tabs`) that `no-circular` flags. The class now lives in
 * `tabs-window.ts`; internal `tabs-*` modules import THAT, and only outside callers come through this
 * barrel. Same surface as before — `import TabManager from './tabs'` is unchanged.
 */
export { BROWSING_PARTITION, type DetachedTab, type NavigationObserver } from './tabs-shared';
export { WindowTabs } from './tabs-window';
export { default } from './tabs-manager';
