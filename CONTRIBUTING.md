# Contributing to Tepegöz

Thanks for looking. This document tells you how to build the project, what CI will hold you to, and
which conventions are non-negotiable — so a first pull request does not fail on something that was only
ever written down in a maintainer's head.

Tepegöz is a **security-sensitive** application: it renders untrusted web content and lets a model act
on pages the user is logged into. Several conventions below exist for that reason and are enforced by
CI rather than by review taste. The full set is [`docs/engineering-rules.md`](docs/engineering-rules.md).

> **Found a security vulnerability?** Do not open an issue or a PR. Follow
> [`SECURITY.md`](SECURITY.md).

## Project status, and what help is actually useful

This is a **pre-release, single-maintainer** project. Nothing is stable, several subsystems are landed
but unmeasured, and the roadmap in [`phases/`](phases/) moves. Consequences worth knowing before you
invest time:

- **Small, focused PRs get merged. Large speculative ones usually do not.** If a change is more than a
  few hundred lines or touches the security kernel, the model gateway, or the IPC contract, **open an
  issue first** and agree on the approach.
- **The most useful contributions right now** are bug reports with reproductions, security findings,
  fixes for anything in [`docs/known-issues.md`](docs/known-issues.md), Turkish/English localization
  corrections, and platform reports from macOS and Linux (Windows 11 is the primary target and gets the
  most testing).
- **Feature work that is already on the roadmap** may be in progress unseen. Ask before building it.

## Setup

**Requirements:** Node **>= 24** (the version Electron 43 embeds — the app and the tests run the same
runtime), and pnpm **>= 10**. No compiler, no native database build: the database is Node's built-in
`node:sqlite`, so there is nothing to rebuild and no ABI to match.

```sh
pnpm install --frozen-lockfile

# The full local gate — run this before every push
pnpm exec turbo run typecheck lint test build

# Launch the app
pnpm dev
```

Other commands you will need:

```sh
pnpm format            # prettier --write . (CI checks this)
pnpm depcruise         # module-boundary and import-cycle rules
pnpm coverage          # coverage gate (scope + thresholds in vitest.coverage.config.ts)
pnpm run docs:links phases docs research   # 0 broken relative links
pnpm audit --audit-level=high     # high/critical advisories fail CI
pnpm e2e               # Playwright `_electron` smoke against the BUILT app
```

> If `pnpm dev` starts a headless process instead of a window, some shell exported
> `ELECTRON_RUN_AS_NODE=1`. `pnpm dev` clears it; a raw `electron` invocation will not.

Running the agent for real needs **your own AI provider key** (Anthropic, OpenAI, Gemini, or Kimi),
entered in Settings. Keys are stored encrypted in the OS keychain via Electron's `safeStorage`, only in
the main process. Never put a key in `.env`, a fixture, or a test.

## Workflow

1. **Branch** off `main` as `<type>/<short-scope>` — e.g. `fix/omnibox-paste`, `feat/tab-groups`,
   `docs/security-policy`. Only trivial and reversible changes go straight to `main`.
2. **Commit** as `<type>(<scope>): <summary>`, imperative mood, explaining the _why_ in the body when
   the change is not self-evident.
3. **Open a PR** and fill in [the template](.github/pull_request_template.md). Its checklist is the
   binding gate list, not a formality.

### Commit messages: no AI attribution trailers

`Co-Authored-By: Claude`, `Generated with Claude Code`, and similar trailers are **forbidden** and the
CI `commit-policy` job fails the build on them. Use whatever tools you like — the commit log records
who is accountable for the change, which is you.

## Conventions CI enforces

These are checked mechanically. A PR that violates one goes red before a human reads it.

- **Strict TypeScript.** No `@ts-ignore`, no `@ts-expect-error`; `any` only in a `catch`. The
  repository currently has **zero** of each — please keep it that way. Files stay **≤ 250 lines**.
- **Zod `safeParse` at every trust boundary** — IPC in both directions, LLM tool-call arguments, MCP
  payloads, adapters, the journal, policy input. A boundary that trusts its input is a defect even when
  it works.
- **`@tepegoz/shared-types` is the only schema source.** Derive DTOs with `Pick`/`Omit`/`z.infer`;
  never re-declare a contract shape inline.
- **`AppError(message, statusCode)`** — services throw, the boundary maps
  ([ADR-0009](docs/adr/0009-boundary-mapping.md)). Messages come from a `messages.ts`, never inline.
- **Secrets live only in the main process**, via `safeStorage`. Never in env, bundle, or logs; logging
  is redacted.
- **Every user-facing string is localized**, English-first with Turkish at full parity **in the same
  PR**. Each package owns its dictionary (`src/i18n/`, `defineDict` + `useT`); only the shared core
  lives in `@tepegoz/i18n` ([ADR-0016](docs/adr/0016-per-package-i18n.md)). A lint rule catches
  hardcoded strings in `.tsx`.
- **Module boundaries.** `dependency-cruiser` enforces the layer graph and forbids import cycles; a new
  package needs a rule in [`dependency-cruiser.cjs`](dependency-cruiser.cjs).
- **Renderer is untrusted.** One secure `createWindow()` factory, `contextIsolation` on, typed
  `contextBridge` only. Decisions about autonomy and permissions are enforced in **main** — the
  renderer displays and relays, it never decides.
- **Coverage thresholds** per scope, and **no new broken doc links**.

## Tests

Vitest for unit and integration, Playwright `_electron` for end-to-end against the built app. New or
changed logic needs a test, and the useful ones exercise the **sad path**: what the code does with a
malformed payload, a hostile page, a denied permission, a dropped connection.

`describe.skip` / `it.todo` are not accepted in merged code — the repository has **zero** skipped tests,
and a skipped test is worse than a missing one because it reads as coverage. If a test cannot run, say
so in the PR instead.

Hostile page fixtures live in [`test-fixtures/sites/`](test-fixtures/sites/) and are deliberately
excluded from formatting — `innerText` is what the scenarios assert on, so reflowing them rewrites the
exam.

## Architecture, and where to read first

- [`phases/README.md`](phases/README.md) — the roadmap index and the cross-cutting gates. **Start here.**
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the L0–L10 layer model, an index pointing at the
  document that owns each piece.
- [`docs/adr/`](docs/adr/) — the decision record. A change that contradicts an accepted ADR needs a new
  ADR, not a quiet edit.
- [`docs/package-map.md`](docs/package-map.md) — the realized module map.
- [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md) — what is trusted, what is not, and why.

**New work targets a package, not `apps/desktop` growth.** The desktop app is a thin Electron shell over
the `@tepegoz/*` packages.

## Licensing of contributions

Tepegöz is licensed under the **GNU Affero General Public License v3.0** ([`LICENSE`](LICENSE)).
Contributions are **inbound = outbound**: by opening a pull request you agree that your contribution is
licensed under AGPL-3.0 on the same terms, and that you have the right to license it. There is no CLA
and no copyright assignment.

**Dependencies and vendored code.** Anything you add must be one-way compatible into AGPL-3.0 — MIT,
BSD, Apache-2.0, ISC, MPL-2.0, and GPL/AGPL-family are fine. A source-available license with
field-of-use restrictions, or a copyleft license outside that family, is not. If you copy or adapt code
from elsewhere — even a snippet, even your own code under another license — say so in the PR and add an
entry to [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) with the upstream license and what you
changed. Getting attribution right matters more here than getting the feature in fast.

## Code of Conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) (Contributor Covenant 2.1).
