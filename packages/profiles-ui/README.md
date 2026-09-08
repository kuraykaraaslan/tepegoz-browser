# @tepegoz/profiles-ui

Presentational manager page for Chrome-style multi-profile identities — `tepegoz://profiles` (ADR-0045,
`docs/tracks/multi-profile-isolation.md`). Rename, delete (with a last-profile guard and a confirm
step), switch, and add. All I/O is injected via `ProfilesPageProps`; the desktop host
(`ProfilesPageSurface.tsx`) wires them to `window.tepegoz`'s profile bridge.

## Exports

- **`.`** — `ProfilesPage`, `ProfilesPageProps`.
- **`./i18n`** — `profilesDict` (`defineDict`, English + Turkish), `ProfilesStrings`.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
