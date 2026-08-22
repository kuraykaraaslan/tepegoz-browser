# Where your data lives, what you can take with you, and what a backup misses

A local-first browser makes a specific promise: the data is on your machine and it is yours. That
promise is only real if you can answer three questions without reading the source — where is it, how do
I get a copy out, and what would I lose if this machine died. This page answers them, including the
parts that are currently gaps.

Everything below lives under the app's **user-data directory**:

| OS      | Path                                    |
| ------- | --------------------------------------- |
| Windows | `%APPDATA%\tepegoz`                     |
| macOS   | `~/Library/Application Support/tepegoz` |
| Linux   | `~/.config/tepegoz`                     |

## What is stored, and where

| What                                                                                                                                                          | Where                                                | Encrypted?                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------- |
| History, bookmarks, downloads list, macros, tasks, agent conversations, agent memory & skills, remembered grants, trust profiles, token ledger, event journal | `tepegoz.db` (SQLite)                                | No — except stored logins   |
| Stored website logins                                                                                                                                         | `tepegoz.db` → `login_credentials`                   | **Yes** — OS keychain       |
| AI provider API keys                                                                                                                                          | `credentials.enc.json`                               | **Yes** — OS keychain       |
| Preferences (theme, language, network bindings, extension toggles)                                                                                            | `preferences.json`                                   | No                          |
| Quarantined downloads awaiting release                                                                                                                        | `Downloads/quarantine/`                              | No                          |
| Downloaded on-device models                                                                                                                                   | `models/`                                            | No                          |
| Spelling dictionaries, ad-block lists, translation memory                                                                                                     | `dictionaries/`, `adblock/`, `translate-memory.json` | No                          |
| Installed third-party extensions                                                                                                                              | `Extensions/`                                        | No                          |
| VPN/Tor profiles and helper binaries                                                                                                                          | `vpn/`, `bin/`                                       | WireGuard keys: OS keychain |

## What you can export today

| Data              | How                                    | Format                                                          |
| ----------------- | -------------------------------------- | --------------------------------------------------------------- |
| Bookmarks         | `tepegoz://bookmarks` → **Export**     | Netscape bookmarks HTML — every other browser imports it        |
| Stored logins     | Settings → Passwords → Export          | Google-compatible CSV                                           |
| One agent chat    | Agent panel → export conversation      | Plain text                                                      |
| One agent session | Agent panel header → diagnostic bundle | Folder: transcript, per-tab DOM + screenshots, redacted journal |

Both bookmark and login exports use the format the other browsers read, on purpose. A JSON dump only
this application can restore is a backup shaped like lock-in.

## What you cannot export yet

Browsing history, the downloads list, macros, scheduled tasks, agent memory and skills, trust profiles,
and preferences have **no export path**. They are readable — `tepegoz.db` is an ordinary SQLite file and
nothing stops you opening it — but there is no supported way to move them to another installation. This
is a real gap, not an oversight being hidden: see the tracked item in
[`known-issues.md`](known-issues.md).

## Backing the whole profile up

Copying the user-data directory while the app is **closed** captures everything in the table above. Two
things about restoring it are worth knowing before you rely on it:

- **Encrypted data does not travel.** Stored logins and API keys are sealed with the OS keychain
  (`safeStorage`), which is bound to that user account on that machine. Restore the folder somewhere
  else and everything else comes back while those decrypt to nothing. That is the protection working —
  a stolen copy of the profile is not a stolen password list — but it means a machine-to-machine move
  needs the CSV export, not a file copy.
- **Copy it closed, not open.** SQLite in WAL mode keeps recent writes in a side file; copying the
  `.db` alone from a running app can miss them. Quit first, or copy `tepegoz.db*` (all of them).

Uninstalling does not remove the user-data directory. Delete it by hand if you want the data gone —
and note that this is the only way to remove it, since nothing here is stored in the cloud.

## Not stored anywhere

There is no server. No account, no sync, no telemetry endpoint receiving your browsing. Cloud sync is a
[Phase 3](../phases/product/phase-3-backend-cloud-extensions.md) design, which is why the tables that
hold user data already carry sync metadata (`updated_at`, `version`, `tombstone`, a device id) — so
turning it on later is a feature, not a migration.
