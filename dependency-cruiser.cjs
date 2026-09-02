/**
 * Layer-boundary enforcement (internal-ai-rules: modular monolith, no cross-module direct writes,
 * no circular deps). Concrete L-layer rules (e.g. browser-ui -> persistence forbidden) are added
 * as those packages land in Phase 1a/1b.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependencies break modular boundaries and make reasoning impossible. The concrete ' +
        'hazard is ESM evaluation order: in a static cycle, whichever module is evaluated first sees ' +
        'the other half-built. A cycle that has to travel through a DYNAMIC import does not have that ' +
        'hazard — the deferred side is fully evaluated before it is ever reached — so `viaOnly` limits ' +
        'the rule to cycles made entirely of static edges. That is the semantics, not an exemption: a ' +
        'dynamic import used to dodge this rule (rather than to defer real work) still leaves the ' +
        'design smell, and belongs in review, not in a linter.',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['dynamic-import'] } },
    },
    // `no-orphans` was removed, not silenced. With `tsPreCompilationDeps` off (see options — it has to
    // be, for `no-circular` to mean anything), a module imported only via `import type` has no visible
    // importer, so the rule called `password-core/src/types.ts` a dead file while 70 modules import it.
    // 15 of its 17 findings were false. A gate that is 88% wrong teaches people to skim past the output,
    // which costs more than the two real hits it found. Dead-file detection needs a type-aware tool
    // (knip / ts-prune); this config keeps the rules it can actually enforce.
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Production code must not import devDependencies.',
      // `.eval.ts` are dev-only agent-eval drivers (Playwright over the real app) — dev-only like tests.
      from: { pathNot: '\\.(test|spec|eval)\\.ts$' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'omnibox-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/omnibox is a presentational chrome leaf (url-bar): it must never import back into ' +
        'the desktop app. Navigation/clipboard are injected via callbacks. See docs/package-map.md.',
      from: { path: '^packages/omnibox/' },
      to: { path: '^apps/' },
    },
    {
      name: 'navigation-is-pure',
      severity: 'error',
      comment:
        '@tepegoz/navigation is a pure URL/allow-list library: no Electron, no app imports. The ' +
        'desktop adapters inject app.isPackaged and the internal-page set. See docs/package-map.md.',
      from: { path: '^packages/navigation/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'json-store-is-pure',
      severity: 'error',
      comment:
        '@tepegoz/json-store is a pure Node file utility: no Electron, no app imports. Callers pass ' +
        'the file path and validate the returned shape with zod. See docs/package-map.md.',
      from: { path: '^packages/json-store/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'credential-vault-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/credential-vault must stay Electron-free and app-free: the OS keychain (safeStorage) ' +
        'is injected as SecretCrypto and the file path is injected by the desktop app. See docs/package-map.md.',
      from: { path: '^packages/credential-vault/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'desktop-ipc-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/desktop-ipc is the IPC contract: it must never import back into the app or Electron. ' +
        'Its `.` (contract) entry must also stay zod-free so the sandboxed preload can bundle it. See docs/package-map.md.',
      from: { path: '^packages/desktop-ipc/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'preferences-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/preferences must stay Electron-free and app-free: the file path is injected by the ' +
        'desktop app; the Preferences type comes from @tepegoz/desktop-ipc. See docs/package-map.md.',
      from: { path: '^packages/preferences/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'tab-strip-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/tab-strip is a presentational chrome leaf: it must never import back into the ' +
        'desktop app. Selection/close/context-menu/new-tab are injected via callbacks. See docs/package-map.md.',
      from: { path: '^packages/tab-strip/' },
      to: { path: '^apps/' },
    },
    {
      name: 'extension-host-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/extension-host (ADR-0021) is the Electron-free in-process capability supervisor + ' +
        'meta extension-management tools: no Electron, no app imports. The CapabilityRegistry and the ' +
        'ExtensionManagementHost are injected by the desktop app. See docs/package-map.md.',
      from: { path: '^packages/extension-host/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'macro-engine-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/macro-engine is a pure deterministic interpreter: no Electron, no app imports. The ' +
        'MacroHost (CDP/tabs) is injected by the desktop app. See docs/package-map.md.',
      from: { path: '^packages/macro-engine/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'cert-warning-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/cert-warning-ui is a presentational chrome leaf (the TLS certificate warning): it ' +
        'must never import back into the desktop app. The certificate details are injected and the ' +
        'decision leaves through a callback. See docs/package-map.md.',
      from: { path: '^packages/cert-warning-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'auth-prompt-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/auth-prompt-ui is a presentational chrome leaf (the 401/407 credential prompt): it ' +
        'must never import back into the desktop app. The challenge details are injected and the ' +
        'credentials leave through a callback — the package stores nothing. See docs/package-map.md.',
      from: { path: '^packages/auth-prompt-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'find-bar-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/find-bar is a presentational chrome leaf (the Ctrl+F bar): it must never import back ' +
        'into the desktop app. findInPage runs in main; the query, counts and actions are injected. ' +
        'See docs/package-map.md.',
      from: { path: '^packages/find-bar/' },
      to: { path: '^apps/' },
    },
    {
      name: 'window-controls-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/window-controls is a presentational chrome leaf: it must never import back into ' +
        'the desktop app. Maximized state + actions are injected via props. See docs/package-map.md.',
      from: { path: '^packages/window-controls/' },
      to: { path: '^apps/' },
    },
    {
      name: 'bookmarks-must-not-pull-node-into-the-renderer',
      severity: 'error',
      comment:
        '@tepegoz/bookmarks is imported BY THE RENDERER at runtime (isBookmarkable, BOOKMARK_ROOT_BAR), ' +
        'so nothing reachable from its package index may value-import the @tepegoz/persistence barrel: ' +
        'that barrel pulls node:sqlite and node:crypto, and Vite resolves them to ' +
        '__vite-browser-external, which fails the desktop renderer build outright ("DatabaseSync is not ' +
        'exported"). Measured — it happened on 2026-09-02 when the bookmark store imported MetaStore. ' +
        'Use `import type` (erased), the node-free `@tepegoz/persistence/sql-like` subpath, or plain SQL. ' +
        'The `profiles` entry is exempt: it is main-process-only by construction and is never reached ' +
        'from the index. Tests are exempt for the same reason they may open a real database: nothing ' +
        'bundles them.',
      from: {
        path: '^packages/bookmarks/src/',
        pathNot: '^packages/bookmarks/src/(profiles|browser-profile-read)\.ts$|\.test\.ts$',
      },
      to: { path: '^packages/persistence/src/index\.ts$' },
    },
    {
      name: 'bookmarks-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/bookmarks-ui is a presentational chrome leaf (the tepegoz://bookmarks manager): it must ' +
        'never import back into the desktop app. The tree, mutations, open + context-menu actions, and copy ' +
        'are injected. See docs/package-map.md.',
      from: { path: '^packages/bookmarks-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'history-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/history-ui is a presentational chrome leaf: it must never import back into the ' +
        'desktop app. The history data source (list/remove/clear) is injected. See docs/package-map.md.',
      from: { path: '^packages/history-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'downloads-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/downloads-ui is the presentational tepegoz://downloads surface: it must never import ' +
        'back into the desktop app. Download data and commands are injected. See docs/package-map.md.',
      from: { path: '^packages/downloads-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'process-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/process-ui is the presentational tepegoz://process (Task Manager) surface: it must ' +
        'never import back into the desktop app. The metrics poll and end-process action are injected. ' +
        'See docs/package-map.md.',
      from: { path: '^packages/process-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'downloads-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/downloads is the Electron-free download domain model: no Electron, no app imports. ' +
        'The desktop app owns DownloadItem, quarantine paths, and native open/reveal. See docs/package-map.md.',
      from: { path: '^packages/downloads/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'clipboard-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/clipboard is the Electron-free clipboard policy/type model: no Electron, no app ' +
        'imports. The desktop app owns native clipboard and WebContents commands. See docs/package-map.md.',
      from: { path: '^packages/clipboard/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'uploads-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/uploads is the Electron-free upload broker domain model: no Electron, no app imports. ' +
        'The desktop app owns file paths, CDP file-input binding, and native dialogs. See docs/package-map.md.',
      from: { path: '^packages/uploads/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'uploads-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/uploads-ui is the presentational tepegoz://uploads surface: it must never import ' +
        'back into the desktop app. Upload data and commands are injected. See docs/package-map.md.',
      from: { path: '^packages/uploads-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'newtab-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/newtab-ui is the presentational tepegoz://newtab surface (AI/Favorites/Blank chooser): ' +
        'it must never import back into the desktop app. Favorites data and the agent/navigation actions ' +
        'are injected. See docs/package-map.md.',
      from: { path: '^packages/newtab-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'screenshots-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/screenshots is the Electron-free screenshot domain/tool package: no Electron, no app ' +
        'imports. The desktop app owns WebContents capture and full-page sizing. See docs/package-map.md.',
      from: { path: '^packages/screenshots/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'tasks-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/tasks is the Electron-free saved-task/trigger domain model: no Electron, no app ' +
        'imports. The desktop app owns scheduling, browser checks, and agent run launching. See docs/package-map.md.',
      from: { path: '^packages/tasks/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'web-tools-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/web-tools is the Electron-free web search/fetch tool package: no Electron, no app ' +
        'imports. The desktop app injects the concrete outbound HTTP host. See docs/package-map.md.',
      from: { path: '^packages/web-tools/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'tasks-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/tasks-ui is the presentational tepegoz://tasks surface: it must never import ' +
        'back into the desktop app. Task data, commands, and subscriptions are injected. See docs/package-map.md.',
      from: { path: '^packages/tasks-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'settings-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/settings-ui is a presentational chrome leaf (the generic settings shell): it must ' +
        'never import back into the desktop app. Section content + copy are injected. See docs/package-map.md.',
      from: { path: '^packages/settings-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'extensions-ui-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/extensions-ui is a presentational chrome leaf (the extensions grid shell): it must ' +
        'never import back into the desktop app. Items + copy are injected. See docs/package-map.md.',
      from: { path: '^packages/extensions-ui/' },
      to: { path: '^apps/' },
    },
    {
      name: 'bookmarks-bar-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/bookmarks-bar is a presentational chrome leaf (the bookmarks strip under the nav ' +
        'bar): it must never import back into the desktop app. The list, the open action, and the copy ' +
        'are injected. See docs/package-map.md.',
      from: { path: '^packages/bookmarks-bar/' },
      to: { path: '^apps/' },
    },
    {
      name: 'nav-toolbar-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/nav-toolbar is a presentational chrome leaf (the browser nav bar): it must never ' +
        'import back into the desktop app. Actions are injected; the extension tray fills an actions slot. See docs/package-map.md.',
      from: { path: '^packages/nav-toolbar/' },
      to: { path: '^apps/' },
    },
    {
      name: 'browser-chrome-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/browser-chrome is the presentational chrome frame (title row + nav bar): it must ' +
        'never import back into the desktop app. Actions are injected; the extension tray fills a slot. See docs/package-map.md.',
      from: { path: '^packages/browser-chrome/' },
      to: { path: '^apps/' },
    },
    {
      name: 'browser-menu-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/browser-menu is a presentational chrome leaf (the reusable menu surface): it must ' +
        'never import back into the desktop app. Items + copy are injected. See docs/package-map.md.',
      from: { path: '^packages/browser-menu/' },
      to: { path: '^apps/' },
    },
    {
      name: 'browser-tools-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/browser-tools must stay Electron-free and app-free: the concrete browser operations ' +
        'are injected via the BrowserHost interface (the desktop app implements it over TabManager). See docs/package-map.md.',
      from: { path: '^packages/browser-tools/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'tab-engine-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/tab-engine is the pure tab-state model + the tab_* agent tools (registerTabTools): ' +
        'no Electron, no app imports. The desktop TabManager owns the WebContentsViews and injects the ' +
        'TabHost. See docs/package-map.md.',
      from: { path: '^packages/tab-engine/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'journal-tools-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/journal-tools owns the journal_search_events agent tool: no Electron, no app, no ' +
        'persistence imports. The JournalReader (over EventJournal + SQLite) is injected by the desktop ' +
        'app. See docs/package-map.md.',
      from: { path: '^packages/journal-tools/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'mcp-client-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/mcp-client must stay Electron-free and app-free: the SDK Client + stdio transport ' +
        'and config sourcing are injected by the desktop layer (transport.electron / supervisor.electron). See docs/package-map.md.',
      from: { path: '^packages/mcp-client/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
    {
      name: 'agent-runtime-no-app-no-electron',
      severity: 'error',
      comment:
        '@tepegoz/agent-runtime is the Electron-free agentic run engine: the browser tool host, journal ' +
        'reader, active-tab URL and localized handoff copy are injected via AgentRunDeps by the desktop ' +
        'adapter (main/agent/agent-service.ts). See docs/package-map.md.',
      from: { path: '^packages/agent-runtime/' },
      to: { path: ['^apps/', 'node_modules/electron'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Build output is bundled, so every code-split chunk cross-references its siblings and every rule
    // fires on it. Cruising `apps` picked up `apps/desktop/out/**` and reported 198 phantom
    // `no-circular` errors about generated chunks — which is why this gate had never been green, and so
    // had never been wired into CI. Source only.
    exclude: { path: '(^|/)(out|dist|build|coverage|node_modules)/' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    // Left OFF deliberately. `no-circular` — the rule that is an ERROR here — is about ESM evaluation
    // order, and `import type` edges are erased before any code runs, so counting them would fail the
    // build on cycles that cannot exist at runtime (24 of them, all type-only or JSX-component).
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types'],
      extensions: ['.ts', '.tsx', '.js'],
    },
  },
};
