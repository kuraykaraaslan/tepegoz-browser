# Handover

Skeleton for the handover package (internal-ai-rules `documentation-and-handover`). Filled out per
release / milestone.

## Contents (to complete)

- [ ] **Architecture overview** → see `docs/architecture.md` (from the plan) + `docs/adr/`
- [ ] **Runbook** — how to build, run (`pnpm dev`), test, and package; environment requirements
- [ ] **Access & credentials** — signing identity, any service accounts (stored in a vault, never here)
- [ ] **Known issues & troubleshooting** → `docs/known-issues.md`
- [ ] **Security** → `docs/threat-model.md`; data classification; incident contact
- [ ] **Acceptance & signoff** — per-milestone UAT (in-scope flows, test profile, known limits)

## Quick start

```sh
pnpm install
pnpm dev          # launches the Electron GUI (clears ELECTRON_RUN_AS_NODE automatically)
pnpm test         # vitest across packages
pnpm exec turbo run typecheck lint test build
```
