# Phase X-chat — Multi-Protocol Messenger Extension (`@tepegoz/ext-chat`)

**Status:** 📋 Proposed — not scheduled, **not in the v1 ship line** · **Estimate:** large
(multi-month; 11 sub-phases) · **Owner:** unassigned
**Depends on:** [ADR-0021](../../docs/adr/0021-agent-controllable-extensions.md) (agent-controllable
extensions) · [ADR-0018](../../docs/adr/0018-mcp-client.md) (out-of-process adapters — **the core
mechanism for protocol bridges**) · [ADR-0023](../../docs/adr/0023-ai-adaptors.md) (grouping) ·
`@tepegoz/credential-vault` + `safeStorage` · [ADR-0045](../../docs/adr/0045-multi-profile-isolation.md)
(per-profile isolation) · [ADR-0022](../../docs/adr/0022-file-operations-sandbox.md) /
[ADR-0040](../../docs/adr/0040-download-trust-model.md) (media) ·
[Phase 5](../product/phase-5-vpn-network-privacy.md) (egress binding / kill switch) · the shared
prerequisite work in [`README.md`](README.md#shared-prerequisite-work-blocks-both-docs).
**Relates to:** [ext-mail.md](ext-mail.md) (sibling — same trust model, same host shape, shared
prerequisites), [Phase 2](../product/phase-2-adapters-safe-browsing.md) (adapters),
[Phase 3](../product/phase-3-backend-cloud-extensions.md) (third-party ExtensionHost, signed adapter
packages).
**ADR:** [ADR-0047](../../docs/adr/0047-chat-protocol-adapter-and-bridge-trust-model.md) — Chat
protocol-adapter & bridge trust model (Proposed, written 2026-09-09).
**Branch examples:** `feat/ext-chat-core`, `feat/chat-xmpp-adapter`, `feat/chat-reader`,
`feat/chat-muc`, `feat/chat-irc-adapter`, `feat/chat-matrix-adapter`, `feat/chat-agent-caps`,
`feat/chat-e2ee`, `feat/chat-bridge-framework`

**Goal:** A multi-protocol, **multi-account** instant-messenger delivered as a first-class internal
extension, built on a **Pidgin / libpurple-style protocol-plugin model** — one normalized conversation
core, many pluggable protocol adapters. First-class, native adapters: **XMPP**, **IRC**, **Matrix**.
Later, via an out-of-process **bridge framework**: **Telegram**, **Slack**, **Discord**, and — with
the ToS caveat stated plainly — **WhatsApp**. Every conversation is agent-drivable behind the single
ToolGateway PEP: the agent can read a room, summarize a backlog, draft a reply, set presence, and —
always HITL-gated — send. Local-first: direct connections, history in the local SQLite DB, E2EE key
material in the vault, no Tepegöz relay.

---

## Why the libpurple model

Pidgin's durable idea is the **prpl** (protocol plugin): the UI and the conversation model know
nothing about any specific network; each protocol is a plugin implementing a fixed contract
(connect, send, roster, presence, room join, receive). That is exactly the ADR-0021 injected-host
seam applied to chat. It gives us:

- **One UI, one agent surface, N networks.** Adding Signal is an adapter, not a feature.
- **A clean trust boundary.** A native adapter (XMPP/IRC/Matrix — protocols we can implement and
  audit) runs in-process in `ChatService`. A *bridge* to a closed network (Telegram/Slack/Discord/
  WhatsApp — where the "adapter" is really a third-party daemon or an unofficial client) runs
  **out of process** behind [ADR-0018](../../docs/adr/0018-mcp-client.md): no host access, its own
  egress binding, every event re-validated before the core sees it.
- **Honest capability negotiation.** Each adapter declares what its protocol actually supports
  (receipts, typing, edits, reactions, threads, E2EE, media) so the UI and the agent tools degrade
  correctly instead of pretending.

## Architecture — package split

Same shape as [ext-mail](ext-mail.md).

| Package | Layer | Electron? | Owns |
| --- | --- | --- | --- |
| `@tepegoz/ext-chat` (`extensions/ext-chat`) | extension | no | Manifest (surfaces), `capabilities.ts`, view models. |
| `@tepegoz/chat-core` | domain lib | **no** | The normalized model: account, **roster/contacts**, **conversation** (1:1 and multi-user room / MUC / channel), **message** (text, edits, replies, reactions, attachments, system events), **presence**, delivery/read receipts, typing. The cross-protocol event normaliser (the "prpl abstraction"). Offline send queue. Turkish-aware history search fold. |
| `@tepegoz/chat-adapters` | domain lib | **no** | The `ChatAdapter` contract + first-party **XMPP**, **IRC**, **Matrix** adapters, each over an injected transport (TCP/TLS, WebSocket, HTTP) so they test against recorded traces. |
| desktop `ChatService` (`apps/desktop/src/main/chat/`) | L0 host | yes | Opens connections (bound to profile egress), resolves credentials + E2EE keys from the vault, runs native adapters, supervises **out-of-process bridge adapters**, writes the DB, emits redacted Journal events, runs the `background-connection` supervisor. The `ChatCapabilityHost`. |
| `@tepegoz/chat-ui` | feature-ui | no (renderer) | Conversation list, message timeline, composer, roster, room browser, account setup. Self-localizes. |
| `@tepegoz/persistence` (extend) | L1 | no | `ChatStore` + migration (appendix). |

## The adapter contract

```ts
interface ChatAdapter {
  readonly id: string;                    // 'xmpp' | 'irc' | 'matrix' | 'bridge:telegram' | ...
  readonly capabilities: ChatAdapterCaps; // receipts? typing? edits? reactions? threads? e2ee? media? presence? history-sync?
  connect(account: ChatAccountCreds, transport: ChatTransport): Promise<ChatSession>;
  roster(s: ChatSession): Promise<Contact[]>;
  setPresence(s: ChatSession, presence: Presence): Promise<void>;
  listConversations(s: ChatSession): Promise<Conversation[]>;
  history(s: ChatSession, conv: ConvId, before: Cursor | null): Promise<ChatMessage[]>;
  sendMessage(s: ChatSession, conv: ConvId, body: OutgoingMessage): Promise<SendReceipt>;
  editMessage?(s: ChatSession, conv: ConvId, id: MsgId, body: OutgoingMessage): Promise<void>;
  react?(s: ChatSession, conv: ConvId, id: MsgId, emoji: string, on: boolean): Promise<void>;
  markRead(s: ChatSession, conv: ConvId, upTo: MsgId): Promise<void>;
  joinRoom?(s: ChatSession, room: RoomAddr): Promise<Conversation>;
  leaveRoom?(s: ChatSession, conv: ConvId): Promise<void>;
  uploadMedia?(s: ChatSession, file: SandboxPath): Promise<MediaRef>;
  events(s: ChatSession): AsyncIterable<ChatEvent>;   // incoming messages, presence, receipts, typing, room changes
  close(s: ChatSession): Promise<void>;
}
```

| Adapter | Kind | Sub-phase | Notes |
| --- | --- | --- | --- |
| `xmpp` | native, in-process | X-chat.1 (+ MUC in .3, OMEMO in .7) | Core RFC 6120/6121 + XEPs: `0198` (stream management / reconnect), `0280` (carbons), `0313` (MAM history), `0363` (HTTP upload), `0384` (**OMEMO** E2EE), `0045` (MUC), `0085` (typing), `0184` (receipts). Direct TLS or WebSocket. Password or token in the vault. |
| `irc` | native, in-process | X-chat.4 | RFC 1459/2812 + IRCv3 (`server-time`, `message-tags`, `chathistory`, SASL, `echo-message`, `batch`). No E2EE (protocol has none — the caps flag says so). NickServ/SASL creds in the vault. |
| `matrix` | native, in-process | X-chat.5 (E2EE in .7) | Client-Server API, `/sync` long-poll, **Olm/Megolm** E2EE with device verification, media repo, spaces. The substrate most third-party bridges already target. |
| `bridge:telegram` | **out-of-process** | X-chat.9 | Telegram's own API (vetted MTProto client lib, or Bot API for the narrow bot case). Subprocess adapter — no host access, own egress binding. |
| `bridge:slack` / `bridge:discord` | **out-of-process** | X-chat.9 | Official APIs + user/bot tokens. Same subprocess isolation. Rate-limit + ToS constraints in the adapter caps + docs. |
| `bridge:whatsapp` | **out-of-process, caveated** | X-chat.9 (behind a flag) | No official multi-device client API for third parties. Options: a self-hosted Matrix bridge (`mautrix-whatsapp`), or an unofficial web-client library — **both carry account-ban risk and a ToS violation.** Ships behind an explicit acknowledgement screen, never bundled, documented as unsupported / at-own-risk. Listed because the user asked; not a recommended path. |
| *third-party* | out-of-process | after the ADR-0018 generalisation | Any user/community protocol adapter arrives the same way — signed package, results re-validated, behind the one PEP. |

## Agent capabilities (behind the one PEP) — delivered in X-chat.6

| Tool | Danger class | Notes |
| --- | --- | --- |
| `chat_list_items` | `read` | Conversations for an account — last message preview, unread count, kind (dm/room). |
| `chat_get_item` | `read` | One conversation's metadata + participants. |
| `chat_get_history` | `read` | Recent messages, oldest-first, each body `wrapUntrustedContent`. Paginated. |
| `chat_search_items` | `read` | Structured/full-text search over local history. |
| `chat_create_message` | `state_changing` → **always HITL** · idempotency key | Send a message to one conversation. The confirm surface shows the target conversation + rendered body; unsuppressible. |
| `chat_update_item` | `state_changing` | Mark read, set a per-conversation mute, add a reaction. |
| `chat_update_presence` | `state_changing` | Set the account's presence/status text. |
| `chat_create_room_join` | `state_changing` → HITL | Join a room/channel by address. |
| `chat_delete_item` | `destructive` | Leave a room, or delete a local conversation copy. |
| `chat_get_media` | `read` → gated | Materialize an attachment into the file-operations sandbox after quarantine. |

### Rules specific to the agent surface

- **Chat is the hardest untrusted-input surface in the product.** Unlike a page or an email, *a
  stranger can initiate* — an unsolicited DM lands directly in a channel the agent may be asked to
  read. Every message body, sender display name and room topic is wrapped untrusted content and can
  never alter the agent's authority or auto-approve a tool.
- **Auto-processing of unknown contacts is off by default.** The agent only reads/acts on
  conversations with roster contacts (or rooms the user explicitly pointed it at). A message from an
  unknown JID/handle is not fed to the model unless the user opts in for that conversation.
- **No broadcast primitive.** `chat_create_message` is one conversation per call, one HITL per call.
- **No auto-reply loops.** The agent cannot arm a "reply to everything in this room" behaviour; a
  standing auto-responder would be a separate, explicitly-configured `@tepegoz/tasks` job with its
  own sealed narrowing, and even then `send` fail-closes under an unattended profile unless the exact
  conversation was preapproved.
- **Link/media safety.** URLs in messages are inert to the model; the agent choosing to open one
  re-enters the browser PEP + Safe Browsing. Media is quarantined, never auto-opened.

## Trust & security (applies across every sub-phase)

- **All protocol I/O in the main process** (native adapters) **or a sandboxed subprocess** (bridges).
  The renderer never opens a socket, never holds a credential or an E2EE key.
- **TLS required**; egress bound to the profile ([Phase 5](../product/phase-5-vpn-network-privacy.md));
  a kill-switched profile → accounts show "blocked", do not connect, agent chat tools return a policy
  denial.
- **Credentials + E2EE key material only in `@tepegoz/credential-vault` / `safeStorage`** — passwords,
  SASL secrets, Matrix access tokens + device keys, OMEMO identity keys. Redacted from the Journal and
  logs; the Journal records *that* a message was sent (conversation id hash, account, timestamp),
  never plaintext.
- **Zod `safeParse` at every boundary:** IPC, **every adapter event** (an XMPP stanza, a Matrix sync
  event, an IRC line, a bridge's normalized payload are all hostile until parsed), agent tool args,
  the Journal projection.
- **E2EE is real where the protocol has it.** OMEMO for XMPP, Olm/Megolm for Matrix — decryption in
  the host, keys never leaving the vault, device-verification surfaced in the UI. Adapters whose
  protocol has no E2EE (IRC) say so in their caps and the UI shows it.
- **Media / attachments** quarantined, saved only into the file-operations sandbox.
- **Per-profile isolation** ([ADR-0045](../../docs/adr/0045-multi-profile-isolation.md)): accounts,
  history DB, search index, E2EE sessions under `Profiles/<id>/`; a profile switch drops every
  connection.
- **Bridge subprocesses** get no filesystem access beyond their own state dir, no host RPC beyond the
  adapter contract, and their own egress binding; a crashing or misbehaving bridge cannot take down
  `ChatService` or reach another account.
- **Local, optionally encrypted history**; no Tepegöz relay — cross-device is the protocol's own
  history sync (MAM / Matrix `/sync`).

## Surfaces

- **`sidebar`** — "Chat" dock: conversation list + active conversation beside the page. Primary
  `click` target.
- **`page`** — `tepegoz://com.tepegoz.chat`, the full messenger (roster, rooms, multi-account).
  `doubleClick` target.
- **`popup`** — unread count + latest messages.

## Sub-phase DoD template

Every sub-phase closes only when **all** hold (stated once, referenced per phase):

- [ ] i18n **en + tr full parity** for every surface added.
- [ ] zod `safeParse` at every IPC / adapter-event / tool boundary introduced.
- [ ] `AppError` contract.
- [ ] Coverage gate for new `packages/*` code; `apps/desktop` additions at the app floor.
- [ ] Migration-safe DB; store round-trip test.
- [ ] Self-review / `/code-review`; **no AI attribution trailer**.
- [ ] The sub-phase's own functional DoD.

---

# The phased program

```
X-chat.0  Foundations ──────────────┐
X-chat.1  XMPP + connection spine ───┼──► X-chat.2  Roster & conversation UI ──► X-chat.3  MUC / rooms
                                     │                                                │
X-chat.4  IRC adapter    (after .1/.2, parallel-able)                                 │
X-chat.5  Matrix adapter (after .1/.2, parallel-able)                                 │
                                     ├───────────────────────────────────────────────►┼──► X-chat.6  Agent capabilities
X-chat.7  E2EE (OMEMO + Olm/Megolm)  (after .1 + .5)                                   │
X-chat.8  Bridge framework (out-of-process)  ──► X-chat.9  First bridges (Telegram/Slack/Discord/·WhatsApp)
X-chat.10 Hardening, sandbox tests, e2e  ◄────────────────────────────────────────────┘
```

---

## X-chat.0 — Foundations (`@tepegoz/chat-core` + model)

**Status:** 🟡 Code landed (2026-09-09) — `@tepegoz/shared-types` `chat.ts` + `@tepegoz/chat-core`
(`normalizeEvent` · `foldEvent`/`reconcileEcho`/`markRead` · `send-queue` · `mentions` · `address` ·
`search-fold`), 50 tests, coverage floor met. Golden mixed-event-stream + capability-gating tests
present. DoD-template close-out (i18n/e2e N/A for a pure lib) pending. · **Branch:** `feat/ext-chat-core`
**Risk:** medium — the cross-protocol normaliser is the design's keystone; getting the event union
wrong is expensive later.

### Deliverables
- [ ] **Domain schemas** in `@tepegoz/shared-types` (`chat.ts`, appendix): `ChatAccount`
      (multi-account, per-protocol `ChatServerConfig` discriminated union, `secretRef`),
      `ChatContact`, `ChatConversation` (`kind: 'dm' | 'room'`), `ChatMessage` (text / media /
      system / edit / redaction, reply-to, reactions), `ChatPresence`, `ChatReceipt`, `ChatAdapterCaps`,
      `ChatQuery`. Registered + a `chat.test.ts`.
- [ ] **`@tepegoz/chat-core` package** — scaffold, `pnpm-workspace` (globbed), coverage `include`,
      `dependency-cruiser` (`chat-core-no-app-no-electron`), `docs/package-map.md`.
- [ ] **The event normaliser** (`normalize.ts`) — every adapter emits a `RawAdapterEvent`; this maps
      it to the `ChatEvent` union (`message` / `message-edit` / `message-redact` / `receipt` /
      `typing` / `presence` / `room-membership` / `roster-change` / `error`). Capability-gated fields
      (edits, reactions, threads) are dropped (not faked) when the adapter's caps say the protocol
      lacks them.
- [ ] **Conversation model** (`conversation.ts`) — merge an incoming event into local state:
      dedup by protocol message id, optimistic-echo reconciliation (local temp id → server id),
      ordering by `(origin-ts, arrival-seq)`, unread/mention counting, last-read watermark.
- [ ] **Offline send queue** (`send-queue.ts`) — pure: enqueue an `OutgoingMessage`, mark
      sending/sent/failed, idempotent replay key, backoff schedule; the host drives it.
- [ ] **Mention / highlight parsing** (`mentions.ts`) — nick highlighting (IRC), `@`-mentions
      (Matrix/XMPP), room-ping detection; used for notification routing.
- [ ] **History search fold** (`search-fold.ts`) — reuse the Turkish-aware fold; FTS writer + query.
- [ ] **Address parsing** (`address.ts`) — JID (`node@domain/resource`), IRC (`nick!user@host`),
      Matrix (`@user:server`, `#room:server`, `!roomid:server`) parse + format.

### Functional DoD
- [ ] A recorded stream of mixed events (out-of-order delivery, an edit before its original, a
      redaction, a duplicate) folds into the correct final conversation state (golden test).
- [ ] Capability gating: an "edit" event from an adapter whose caps lack `edits` is dropped, not
      applied as a new message.
- [ ] `@tepegoz/chat-core` meets the `packages/**` coverage floor.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.1 — XMPP adapter + connection spine

**Status:** 🟡 In progress (~90%, 2026-09-09) — **everything except the desktop host is done**:
- `@tepegoz/chat-adapters` — the full pure XMPP client: `XmlStreamParser` (incremental, bounded,
  fail-closed) · stanza↔`ChatEvent` mapping (message/presence/roster/receipts/chat-states/correction/
  retraction/MAM) · `<stream:features>` + SASL (PLAIN + SCRAM-SHA-1/256 via Web Crypto, RFC 5802
  vector passes) · `XmppNegotiator` (STARTTLS/direct-TLS → SASL → bind → SM) · XEP-0198
  `StreamManager` · `XmppAdapter` (transport wiring, live events, sendMessage/setPresence/markRead/
  roster round-trip/MAM history) · connection autodiscovery (SRV + XEP-0156 host-meta). **132 tests.**
- `@tepegoz/chat-core` — `normalizeEvent`/`foldEvent`/`send-queue`/`mentions`/`address`/`search-fold`
  (X-chat.0) · `ChatConnectionManager` (per-account lifecycle + jittered-backoff reconnect +
  kill-switch) · `PresenceTracker` (multi-resource fold) · `ChatAccountState` (raw stream →
  conversations/roster/presence → `ChatStateChange[]`). **90 tests.**
- `@tepegoz/shared-types` chat model · `ChatStore` + persistence migration 21 · `extensions/ext-chat`
  scaffold (manifest + en/tr i18n + placeholder surfaces + `comments` icon) ·
  `ExtensionPermissionSchema` extended · [ADR-0047](../../docs/adr/0047-chat-protocol-adapter-and-bridge-trust-model.md).

**Remaining:** the desktop `ChatService` host — a `node:net`/`node:tls`/WebSocket `ChatTransport`
implementation bound to the profile egress, credential-vault resolution, `ChatStore` wiring, a
`ChatConnectionManager` + `ChatAccountState` per account, the IPC surface + preload bridge, and the
`background-connection` supervisor (enable/disable · profile switch · kill-switch). Best done on a
clean `apps/desktop` tree. · **Branch:** `feat/ext-chat-xmpp-adapter` · **Risk:** low-medium — every
hard part (protocol engine, reconnect, presence, folding) is done and unit-tested; the host is glue.

### Deliverables
- [ ] **`extensions/ext-chat` scaffold** — manifest (`com.tepegoz.chat`, surfaces `sidebar`+`page`,
      permissions `accounts`/`background-connection`/`notifications`/`contacts`), `src/i18n/`,
      catalog pickup, surface-loader thunk.
- [ ] **`ChatStore` + migration** (appendix): `chat_accounts`, `chat_contacts`,
      `chat_conversations`, `chat_messages`, `chat_attachments`, `chat_receipts`,
      `chat_e2ee_sessions` (wrapped blobs), `chat_send_queue`, `chat_search` (FTS5). Sync-meta on
      `chat_accounts`.
- [ ] **`@tepegoz/chat-adapters` package** — `ChatAdapter` contract, `ChatTransport` port
      (`openTCP`/`openTLS`/`openWebSocket`), normalized event types, dependency-cruiser rule,
      coverage registration.
- [ ] **XMPP adapter** (`xmpp/`) — XML stream parser (incremental, namespace-aware), SASL
      (`SCRAM-SHA-1/256`, `PLAIN`, `EXTERNAL`), STARTTLS + direct TLS, resource binding, session,
      **XEP-0198** stream management (h-acks, resumption), roster get/push (`jabber:iq:roster`),
      presence (`0012` last-activity optional), `0280` carbons, `0313` MAM (paged history),
      `0085` chat states (typing), `0184` delivery receipts, `0363` HTTP file upload, service
      discovery (`0030`), `0198`-driven reconnect with exponential backoff. Stanza handling is
      **pure** + fixture-tested; only the socket is injected.
- [ ] **desktop `ChatService`** — account CRUD, credential vault resolve (`SecretCrypto`),
      `ChatTransport` over Node `net`/`tls`/WebSocket bound to the profile egress, adapter lifecycle,
      DB writes, redacted Journal events (`ChatAccountAdded`, `ChatMessageSent` — conv-id hash only),
      IPC surface (zod-gated channels + preload bridge).
- [ ] **`background-connection` supervisor integration** — keep-alive, backoff, drop on disable /
      profile switch / kill-switch; per-account state machine pushed to the renderer.
- [ ] **Offline send queue** wired to `chat-core/send-queue`.
- [ ] **Autodiscover** — XMPP `SRV` (`_xmpp-client._tcp`), host-meta for WebSocket/BOSH endpoints,
      manual override.

### Functional DoD
- [ ] A user adds **two** XMPP accounts; both connect, load the roster with presence, exchange 1:1
      messages, and backfill history via MAM.
- [ ] Network drop → XEP-0198 resumption (no missed/duplicated messages); a longer outage →
      clean reconnect + MAM catch-up.
- [ ] Kill-switched profile: accounts show "blocked", no socket opens.
- [ ] XMPP stanza engine meets the `packages/**` coverage floor against fixtures.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.2 — Roster & conversation UI

**Status:** ⬜ Not started · **Depends on:** X-chat.1 · **Branch:** `feat/ext-chat-reader`
**Risk:** medium.

### Deliverables
- [ ] **`@tepegoz/chat-ui`** — conversation list (virtualized, unread/mention badges, account
      grouping + colour), roster panel (presence, groups, add/remove contact, subscription
      requests), account setup flow (fields driven by adapter caps).
- [ ] **Message timeline** — text with linkification (safe — no auto-navigation), reply quoting,
      reactions row, edited/redacted markers, system events, delivery/read state, typing indicator,
      date separators, "jump to unread".
- [ ] **Composer** — text, emoji picker, attachment from the file sandbox (→ `uploadMedia`),
      reply/edit affordances, per-conversation mute, send on Enter / newline on Shift-Enter.
- [ ] **Media rendering** — image/video thumbnails from local (quarantined) parts; click →
      open-into-sandbox; no autoplay; no remote fetch for previews.
- [ ] IPC read channels: conversation list, history page, roster, account live state; write channels
      for send / mark-read / mute (all zod-gated).

### Functional DoD
- [ ] A human holds a real XMPP conversation across two accounts: send/receive, reactions, edits,
      typing, read receipts, an image attachment round-trips through the sandbox.
- [ ] `@tepegoz/chat-ui` component tests; the media path asserts no remote fetch.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.3 — MUC / rooms

**Status:** ⬜ Not started · **Depends on:** X-chat.2 · **Branch:** `feat/ext-chat-muc`
**Risk:** low-medium.

### Deliverables
- [ ] **XMPP MUC (XEP-0045)** — join/leave by JID, nickname, room roster + affiliations/roles,
      subject, invites, kick/ban surfacing (read), history-on-join limit, `0secret`/password rooms.
- [ ] **Room browser** — service discovery of a MUC service's public rooms, search, join-by-address.
- [ ] **UI for rooms** — member list, mention autocomplete, per-room notification level
      (all / mentions / none), topic display, "who's typing" for rooms.
- [ ] **Mention routing** — a room-ping / nick-highlight raises a notification even when the room is
      muted for "all messages".

### Functional DoD
- [ ] Join a public MUC, send/receive, get pinged, leave; notification levels behave.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.4 — IRC adapter

**Status:** ⬜ Not started · **Depends on:** X-chat.1 (contract) + X-chat.2/.3 (UI) ·
**Branch:** `feat/ext-chat-irc-adapter` · **Risk:** low-medium.

### Deliverables
- [ ] **IRC adapter** (`irc/`) — RFC 2812 message parser, connection registration (`PASS`/`NICK`/
      `USER`), SASL (`PLAIN`, `EXTERNAL`), IRCv3 capability negotiation (`server-time`,
      `message-tags`, `account-tag`, `echo-message`, `batch`, `chathistory`, `multi-prefix`,
      `away-notify`, `extended-join`), channel join/part/topic/names, PRIVMSG/NOTICE, CTCP
      (`ACTION`), `chathistory` backfill, NickServ interaction, auto-rejoin on reconnect, ISUPPORT
      parsing (`CHANTYPES`, `PREFIX`, `CASEMAPPING`), flood-protection send queue.
- [ ] **Caps** — `e2ee: false` (protocol has none), `edits: false`, `reactions: false`,
      `receipts: false` unless `message-tags` + a draft spec is present. The UI shows "not
      encrypted" for IRC conversations.
- [ ] Recorded-trace fixture suite.

### Functional DoD
- [ ] Connect to a local IRC server (ergo), join a channel, send/receive, backfill via
      `chathistory`, reconnect + auto-rejoin; the UI correctly shows IRC as unencrypted.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.5 — Matrix adapter

**Status:** ⬜ Not started · **Depends on:** X-chat.1 (contract) + X-chat.2/.3 (UI); E2EE is
X-chat.7 · **Branch:** `feat/chat-matrix-adapter` · **Risk:** medium-high — `/sync` state
management + the media repo.

### Deliverables
- [ ] **Matrix adapter** (`matrix/`) — login (password / token / SSO-token), `/sync` loop with
      `since` token + filters, room state + timeline events, `m.room.message` (text/emote/notice/
      image/file), `m.reaction`, `m.room.redaction`, edits (`m.replace`), threads (`m.thread`),
      read markers + receipts, typing (`m.typing`), presence, `/rooms/{id}/send`, media repo
      upload/download (`mxc://` resolve), spaces (`m.space`), room directory, invites.
- [ ] **Caps** — everything on except E2EE (deferred to X-chat.7); `history-sync: true`.
- [ ] **State resilience** — a dropped `/sync` resumes from the last token; a `M_UNKNOWN_TOKEN`
      forces a clean re-login; gappy sync (`limited: true`) triggers a backfill.
- [ ] Recorded-exchange fixture suite (Synapse shapes).

### Functional DoD
- [ ] A Matrix account adds, syncs rooms + spaces, sends/receives text + media + reactions + edits +
      threads in **unencrypted** rooms, survives a sync drop and a token invalidation.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.6 — Agent capabilities

**Status:** ⬜ Not started · **Depends on:** X-chat.1 + X-chat.2 (+ any of .3/.4/.5 for breadth) ·
**Branch:** `feat/chat-agent-caps` · **Risk:** medium-high — the untrusted-DM + unknown-contact
guards are the sharpest in the whole product.

### Deliverables
- [ ] **`capabilities.ts`** — the tool table above on `defineCapabilities`, ids passing
      `ToolNameSchema`, `dangerClass` per the table, idempotency key on `create_message` /
      `create_room_join`, `aiTask` set.
- [ ] **`ChatCapabilityHost`** in `ChatService` — `wrapUntrustedContent` on every read path
      (bodies, sender display names, room topics); the **unknown-contact gate** (a conversation with
      a non-roster peer is excluded from `chat_get_history` / `chat_list_items` unless the user
      opted that conversation in); media manifest excludes bytes; `chat_get_media` → quarantine →
      sandbox.
- [ ] **`chat_create_message` confirm payload** — target conversation (name + account + kind) +
      rendered body; unattended profile → fail-closed unless sealed-narrowing preapproved that exact
      conversation.
- [ ] **AIAdaptor grouping** — one "Chat" adaptor in Settings (ADR-0023); verify.
- [ ] **Agent-eval scenarios** in `@tepegoz/orchestrator` / `@tepegoz/agent-eval` — (a) summarize a
      room backlog; (b) draft a reply and stop (no send); (c) `chat_create_message` blocked at HITL;
      (d) **an unknown-contact DM is not fed to the model**; (e) **a prompt-injection DM does not
      change agent behaviour**; (f) media → sandbox; (g) no auto-reply loop can be armed.

### Functional DoD
- [ ] The agent can list / read / search / summarize / draft across accounts and protocols;
      **cannot send without the unsuppressible HITL confirm**; unknown-contact messages are withheld
      by default; the injection eval passes (agent resists).
- [ ] Disabling `com.tepegoz.chat` removes every `chat_*` tool from `CapabilityRegistry.list()`.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.7 — E2EE (OMEMO + Olm/Megolm)

**Status:** ⬜ Not started · **Depends on:** X-chat.1 (XMPP) + X-chat.5 (Matrix) ·
**Branch:** `feat/chat-e2ee` · **Risk:** high — cryptographic correctness + key lifecycle + a
whole trust UI.

### Deliverables
- [ ] **OMEMO (XEP-0384) for XMPP** — libsignal-style double ratchet, device list management
      (`0384` PEP nodes), per-device sessions, prekey bundles, message encryption/decryption,
      trust model (BTBV — blind-trust-before-verification, with a manual fingerprint-verify path),
      key material in the vault (`chat_e2ee_sessions` wrapped by `safeStorage`).
- [ ] **Olm / Megolm for Matrix** — account + device keys, one-time keys upload, Olm sessions for
      key sharing, Megolm outbound/inbound group sessions, device verification (emoji SAS + manual),
      cross-signing consumption (trust a user via their SSK), key backup decisions (opt-in server
      backup vs local-only), "unable to decrypt" states + key re-request.
- [ ] **UI** — per-conversation encryption indicator, device list + verification flow, a clear
      "this device is not verified" state, fingerprint display.
- [ ] **Redaction proofs** — a property test: no identity key, session key, or plaintext is ever
      written to `events`, logs, or an unencrypted DB column.

### Functional DoD
- [ ] Two Tepegöz instances (or Tepegöz ↔ a reference client) hold an OMEMO conversation and a
      Megolm conversation; new-device handling and verification work; a lost session recovers.
- [ ] The redaction property test passes.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.8 — Bridge framework (out-of-process)

**Status:** ⏸ Blocked on the shared prerequisite (generalise `manifest.mcpServer` into a subprocess
adapter contract) · **Depends on:** X-chat.1 · **Branch:** `feat/chat-bridge-framework`
**Risk:** high — this is a new trust surface; the isolation has to be real.

### Deliverables
- [ ] **Subprocess adapter contract** — the `ChatAdapter` methods exposed over a typed RPC to a
      child process; lifecycle (spawn / health-check / restart-with-backoff / kill), a manifest shape
      declaring the bridge's protocol + required tokens + declared egress hosts.
- [ ] **Isolation** — the child runs with: no filesystem access beyond `Bridges/<id>/state/`, its
      own Phase 5 egress binding (a bridge cannot bypass the profile's kill-switch), no host RPC
      beyond the adapter methods, a wall-clock + memory budget, crash isolation (a bridge crash
      surfaces as that account going `error`, nothing else).
- [ ] **Result re-validation** — every event the child emits is `safeParse`d against the normalized
      `ChatEvent` schema in the parent before it touches `chat-core`.
- [ ] **Supervisor** in `ChatService` — treats bridge accounts like native ones for the UI + agent,
      routes through the child for I/O.
- [ ] **Packaging** — a bridge is a signed package ([Phase 3](../product/phase-3-backend-cloud-extensions.md)
      supply-chain gate), never bundled with the app.

### Functional DoD
- [ ] A trivial "echo" bridge runs as a child, its events are re-validated, killing it fails only its
      account, and it cannot read outside its state dir or egress off the profile binding (tested).
- [ ] Sub-phase DoD template ✔.

---

## X-chat.9 — First bridges (Telegram, Slack, Discord; WhatsApp caveated)

**Status:** ⏸ After X-chat.8 · **Depends on:** X-chat.8 · **Branch:** `feat/chat-bridge-telegram`
(etc.) · **Risk:** medium — third-party API churn + ToS.

### Deliverables
- [ ] **`bridge:telegram`** — a vetted MTProto client lib (or Bot API for the bot-only case); login
      (phone + code + 2FA, or bot token), chats/channels/groups, messages + media, edits, reactions,
      read state. Tokens in the vault. Rate-limit handling. ToS note in the adapter caps + setup UI.
- [ ] **`bridge:slack`** — Web API + Socket Mode (or RTM), user or bot token, channels/DMs/threads,
      reactions, files. Workspace-scoped.
- [ ] **`bridge:discord`** — official API + gateway, guild channels + DMs, threads, reactions,
      attachments. Bot or (discouraged, ToS-risky) user token — user token behind the same
      acknowledgement screen as WhatsApp.
- [ ] **`bridge:whatsapp`** — behind an explicit risk-acknowledgement screen; **never bundled**;
      documented as unsupported / at-own-risk (no official third-party API exists). Implementation is
      either a thin client over a user-run `mautrix-whatsapp` (preferred — then it is really just the
      Matrix adapter) or an unofficial web-client lib (higher ban risk).

### Functional DoD
- [ ] Telegram + one of Slack/Discord run as sandboxed bridges: send/receive/media/reactions, tokens
      vaulted, a crash isolated to that account.
- [ ] WhatsApp path is reachable only after the acknowledgement, and the recommended route documents
      the Matrix-bridge option first.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.10 — Hardening, sandbox tests, e2e

**Status:** ⬜ Not started · **Depends on:** X-chat.2–.7 · **Branch:** `feat/chat-hardening`
**Risk:** low — mostly tests.

### Deliverables
- [ ] **Adapter-event fuzz / zod-rejection tests** — malformed XMPP stanza, Matrix sync event, IRC
      line, and bridge payload all rejected cleanly (no throw past the boundary, no state
      corruption).
- [ ] **Bridge sandbox tests** — no FS escape, no cross-account reach, crash isolation, egress
      binding enforced, RPC surface minimal.
- [ ] **Journal redaction property test** — no plaintext, credential, or key material in `events`.
- [ ] **Kill-switch + profile-switch tests** — bound-blocked profile denies agent chat tools; a
      profile switch drops every connection (native + bridge) and the next profile sees only its own
      accounts.
- [ ] **Playwright `_electron` e2e** — against a local Prosody (XMPP) + ergo (IRC), and a local
      Synapse (Matrix) if CI budget allows: add account → roster → 1:1 send/receive → join a room →
      get pinged. A second e2e for the agent path (summarize → draft → HITL-stop → unknown-DM
      withheld).
- [ ] **Perf pass** — a 20k-message room: timeline virtualization, search latency, `/sync` memory
      ceiling.

### Functional DoD
- [ ] Every trust claim in "Trust & security" above has a test that fails if the property regresses.
- [ ] Both e2e flows green in CI.
- [ ] Sub-phase DoD template ✔.

---

## Later / demand-gated (not sub-phases — promote on pull)

- **Signal** — via `signald` / libsignal as an out-of-process bridge (its own registration + safety
  numbers).
- **Voice / video** — XMPP Jingle, Matrix VoIP, WebRTC plumbing; a large separate surface.
- **A shared `@tepegoz/contacts` address book** — unify ext-chat's roster with ext-mail's
  autocomplete (CardDAV backing).
- **Rich presence / custom statuses, per-contact notification rules, do-not-disturb schedules.**
- **Server-side search** where a protocol offers it (Matrix `/search`, XMPP MAM full-text).
- **Message translation** — reuse `@tepegoz/ext-translate` on an inbound message (opt-in, per
  conversation).
- **Stickers / GIF pickers, message pinning, polls (Matrix), scheduled send.**
- **Multi-device Matrix key-backup UX, secure-storage / 4S recovery.**

---

## Appendix A — `@tepegoz/shared-types` model sketch

Multi-account + multi-protocol is structural: nothing is addressable without `accountId`, and every
protocol difference is a `ChatAdapterCaps` flag, never a special case in the core.

```ts
ChatAccountIdSchema        // lowercase dash slug, ≤64
CHAT_PROTOCOLS             = ['xmpp','irc','matrix','bridge']    // 'bridge' + bridgeId for out-of-process
ChatServerConfigSchema     = discriminatedUnion('protocol', [
  { protocol:'xmpp',   jid, host?, port?, security:'tls'|'starttls', wsUrl? },
  { protocol:'irc',    server, port, tls:boolean, nick, sasl:boolean },
  { protocol:'matrix', homeserverUrl, userId },
  { protocol:'bridge', bridgeId, config:Record<string,string> },  // opaque to the core
])
ChatAdapterCapsSchema      = { receipts, typing, edits, reactions, threads, e2ee, media, presence,
                               historySync, rooms }               // all boolean
ChatAccountSchema          = { id, label, protocol, displayName, server:ChatServerConfig, secretRef,
                               color|null, order, updatedAt, version }
ChatContactSchema          = { id, accountId, address, name, groups[], presence:'online'|'away'|'dnd'|'offline',
                               statusText, subscription:'none'|'to'|'from'|'both' }
CHAT_CONV_KINDS            = ['dm','room']
ChatConversationSchema     = { id, accountId, kind, address, name, topic, memberCount, unread, mentions,
                               lastReadId|null, muted, isKnownContact }   // isKnownContact gates the agent
CHAT_MESSAGE_KINDS         = ['text','media','system','call']
ChatMessageSchema          = { id, conversationId, accountId, protocolId, senderAddress, senderName,
                               kind, body, mediaRef|null, replyToId|null, reactions:{emoji,count,me}[],
                               editedAt|null, redacted, originTs, receivedAt, deliveryState }
ChatReceiptSchema          = { conversationId, messageId, byAddress, kind:'delivered'|'read', ts }
ChatEventSchema            = discriminatedUnion('type', [
  message | message-edit | message-redact | receipt | typing | presence |
  room-membership | roster-change | error ])
ChatQuerySchema            = { text?, accountId?, conversationId?, senderAddress?, since?, before?,
                               limit=50, offset=0 }
```

## Appendix B — `ChatStore` schema sketch (X-chat.1 migration)

```sql
CREATE TABLE chat_accounts ( id TEXT PRIMARY KEY, label TEXT NOT NULL, protocol TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '', server_json TEXT NOT NULL, secret_ref TEXT NOT NULL,
  color TEXT, "order" INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, tombstone INTEGER NOT NULL DEFAULT 0 );
CREATE TABLE chat_contacts ( id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES chat_accounts(id) ON DELETE CASCADE,
  address TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', groups_json TEXT NOT NULL DEFAULT '[]',
  presence TEXT NOT NULL DEFAULT 'offline', status_text TEXT NOT NULL DEFAULT '',
  subscription TEXT NOT NULL DEFAULT 'none', UNIQUE (account_id, address) );
CREATE TABLE chat_conversations ( id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES chat_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, address TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', topic TEXT NOT NULL DEFAULT '',
  member_count INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0, mentions INTEGER NOT NULL DEFAULT 0,
  last_read_id TEXT, muted INTEGER NOT NULL DEFAULT 0, is_known_contact INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, UNIQUE (account_id, address) );
CREATE INDEX idx_chat_conv_recent ON chat_conversations (account_id, updated_at DESC);
CREATE TABLE chat_messages ( id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL, protocol_id TEXT NOT NULL, sender_address TEXT NOT NULL, sender_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'text', body TEXT NOT NULL DEFAULT '', body_fold TEXT NOT NULL DEFAULT '',
  media_ref TEXT, reply_to_id TEXT, reactions_json TEXT NOT NULL DEFAULT '[]',
  edited_at INTEGER, redacted INTEGER NOT NULL DEFAULT 0, origin_ts INTEGER NOT NULL, received_at INTEGER NOT NULL,
  delivery_state TEXT NOT NULL DEFAULT 'delivered', UNIQUE (conversation_id, protocol_id) );
CREATE INDEX idx_chat_messages_conv ON chat_messages (conversation_id, origin_ts DESC);
CREATE TABLE chat_attachments ( id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0, blob_ref TEXT, quarantine TEXT NOT NULL DEFAULT 'pending' );
CREATE TABLE chat_receipts ( conversation_id TEXT NOT NULL, message_id TEXT NOT NULL, by_address TEXT NOT NULL,
  kind TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (conversation_id, message_id, by_address, kind) );
CREATE TABLE chat_e2ee_sessions ( account_id TEXT NOT NULL, peer TEXT NOT NULL, device TEXT NOT NULL,
  wrapped_blob TEXT NOT NULL,          -- safeStorage-wrapped; never plaintext
  trust TEXT NOT NULL DEFAULT 'untrusted', updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, peer, device) );
CREATE TABLE chat_send_queue ( id TEXT PRIMARY KEY, account_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
  body_json TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE VIRTUAL TABLE chat_search USING fts5 ( message_id UNINDEXED, body, sender,
  tokenize = 'unicode61 remove_diacritics 2' );
```

## Cross-cutting (as in every phase)

i18n en+tr for all new surfaces · zod `safeParse` at every new IPC / adapter-event / tool boundary ·
every agent-callable capability behind the ToolGateway PEP · `AppError` contract · determinism-first
(model only for summarize/draft/classify) · secrets + E2EE keys in the vault, redacted from the
Journal · egress bound, kill-switch aware · per-profile isolation · bridges out-of-process and
sandboxed · coverage gate · migration-safe DB · **NO AI attribution trailer**.
