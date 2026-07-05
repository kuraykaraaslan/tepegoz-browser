# @tepegoz/file-operations (L5)

Folder-sandboxed `file_*` / `fileaccess_*` capabilities behind the ToolGateway PEP (ADR-0022, refining
ADR-0007). The user's folder-grant whitelist (each grant a `read`/`read-write`/`full` mode, optionally
recursive) *is* the authorization — there is no broader filesystem access. `FileAccessPolicy` is pure
path-math over that whitelist: `assertMembership` is the hard sandbox every handler calls (a path
outside every grant is refused, full stop), while `decide` is the softer mode gate the ToolGateway
confirm handler consults for mutating ops (`allow`/`ask`/`deny`). Electron-free: the concrete
filesystem and grant persistence are injected via `FileSystemHost`/`GrantStore`, implemented by the app
over `node:fs` + preferences in `main/file-operations/file-operations-host.ts`.

## Exports
- **`registerFileOperations(deps)`** — registers the `file_*`/`fileaccess_*` tools into the
  `CapabilityRegistry`, bound to the given `FileSystemHost`/`FileAccessPolicy`/`GrantStore`. Read tools
  are `read` danger class (auto-allowed; membership still enforced in the handler); writes are
  `state_changing`, deletes `destructive` (→ HITL).
- **`resetFileOperationsForTest`** — test seam to unregister and re-register cleanly.
- **`FILE_OP_REQUIRED_MODE`** — the minimum grant mode each mutating op requires, consumed by the
  confirm handler's mode gate.
- **`FILE_GRANT_TOOL_IDS`** — the grant-management tool ids (`fileaccess_create_grant`/`update_grant`/
  `delete_grant`), always user-consented, never auto-approved.
- **`FileAccessPolicy`** / **`FileAccessDecision`** — the pure path-math sandbox core: `assertMembership`
  (hard containment check) and `decide` (`allow`/`ask`/`deny` mode gate).
- **`FileSystemHost`** — the injected fs seam (`canonicalize`, `readFile`/`writeFile`/`appendFile`,
  `mkdir`/`readdir`/`stat`/`exists`, `rename`/`copyFile`/`remove`, glob `search`). Every method except
  `canonicalize` takes an already-canonicalized, grant-checked absolute path.
- **`GrantStore`**, **`DirEntry`**, **`FileStat`**, **`FileEncoding`** — supporting injected/data types
  (`FileEncoding` is `utf8`/`base64`, so binary content can cross IPC safely).

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test`
