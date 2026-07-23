# @tepegoz/macro-engine CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support deterministic macro execution without model calls.
- [x] Support navigation steps through an injected host.
- [x] Support click steps with selector-chain targeting.
- [x] Support fill steps for editable elements.
- [x] Support key press steps.
- [x] Support scroll steps.
- [x] Support extract steps that store values in variables.
- [x] Support wait-for-element and wait-for-load steps.
- [x] Support page text condition checks.
- [ ] Support element existence and visibility checks.
- [x] Support if control flow with nested steps.
- [x] Support repeat control flow with nested steps.
- [x] Support CSV-driven row iteration.
- [ ] Support restartable CSV progress metadata.
- [x] Support unlimited scalar variables.
- [x] Support array variables.
- [x] Support sandboxed expressions with no arbitrary JavaScript.
- [x] Support predicate evaluation against scoped variables.
- [x] Support automatic waiting inside host element operations.
- [x] Support configurable wait timeouts.
- [x] Support configurable pacing between operations.
- [x] Support runaway-loop guards by maximum step count.
- [x] Support cancellation signals.
- [x] Support progress events for start, step, success, and failure.
- [x] Support located macro errors with nested step paths.
- [x] Support user-aborted run results.
- [x] Support optional element highlighting for record and replay UX.
- [x] Support final variable snapshots in run results.
- [x] Support pure tests for expression and variable behavior.
- [x] Support future recorder-generated macro shapes from shared types.
