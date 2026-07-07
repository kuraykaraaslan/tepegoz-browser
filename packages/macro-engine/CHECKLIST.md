# @tepegoz/macro-engine CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support deterministic macro execution without model calls.
- [ ] Support navigation steps through an injected host.
- [ ] Support click steps with selector-chain targeting.
- [ ] Support fill steps for editable elements.
- [ ] Support key press steps.
- [ ] Support scroll steps.
- [ ] Support extract steps that store values in variables.
- [ ] Support wait-for-element and wait-for-load steps.
- [ ] Support page text condition checks.
- [ ] Support element existence and visibility checks.
- [ ] Support if control flow with nested steps.
- [ ] Support repeat control flow with nested steps.
- [ ] Support CSV-driven row iteration.
- [ ] Support restartable CSV progress metadata.
- [ ] Support unlimited scalar variables.
- [ ] Support array variables.
- [ ] Support sandboxed expressions with no arbitrary JavaScript.
- [ ] Support predicate evaluation against scoped variables.
- [ ] Support automatic waiting inside host element operations.
- [ ] Support configurable wait timeouts.
- [ ] Support configurable pacing between operations.
- [ ] Support runaway-loop guards by maximum step count.
- [ ] Support cancellation signals.
- [ ] Support progress events for start, step, success, and failure.
- [ ] Support located macro errors with nested step paths.
- [ ] Support user-aborted run results.
- [ ] Support optional element highlighting for record and replay UX.
- [ ] Support final variable snapshots in run results.
- [ ] Support pure tests for expression and variable behavior.
- [ ] Support future recorder-generated macro shapes from shared types.
