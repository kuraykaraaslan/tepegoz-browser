# ADR-0002: pnpm workspaces + Turborepo monorepo

- **Status:** Accepted
- **Date:** 2026-06-30

## Context
The product is naturally layered (L0–L10) with shared contracts. We want enforceable module
boundaries, incremental builds, and a single dependency graph.

## Decision
Use **pnpm workspaces** (`apps/*`, `packages/*`) + **Turborepo** for task orchestration/caching.
Layer boundaries enforced at build time via **dependency-cruiser**. `node-linker=hoisted` to ease
Electron + native modules.

## Consequences
- `turbo run typecheck/lint/test/build` across all packages; cached, incremental.
- **Deviation:** `turbo` is pinned to **2.5.5** — 2.10.1 crashes on the dev machine with
  `STATUS_DLL_NOT_FOUND` (0xC0000135). Revisit when a working newer release is confirmed.
- Workspace packages expose TS source via `exports`; they are **bundled** into the Electron
  main/preload (not externalized), since Node cannot load their `./src/*.ts` at runtime.
