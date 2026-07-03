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
