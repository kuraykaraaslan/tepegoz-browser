# @tepegoz/agent-runtime CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support multi-step agent runs with explicit planning, execution, and reaction phases.
- [ ] Support live progress events for each meaningful planning and execution transition.
- [ ] Support cooperative cancellation before, during, and after tool execution.
- [ ] Support human review of generated plans before any gated work begins.
- [ ] Support skipping individual plan steps during human plan review.
- [ ] Support per-tool human approval prompts with clear action summaries.
- [ ] Support localized human handoff copy for CAPTCHA, 2FA, and sensitive flows.
- [ ] Support injection of browser host capabilities without Electron-specific dependencies.
- [ ] Support injection of journal readers for audit-aware agent context.
- [ ] Support active-tab URL context for site-aware policy decisions.
- [ ] Support provider selection through a model router instead of direct provider calls.
- [ ] Support safe provider-key access where raw keys stay inside the host process.
- [ ] Support local-model routing as an optional transport path.
- [ ] Support cloud fallback when local inference is unavailable.
- [ ] Support deterministic run summaries for conversation memory.
- [ ] Support structured stop reasons for success, denial, cancellation, and failure.
- [ ] Support surfacing tool errors without leaking host internals.
- [ ] Support run hooks for observability, UI updates, and audit correlation.
- [ ] Support dependency injection for every OS, browser, and persistence concern.
- [ ] Support reentrant runs without shared mutable state between turns.
- [ ] Support bounded run loops to avoid runaway agent execution.
- [ ] Support policy-aware execution through a single tool gateway.
- [ ] Support planner DAG metadata that can be rendered in an agent console.
- [ ] Support resumable user handoff after the user completes a blocked browser step.
- [ ] Support safe handling of untrusted page content in prompts and summaries.
- [ ] Support structured telemetry for model usage, tool calls, and approval latency.
- [ ] Support host-provided localization for all user-visible runtime decisions.
- [ ] Support test doubles for model router, planner, executor, and browser host.
- [ ] Support graceful degradation when optional host dependencies are absent.
- [ ] Support clear extension points for new run phases, routing modes, and event types.
