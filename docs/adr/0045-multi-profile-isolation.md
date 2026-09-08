# ADR-0045: Chrome-style multi-profile isolation — one Electron process per profile, profile-scoped partitions, and a first-run flat→`Profiles/<id>/` migration

- **Status:** Accepted (shipped in five PRs on `main`, 2026-09-08 — the `@tepegoz/profiles` registry
  package, `resolveAndPinProfile()` + `migrate-legacy-profile.ts`, profile-scoped partition names in
  `@tepegoz/tab-engine`, the `profiles:*` IPC + `@tepegoz/profiles-ui` manager + wired `UserMenuPopup`,
  and the deletion guards; unit- and E2E-tested)
- **Date:** 2026-09-08
- **Supersedes:** the never-merged `feat/multi-profile-windows` branch's `docs/adr/0025-multi-profile-isolation.md`
  draft (the `0025` number is taken on `main` by `0025-model-streaming-boundary.md`)
- **Refines:** [ADR-0014](0014-user-data-layout-db-connector.md) (the single `userData` directory gains a
  `Profiles/<id>/` subdivision) · [ADR-0020](0020-tab-boundary-model.md) (the per-profile partition
  isolation it deferred to "a separate, later ADR") · [ADR-0012](0012-browser-tab-model.md) ("profiles
  are a later phase") · **relates to** the Phase 5 network layer's `persist:tepegoz-web--conn-<id>`
  tunnel-partition convention, which now composes on the profile-scoped base
- **Track:** [`docs/tracks/multi-profile-isolation.md`](../tracks/multi-profile-isolation.md)

## Context

The old roadmap recorded "Full multi-profile targeting (BrowserContext isolation already exists; add
UI/flow)" as a Phase 3 task. The premise was false. On `main` before this work: exactly two hardcoded,
permanently shared Electron session partitions (`persist:tepegoz-app` for chrome, `persist:tepegoz-web`
for browsed tabs), one global `userData` directory (one `tepegoz.db`, one `preferences.json`, one
`credentials.enc.json`, one adblock cache, one models dir, one third-party `Extensions/` dir), and
`PreferenceStore` / `CredentialVault` as `private static` singletons — one slot per process, so two
identities' data could not even coexist in memory. The Chrome-style profile menu rows in
`UserMenuPopup.tsx` were disabled placeholders with nothing behind them.

Target use case: a consultant / agency running several client identities on one machine — full data
isolation per identity (history, bookmarks, passwords, preferences, cookies, extension installs), a
picker / switcher, and two or more identities open **concurrently**, each in its own OS window with an
avatar + colour so they are never confused.

The `feat/multi-profile-windows` branch (2026-08-17) built this twice. Its first design kept a **single
process** serving every profile, with `PreferenceStore` / `CredentialVault` / the DB connector each an
internal `Map<profileId, Core>` behind an unchanged static facade routing every read / write to "the
active profile". That shipped on the branch and then failed in use: changing the theme in one profile's
window changed it in the other's, because `prefs:get` / `prefs:set` resolved the process-wide active
profile rather than the calling window's. That is the *class* of bug the design invites — correctness
depended on ~50 call sites each re-asserting which profile they meant. The branch's final commit
replaced it with one process per profile. This ADR adopts that end state directly (per the track: "read
the branch for intent, rebuild for today's tree"), against a `main` that is ~945 commits further along.

## Decision

### 1. Directory layout

Under the single `appData` root (`%APPDATA%/tepegoz/`, unchanged from ADR-0014 at the root):

```
%APPDATA%/tepegoz/
├── profiles.json             # the registry — Chrome's "Local State" equivalent; read before a profile is chosen
└── Profiles/
    ├── default/              # tepegoz.db(+ -wal/-shm), preferences.json, credentials.enc.json,
    │                         # translate-memory.json, adblock/, dictionaries/, safe-browsing/, models/,
    │                         # Extensions/, vpn/, bin/, Downloads/quarantine/, AND Chromium's own
    │                         # Partitions/ · Cache/ · Local State
    └── profile-1/            # identical shape, one directory per additional profile
```

`profilesRoot()` (`apps/desktop/src/main/profiles/profile-paths.ts`) is `join(appData, 'tepegoz')`,
overridable wholesale by `TEPEGOZ_PROFILES_ROOT` — the one seam a test or the eval harness uses to run
the real profile system against an isolated directory (Electron derives `appData` from an OS API, not
`$APPDATA`).

### 2. One Electron process per profile

Each profile runs as its own Electron instance, launched with `--user-data-dir=<root>/Profiles/<id>`
(`profiles/profile-launcher.ts`). `profiles/profile-boot.ts#resolveAndPinProfile()` runs at module load
— before `app.requestSingleInstanceLock()` and `whenReady` — and pins `userData` to the profile's
directory, so every later `app.getPath('userData')` (the stores, the SQLite connector, Chromium's
partitions) already resolves inside it. **The stores are the pre-multi-profile code, unchanged** — no
routing facade, no `Map<profileId, …>`. Cross-profile bleed is structurally impossible: there is no
"other profile" in the process to leak into.

Selection order in `resolveAndPinProfile()`:

1. `--profile-id=<id>` — a launcher-spawned child; pin `Profiles/<id>/`.
2. `--user-data-dir=<path>` with no `--profile-id` — an explicit opt-out (the AI-1 eval harness isolates
   a run this way). Honoured verbatim; profile id reported as `default`; **the shared `profiles.json` is
   not touched** (no `touchLastUsed`), so an isolated run cannot write into the real registry.
3. Neither — a plain launch: carry over any pre-rename `%APPDATA%/Tepegöz` files, run the one-time
   migration, then open whichever profile `profiles.json`'s `lastActiveProfileId` names (no forced
   picker on cold start), falling back to `default`.

Consequences of the process boundary, all for free:

- `TaskService`, `McpService`, `CapabilityRegistry`, `MacroService`, `FileOperationsHost`,
  `BrowsingWebRequestService`, `user-agent-host` are per-process singletons — genuinely per-profile. An
  agent run in one profile cannot act on another's data.
- Electron's single-instance lock is keyed by the user-data directory, so "switch to profile X" is the
  same spawn whether or not X is running: if it is, the new process's lock fails and the running one's
  `second-instance` handler reveals its window.
- The per-window `profileId` threading the first design needed (a `WeakMap<BrowserWindow, ProfileId>`,
  `PopupWindowManager`'s single-slot fix) simply does not arise — every window in a process is the same
  profile.

Cost, accepted: a full Electron runtime per open profile (~200–300 MB — the reason Chrome itself does
*not* do this). Deleting a profile whose process is running is refused with an actionable message (its
files are locked); deleting the profile you are currently in is refused outright.

### 3. `@tepegoz/profiles` — the registry

An Electron-free package. The `.` barrel is pure (types + reducers, no `fs`) so `@tepegoz/profiles-ui`
can bundle it. `Profile.id` follows Chrome's own scheme — `default` for the first / migrated profile,
then the lowest unused `profile-N` — assigned once and immutable; the display `name` is independently
editable and never affects the folder name. `./schemas` holds the zod validators (the persisted file and
the untrusted renderer→main IPC inputs); `./store` (main-only) is `ProfilesStore`, a static singleton
over `profiles.json`.

**`profiles.json` is shared mutable state across processes** — the one thing this design adds. It is
small and mutated only by explicit, rare user actions (create / rename / delete / switch).
`ProfilesStore` re-reads from disk before every mutation (read-modify-write), and `@tepegoz/json-store`'s
atomic tmp+rename write rules out a torn read. The residual race — two processes mutating within the
same few milliseconds — is accepted.

### 4. Profile-scoped partition names

The Chromium session partitions are named per profile: `persist:tepegoz-profile-<id>` (browsing),
`persist:tepegoz-profile-<id>--app` (chrome), and Phase 5 tunnels compose on the bare base as
`persist:tepegoz-profile-<id>--conn-<connId>`. The unset scope (tests, an opted-out `--user-data-dir`
run) keeps the pre-multi-profile spelling `persist:tepegoz-web` / `persist:tepegoz-app`, byte-identical.

The scope lives in `@tepegoz/tab-engine/partition-scope.ts`, set once at boot by
`setProfilePartitionScope(CURRENT_PROFILE_ID)` in `index.ts` before any partition is materialised.
`DIRECT_PARTITION` / `APP_PARTITION` / `CHROME_WEB_PREFERENCES` were compile-time constants; they became
accessor functions (`directBrowsingPartition()` / `appPartition()` / `chromeWebPreferences()`) so the
scoped name resolves at call time.

**This is defense-in-depth, and an explicit owner decision.** Under process-per-profile the partition
directories are already isolated by `userData`, so profile-scoped *names* prevent no failure mode the
process boundary does not already prevent. The cost — threading the scope through `window.ts`, the tab
layer, the Phase 5 network layer (`browsing-sessions`, and by composition `binding-service` /
`connection-pool` / `tunnel-session`), the download service, the site-data IPC, and ~10 test mocks —
was accepted to make it impossible for a future refactor that got the process boundary wrong to also
merge two profiles' cookie jars.

### 5. First-run migration

`migrate-legacy-profile.ts` runs once (gated on `profiles.json` not existing), before `userData` is
pinned, on the shared root. It moves every flat file / directory a pre-multi-profile install wrote —
`tepegoz.db` **with its `-wal` / `-shm` sidecars** (omitting them drops everything written since the
last SQLite checkpoint after a crash), `Partitions/` (omitting it silently signs the user out),
`preferences.json`, `credentials.enc.json`, adblock, dictionaries, safe-browsing, models, `Extensions/`,
the VPN secrets and downloaded binaries, the download quarantine — into `Profiles/default/`,
existence-guarded per entry, same-volume rename with copy+delete fallback. It then **renames the
partition directories inside `Partitions/`** to the profile-scoped names (`tepegoz-web` →
`tepegoz-profile-default`, `tepegoz-app` → `tepegoz-profile-default--app`, `tepegoz-web--conn-*`
likewise) — without this the scoped names would point at directories that do not exist and every
existing user's cookies / logins would be orphaned. Any failure is logged and left in place; the stores
then treat `Profiles/default/` as freshly initialised, matching the tolerance they already have.

### 6. IPC + UI

`@tepegoz/desktop-ipc` gains six channels: `profiles:list` / `get-active` / `create` / `rename` /
`delete` / `switch`, all `safeParse`-validated at the boundary against `@tepegoz/profiles/schemas`.
`getActive` is **this process's own profile** — process-per-profile, no sender-window resolution.
`switch` (and `create`-then-switch) is a spawn via `profile-launcher.ts`. `delete` refuses the last
profile and the in-use one, wipes the profile's one directory (Partitions nested inside it), and drops
the registry row.

`@tepegoz/profiles-ui` is a presentational leaf — `ProfilesPage` (avatar colour + initial, inline
rename, delete behind a confirm step + last-profile guard, switch, add) with its own en/tr dictionary
(ADR-0016). It renders at `tepegoz://profiles` via the `protocol.handle` internal-pages plumbing
(`REAL_PAGE_HOSTS` + `REAL_PAGE_BASE_URLS` + the `main.tsx` host dispatch). `UserMenuPopup.tsx`'s
placeholder rows become working actions: add-and-switch, switch (focus an existing window or spawn),
manage, new window. Passwords / account / sync stay disabled (out of scope); Guest stays disabled
(phase-2c, unrelated).

## Consequences

- Every subsystem that read `app.getPath('userData')` is now per-profile with no code change — the pin
  at boot is the whole mechanism.
- A profile is one self-contained, copyable folder — full Chrome parity, and profile deletion is a
  single recursive directory remove.
- A profile switch cannot leak the previous profile's in-memory secrets into the new process, because
  it is a fresh process — a security argument *for* this design.
- `passwordVault` (`@tepegoz/password-vault`) was already a plain singleton instance opened over
  `getDb()`, which is now the profile's own DB — so it is per-profile for free, like the rest.
- The `--user-data-dir` opt-out path exists precisely so the eval harness and E2E specs do not write
  into a developer's real `profiles.json`; `TEPEGOZ_PROFILES_ROOT` covers the case where the real
  profile system itself must be exercised in isolation.
- **Rejected:** the single-process routing facade (shipped on the branch, failed in use — see Context);
  keeping the partition names profile-agnostic (objectively sufficient under process-per-profile, but
  the owner chose the scoped names for defense-in-depth — see §4).

## Explicit non-goals

- **Cloud sync** of any profile data (a later phase).
- The **MV3 `ExtensionHost` execution engine** itself (still unbuilt) — this ADR only guarantees that
  whenever it lands, each profile already has its own isolated `Extensions/` install directory. The
  bundled built-in extension *catalog* (`resources/extensions.catalog.json`) stays a single read-only
  app resource; only installed / enabled state is per-profile.
- **Guest / private-ephemeral mode** (phase-2c) — unrelated and unbuilt; its menu placeholder stays
  disabled.
- **Per-site** `webPreferences` / partition overrides — profile-wide only.
