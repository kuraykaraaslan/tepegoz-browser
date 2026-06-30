# ADR-0010: TypeScript / tooling conventions & deviations

- **Status:** Accepted
- **Date:** 2026-06-30

## Context
The internal code-structure rules target a TS server stack. Some specifics don't fit a 2026
Electron + bundler setup and are adapted here (in spirit, not letter).

## Decision
- **Strict TS everywhere:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; no
  `@ts-ignore`; `any` only in `catch`. Root base `tsconfig` extended by every package.
- **Zod at every trust boundary** with `safeParse` (IPC, LLM tool-call args, MCP, adapters, Journal,
  Policy inputs). `shared-types` is the single schema source; consumers use `z.infer`.
- **Static service classes** (no DI/`new`); `z.enum` for runtime enums; provider pattern for
  pluggable backends; modules/ + libs/ layout; 250-line file cap → facade composition.

### Deviations from the literal rules (with rationale)
- **Dropped `ignoreDeprecations:"6.0"`** — invalid on TS 5.7 and unnecessary with `moduleResolution:
  bundler` (the rule assumed `node` resolution + baseUrl, which we don't use).
- **ESLint flat config** (`eslint.config.mjs`, ESLint 9 + typescript-eslint v8 type-checked) instead
  of the rule's `.eslintrc.cjs` (deprecated in ESLint 9).
- **No AI attribution trailers** in commits/PRs (enforced by a CI commit-policy job) — overrides the
  default harness behavior, per the internal rule.
- **i18n is English-first (source)**, Turkish first-class — every user-facing string via the catalog,
  no hardcoded UI strings.

## Consequences
- Tooling matches current (Jan 2026) ecosystem; deviations are explicit and reversible.
