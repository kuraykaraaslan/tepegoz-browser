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
pnpm test:electron                 # native-dependent (better-sqlite3) tests under Electron's Node
```

> **`better-sqlite3` ABI note.** One `.node` file matches one ABI. A fresh `pnpm install` fetches the
> **Node** prebuild (ABI 127 for Node 22) — so CI and `pnpm test` pass. Running the GUI needs the
> **Electron** ABI (`pnpm --filter @tepegoz/desktop rebuild`); after that, `pnpm test` can't load the
> addon under Node. Don't flip the binary back and forth — run the persistence tests with
> **`pnpm test:electron`** (Electron-as-Node, same 130 binary as the app). CI is unaffected.

## Layout

`apps/desktop` (L0 Electron) · `packages/{shared-types,libs,i18n,persistence}` · `packages/native-rs`
(Rust placeholder) · `docs/` (ADRs, threat model) · `phases/` (roadmap — `product/` · `ai-agent-super/`
· `tracks/`) · `e2e/` (Playwright).
