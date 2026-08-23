# @tepegoz/agent-runtime CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support multi-step agent runs with explicit planning, execution, and reaction phases.
- [x] Support live progress events for each meaningful planning and execution transition.
- [ ] Support cooperative cancellation before, during, and after tool execution.
- [x] Support human review of generated plans before any gated work begins.
- [x] Support skipping individual plan steps during human plan review.
- [x] Support per-tool human approval prompts with clear action summaries.
- [x] Support localized human handoff copy for CAPTCHA, 2FA, and sensitive flows.
- [ ] Support automatic CAPTCHA/2FA clearing with handoff as the fallback (ADR-0039).
- [x] Support injection of browser host capabilities without Electron-specific dependencies.
- [x] Support injection of journal readers for audit-aware agent context.
- [x] Support active-tab URL context for site-aware policy decisions.
- [x] Support provider selection through a model router instead of direct provider calls.
- [x] Support safe provider-key access where raw keys stay inside the host process.
- [x] Support local-model routing as an optional transport path.
- [x] Support cloud fallback when local inference is unavailable.
- [x] Support deterministic run summaries for conversation memory.
- [x] Support structured stop reasons for success, denial, cancellation, and failure.
- [x] Support surfacing tool errors without leaking host internals.
- [x] Support run hooks for observability, UI updates, and audit correlation.
- [ ] Support dependency injection for every OS, browser, and persistence concern.
- [ ] Support reentrant runs without shared mutable state between turns.
- [x] Support bounded run loops to avoid runaway agent execution.
- [x] Support policy-aware execution through a single tool gateway.
- [ ] Support planner DAG metadata that can be rendered in an agent console.
- [x] Support resumable user handoff after the user completes a blocked browser step.
- [x] Support safe handling of untrusted page content in prompts and summaries.
- [ ] Support structured telemetry for model usage, tool calls, and approval latency.
- [ ] Support host-provided localization for all user-visible runtime decisions.
- [ ] Support test doubles for model router, planner, executor, and browser host.
- [x] Support graceful degradation when optional host dependencies are absent.
- [ ] Support clear extension points for new run phases, routing modes, and event types.
