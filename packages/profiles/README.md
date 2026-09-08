# @tepegoz/profiles

Chrome-style multi-profile registry — the domain model for named identities on one machine
(consultant / agency use case), plus the shared `profiles.json` store. Part of the multi-profile
isolation track (`docs/tracks/multi-profile-isolation.md`, ADR-0045).

Each profile has an **immutable id** following Chrome's own scheme (`default` for the first / migrated
profile, then `profile-1`, `profile-2`, …) and an independently **editable display name**. The id is
the on-disk folder name (`Profiles/<id>/`); a rename never moves the folder.

## Entry points

- **`.`** (`@tepegoz/profiles`) — PURE barrel: `Profile` / `ProfilesFile` types and pure reducers
  (`addProfile` / `renameProfile` / `removeProfile` / `touchLastUsed`, Chrome-style id + colour
  assignment). No Node, no `fs`, no Electron — safe for the renderer bundle (`@tepegoz/profiles-ui`).
- **`./schemas`** (`@tepegoz/profiles/schemas`) — zod validators for the persisted file
  (`ProfilesFileSchema`, `ProfileIdSchema`) and the untrusted renderer→main IPC payloads
  (`CreateProfileInputSchema`, `RenameProfileInputSchema`).
- **`./store`** (`@tepegoz/profiles/store`) — MAIN PROCESS ONLY. `ProfilesStore`, a static singleton
  over `<root>/profiles.json` (Chrome's `Local State` equivalent). Pulls `@tepegoz/json-store`, hence
  the separate subpath so a renderer bundle never gets `fs` transitively.

## Shared across processes

Under process-per-profile every running profile is its own Electron instance and they all read/write
the one `profiles.json`. `ProfilesStore` re-reads from disk before every mutation (read-modify-write)
and `@tepegoz/json-store`'s atomic tmp+rename write rules out a torn file. The residual race — two
processes mutating within the same few milliseconds — is acceptable for a registry touched only by
explicit, rare user actions (create / rename / delete / switch).

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
