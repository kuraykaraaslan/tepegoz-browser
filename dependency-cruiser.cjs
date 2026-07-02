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
      comment: 'Circular dependencies break modular boundaries and make reasoning impossible.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)index\\.ts$', '\\.test\\.ts$'] },
      to: {},
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Production code must not import devDependencies.',
      from: { pathNot: '\\.(test|spec)\\.ts$' },
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
      name: 'window-controls-is-a-leaf',
      severity: 'error',
      comment:
        '@tepegoz/window-controls is a presentational chrome leaf: it must never import back into ' +
        'the desktop app. Maximized state + actions are injected via props. See docs/package-map.md.',
      from: { path: '^packages/window-controls/' },
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
        '@tepegoz/tab-engine is the pure tab-state model: no Electron, no app imports. The desktop ' +
        'TabManager owns the WebContentsViews and delegates record state to it. See docs/package-map.md.',
      from: { path: '^packages/tab-engine/' },
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
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types'],
      extensions: ['.ts', '.tsx', '.js'],
    },
  },
};
