# @tepegoz/tasks CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support saved agent task definitions.
- [ ] Support task names and descriptions.
- [ ] Support trigger definitions for scheduled or event-based runs.
- [ ] Support manual task execution metadata.
- [ ] Support redacted task run records.
- [ ] Support redacted task artifact records.
- [ ] Support reducer state for task lists.
- [ ] Support selectors for active, recent, failed, and scheduled tasks.
- [ ] Support main-process-only zod schemas for task payloads.
- [ ] Support task capability registration in the Capability Plane.
- [ ] Support creating tasks through policy-aware capabilities.
- [ ] Support listing tasks through policy-aware capabilities.
- [ ] Support updating tasks through policy-aware capabilities.
- [ ] Support deleting tasks through policy-aware capabilities.
- [ ] Support enabling and disabling tasks.
- [ ] Support task run status values such as queued, running, succeeded, failed, and canceled.
- [ ] Support run retry metadata.
- [ ] Support next-run timestamp metadata.
- [ ] Support last-run summary metadata.
- [ ] Support artifact references without raw sensitive payloads.
- [ ] Support redaction of prompts, outputs, and web-derived data.
- [ ] Support per-task permission or capability requirements.
- [ ] Support human approval requirements for risky task runs.
- [ ] Support audit-friendly task history.
- [ ] Support cancellation of running tasks.
- [ ] Support import and export of task definitions.
- [ ] Support deterministic reducer tests.
- [ ] Support host-owned scheduling adapters.
- [ ] Support future recurring trigger types.
- [ ] Support model-safe task summaries for the agent.
