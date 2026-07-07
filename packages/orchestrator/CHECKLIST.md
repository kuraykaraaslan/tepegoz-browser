# @tepegoz/orchestrator CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support planning a user prompt into a step graph.
- [ ] Support DAG metadata for dependencies between plan steps.
- [ ] Support executor traversal of planned steps.
- [ ] Support tool execution only through the ToolGateway.
- [ ] Support step outcomes for success, denial, failure, and cancellation.
- [ ] Support reactor decisions after each step outcome.
- [ ] Support continue decisions when execution can proceed.
- [ ] Support retry decisions for recoverable tool failures.
- [ ] Support replan decisions when the plan no longer fits page state.
- [ ] Support stop decisions with structured reasons.
- [ ] Support model routing through the model gateway.
- [ ] Support planner prompts with available capability descriptors.
- [ ] Support bounded retries per step.
- [ ] Support bounded replans per run.
- [ ] Support cancellation signals during execution.
- [ ] Support progress callbacks for planning and execution events.
- [ ] Support tool result summaries suitable for model context.
- [ ] Support redaction of untrusted page data before model use.
- [ ] Support deterministic parsing of reactor decisions.
- [ ] Support validation of planner output before execution.
- [ ] Support unavailable-tool handling in executor outcomes.
- [ ] Support policy-denied tool outcomes without crashing the run.
- [ ] Support step-level timing and latency metadata.
- [ ] Support plan-level run summaries.
- [ ] Support test providers for planner and reactor model calls.
- [ ] Support golden replay fixtures for agent evaluation.
- [ ] Support host-provided run options such as limits and hooks.
- [ ] Support future parallel step execution where dependencies allow it.
- [ ] Support domain-neutral operation without Electron imports.
- [ ] Support documentation for adding new stop reasons and decisions.
