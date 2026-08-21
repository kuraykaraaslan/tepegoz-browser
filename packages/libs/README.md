# @tepegoz/libs

Shared infrastructure used across layers (framework-agnostic; no Electron imports).

## Exports

- **`AppError(message, statusCode)`** + `toBoundary(err)` — services throw, the boundary maps to
  `{ message, statusCode }` (HTTP-semantic status codes; see ADR-0009).
- **`env`** — centralized config parsed once via zod at import (startup-crash on invalid). BYO API
  keys are **not** env vars (they live in the OS keychain).
- **`Logger`** — static logger with **secret/PII redaction** (`Logger.redact`); the Event Journal and
  Agent Console reuse the same redaction.
- **`Messages`** — constant operator/log messages (no inline throw strings).

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
