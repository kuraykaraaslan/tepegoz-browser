# Extensions roadmap (`phases/extensions/`)

Design documents for **net-new first-class internal extensions** that are large enough to need their
own DoD-gated plan (like [Phase M — Macros](../product/phase-macros.md)) but are **not** on the
numbered product roadmap and **not** in the [v1 ship line](../README.md#v1-ship-line-owner-decision-2026-08-21).

> **Truth status:** everything here is **📋 Proposed — not scheduled.** A document in this folder earns
> real roadmap status the same way a `tracks/` document does: by being promoted into a product
> `phase-*.md` DoD **or** an ADR. Until then it is a written design with an owner's name on it.
>
> This folder exists because these are *extensions* specifically — they all sit on the same standard
> ([ADR-0021](../../docs/adr/0021-agent-controllable-extensions.md) in-process capability providers,
> [ADR-0018](../../docs/adr/0018-mcp-client.md) out-of-process adapters,
> [ADR-0023](../../docs/adr/0023-ai-adaptors.md) grouping) and share one trust model, so keeping their
> plans next to each other keeps that shared surface honest. Existing shipped extensions live in
> [`../../extensions/`](../../extensions/); their smaller roadmaps stay in `../product/` (Macros) or
> are folded into product phases.

## Index

| Doc | Extension | Sub-phases | Goal | Status |
| --- | --- | --- | --- | --- |
| [ext-mail.md](ext-mail.md) | `@tepegoz/ext-mail` | **9** (X-mail.0–.8) | A full **multi-account** mail client — IMAP/SMTP + JMAP + (Phase 3) OAuth Gmail/Graph, a real reader, compose, search/filters, and a complete agent capability set behind the one PEP. | 📋 Proposed — not scheduled |
| [ext-chat.md](ext-chat.md) | `@tepegoz/ext-chat` | **11** (X-chat.0–.10) | A **multi-account, multi-protocol** messenger on a Pidgin/libpurple protocol-plugin model — native XMPP / IRC / Matrix, out-of-process bridges for Telegram / Slack / Discord / (caveated) WhatsApp later, all agent-drivable behind the one PEP. | 📋 Proposed — not scheduled |

### How the docs are structured

Each doc is a **phased program** like [`../ai-agent/`](../ai-agent/README.md)'s S0–S12: a header
(depends-on / ADR owed / branches), the fixed cross-cutting pieces (architecture, adapter contract,
agent-capability table, trust model, surfaces), a **sub-phase DoD template** stated once, then the
numbered sub-phases — each with its own `Depends on`, `Deliverables` checklist, functional `DoD`, and
`Risk`. Two appendices per doc carry the concrete `@tepegoz/shared-types` model sketch and the
`*Store` migration sketch, so the first sub-phase (`.0`) has something to build against. Both are
**multi-account from `.0`** — the schema makes nothing addressable without an `accountId`.

## The shared contract every doc in this folder must honour

These are not restated per-document beyond a pointer; they are the price of being an extension here.

1. **One Policy Enforcement Point.** Every agent-callable capability registers into the single
   `CapabilityRegistry` behind `ToolGateway` → `PolicyKernel` via `defineCapabilities`
   ([ADR-0021](../../docs/adr/0021-agent-controllable-extensions.md)). Ids pass `ToolNameSchema`
   (`{domain}_{verb}_{noun}`, closed verb set). Danger classes are fail-safe: only `read` auto-allows;
   `state_changing` → HITL; `destructive` → HITL. **Sending a message is always `state_changing`** and
   carries an idempotency key.
2. **Inbound content is untrusted model input, never an instruction channel.** An email body, a chat
   message, a subject line, a contact's display name — all of it is attacker-controlled text. It is
   wrapped (`wrapUntrustedContent`, the `@tepegoz/tool-executor` sanitizer `ext-macros` already reuses)
   before it ever reaches the model, and it can never elevate the agent's authority
   (the [ADR-0027](../../docs/adr/0027-agent-memory.md) posture). Chat is the sharper case: a stranger
   can DM the agent directly.
3. **Protocol I/O lives in the main process.** The renderer never opens a socket. Adapters run in
   `MailService` / `ChatService` hosts (the injected-`host` seam of ADR-0021), or — for third-party /
   untrusted adapters — out of process behind [ADR-0018](../../docs/adr/0018-mcp-client.md).
4. **Secrets only in the vault.** Passwords, app-passwords, OAuth refresh tokens, E2EE key material →
   `@tepegoz/credential-vault` / `safeStorage`, never in `preferences.json`, the Event Journal, or
   logs (redaction). Zod `safeParse` at every trust boundary, including **the adapter wire payload** —
   an IMAP `FETCH` response, an XMPP stanza and a Matrix event are all remote and hostile until parsed.
5. **Egress is bound.** Every connection is placed on the active profile's network binding
   ([Phase 5](../product/phase-5-vpn-network-privacy.md) / [ADR-0011](../../docs/adr/0011-vpn-network-privacy.md));
   a kill-switched profile cannot sync. Accounts are per-profile isolated
   ([ADR-0045](../../docs/adr/0045-multi-profile-isolation.md)).
6. **Local-first, leak-nothing.** Direct connections to the user's own servers; no Tepegöz cloud
   relay. Messages and attachments are stored in the local SQLite DB (migration-safe), attachments
   quarantined ([ADR-0040](../../docs/adr/0040-download-trust-model.md)) and only ever written into the
   file-operations sandbox ([ADR-0022](../../docs/adr/0022-file-operations-sandbox.md)).
7. **Determinism-first.** Adapters are deterministic protocol clients. The model is used only for the
   cognitive work (triage, summarize, draft, classify) — never to decide protocol mechanics.
8. **i18n day-0, en + tr full parity**, per-package dict ([ADR-0016](../../docs/adr/0016-per-package-i18n.md));
   `AppError` contract; coverage gate; **no AI attribution trailer**.

## Shared prerequisite work (blocks both docs)

- [x] **Extend `ExtensionPermissionSchema`** (`@tepegoz/extension-sdk`) past the current closed set
      (`tabs` · `read-page` · `write-page` · `navigate` · `network`). New host capabilities these
      extensions need a name for: `accounts` (hold server credentials), `background-connection`
      (keep a socket open while the surface is closed), `notifications`, `contacts`. Landed with
      X-chat.1 (`packages/extension-sdk/src/manifest.ts`); `extensions/ext-chat`'s manifest declares
      all four.
- [x] **A `background-connection` supervisor** in `@tepegoz/extension-host` — today an extension's
      runtime is tied to a renderer surface being open. A mail/chat account must stay connected (or on
      a defined reconnect/backoff schedule) with every surface closed, and must drop cleanly on
      disable, on profile switch, and on a kill-switch egress block. **Landed 2026-09-13 (`feat/chat`):**
      `BackgroundConnectionSupervisor` (`packages/extension-host/src/background-connection-supervisor.ts`)
      — a `provide(extensionId, init/stop/reconcile/notifyEgressChange)` registry that fans each of the
      four lifecycle calls out to every registered provider, isolating one provider's failure from the
      rest (a broken mail account must never stop chat's `init`/`stop`/etc., or vice versa). Deliberately
      thin: it does not itself gate on the extension's enabled state — each provider already does that
      internally, the same way `ChatService.start()` always has — so this is a pure promotion of the
      existing bespoke wiring, not a behaviour change. `background-connection.electron.ts` is the
      main-process singleton (mirrors `capability-supervisor.electron.ts`); `main/index.ts`'s startup +
      `before-quit`, `ipc-content-app.ts`'s two prefs-reconcile paths, and `ipc-network.ts`'s
      `broadcastNetworkState` now call `BackgroundConnectionService.init/stop/reconcile/
      notifyEgressChange()` instead of `ChatMessenger.*` directly — `com.tepegoz.chat` is registered as
      the first (and so far only) provider. A future `ext-mail` gets all four lifecycle hooks by calling
      `provide()` once, instead of duplicating these four call sites.
- [x] **Adapter-as-subprocess contract** — generalise `manifest.mcpServer` (stdio) into the shape a
      third-party mail/chat adapter or a protocol *bridge* would use: no host access, its own egress
      binding, every result normalised and re-validated before the core sees it, every tool still
      behind the one PEP. **Addendum ADR landed 2026-09-12:**
      [ADR-0048](../../docs/adr/0048-adapter-subprocess-contract.md) — design only, no
      implementation; a `manifest.adapterSubprocess` capability declaration alongside `mcpServer`,
      isolation guarantees generalized from [ADR-0047](../../docs/adr/0047-chat-protocol-adapter-and-bridge-trust-model.md)
      §4 (own state dir, own egress binding, no host RPC beyond the extension's own adapter
      interface, crash isolation, signed package, never bundled), typed RPC over the extension's own
      adapter interface rather than MCP tool-call semantics. **Still owed:** the actual
      `@tepegoz/ext-chat` X-chat.8 bridge framework that implements this contract — this checklist
      item is the design prerequisite, not the framework itself.
