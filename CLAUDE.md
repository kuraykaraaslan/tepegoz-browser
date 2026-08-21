# CLAUDE.md — working agreement for this repo

Guidance for Claude Code (and humans) working on **tepegoz-browser**.

## What this is

An agentic, security-by-design, local-first browser (Electron + TypeScript). Architecture and the
task-by-task roadmap live in **[`phases/`](phases/)** and **[`docs/adr/`](docs/adr/)**. The full plan
is `docs/ARCHITECTURE.md` — a thin index of the L0–L10 layer model pointing at the document that owns
each piece. Read `phases/README.md` first.

## Binding design rules

This project **must** comply with `//wsl.localhost/Ubuntu/home/kuray/internal-ai-rules`. Cross-cutting
gates are summarized in `phases/README.md`; ADR-0010 records deviations.

## Session close-out (standing rule)

**Every working session that touches a phase MUST end with the Phase Status Report** — what closed, and
how much is left. Format and the rules that keep it honest: [`phases/README.md`](phases/README.md#session-close-out--the-phase-status-report-standing-rule).

The short version: landed code is **not** a closed phase (✅ needs DoD passed _and_ the delta in the
results ledger); "how many left" counts against ✅, never against "started"; a session that closed
nothing prints **"hiçbiri"**; and blockers are named by **kind** (API spend ≠ downloaded weights ≠ rival
subscriptions).

> This lives in `CLAUDE.md` rather than only in agent memory on purpose: memory is keyed per machine and
> per absolute path, so the same repo opened from WSL, another checkout, or another machine is a
> different key and would silently lose the rule. `CLAUDE.md` travels with the code, so the rule applies
> from Windows, WSL, and CI alike.

## Git (non-negotiable)

- **Branch-based:** `<type>/<short-scope>` → self-review PR → `main`. Only trivial+reversible changes
  go straight to `main`.
- **origin is SSH** (`git@github.com:...`), never HTTPS.
- **No AI attribution trailers** in commit messages or PR bodies (`Co-Authored-By: Claude`,
  `Generated with Claude Code` are forbidden — enforced by the CI `commit-policy` job).

## Engineering conventions

- Strict TypeScript (no `@ts-ignore`); **zod `safeParse` at every trust boundary** (IPC, LLM tool-call
  args, MCP, adapters, journal, policy). `@tepegoz/shared-types` is the only schema source.
- `AppError(message, statusCode)` — services throw, the boundary maps (ADR-0009).
- Secrets only in the main process via `safeStorage`; never in env/bundle/logs (redaction).
- Every user-facing string is localized (English-first; Turkish first-class) — no hardcoded UI strings.
  Each package/extension **owns its dictionary** (`src/i18n/`, `defineDict` + `useT`); only the shared core
  (`common`/`window`/`errors`) lives in `@tepegoz/i18n` (ADR-0016).
- Renderer is untrusted; one secure `createWindow()` factory; typed `contextBridge` only.

## Commands

```sh
pnpm install                       # frozen in CI
pnpm dev                           # launch the Electron GUI (clears ELECTRON_RUN_AS_NODE)
pnpm exec turbo run typecheck lint test build
pnpm e2e                           # Playwright _electron smoke
```

> **No native database.** The DB is Node's built-in `node:sqlite` (`packages/persistence/src/db.ts`
> presents the small better-sqlite3-shaped surface the stores speak). Nothing to rebuild, no ABI to
> match, no compiler required — `pnpm test` and `pnpm e2e` run the same SQLite the app ships.
>
> This replaced `better-sqlite3`, which publishes **no Electron prebuilds at any version**, so its
> Electron-ABI build always compiled from source. That one fact had grown a `rebuild` script, a
> `test:electron` runner, `electron-rebuild` steps in three workflows, and a skip-guard that let 63
> tests sit out any run on a machine configured for the other ABI. All of it is gone.
>
> Caveat worth knowing: `node:sqlite` is still marked experimental upstream, which is why the Node floor
> is **>= 24** (what Electron 43 embeds — the app and the tests run the same runtime). If it ever needs
> reversing, `db.ts` is the only file that talks to it.
>
> `node-llama-cpp` is still native, but its prebuilds are N-API and therefore ABI-independent;
> `npmRebuild` stays on in electron-builder for it.

## Layout

`apps/desktop` (L0 Electron) · `packages/{shared-types,libs,i18n,persistence}` · `packages/native-rs`
(Rust placeholder) · `docs/` (ADRs, threat model) · `phases/` (roadmap — `product/` · `ai-agent-super/`
· `tracks/`) · `e2e/` (Playwright).
