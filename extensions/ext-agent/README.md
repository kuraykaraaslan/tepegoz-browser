# @tepegoz/ext-agent

The Agent extension: the chat/agent sidebar surface (`AgentPanel`) that lets the user hand autonomous
browsing tasks to Tepegöz on the current page, with human approval built in. Each tab group gets its
own independent agent session; the panel switches context automatically as the active tab's group
changes. On the main-process side it is backed by the Electron-free `@tepegoz/agent-runtime` (see
`apps/desktop/src/main/agent/agent-service.ts`, which adapts `runAgent` with the browser tool host,
CDP driver, and IPC bridge) — this package owns only the wire types (`AgentEvent`, `AgentPlanPreview`,
`AgentApprovalRequest`, `AgentRunResult`, `TokenUsageSnapshot`, `AgentHostApi`, …) and the panel UI, and
never reaches a global bridge directly.

The panel's surface is intentionally broad: a command palette (Chat / Do / Make / Tasks), a plan-review
step before any run executes, graduated autonomy levels (`ask` reviews everything, `act` auto-approves
routine steps but still pauses for destructive/financial actions, `auto` is fully hands-off, `dangerous`
is a gated, currently-disabled unrestricted mode), reasoning-effort presets (`low`…`max`, mirroring the
model gateway's `EffortLevel`), a collapsible per-step reasoning/rationale section, a scrubbable replay
timeline over a run's event stream, token-usage reporting, composer attachments (selected text, files,
screenshots), and a Human Handoff Controller that detects CAPTCHA/2FA and (per ADR-0039, pending
implementation) clears them automatically, handing control back to the
user rather than attempting to solve it. Approvals distinguish routine state-changing tools from
biometric-gated (high-risk) ones.

## Exports

- **`agentManifest`** — the extension manifest (`com.tepegoz.agent`, sidebar surface, `tabs`/`read-page`/`navigate` permissions).
- **`AgentPanel`** — the sidebar surface (chat thread, composer, plan review, approvals, replay timeline).
- **`AgentEvent`** / **`AgentEventKind`** (types) — the run event stream (`plan`, `decision`, `step_start`, `step_ok`, `step_error`, `awaiting_approval`, `input_action`, `handoff`, `done`, `error`).
- **`AgentApprovalRequest`** (type) — a pending state-changing tool call awaiting user approval.
- **`AgentPlanStep`** / **`AgentPlanPreview`** (types) — the proposed plan shown before a run executes.
- **`AgentRunResult`** (type) — a run's terminal outcome (`runId`, `stoppedReason`, `ok`).
- **`TokenUsageSnapshot`** (type) — cumulative input/output/total token counts.
- **`AgentHostApi`** (type) — the host contract: run/cancel/reset a run, approvals, plan responses, provider/autonomy/effort config, file/screenshot capture, tab creation.

## i18n

Own `src/i18n/{en,tr}.ts` dictionary (English + Turkish, parity-tested); consumed via `useT` from `@tepegoz/i18n/react`.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
