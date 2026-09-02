# Track — Chrome-style multi-profile data & session isolation

- **Status:** 📋 **Proposed — not scheduled (2026-08-28).** A first implementation shipped on the
  abandoned branch `feat/multi-profile-windows` (5 commits, 2026-08-17) and was **never merged**; that
  branch is now ~350 commits behind `main` and will not rebase cleanly. This track is the re-derivation:
  the capabilities to deliver, the architecture that branch converged on (process-per-profile), and a
  fresh plan against today's `main`. **Do not cherry-pick the branch** — read it for intent, rebuild for
  today's tree.
- **Owner decisions owed:** (1) ship as process-per-profile (accept ~200–300 MB RAM per open profile) or
  retry in-process routing; (2) partition-key scheme now that Phase 5's `persist:tepegoz-web--conn-<id>`
  tunnel partitions have landed on `main`; (3) whether this earns a numbered phase row or stays a track;
  (4) ADR number — the branch wrote `docs/adr/0025-multi-profile-isolation.md`, but `0025` on `main` is
  `0025-model-streaming-boundary.md`, so a merge must renumber to the next free ADR (0042+).
- **Companion ADR (to be written):** supersedes the branch's ADR-0025 draft; refines
  [ADR-0014](../../docs/adr/0014-user-data-layout-db-connector.md) (single `userData` → `Profiles/<id>/`
  subdivision), [ADR-0020](../../docs/adr/0020-tab-boundary-model.md) (per-profile partition isolation it
  deferred), and the Phase 5 network layer's partition-key convention.

## Why

The premise the old roadmap recorded — "BrowserContext isolation already exists; just add the UI" — is
false. On `main` today:

- Exactly **two hardcoded, permanently shared** Chromium session partitions: `APP_PARTITION =
'persist:tepegoz-app'` ([`window.ts:18`](../../apps/desktop/src/main/window.ts#L18)) for chrome and
  internal pages, `persist:tepegoz-web` for browsed tabs. Every window and every tab in the whole app
  shares them. (Phase 5 added `persist:tepegoz-web--conn-<id>` tunnel variants, but those are per-VPN
  connection, not per-identity.)
- One global `userData` directory (ADR-0014): one `tepegoz.db`, one `preferences.json`, one
  `credentials.enc.json`, one adblock cache, one dictionaries dir, one download-quarantine dir, one
  models dir, one third-party `Extensions/` install dir.
- `PreferenceStore` and `CredentialVault` are `private static` singletons — one slot per process
  ([`preference-store.ts:16-18`](../../packages/preferences/src/preference-store.ts#L16)) — so two
  identities' data cannot even coexist in memory.

There is **no per-profile isolation of any kind**. The Chrome-style profile menu rows
(`UserMenuPopup.tsx`) are disabled placeholders with nothing behind them.

**Target use case:** a consultant / agency running several client identities on one machine — full data
isolation per identity (history / bookmarks / passwords / preferences / cookies / extensions), a
picker/switcher, and two or more identities open **concurrently**, each in its own OS window with an
avatar + colour so they are never confused.

## Capabilities to deliver

| #   | Capability                                                                                                                                                                                                                                                                                        | State on `main`                   | State on the abandoned branch                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| C1  | **Profile registry** — CRUD over a list of named identities, Chrome-style ids (`default`, then `profile-1`, `profile-2`, …), auto-assigned name + avatar colour, immutable id / editable display name                                                                                             | none                              | `@tepegoz/profiles` package: zod schemas, pure reducers, `profiles.json` store               |
| C2  | **Full data isolation per profile** — DB, preferences, credential vault, translate memory, adblock, dictionaries, download quarantine, local models, third-party extension installs all live under `Profiles/<id>/`                                                                               | single global `userData`          | every `userData`-derived path repointed through `profile-paths.ts`                           |
| C3  | **Session / cookie isolation** — each profile gets its own Chromium partition(s); cookies, cache, IndexedDB, localStorage, service workers do not cross                                                                                                                                           | two shared partitions             | per-process `userData` ⇒ Chromium writes a self-contained `Partitions/` per profile          |
| C4  | **Picker + switcher UI** — working profile menu (add-and-switch, switch, manage, open new window) and a `tepegoz://profiles` manager page (rename / delete / list, last-profile delete refused)                                                                                                   | disabled placeholder rows         | `@tepegoz/profiles-ui` page + `ipc-profiles.ts` + `UserMenuPopup` wired                      |
| C5  | **Concurrent profiles** — two or more open at once, each window shows its **own** profile, independent menus, agent/task/MCP runs scoped to the profile whose window they belong to                                                                                                               | one active identity, process-wide | each profile is its own Electron process (`--user-data-dir=<root>/Profiles/<id>`)            |
| C6  | **First-run migration** — an existing flat `userData/{tepegoz.db,-wal,-shm,preferences.json,credentials.enc.json,Partitions/,…}` install moves into `Profiles/default/` before any store opens, existence-guarded, same-volume rename with copy+delete fallback, failure logged and left in place | n/a                               | `migrate-legacy-profile.ts`                                                                  |
| C7  | **Profile deletion** — confirm dialog, then close its windows, wipe its data directory + partitions as one unit, remove from registry; refuse deleting the last profile or the profile in use                                                                                                     | n/a                               | `deleteProfile` in `ipc-profiles.ts` (process-per-profile: refuse if its process is running) |

## Recommended architecture — process per profile

The branch shipped **two** designs. The first (single process, `PreferenceStore` / `CredentialVault` /
DB connector each an internal `Map<profileId, Core>` behind an unchanged static facade, routing every
read/write to "the active profile") **shipped and then failed in use**: changing the theme in one
profile's window changed it in the other's, because `prefs:get` / `prefs:set` resolved the process-wide
active profile, not the calling window's. That is the _class_ of bug the design invites — correctness
depended on ~50 call sites each re-asserting which profile they meant, and one that forgot was silently
wrong.

The branch's final commit (`90cf04e`) replaced it with **one Electron process per profile**, launched
with `--user-data-dir=<root>/Profiles/<id>`:

- Inside a process, `app.getPath('userData')` **is** the profile directory. Every store opens a plain
  path inside it — the pre-multi-profile code, unchanged, routing facade deleted. Cross-profile bleed is
  structurally impossible: there is no "other profile" in the process to leak into.
- Chromium writes `Partitions/`, `Cache/`, `Local State` under `userData` ⇒ a profile really is one
  self-contained, copyable folder — full Chrome parity. Partition **names** can stay
  `persist:tepegoz-app` / `persist:tepegoz-web` (two profiles never share one — the directories differ).
  Deleting a profile is a single recursive directory remove.
- `TaskService`, `McpService`, `CapabilityRegistry`, `MacroService`, `FileOperationsHost` are
  per-process singletons ⇒ genuinely per-profile at no extra cost. An agent run in one profile cannot
  touch another's data.
- Electron's single-instance lock is keyed by the user-data dir ⇒ "switch to profile X" is the same
  spawn whether or not X is running; if it is, the new process's lock fails and the running one's
  `second-instance` handler focuses its window.
- The per-window `profileId` threading (`window-profile-map.ts`, the `profileId` params on
  `createWindow` / `openWindow` / popup + drag-preview factories / tab creation) is **deleted** — every
  window in a process is the same profile.

**Costs, accepted:** a full Electron runtime per open profile (~200–300 MB — the reason Chrome itself
does _not_ do this). Deleting a running profile is refused with an actionable message (files locked);
deleting the profile you are in is refused outright. Cross-profile tab drags are impossible by
construction (a different process is not a drop target) — matches Chrome.

**Shared mutable state, the one thing this adds:** `profiles.json` is written by multiple processes.
Mitigate exactly as the branch did — `ProfilesStore` re-reads before every mutation, atomic tmp+rename
via `@tepegoz/json-store` rules out a torn read, and mutations are only ever explicit user actions
(create / rename / delete / switch).

## Re-implementation plan against today's `main`

PRs kept small and each a no-user-visible-change checkpoint until the last.

1. **PR1 — foundation, no behaviour change.**
   - New `@tepegoz/profiles` (Electron-free): `Profile` / `ProfilesFile` types, zod schemas
     (`ProfileIdSchema = /^(default|profile-\d+)$/`, 8-colour palette), pure reducers
     (`addProfile` / `renameProfile` / `removeProfile` / `touchLastUsed`, Chrome-style id + colour
     assignment), `ProfilesStore` singleton over `profiles.json` on a `./store` subpath so the renderer
     bundle never pulls `fs` transitively.
   - `apps/desktop/src/main/profiles/profile-paths.ts` — single source for the `Profiles/<id>/` layout.
   - `migrate-legacy-profile.ts` — flat install → `Profiles/default/`, **including `tepegoz.db-wal` /
     `-shm` and `Partitions/`** (the branch's two data-safety fixes — omitting the WAL drops everything
     since the last SQLite checkpoint after a crash; omitting `Partitions/` silently signs the user out).
   - Repoint every `userData`-derived path (DB connector, `stores.electron.ts`, adblock, translate host,
     typo-dictionary manager, download service + lifecycle, model manager) through `profile-paths.ts`.
   - `dependency-cruiser.cjs` allow-rules for the new package; `docs/package-map.md` row.
2. **PR2 — the profile launcher / boot resolver.**
   - `profiles/profile-launcher.ts` (spawn with `--user-data-dir`), `profiles/profile-boot.ts` (resolve
     which profile to open from `profiles.json`'s `lastActiveProfileId` **before** `app.whenReady()`; no
     forced picker on cold start).
   - Single-instance-lock `second-instance` handler focuses the running profile's window.
   - Still one profile in practice (`default`), just launched through the new path.
3. **PR3 — partitions + session hooks per profile.**
   - Decide the partition-key scheme against the Phase 5 network layer (`binding-service`,
     `browsing-sessions`, `connection-pool` all speak `persist:tepegoz-web[--conn-<id>]`). Process-per-
     profile lets the names stay unchanged; confirm `BrowsingSessions.isBrowsingPartition` and the
     tunnel-partition composition still hold when `userData` differs.
   - Re-register session-level hooks (CSP in `security.ts`, the shared `webRequest` multiplexer in
     `browsing-web-request-service`, download interception, `user-agent-host`) per process — most of this
     falls out for free once each profile is its own process.
4. **PR4 — IPC + UI.**
   - `@tepegoz/desktop-ipc`: `contract-profiles.ts` / `api-profiles.ts` / `schemas.ts` — `listProfiles`,
     `getActiveProfile` (**sender-window-resolved**, not process-global), `createProfile`,
     `renameProfile`, `deleteProfile`, `switchProfile`. `safeParse` on every input at the boundary.
   - `apps/desktop/src/main/ipc/ipc-profiles.ts` + `apps/desktop/src/preload/api-profiles.ts`.
   - `@tepegoz/profiles-ui` — presentational `ProfilesPage` (avatar colour, initial, rename modal,
     delete with last-profile guard), own `src/i18n/{en,tr}.ts` dictionary (ADR-0016).
   - `tepegoz://profiles` route (via the `protocol.handle` internal-pages plumbing from
     [protocol-tepegoz-pages.md](protocol-tepegoz-pages.md) — new since the branch; the branch used the
     old `WebContentsView` internal-page path).
   - Turn the disabled `UserMenuPopup.tsx` / `MainMenuPopup.tsx` rows into working actions: add-and-
     switch, switch (focus existing window or spawn), manage, open new window. Passwords / account / sync
     rows stay disabled (out of scope); Guest stays disabled (phase-2c, unrelated).
5. **PR5 — deletion + concurrency hardening.**
   - `deleteProfile`: refuse the last profile and the in-use profile; for a running target, refuse with
     "close its window first" rather than half-wiping locked files.
   - `PopupWindowManager` needs no per-owning-window map fix (different processes ⇒ different menus) —
     confirm and delete the branch's deferred papercut note.
   - E2E: two profiles as separate process trees at once, distinct themes (dark vs light), no bleed;
     migration round-trip; last-profile-delete refused.

## The security line (non-negotiable — CLAUDE.md, ADR-0010)

- Renderer stays untrusted; the profile API is typed `contextBridge` only, `safeParse` at the IPC
  boundary. No profile id or path crosses from the renderer unvalidated against `ProfileIdSchema`.
- `credentials.enc.json` stays `safeStorage`-encrypted per profile; never logged, never in the renderer
  bundle. Each profile's vault is a separate file under `Profiles/<id>/`.
- A profile switch must not leak the previous profile's in-memory secrets into the new process — with
  process-per-profile this is automatic (fresh process), which is a security argument _for_ that design.

## Explicitly out of scope

- **Cloud sync** of any profile data — a later phase.
- The **MV3 `ExtensionHost` execution engine** itself (still unbuilt, its own roadmap task) — this track
  only guarantees that whenever it lands, each profile already has its own isolated `Extensions/` install
  directory, not a shared one. The bundled built-in extension **catalog**
  (`resources/extensions.catalog.json`) stays a single read-only app resource; only installed/enabled
  state is per-profile.
- **Guest / private-ephemeral mode** (phase-2c) — unrelated, unbuilt; its menu placeholder stays
  disabled.
- **Per-site** `webPreferences` / partition overrides — profile-wide only.

## Reference — what the abandoned branch already wrote

`git show feat/multi-profile-windows` — 5 commits, all 2026-08-17, merge-base `ab11931` (2026-07-11):

| Commit    | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `2c6a5a5` | `docs(profiles)` — ADR-0025 draft + `@tepegoz/profiles` registry package + `migrate-legacy-profile.ts` + `profile-paths.ts`; every `userData`-derived path repointed. Non-user-visible foundation.                                                                                                                                                                                                                                                                                               |
| `f007eaa` | `refactor(profiles)` — `PreferenceStore` / `CredentialVault` / DB connector: `private static` singleton → internal `Map<profileId, Core>` behind the **same** static class name + signatures, so ~50 call sites and every existing test needed zero changes. `.init(deps)` becomes permanent sugar for `.open('default', deps)`. **This is the in-process design that later failed — see `90cf04e`.**                                                                                            |
| `8529801` | `feat(profiles)` — per-profile Chromium partitions `persist:tepegoz-profile-<id>[--app]`; `profileId` threaded through window / popup / drag-preview / tab creation and per-window nav+prefs reads; session hooks (CSP, webRequest mux, download interception) re-registered per opened profile; cross-profile tab drag tears off a new window instead of merging into the wrong strip; boot resolves the profile from the registry's last-active pointer.                                       |
| `5de36d7` | `feat(profiles)` — profile IPC contract (list / get-active / create / rename / delete / switch, sender-window-resolved), `@tepegoz/profiles-ui` manager page at `tepegoz://profiles`, `UserMenuPopup` placeholders → working actions; delete closes windows + clears sessions + removes the data dir, refuses the last one. `@tepegoz/profiles` split onto a `./store` subpath so the renderer never pulls `fs`.                                                                                 |
| `90cf04e` | `feat(profiles)` — **replaces the in-process design**: each profile is its own Electron process (`--user-data-dir=<root>/Profiles/<id>`), routing facade deleted, `Partitions/` nested inside the profile folder (Chrome parity, one-shot deletion), agent/task/MCP engines per-profile for free, per-window `profileId` threading + `window-profile-map.ts` deleted. Fixes the migration's missing `tepegoz.db-wal` / `-shm` and `Partitions/`. Adds `profile-boot.ts` + `profile-launcher.ts`. |

Verified live on the branch: two profiles as fully separate process trees at once (each with its own
browser / renderer / gpu / utility processes) holding distinct themes (dark vs light) with no bleed.

## Why it is not just merged

- ~350 commits behind `main`; merge-base predates the phases consolidation
  (`phases/phase-3-backend-cloud-extensions.md`, which the branch edits, no longer exists), the Phase 5
  network / tunnel-partition layer, and the `protocol.handle` internal-pages rework — all three touch the
  exact files this branch touches.
- ADR number collision (`0025` is taken on `main`).
- The in-process → process-per-profile pivot means commits `f007eaa` / `8529801` are partly superseded
  by `90cf04e` **within the branch itself** — a clean cherry-pick would re-introduce then remove the
  facade. Rebuild from `90cf04e`'s end state, not the commit sequence.
