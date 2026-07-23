# @tepegoz/tasks CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support saved agent task definitions.
- [x] Support task names and descriptions.
- [x] Support trigger definitions for scheduled or event-based runs.
- [x] Support manual task execution metadata.
- [ ] Support redacted task run records.
- [ ] Support redacted task artifact records.
- [x] Support reducer state for task lists.
- [ ] Support selectors for active, recent, failed, and scheduled tasks.
- [x] Support main-process-only zod schemas for task payloads.
- [x] Support task capability registration in the Capability Plane.
- [x] Support creating tasks through policy-aware capabilities.
- [x] Support listing tasks through policy-aware capabilities.
- [x] Support updating tasks through policy-aware capabilities.
- [ ] Support deleting tasks through policy-aware capabilities.
- [x] Support enabling and disabling tasks.
- [ ] Support task run status values such as queued, running, succeeded, failed, and canceled.
- [ ] Support run retry metadata.
- [x] Support next-run timestamp metadata.
- [x] Support last-run summary metadata.
- [ ] Support artifact references without raw sensitive payloads.
- [ ] Support redaction of prompts, outputs, and web-derived data.
- [x] Support per-task permission or capability requirements.
- [x] Support human approval requirements for risky task runs.
- [x] Support audit-friendly task history.
- [ ] Support cancellation of running tasks.
- [ ] Support import and export of task definitions.
- [x] Support deterministic reducer tests.
- [x] Support host-owned scheduling adapters.
- [ ] Support future recurring trigger types.
- [ ] Support model-safe task summaries for the agent.
