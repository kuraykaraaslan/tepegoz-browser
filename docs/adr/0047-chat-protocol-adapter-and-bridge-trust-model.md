# ADR-0047: Chat protocol-adapter & bridge trust model — native adapters in-process, closed-network bridges out-of-process, every event re-validated, every agent tool behind the one PEP

- **Status:** Proposed (design; `@tepegoz/ext-chat` phase X-chat.1 — see
  [`phases/extensions/ext-chat.md`](../../phases/extensions/ext-chat.md))
- **Date:** 2026-09-09
- **Refines:** [ADR-0021](0021-agent-controllable-extensions.md) (in-process capability providers) ·
  [ADR-0018](0018-mcp-client.md) (out-of-process subprocess adapters) ·
  [ADR-0023](0023-ai-adaptors.md) (typed capability groups)
- **Relates to:** [ADR-0011](0011-vpn-network-privacy.md) (egress binding / kill switch) ·
  [ADR-0022](0022-file-operations-sandbox.md) / [ADR-0040](0040-download-trust-model.md) (media) ·
  [ADR-0027](0027-agent-memory.md) (untrusted content is never an instruction channel) ·
  [ADR-0039](0039-user-granted-sensitive-capabilities.md) (per-use grants) ·
  [ADR-0045](0045-multi-profile-isolation.md) (per-profile isolation)
- **Sibling:** ADR-0046 (Mail adapter trust model — owed, `ext-mail` X-mail.1)

## Context

`@tepegoz/ext-chat` is a multi-account, multi-protocol messenger on a Pidgin / libpurple-style
protocol-plugin ("prpl") model: one normalized conversation core (`@tepegoz/chat-core`) and many
pluggable adapters. It must connect to protocols we can implement and audit (XMPP, IRC, Matrix) **and**
to closed networks where the practical "adapter" is a third-party daemon or an unofficial client
(Telegram, Slack, Discord, and — caveated — WhatsApp).

Two facts drive the model:

1. **Chat is the hardest untrusted-input surface in the product.** Unlike a web page or an email, *a
   stranger can initiate*: an unsolicited DM lands directly in a conversation the agent may be asked
   to read. Every message body, sender display name, room topic and reaction is attacker-controlled
   text.
2. **A bridge to a closed network is code we do not control.** A `mautrix`-style daemon or an
   unofficial protocol library is exactly the kind of thing ADR-0018 already isolates out-of-process
   for MCP servers.

The binding constraints are unchanged: a single Policy Enforcement Point (`ToolGateway` →
`PolicyKernel`), the `{domain}_{verb}_{noun}` tool-naming rule, secrets only in the vault, zod
`safeParse` at every trust boundary, egress bound to the profile, per-profile data isolation.

## Decision

### 1. One `ChatAdapter` contract; two execution modes

`@tepegoz/chat-adapters` defines a single `ChatAdapter` interface (connect / roster / presence /
history / send / edit / react / markRead / joinRoom / uploadMedia / events) plus a `ChatAdapterCaps`
descriptor (receipts, typing, edits, reactions, threads, e2ee, media, presence, historySync, rooms).

- **Native adapters** — XMPP, IRC, Matrix — run **in-process** in the desktop `ChatService`, the
  ADR-0021 injected-host pattern. We implement and audit the wire protocol.
- **Bridge adapters** — Telegram, Slack, Discord, WhatsApp — run **out-of-process**, the ADR-0018
  subprocess shape, implementing the *same* `ChatAdapter` interface over a typed RPC. The
  `ChatService` supervises the child and treats it like a native adapter for the UI and the agent.

### 2. The transport is injected and egress-bound

`@tepegoz/chat-adapters` is Electron-, app- **and** Node-free. The `ChatService` supplies a concrete
`ChatTransport` (`openTCP` / `openWebSocket` / `fetch` / `openEventStream`) whose every stream is
placed on the active profile's network binding ([ADR-0011](0011-vpn-network-privacy.md)). A native
adapter and a bridge subprocess alike get their sockets *only* through this port — neither can open a
connection that dodges the kill-switch. A kill-switched profile → the account shows "blocked", no
socket opens, and the agent's `chat_*` tools return a policy denial.

### 3. Every adapter event is re-validated and capability-gated in the parent

An adapter (native or bridge) emits **raw** events. `@tepegoz/chat-core`'s `normalizeEvent` is the
trust boundary:

1. **Validate** — `safeParse` against the one `ChatEventSchema` (bounded strings, capped arrays). A
   malformed / hostile event is dropped, never thrown past here.
2. **Capability-gate** — an event describing a feature the protocol's caps do not have is *dropped,
   not faked*: an `edit` from an IRC adapter would otherwise land as a spurious new message; a
   `receipt` from a protocol without them is noise. Rich fields (reactions, media, threads, edits)
   are *stripped* from a `message` when the caps say so, rather than the whole message being lost.

`negotiateCaps` narrows a protocol preset only — a connection can turn a capability **off** (a server
without MAM loses `historySync`) but never **on** beyond the preset, so a buggy or hostile server
response cannot make the UI offer a feature the wire cannot carry.

### 4. Bridge subprocess isolation

A bridge child process gets:

- **No filesystem access** beyond its own `Bridges/<id>/state/` directory.
- **Its own egress binding** — a bridge cannot bypass the profile's kill-switch.
- **No host RPC** beyond the `ChatAdapter` methods.
- **A wall-clock + memory budget**, and **crash isolation** — a bridge crash surfaces as *that
  account* going `error`; nothing else is affected, no other account is reachable.
- **A signed package** ([Phase 3](../../phases/product/phase-3-backend-cloud-extensions.md)
  supply-chain gate). Bridges are never bundled with the app.

### 5. Agent capabilities behind the one PEP, with chat-specific guards

`chat_*` capabilities register through `defineCapabilities` into the single `CapabilityRegistry`
behind `ToolGateway` → `PolicyKernel`, exactly like `macros_*`. Danger classes are fail-safe:
`chat_list_items` / `chat_get_item` / `chat_get_history` / `chat_search_items` / `chat_get_media` are
`read`; `chat_update_item` / `chat_update_presence` are `state_changing`; `chat_create_message` and
`chat_create_room_join` are `state_changing` → **always HITL**; `chat_delete_item` is `destructive`.

On top of the PEP:

- **Untrusted content.** Every body, sender name and room topic is `wrapUntrustedContent` before the
  model sees it and can never alter the agent's authority or auto-approve a tool
  ([ADR-0027](0027-agent-memory.md)).
- **Unknown-contact gate.** A conversation whose peer is not a roster contact (and which the user has
  not explicitly opted in) is withheld from `chat_get_history` / `chat_list_items` — a stranger's DM
  is not fed to the model by default.
- **`chat_create_message` is one conversation per call, one HITL per call.** There is no broadcast
  primitive. The confirm surface shows the target conversation + rendered body and the agent cannot
  suppress it.
- **No auto-reply loops.** The agent cannot arm "reply to everything here". A standing auto-responder
  is a separate, explicitly configured `@tepegoz/tasks` job with its own sealed narrowing, and even
  then `send` fail-closes under an unattended profile unless that exact conversation was preapproved.
- **Link / media safety.** URLs in messages are inert to the model; opening one re-enters the browser
  PEP + Safe Browsing. Media is quarantined and only ever materialized into the file-operations
  sandbox ([ADR-0022](0022-file-operations-sandbox.md) / [ADR-0040](0040-download-trust-model.md)).

### 6. Secrets and E2EE key material only in the vault

Passwords, SASL secrets, Matrix access tokens + device keys, and OMEMO / Olm identity keys live in
`@tepegoz/credential-vault` / `safeStorage`. The `ChatStore` holds `secret_ref` (a vault key) and
`chat_e2ee_sessions.wrapped_blob` (`safeStorage`-wrapped), never plaintext. The Event Journal records
*that* a message was sent (conversation-id hash, account, timestamp), never its content. E2EE
decryption happens in the host; keys never leave the vault (X-chat.7).

### 7. Per-profile isolation

Accounts, history DB, search index and E2EE sessions live under `Profiles/<id>/`
([ADR-0045](0045-multi-profile-isolation.md)). A profile switch tears down every connection — native
and bridge — and the next profile sees only its own accounts.

### 8. WhatsApp is caveated, never bundled

No official third-party multi-device client API exists. The supported route is a user-run Matrix
bridge (`mautrix-whatsapp`) — which reduces to the Matrix adapter. An unofficial web-client library
is offered only behind an explicit risk-acknowledgement screen, documented as unsupported /
at-own-risk (account-ban risk, ToS violation). Discord user tokens are treated the same way.

## Consequences

- Chat capabilities are indistinguishable from builtin tools to the agent, and every one is
  policy-gated, HITL-guarded, and audited. Disabling `com.tepegoz.chat` removes every `chat_*` tool
  from the agent's reach — a clean capability kill-switch.
- A bridge is trusted no more than an out-of-process MCP server: sandboxed, egress-bound, its events
  re-validated. A compromised or malicious bridge cannot read outside its state dir, reach another
  account, egress off the profile binding, or take down `ChatService`.
- The "prpl abstraction" means adding Signal, or any community protocol adapter, is an adapter — not
  a change to the core, the UI, the agent surface, or this ADR.
- **Residual risk:** a native adapter is trusted in-process (like `ext-macros`), so its
  `ChatAdapterCaps` declaration matters — mitigated by the fail-safe PEP defaults, the
  `normalizeEvent` gate, and `negotiateCaps` being narrow-only. E2EE correctness (X-chat.7) is its
  own hard problem with its own verification bar; until it lands, adapters advertise `e2ee: false`
  per connection and the UI shows conversations as unencrypted.
