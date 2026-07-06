# @tepegoz/extension-host (L5)

In-process **agent-controllable extensions** (ADR-0021). `ExtensionCapabilitySupervisor` is the
in-process analogue of `@tepegoz/mcp-client`'s `McpSupervisor`: it registers an *enabled* extension's
`defineCapabilities` tools into the single `CapabilityRegistry` (behind the ToolGateway PEP), and
unregisters them when the extension is disabled — `reconcile()` is idempotent, called at startup and
on every prefs/enable change, and needs no `agent-runtime` change since the planner already enumerates
`CapabilityRegistry.list()`. It also always registers the meta `extension_list`/`get`/`update_item`
tools so the agent can manage extensions itself. Electron-free: the registry adapter and
`ExtensionManagementHost` are injected, implemented by the app in
`main/extensions/capability-supervisor.electron.ts`.

## Exports
- **`ExtensionCapabilitySupervisor`** / **`SupervisorDeps`** — `provide(set, host)` binds an extension's
  `ExtensionCapabilitySet` (from `@tepegoz/extension-sdk`) to its concrete host; `reconcile()` syncs the
  registry to the currently-enabled set.
- **`extensionManagementCapabilities`** / **`EXTENSION_HOST_ID`** — the always-on meta tools
  (`extension_list_items`/`extension_get_item`/`extension_update_item` style ids) and the host id they
  register under.
- **`CapabilityRegistryPort`** — the minimal registry seam (`register`/`unregister`/`has`) the
  supervisor depends on, so it stays Electron- and app-free.
- **`ExtensionInfo`** — one extension's identity/state as exposed to the agent (id, name, version,
  enabled, permissions, contributed capability ids).
- **`ExtensionManagementHost`** — the injected host for the meta tools (`list`/`get`/`setEnabled`),
  implemented by the app over `PreferenceStore` + `BUILTIN_MANIFESTS`.
- **`ActionInterceptorSupervisor`** / **`ActionInterceptorSupervisorDeps`** — the synchronous
  action-interception plane (ADR-0024): simpler than `ExtensionCapabilitySupervisor` (no persistent
  registry, so `evaluate(actionType, ctx)` checks `isEnabled` live on every call instead of
  register/unregister + `reconcile`). `provide(set)` registers an extension's
  `@tepegoz/extension-sdk` `ActionInterceptorSet`; `evaluate` returns `true` if the first enabled,
  matching interceptor blocks. Electron-free: the app wires the enabled-check in
  `main/extensions/action-interceptors.electron.ts`.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
