# @tepegoz/extension-sdk

The developer API for Tepegöz internal extensions: a zod manifest schema (mirroring a web-extension
manifest — a small, declarative, versioned contract the host validates before loading anything) plus
the agent-callable capability contract an extension may declare (ADR-0021). Depends only on
`@tepegoz/shared-types` and zod.

## Exports
- **`ExtensionManifestSchema`** (+ `defineExtension`/`validateManifest`) — the manifest shape: reverse-DNS
  `id` (`EXTENSION_ID_RE`), `name`/`version`/`description`, an icon slug, the declared `surfaces`
  (`popup`/`modal`/`panel`/`sidebar`/`page`), toolbar `actions` (click/double-click bindings, defaulted
  and cross-validated against the declared surfaces), per-locale `labels`, requested `permissions`
  (closed enum — no free-form strings), and an optional `mcpServer` declaration. `defineExtension`
  parses and throws on an invalid manifest (dev-time contract); `validateManifest` is the non-throwing
  `safeParse` form for untrusted/third-party manifests.
- **`ExtensionSurfaceKindSchema`** / **`ExtensionSurfaceKind`** — the surface-kind enum and its type.
- **`McpServerDeclSchema`** / **`McpServerDecl`** — an MCP server an extension provides, so its tools
  become usable by the internal agent via the host's ToolGateway PEP (ADR-0018). Only `stdio` is wired
  today; `http_sse` is reserved.
- **`EXTENSION_ID_RE`** — the reverse-DNS id pattern, shared by the host's own extension-id validators
  (single source of truth — see `@tepegoz/preferences`).
- **`capability(def)`** / **`defineCapabilities(extensionId, capabilities)`** — declare an extension's
  in-process, agent-callable tools (ADR-0021). Unlike `mcpServer` (an out-of-process stdio server),
  these run in-process with host access (CDP driver, tabs, the extension's own store) via a host object
  `H` injected at registration time by `@tepegoz/extension-host`. `capability` validates the tool id
  against the shared `ToolNameSchema` and normalizes the author's definition into a full
  `ToolDescriptor` + validator + handler; `defineCapabilities` validates the extension id, rejects
  duplicate capability ids, and stamps `provenance = extensionId` on every descriptor for
  attribution/audit. Both throw on an invalid definition (dev-time contract, like `defineExtension`).
- **`ExtensionCapabilityDef`** / **`ExtensionCapability`** / **`ExtensionCapabilitySet`** — the
  author-facing definition type, the normalized/registry-facing type, and the per-extension set
  returned by `defineCapabilities`.
- **`defineActionInterceptors(extensionId, defs)`** — declare an extension's synchronous action
  interceptors (ADR-0024): allow/deny predicates for browser mechanics (`popup:open`, `tab:create`,
  `tab:close`, `navigation:navigate`) that `TabManager` consults at each action's execution point.
  Unlike `capability`/`defineCapabilities` (async, behind the agent's `ToolGateway` PEP), these run
  INLINE and must be synchronous — `WebContents.setWindowOpenHandler`/`will-navigate` accept no
  `Promise`. Validates the extension id and stamps it on every interceptor for the enabled-set gate
  applied by `@tepegoz/extension-host`'s `ActionInterceptorSupervisor`.
- **`ActionType`** / **`ActionContext`** — the closed union of interceptable actions and each one's
  typed context shape (the single source of truth new action types are added to).
- **`ActionInterceptorDef`** / **`ActionInterceptor`** / **`ActionInterceptorSet`** — the author-facing
  definition type, the normalized/supervisor-facing type, and the per-extension set returned by
  `defineActionInterceptors`.

## Scripts
`pnpm typecheck` · `pnpm build` · `pnpm test` · `pnpm lint`
