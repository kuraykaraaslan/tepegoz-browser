# ADR-0021: Agent-controllable extensions via in-process capability providers

- **Status:** Accepted
- **Date:** 2026-07-03
- **Refines:** [ADR-0007](0007-capability-plane-mcp.md) (unified Capability/Tool Plane) ·
  **complements** [ADR-0018](0018-mcp-client.md) (MCP client — out-of-process servers behind the PEP)

## Context

The internal agent should be able to discover and drive built-in extensions (e.g. run a saved macro,
list macros, toggle an extension). Today an extension can contribute agent-callable tools **only**
via `manifest.mcpServer` (ADR-0018) — an **out-of-process stdio subprocess**. That is right for
third-party/sandboxed servers, but a stdio child process **cannot reach host resources** (the CDP
driver, `TabManager`, the app DB) that a first-party extension like `ext-macros` must use to actually
automate the browser. There was no in-process path for a trusted built-in extension to expose
capabilities to the agent.

The binding constraint is unchanged: this is a security-by-design browser with a **single Policy
Enforcement Point** (`ToolGateway` → `PolicyKernel`) and a strict tool-naming rule
(`ToolNameSchema`, `{domain}_{verb}_{noun}`, closed verb set). Any new tool source must not bypass
either.

## Decision

1. **A first-class in-process capability contract in `@tepegoz/extension-sdk`.** An extension MAY
   declare capabilities with `defineCapabilities(extensionId, [capability(...)])`. Each `capability`
   carries a `ToolDescriptor` (`source: 'extension'`, `provenance: extensionId`), a **zod** input
   schema (the trust boundary), and a handler `(args, host) => …`. The `host` is an **injected**
   access seam (like `BrowserHost`), so the extension package stays Electron-free; the main process
   supplies the concrete host at registration time.
2. **They register into the ONE registry behind the ONE PEP.** `@tepegoz/extension-host` provides an
   `ExtensionCapabilitySupervisor` (the in-process analogue of `McpSupervisor`): it `register()`s an
   **enabled** extension's capabilities into `CapabilityRegistry` and `unregister()`s them on disable,
   reconciling at startup and on every prefs/extensions change. The planner already enumerates
   `CapabilityRegistry.list()`, so **no `agent-runtime` change** is needed — the ADR-0007 invariant.
3. **Naming and danger classes are unchanged.** Ids pass `ToolNameSchema` at `defineCapabilities`
   time. Danger classes are author-declared but fail-safe at the PEP (only `read` auto-allows;
   `state_changing`/`destructive` → HITL). A same-id tool already registered by another source is
   never clobbered (the supervisor skips it).
4. **Permission-gating lands here.** Because these are in-process trusted tools, capabilities are
   gated on the extension being **enabled** (and, as the manifest `permissions[]` enforcement matures,
   on those permissions) rather than deferring all enforcement to a later phase.
5. **Agent-manages-extensions meta-capabilities.** The host itself registers a small always-on set —
   `extension_list_items` (read), `extension_get_item` (read), `extension_update_item`
   (state_changing → HITL: enable/disable) — under the reserved id `com.tepegoz.host`, so the agent
   can discover and toggle extensions, still behind the PEP.
6. **Complements, not replaces, `manifest.mcpServer`.** In-process capability providers = trusted
   first-party extensions needing host access; `mcpServer` (stdio) = third-party/sandboxed. Both
   converge in the single registry behind the single gate.

## Consequences

- Extension capabilities are indistinguishable from builtin/MCP tools to the agent, and every one is
  policy-gated, HITL-guarded, and audited.
- The macro extension (`ext-macros`) is the first consumer; the other built-ins can adopt the same
  contract incrementally with no agent/policy/UI change.
- Disabling an extension removes its tools from the agent's reach (they vanish from
  `CapabilityRegistry.list()`), giving a clean capability kill-switch.
- Residual risk: a first-party extension is trusted in-process (unlike a sandboxed stdio server), so
  its danger-class declarations matter — mitigated by the fail-safe PEP defaults and the enabled-gate.

## Update (2026-07-03) — first-party runtime catalog + lazy surface loading

The built-in extension registry is now **data-driven** rather than a hardcoded array. Extension
IDENTITY loads from a build-time-generated, on-disk catalog (`apps/desktop/resources/extensions.catalog.json`,
emitted by `scripts/generate-extension-catalog.ts` from each extension's authored manifest) that the
main process reads and **validates with zod (`validateManifest` safeParse) at startup** — a single
malformed manifest is skipped-and-logged, not fatal. The renderer receives manifests over IPC
(`listExtensionManifests`, a zod-free `ExtensionManifestWire`) and **lazy-loads** each surface component
via `React.lazy` + dynamic `import()` (code-split, loaded on first open). Enabled/disabled state stays
in `preferences.json`.

Scope is deliberately **first-party built-ins only**: because bundled first-party code needs static
module specifiers for code-splitting, one small surface-loader thunk map remains in renderer source
(the honest limit). Loading extensions from a user/db directory, **untrusted/MV3/third-party execution,
sandboxing, and permission enforcement remain Phase 3** — unchanged by this refinement.

## Update (2026-07-06) — extensions live in `extensions/`, catalog scans the folder

The built-in extension packages moved out of `packages/*` into a sibling top-level **`extensions/`**
workspace (`extensions/ext-agent`, `ext-macros`, `ext-popup-blocker`, `ext-user-agent`) — they own real
decision logic now (ADR-0024), so they're physically separated from plain shared libraries. The catalog
generator (`scripts/generate-extension-catalog.ts`) no longer imports a hardcoded manifest array; it
**scans `extensions/<pkg>/src/manifest.ts`**, dynamically imports each, and includes every module that
exports a `validateManifest`-passing manifest. Dropping an extension folder in makes it load; removing
one makes it disappear — with no code change. The renderer's surface-loader thunk map stays a static
superset (the same bundler limit above), consulted only for extensions actually present in the catalog,
so a stale thunk for a removed extension is inert.

## Update (2026-07-04) — local-eligibility metadata (the "run locally" standard)

`ExtensionCapabilityDef` (and the builtin tool descriptors) now carry three OPTIONAL, fail-safe fields
so the Settings → **Cost & performance** "run locally" list is fully data-driven for extensions too:

- `aiTask?: AiTask` — the LLM/cognitive work an action entails (`none | read_understand | summarize |
classify | extract | redact | plan | decide`). `'none'`/absent ⇒ a purely mechanical action → never
  local-toggleable.
- `localCapable?: boolean` — override; absent ⇒ derived from `aiTask` (present and not `'none'`), via the
  shared `isLocalCapable()` in `@tepegoz/shared-types`.
- `category?: string` — explicit Settings group; absent ⇒ derived from the id's `{domain}` prefix.

Because extension capabilities already register into the ONE `CapabilityRegistry` behind the ONE PEP,
they appear in the "run locally" list automatically — an extension author only declares these fields.
Fail-safe like the danger classes: unknown/absent ⇒ treated as `none`/not-local. The on-device model
itself is the `'local'` provider (see `@tepegoz/local-inference`); routing is decided per-capability by
`ModelRouter`, unchanged by this metadata.

## Update (2026-07-06) — browser/tab/journal tools moved to always-on, package-owned builtins

The Agent extension (`com.tepegoz.agent`) previously declared the `browser_*`, `tab_*`, and
`journal_search_events` tools via `defineCapabilities`, so they registered through the
`ExtensionCapabilitySupervisor` and were unregistered when the agent was disabled (the kill-switch of
Decision #2 / ADR-0024). But those are **browser-, tab-, and journal-domain operations, not agent-owned**
— only `ext-macros`'s `macros_*` genuinely belong to their extension. They now register the same way
`@tepegoz/file-operations` registers `file_*`: **always-on `source: 'builtin'` tools written directly to
the `CapabilityRegistry`**, owned by their domain packages —
`@tepegoz/browser-tools` (`registerBrowserTools`), `@tepegoz/tab-engine` (`registerTabTools`, via a new
`TabHost` seam split out of `BrowserHost`), and `@tepegoz/journal-tools` (`registerJournalTools`, which
now owns the `JournalReader`/`JournalEntry` seam moved out of `browser-tools`). The desktop app calls the
three `registerXxxTools({ host })` factories once at startup, next to `FileOperationsHost.init()`.

This does **not** weaken the single-PEP invariant: every one is still policy-gated, HITL-guarded, and
audited exactly as before, and the ids/danger-classes are unchanged (a pure ownership + registration-path
move, not a rename). It **does** change the kill-switch surface: disabling `com.tepegoz.agent` no longer
unregisters these tools. That is acceptable because the agent _runtime_ that invokes tools only runs when
the extension is enabled, so a registered-but-unreachable browser tool is inert — the same posture as the
always-on `file_*` and `extension_*` builtins. Only `ext-macros` remains on the extension-supervisor
kill-switch path (its tools genuinely are its domain).
