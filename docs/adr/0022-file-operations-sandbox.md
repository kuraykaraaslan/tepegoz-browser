# ADR-0022: Folder-sandboxed file operations for the agent

- **Status:** Accepted
- **Date:** 2026-07-05
- **Refines:** [ADR-0007](0007-capability-plane-mcp.md) (unified Capability/Tool Plane) ·
  **complements** [ADR-0021](0021-agent-controllable-extensions.md) (in-process capability providers)

## Context

The agent had no way to touch the local filesystem. Giving it file access is high-value (edit code,
organize downloads, read/write documents) but high-risk: an untrusted-content-driven agent must never
roam the whole disk. All existing `fs` usage in `main` is unfenced one-off migration/store I/O — there
was no sandbox primitive.

The binding constraints are unchanged: a security-by-design browser with a **single Policy Enforcement
Point** (`ToolGateway` → `PolicyKernel`) and the `{domain}_{verb}_{noun}` closed-verb tool-naming rule
(`ToolNameSchema`). Any filesystem capability must go through the PEP and must not let the agent escape
a user-approved boundary.

## Decision

1. **A folder-grant whitelist is the sandbox.** The user configures a list of folders in Settings, each
   with a permission **mode** — `read`, `read-write`, or `full` (incl. delete) — and a `recursive`
   flag. The grant's mode **is** the authorization. Persisted in `Preferences.fileAccessGrants`; a
   master `fileOperationsEnabled` switch and a one-time `fileAccessSeeded` sentinel accompany it. On
   first run `~/tepegoz` is seeded at `full`. The grant type lives in `@tepegoz/shared-types/file-access`
   (zod-free, the single source shared by prefs, the contract, and the core).

2. **A new Electron-free core, `@tepegoz/file-operations`**, mirrors `@tepegoz/browser-tools`: it
   registers `file_*` (get/list/get-metadata/search/create/update/delete/copy/move) and `fileaccess_*`
   (list/create/update/delete grant) tools into the `CapabilityRegistry`, behind the same PEP. Real
   `fs` is injected via a `FileSystemHost` seam; grant persistence via a `GrantStore` seam. The
   `FileAccessPolicy` is pure path-math over canonical (symlink-resolved) absolute paths.

3. **Enforcement is dual (defense in depth):**
   - **Hard sandbox in every handler** — `assertMembership(realPath)` throws 403 if the path is outside
     every granted root (symlinks resolved via `realpath` first, so a link can't escape). This confines
     reads too (reads are `dangerClass: 'read'`, which the PolicyKernel auto-allows).
   - **Mode gate at the HITL seam** — for a mutating op the confirm handler consults
     `FileAccessPolicy.decide(realPath, requiredMode)`: `allow` (≤ grant mode → run silently), `ask`
     (exceeds grant mode → prompt), or `deny` (no grant). Mode is gated _here_, not in the handler, so
     an **approved** escalation still runs (the handler only re-checks membership, which approval never
     widens).

4. **Consent reuses the existing agent HITL modal.** File tools are only ever invoked by the agent
   through the `ToolGateway` during a run, so the per-run confirm handler is always wired. An op within
   its folder's mode auto-approves; an escalation, or any `fileaccess_*` grant-management tool (incl.
   the AI-driven "add this folder" request), falls through to the standard approval modal — no bespoke
   consent UI, channel, or IPC surface. The Settings grant list rides on `prefs:get`/`prefs:set`; only
   the native directory picker needs a dedicated channel.

## Consequences

- The agent can do real filesystem work while staying inside user-approved folders; the AI can only
  **request** a wider sandbox (via `fileaccess_create_grant`), never self-approve it.
- Tool names are remapped to the closed verb set (`file_read_file` → `file_get_content`,
  `file_add_whitelist_folder` → `fileaccess_create_grant`, `file_ask_permission` → the HITL prompt).
- `fileAccessGrants`/`fileOperationsEnabled`/`fileAccessSeeded` are `private` in `SETTINGS_VISIBILITY`
  (a filesystem footprint must never reach an extension).
- The mode gate lives at the confirm seam; a tool invoked outside the `ToolGateway` would keep only the
  membership guarantee — acceptable because the PEP is the single invocation path.
