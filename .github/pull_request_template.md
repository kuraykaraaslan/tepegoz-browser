<!-- Title: <type>(<scope>): <summary> — branch <type>/<short-scope> -->

## What & why

<!-- One or two sentences: the problem/need, and what this PR changes. Link the phase task / ADR. -->

## Self-review checklist (binding gates — phases/README.md §cross-cutting)

- [ ] **Happy + sad paths** exercised (error mapping via `AppError` → boundary `{message, statusCode}`)
- [ ] **Zod `safeParse` at every new trust boundary** (IPC both directions, LLM tool args, adapters, journal, policy)
- [ ] **Security:** renderer stays untrusted; no secrets outside main/`safeStorage`; logs redacted
- [ ] **i18n day-0:** all new user-facing strings in the owning package's dict (`en` + `tr` parity, same PR); leaf packages string-free
- [ ] **Strict TS:** no `@ts-ignore`; `any` only in `catch`; files ≤ 250 lines
- [ ] **Reuse:** no inline duplicates of `@tepegoz/shared-types` / contract shapes (derive via `Pick`/`Omit`/`z.infer`)
- [ ] **Tests:** new/changed logic covered; `pnpm exec turbo run typecheck lint test build` green locally
- [ ] **No AI attribution trailers** in commits (CI `commit-policy` enforces)

## How verified

<!-- Commands run, manual steps (e.g. pnpm dev scenario), e2e results. -->

## Known limitations / follow-ups

<!-- Anything deferred, with where it's tracked. -->
