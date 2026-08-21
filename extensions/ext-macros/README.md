# @tepegoz/ext-macros

A modern, deterministic iMacros successor: record, edit, and replay browser automations. Ships two
surfaces — a resizable sidebar ("Macro Studio", for recording/editing/running a macro beside the
visible page) and an internal `tepegoz://com.tepegoz.macros` page ("My Macros", the flat manager for
saved macros). Both surfaces share one stateful core (`MacrosCore`) driven entirely through the
injected `MacrosHostApi` — no `window.tepegoz` coupling. The app wires this to the main-process CDP
selector engine, the recorder, and a `MacroStore` (migration v5). The agent can also list, save, run,
and delete macros directly through its own capability contract (`MacrosCapabilityHost`), independent of
the UI streaming path.

## Exports

- **`macrosManifest`** — the extension manifest (`com.tepegoz.macros`, sidebar + page surfaces, `tabs`/`read-page`/`navigate` permissions).
- **`MacrosPanel`** — sidebar surface ("Macro Studio": record, edit, run).
- **`MacrosPage`** — page surface at `tepegoz://com.tepegoz.macros` ("My Macros" manager).
- **`macrosCapabilities`** — builds the agent-callable `ExtensionCapabilitySet<MacrosCapabilityHost>` (ADR-0021).
- **`MacrosHostApi`** (type) — the UI-facing host contract (list/get/save/delete, run/run-draft with progress streaming, recording start/stop).
- **`MacrosCapabilityHost`** (type) — the agent-facing host contract (synchronous list/get/save/delete, run-to-completion).
- **`MacroRunOutcome`** (type) — the terminal result of an agent-driven run (`runId`, `ok`, `aborted`, `stepsRun`, optional `{ where, message }` error).

## i18n

Own `src/i18n/{en,tr}.ts` dictionary (English + Turkish, parity-tested); consumed via `useT` from `@tepegoz/i18n/react`.

## Capabilities

- `macros_list_items` — list saved macros (`{ id, name, stepCount, updatedAt }[]`). Read.
- `macros_get_item` — get one macro's full deterministic IR (steps/variables). Read.
- `macros_create_item` — save (upsert) a macro from a full IR object. State-changing, requires an idempotency key.
- `macros_delete_item` — delete a saved macro. Destructive.
- `macros_create_run` — run a saved macro to completion, optionally binding initial variables. State-changing, requires an idempotency key.
- `macros_get_run` — get the recorded outcome of a finished run. Read.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
