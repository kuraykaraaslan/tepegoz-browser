# Technical AI Documentation (L7 Model Gateway)

> **Scope.** This document is the required AI transparency/technical record for tepegöz's agentic core
> (Phase 1a). It covers the models used, provider data-processing posture, EU AI Act risk classification,
> human oversight, known limits, and the in-product AI disclosures. It is maintained alongside the code:
> update it in the same PR whenever a model tier, provider, budget, or oversight control changes.
>
> **Status:** Phase 1a. BYO-key, local-first, no managed backend. Sources of truth in code:
> `packages/model-gateway` (router, gateway, providers, token ledger), `packages/agent-runtime`
> (run wiring + budget seam), `packages/security-policy` + `packages/capability-plane` (Policy Kernel,
> Egress Firewall, HITL PEP), `packages/persistence` (SQLite Token Ledger + Event Journal).

## 1. Models & providers

The agent is **provider-agnostic** ([ADR-0005](adr/0005-provider-agnostic-ai.md)). Every model call goes
through a single `ModelGateway.complete()` entry point that selects a registered provider adapter by id.
Routing is deterministic (`ModelRouter`): each capability maps to a tier, and each tier maps to a concrete
model per provider — adding a provider is a data change plus one adapter, not a routing branch.

| Provider                         | Transport                              | Adapter                               | Plan tier                 | Exec tier                 | Classify tier          |
| -------------------------------- | -------------------------------------- | ------------------------------------- | ------------------------- | ------------------------- | ---------------------- |
| **Anthropic (Claude)** — default | `@anthropic-ai/sdk` (vendor SDK)       | `providers/anthropic.provider.ts`     | `claude-opus-5`           | `claude-sonnet-5`         | `claude-haiku-4-5`     |
| **OpenAI (GPT)**                 | REST via `@tepegoz/http` (no SDK)      | `providers/openai.provider.ts`        | `gpt-5`                   | `gpt-5`                   | `gpt-5-mini`           |
| **Google (Gemini)**              | REST via `@tepegoz/http` (no SDK)      | `providers/gemini.provider.ts`        | `gemini-3-pro`            | `gemini-3-flash`          | `gemini-3-flash-lite`  |
| **Kimi (Moonshot AI)**           | REST via `@tepegoz/http` (no SDK)      | `providers/kimi.provider.ts`          | `kimi-k2.6`               | `kimi-k2.6`               | `moonshot-v1-8k`       |
| **Amazon Nova**                  | REST via `@tepegoz/http` (no SDK)      | `providers/nova.provider.ts`          | `nova-2-lite-v1`          | `nova-2-lite-v1`          | `nova-micro-v1`        |
| **DeepSeek**                     | REST via `@tepegoz/http` (no SDK)      | `providers/openai-compat.provider.ts` | `deepseek-reasoner`       | `deepseek-chat`           | `deepseek-chat`        |
| **xAI (Grok)**                   | REST via `@tepegoz/http` (no SDK)      | `providers/openai-compat.provider.ts` | `grok-4`                  | `grok-4`                  | `grok-3-mini`          |
| **Groq**                         | REST via `@tepegoz/http` (no SDK)      | `providers/openai-compat.provider.ts` | `llama-3.3-70b-versatile` | `llama-3.3-70b-versatile` | `llama-3.1-8b-instant` |
| **On-device (Local SLM)**        | `@tepegoz/local-inference` (llama.cpp) | `local-provider.ts`                   | selected GGUF             | selected GGUF             | selected GGUF          |

- **Tier roles.** `plan` = highest-capability planning; `exec` = the reactive perceive→decide→act loop;
  `classify` = cheap read/understand/summarize/classify. Reasoning depth for Anthropic is set via
  `output_config.effort` (never `budget_tokens` — rejected on the Claude 5 / 4.x line); the other cloud
  tier models take no effort field, so effort stays a routing/telemetry concern there.
- **Region.** Kimi (`api.moonshot.ai` vs. `api.moonshot.cn`) and xAI (`<region>.api.x.ai` clusters, e.g.
  `eu-west-1` for data residency) are offered on more than one endpoint. The region is chosen **per key**
  at add time (`ProviderKeyMeta.region` → `PROVIDER_REGIONS` → the adapter's `baseURL`); single-endpoint
  providers show no picker. See `packages/model-gateway/src/models.ts` (`PROVIDER_REGIONS`).
- **Tunable ids.** The Claude ids are pinned to a verified generation; the Kimi/Nova/DeepSeek/xAI/Groq
  and OpenAI/Gemini ids are tunable defaults (edit `models.ts`), not verified against a spec.
- **Cost-saver / local offload.** When the cost-saver toggle is on and a local model is installed, simple
  capabilities route on-device (`transport:'local'`), transparently falling back to the cheap cloud tier
  when the local engine is unavailable.
- **BYO-key.** Cloud keys are user-supplied, stored only in the main process via the OS keychain
  (`safeStorage`/DPAPI) in `@tepegoz/credential-vault`. The raw key never crosses IPC and never appears in
  logs. The on-device provider is keyless. There is **no managed backend** in Phase 1a — no key or prompt
  reaches an tepegöz-operated server.
- **Single client per provider.** Each provider caches one underlying client (SDK/axios, keep-alive pool)
  per credential and reuses it across runs.

## 2. Data processing & model cards (DPA)

- **Who processes prompts.** Prompts, page content, and tool arguments are sent **directly** from the
  user's machine to the chosen provider's API using the user's own key. tepegöz does not proxy, log, or
  retain them server-side (no server exists in Phase 1a).
- **Provider terms / model cards.** The applicable data-processing addendum and model card are the
  provider's own, governed by the user's account with that provider:
  - Anthropic (Claude): Anthropic Commercial Terms + DPA; Claude model cards.
  - OpenAI (GPT): OpenAI API Terms + DPA (API data not used for training by default).
  - Google (Gemini): Google AI / Gemini API terms + DPA.
  - Kimi (Moonshot AI): Moonshot API terms + DPA (global `api.moonshot.ai` or China `api.moonshot.cn`).
  - Amazon Nova: Amazon Nova developer API terms (`api.nova.amazon.com` — the consumer API, not AWS Bedrock).
  - DeepSeek: DeepSeek open-platform API terms.
  - xAI (Grok): xAI API terms + DPA; regional cluster chosen per key for data residency.
  - Groq: GroqCloud API terms (open-weight models on Groq's LPU inference).
  - On-device: no third party — inference runs locally; nothing leaves the device.
- **Untrusted-content handling.** Web/page text handed to a model is treated as untrusted: it is sanitized
  (zero-width/bidi/homoglyph/hidden stripping) and wrapped with an XML delimiter + anti-injection footer
  before it is included in a prompt (`Content Sanitizer`, `wrapUntrustedContent`).
- **Egress redaction.** Outbound model/tool payloads pass the **Egress Firewall**: secret tokens/keys are
  blocked; Base64/high-entropy blobs and PII (email/IBAN/card) are flagged. Journal/log writes are redacted
  (`Logger.redact`) before persistence.

## 3. EU AI Act risk classification

- **Classification: limited-risk AI system** (transparency obligations), operated under **meaningful human
  control**. tepegöz is a general-purpose browsing/automation assistant; it is not deployed for any Annex III
  high-risk use case, performs no biometric categorization, social scoring, or automated legal/eligibility
  decisions.
- **Transparency obligation (Art. 50).** Users are told they are interacting with an AI and that output may
  be inaccurate — see §6. AI-generated output is labeled in the UI.
- **High-risk actions are gated by the user, never by the agent.** State-changing / destructive tool calls
  require explicit human approval (HITL). Sensitive categories (bank / crypto / health / password-manager /
  government) are hard-blocked until the user creates a per-category grant, which ships absent and which no
  autonomy level and no agent tool can create (ADR-0039). Financial calls are authorized either by HITL or by
  a user-written wallet mandate with a ceiling, payee set and expiry. CAPTCHA/2FA are cleared automatically —
  two-factor codes are completed by the Credential Broker and never reach the model.
- **Prohibited-practice check.** No subliminal manipulation, no exploitation of vulnerabilities, no
  real-time remote biometric identification. Not applicable by design.

## 4. Human oversight

- **Plan preview (HITL before the loop).** After planning, the full step DAG is shown for review; the user
  can prune steps and must approve before **anything** executes. Reject/timeout → nothing runs.
- **Per-action approval (HITL in the loop).** The single `ToolGateway` PEP + Policy Kernel classify every
  tool call; state-changing/destructive/financial calls and tainted-argument calls escalate to an approval
  modal. Fail-safe: no response within the timeout = deny.
- **Autonomy levels.** `ask` (default) reviews the plan + every state-changing step; `act` auto-approves
  routine steps but still pauses for destructive/financial; `auto` is hands-off. At **every** level the
  deny-class hard-blocks in the main process, and **no level can lift it** — only an out-of-band user grant
  can, which is a separate object from an autonomy level and is never created by the agent (ADR-0039).
- **Hard stops.** `MAX_AGENT_STEPS` cap; Loop Detector (repeated action-signature → stop → credit
  preserved); cooperative cancellation between steps; Human Handoff Controller as the fallback for a
  CAPTCHA the browser cannot clear.
- **Auditability.** Every run projects redacted events + checkpoints into the append-only Event Journal
  (`CheckpointWritten`, `AgentStepExecuted`, `HitlRequested`, `HandoffRequested`, …) for after-the-fact
  review and replay.

## 5. Budgets, quotas & limits

- **No uncapped or untimed call.** `ModelGateway.complete()` rejects any request missing a positive integer
  `maxTokens` or `timeoutMs`, and wraps every call in an `AbortController` + timeout. The per-run
  `maxTokens` is derived from the reasoning-effort preset (low 2048 … max 32768).
- **Token Ledger (persisted).** Usage is accounted at **provider + model + capability** granularity. The
  in-memory ledger counts the current run and feeds the live indicator; at run end the run's rows are
  persisted to the SQLite Token Ledger (`token_usage`), so cumulative lifetime usage survives restarts.
- **Account quota + 80% warning.** An optional account-wide total-token quota (Settings → Cost &
  performance → Token budget; `0` = unlimited) drives the quota indicator. A one-time warning is raised when
  cumulative usage crosses **80%** of the quota.
- **Pre-flight budget gate.** A new run is blocked before planning once the quota is reached.
- **Auto-refund (credit preserved).** When a run fails for a reason **outside the user's control** — a
  system/transient error, a CAPTCHA/2FA handoff, or a detected loop — that run's tokens are marked refunded
  and excluded from the quota total.
- **Sync-ready.** `token_usage` carries `device_id` + sync-meta (`updated_at`/`version`/`tombstone`) so a
  future tepegöz-account cloud sync is not a schema migration.

### Known limits (Phase 1a)

- Vision, true parallel-DAG execution, durable resume across restarts, and on-device model _execution_
  (the engine backend) are Phase 1b — the routing/adapters ship now.
- `count_tokens` pre-flight sizing is Anthropic-only and not yet wired into routing.
- All non-Anthropic tier model ids (OpenAI, Gemini, Kimi, Nova, DeepSeek, xAI, Groq) are tunable
  defaults (edit `models.ts`); they are not verified against a live provider catalog in this document.
  The Anthropic ids track a verified generation and change with a migration, not a retune.
- The token quota is a total-token cap, not a currency budget; per-provider pricing is out of scope here.

## 6. In-product AI disclosure (UI)

- **"AI-generated and may be wrong"** disclaimer is shown on agent output (Agent Console).
- **Raw model output is never rendered as HTML** — chat renders safe markdown/plain text only.
- **Side-effecting actions are surfaced and gated** — the HITL modal shows the tool + a truncated,
  redacted argument preview before the user approves.
- **Granted capabilities are visible and revocable** — every active sensitive-category grant and wallet
  mandate is listed with its scope and expiry, and can be revoked at any time; revocation takes effect on the
  next classification. A CAPTCHA the browser cannot clear still raises a localized handoff notification
  (center + toast + native) and stops the run.
- **Cost transparency** — the live token/quota indicator and the 80% warning are shown in the Console;
  the quota is user-configurable in Settings.
- All disclosures are localized (English source + Turkish parity), per the day-0 i18n rule.
