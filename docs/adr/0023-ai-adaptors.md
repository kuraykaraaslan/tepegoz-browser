# ADR-0023: AIAdaptor — typed capability groups over the tool plane

- **Status:** Accepted
- **Date:** 2026-07-05
- **Refines:** [ADR-0007](0007-capability-plane-mcp.md) (unified Capability/Tool Plane) ·
  **complements** [ADR-0021](0021-agent-controllable-extensions.md) (in-process capability providers) ·
  [ADR-0022](0022-file-operations-sandbox.md) (file operations)

## Context

Settings → **Cost & performance** lists every agent action (the "run locally" inventory), projected from
the single `CapabilityRegistry`. It grouped rows by a raw `category` string, rendered uppercased, with
**no title, no type, no identity** at the group level. As tool sources multiplied (built-in browser/file,
in-process extensions, MCP servers) there was no first-class notion of "which provider does this group of
actions belong to, and what kind of provider is it". The user asked for a uniform model: whether a group
is a system activity (file operations, browser) or an extension, it should surface here the same way, and
extensions should contribute their groups automatically.

The tool plane already carried the anchors: `ToolDescriptor.source` (builtin | extension | mcp | …),
`provenance` (the extensionId/server id), and `category`. `source:'adapter'` was reserved but unused.

## Decision

1. **An `AIAdaptor` is a named, typed group of `AIAdaptorAction`s** — the UI/DTO layer over the tool
   plane (`@tepegoz/desktop-ipc`). `AIAdaptor.kind ∈ {system, extension, mcp}`; each action is a
   registered tool tagged with its `adaptorId`. **Nothing about tool registration, the
   `CapabilityRegistry`, or the `ToolGateway` PEP changes** — this is a projection, not a new plane.

2. **Grouping is derived in the main process** (`apps/desktop/src/main/agent/ai-adaptors.ts`,
   `buildAiAdaptors(locale)`) from `source` + `provenance` + `category`, with no per-tool bespoke logic:
   - `extension` tools group by `provenance` (extensionId) → **one adaptor per extension**, `kind:extension`,
     titled by its localized manifest name (`extensionLabel`). The always-on management host
     (`com.tepegoz.host`) is treated as a `system` "Extensions" group, not a user extension.
   - `mcp` tools group by `provenance` (server id), `kind:mcp`, titled by the server's label.
   - `builtin` tools group by `category` (else the id's `{domain}` prefix), `kind:system`. Owning packages
     declare the group via `category` (browser-tools → `browser`/`journal`; file-operations → `file`).

3. **Title localization is split by stability.** System adaptors have known ids, so the renderer localizes
   their titles via the settings-ui dict (`adaptors` map) with the main-process English title as fallback;
   extension/MCP titles are dynamic data, resolved in main. Each group shows a `kind` badge
   (`adaptorKinds` labels).

4. **`source:'adapter'` stays reserved** for a future user-wired adaptor provider; the AIAdaptor concept
   here is a grouping/projection, not a tool source.

## Consequences

- File operations, browser, journal, each extension, and each MCP server now surface as titled, badged
  groups — the file tools appear as **File operations · System**. Adding a tool or extension needs no
  Settings change; the list is derived.
- The flat `AgentActionInfo` DTO + `capabilities:list` channel were renamed to `AIAdaptorAction` /
  `AIAdaptor` + `ai-adaptors:list` (single consumer). The per-action `localActions` toggle is unchanged.
- Extension authors get an adaptor for free (one per extension). A future need for multiple named
  sub-groups per extension can be met by an explicit per-capability `category` without changing this model.
