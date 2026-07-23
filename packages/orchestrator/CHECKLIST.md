# @tepegoz/orchestrator CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support planning a user prompt into a step graph.
- [x] Support DAG metadata for dependencies between plan steps.
- [x] Support executor traversal of planned steps.
- [x] Support tool execution only through the ToolGateway.
- [x] Support step outcomes for success, denial, failure, and cancellation.
- [x] Support reactor decisions after each step outcome.
- [x] Support continue decisions when execution can proceed.
- [x] Support retry decisions for recoverable tool failures.
- [ ] Support replan decisions when the plan no longer fits page state.
- [x] Support stop decisions with structured reasons.
- [x] Support model routing through the model gateway.
- [x] Support planner prompts with available capability descriptors.
- [x] Support bounded retries per step.
- [ ] Support bounded replans per run.
- [x] Support cancellation signals during execution.
- [x] Support progress callbacks for planning and execution events.
- [x] Support tool result summaries suitable for model context.
- [x] Support redaction of untrusted page data before model use.
- [x] Support deterministic parsing of reactor decisions.
- [x] Support validation of planner output before execution.
- [x] Support unavailable-tool handling in executor outcomes.
- [x] Support policy-denied tool outcomes without crashing the run.
- [ ] Support step-level timing and latency metadata.
- [x] Support plan-level run summaries.
- [x] Support test providers for planner and reactor model calls.
- [x] Support golden replay fixtures for agent evaluation.
- [x] Support host-provided run options such as limits and hooks.
- [ ] Support future parallel step execution where dependencies allow it.
- [x] Support domain-neutral operation without Electron imports.
- [ ] Support documentation for adding new stop reasons and decisions.
