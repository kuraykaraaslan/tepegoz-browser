# @tepegoz/macro-engine

A deterministic, **model-free macro interpreter** — the modern iMacros successor. Supports control
flow (`if`/`repeat`, nested), unlimited variables/arrays, CSV-driven `forEachRow` with restart, and a
safe sandboxed expression language that replaces iMacros' `EVAL` (no arbitrary JS execution). Every
element-targeting step **auto-waits** inside the injected host (poll until resolve or timeout) instead
of sleeping a fixed interval — the core fix for iMacros' classic "wait and hope" failure mode. Failures
surface as located `MacroError`s (which step, which path in the nested structure). Electron-free:
browser operations are injected via a `MacroHost`, implemented by the app over the CDP selector engine
in `main/macro/macro-host.electron.ts`.

## Exports
- **`runMacro`** — executes a `Macro` (from `@tepegoz/shared-types`) against a `MacroHost`; `RunOptions`
  in (initial variables, cancellation signal, `onProgress`, wait/step-count/pacing overrides), `RunResult`
  out (`ok`/`aborted`/`stepsRun`/final `variables`). Enforces a runaway-loop guard (`maxSteps`, default
  100,000 total leaf steps) and a minimum post-operation pacing floor.
- **`RunProgress`** — the `onProgress` event union (`started`/`step`/`done`/`failed`), the last carrying
  the failing step's path and kind.
- **`MacroHost`** — the injected browser-op contract: `navigate`/`click`/`fill`/`press`/`scroll`/
  `extract`/`waitFor`/`waitForLoad`/`elementExists`/`elementVisible`/`pageContainsText`/`readCsv`/
  `sleep`, plus an optional `highlight` for record/replay UX. Every element call takes a `SelectorChain`
  and auto-waits inside the host.
- **`VariableStore`** — the interpreter's variable/array binding store.
- **`evalExpr`** / **`Scope`** — the sandboxed expression evaluator (replaces iMacros `EVAL`).
- **`evalPredicate`** — evaluates an `if`/loop-condition predicate against the current scope.
- **`MacroError`** / **`MacroAborted`** — located run-failure and user-cancellation error types.
- **`MacroValue`**, **`toStr`**, **`toNum`**, **`toBool`** — the macro value type and its coercions.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
