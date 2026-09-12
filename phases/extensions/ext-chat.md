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

**Status:** ✅ Done (2026-09-11) — every deliverable + the Functional DoD verified. `@tepegoz/chat-core`
is **13 test files / 128 tests**, coverage **S98.19 / B92.52 / F100 / L98.19** — clear of the
`packages/**` floor (S80/B85/F86/L80). `@tepegoz/shared-types` `chat.ts` + `chat.test.ts` registered
(part of the 263-test shared-types suite). `dependency-cruiser` `chat-core-no-app-no-electron` rule +
`docs/package-map.md` row present. The DoD-template rows that touch a surface / the DB / a live server
are **N/A for a pure lib** (no `src/i18n/`, no migration, no e2e — the migration is X-chat.1, the
surfaces are X-chat.2). · **Branch:** `feat/ext-chat-core` → `main`
**Risk:** medium — the cross-protocol normaliser is the design's keystone; getting the event union
wrong is expensive later.

### Deliverables
- [x] **Domain schemas** in `@tepegoz/shared-types` (`chat.ts`, appendix): `ChatAccount`
      (multi-account, per-protocol `ChatServerConfig` discriminated union, `secretRef`),
      `ChatContact`, `ChatConversation` (`kind: 'dm' | 'room'`), `ChatMessage` (text / media /
      system / edit / redaction, reply-to, reactions), `ChatPresence`, `ChatReceipt`, `ChatAdapterCaps`,
      `ChatQuery`. Registered + a `chat.test.ts`.
- [x] **`@tepegoz/chat-core` package** — scaffold, `pnpm-workspace` (globbed), coverage `include`,
      `dependency-cruiser` (`chat-core-no-app-no-electron`), `docs/package-map.md`.
- [x] **The event normaliser** (`normalize.ts`) — every adapter emits a `RawAdapterEvent`; this maps
      it to the `ChatEvent` union (`message` / `message-edit` / `message-redact` / `receipt` /
      `typing` / `presence` / `room-membership` / `roster-change` / `error`). Capability-gated fields
      (edits, reactions, threads) are dropped (not faked) when the adapter's caps say the protocol
      lacks them.
- [x] **Conversation model** (`conversation.ts`) — merge an incoming event into local state:
      dedup by protocol message id, optimistic-echo reconciliation (local temp id → server id),
      ordering by `(origin-ts, arrival-seq)`, unread/mention counting, last-read watermark.
- [x] **Offline send queue** (`send-queue.ts`) — pure: enqueue an `OutgoingMessage`, mark
      sending/sent/failed, idempotent replay key, backoff schedule; the host drives it.
- [x] **Mention / highlight parsing** (`mentions.ts`) — nick highlighting (IRC), `@`-mentions
      (Matrix/XMPP), room-ping detection; used for notification routing.
- [x] **History search fold** (`search-fold.ts`) — reuse the Turkish-aware fold; FTS writer + query.
- [x] **Address parsing** (`address.ts`) — JID (`node@domain/resource`), IRC (`nick!user@host`),
      Matrix (`@user:server`, `#room:server`, `!roomid:server`) parse + format.

### Functional DoD
- [x] A recorded stream of mixed events (out-of-order delivery, an edit before its original, a
      redaction, a duplicate) folds into the correct final conversation state (golden test —
      `conversation.test.ts` "same final state regardless of event order", dedup, redaction, ordering;
      `account-state.test.ts` golden mixed stream).
- [x] Capability gating: an "edit" event from an adapter whose caps lack `edits` is dropped, not
      applied as a new message (`normalize.test.ts` "gates out an edit when the adapter has no edits
      capability" + the reaction / room-topic / rooms gates).
- [x] `@tepegoz/chat-core` meets the `packages/**` coverage floor (98.19 / 92.52 / 100 / 98.19).
- [x] Sub-phase DoD template ✔ (surface / DB / live-server rows N/A for a pure lib).

---

## X-chat.1 — XMPP adapter + connection spine

**Status:** 🟢 Code-complete (2026-09-09) — the full stack is landed on `main`; only the runtime DoD
(two live accounts, XEP-0198 resumption, kill-switch behaviour) and the DoD-template close-out remain,
and those need a real server to exercise. **The renderer has no chat UI yet — that is X-chat.2.**
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

**The desktop host** — landed in `apps/desktop/src/main/chat/`:
- `egress-dialer.ts` — `NodeTransportPorts.dial`: direct route → `net.connect`; tunnel route →
  loopback SOCKS port + `@tepegoz/socks5` CONNECT; bound-but-down → fail-closed 503.
- `account-runner.ts` — `ChatAccountRunner`: one account's `ChatConnectionManager` + `ChatAccountState`
  + `ChatStore` glue; `sendMessage` (optimistic echo → reconcile), `setPresence`, `markRead`,
  `history` (MAM), `roster`; per-protocol self identity.
- `chat-service.ts` — `ChatService`: the runner map + the lifecycle that gates it (extension enabled ·
  profile in force · Phase-5 kill switch fans out to every runner); `addAccount` / `removeAccount` /
  `setEnabled` / `stop`; delegates the actions; default adapter = `XmppAdapter` for xmpp.
- `chat-secrets.electron.ts` — `safeStorage`-backed `ChatSecretStore` (encrypted files under
  `userData/chat/`, refuses to write when the keychain is unavailable — mirrors `vpn-secrets`).
- `chat-store-adapter.ts` — `makeRunnerStore` / account projections over the `Db`.
- `chat-service.electron.ts` — the process singleton: composes `ChatService` with the real store,
  secrets, `currentEgressRoute` kill-switch, a `NodeChatTransport` on the egress-dialer, and the
  prefs-driven enabled check; exposes `chatIpcService` (the `ChatIpcService` impl) + a `ChatMessenger`
  facade (`init`/`stop`/`reconcile`/`notifyEgressChange`).

Also landed: `@tepegoz/desktop-ipc` `chat:*` channels + `schemas-chat.ts` (renderer→main payload
guards); `main/ipc/ipc-chat.ts` — the nine `chat:*` handlers over an injected `ChatIpcService`;
**bootstrap** — `registerChatIpc(chatIpcService)` in the IPC facade, `ChatMessenger.init()` in deferred
init (off in safe mode), `.stop()` in `before-quit`, `.reconcile()` on the extension toggle,
`.notifyEgressChange()` from `broadcastNetworkState`; and the **preload bridge** —
`@tepegoz/desktop-ipc` `ChatApi` + `apps/desktop/src/preload/api-chat.ts` (`window.tepegoz` chat.*
methods + the `chat:state` subscription).

**Remaining:** the runtime Functional DoD below (needs a live XMPP server) and the DoD-template
close-out. · **Branch:** `main` · **Risk:** low.

### Deliverables
- [x] **`extensions/ext-chat` scaffold** — manifest (`com.tepegoz.chat`, surfaces `sidebar`+`page`,
      permissions `accounts`/`background-connection`/`notifications`/`contacts`), `src/i18n/`,
      catalog pickup, surface-loader thunk.
- [x] **`ChatStore` + migration** (appendix): `chat_accounts`, `chat_contacts`,
      `chat_conversations`, `chat_messages`, `chat_attachments`, `chat_receipts`,
      `chat_e2ee_sessions` (wrapped blobs), `chat_send_queue`, `chat_search` (FTS5). Sync-meta on
      `chat_accounts`.
- [x] **`@tepegoz/chat-adapters` package** — `ChatAdapter` contract, `ChatTransport` port
      (`openTCP`/`openTLS`/`openWebSocket`), normalized event types, dependency-cruiser rule,
      coverage registration.
- [x] **XMPP adapter** (`xmpp/`) — XML stream parser (incremental, namespace-aware), SASL
      (`SCRAM-SHA-1/256`, `PLAIN`, `EXTERNAL`), STARTTLS + direct TLS, resource binding, session,
      **XEP-0198** stream management (h-acks, resumption), roster get/push (`jabber:iq:roster`),
      presence (`0012` last-activity optional), `0280` carbons, `0313` MAM (paged history),
      `0085` chat states (typing), `0184` delivery receipts, service discovery (`0030`),
      `0198`-driven reconnect with exponential backoff. Stanza handling is **pure** + fixture-tested;
      only the socket is injected. **`0363` HTTP file upload was never built** — found 2026-09-12
      while scoping a live media-round-trip e2e (this line used to list it as shipped alongside
      everything else here, which was doc-drift, not a checked fact: `XmppAdapter.sendMessage`
      (`xmpp/adapter.ts`) never reads `OutgoingMessage.mediaPath`, `stanzas.ts`'s `buildMessage` has
      no media field, and `XmppAdapter` defines no `resolveMedia` at all — Matrix is the only adapter
      that does). `Composer.tsx` also has no attach affordance yet — `mediaPath` is hardcoded `null`
      in `useChatState.send`. Three prerequisites for X-chat.2's media-round-trip Functional DoD line,
      none started: a Composer attach control, XEP-0363 upload, `XmppAdapter.resolveMedia`.
- [x] **desktop `ChatService`** — account CRUD, credential vault resolve (`safeStorage`),
      `ChatTransport` over Node `net`/`tls`/WebSocket bound to the profile egress, adapter lifecycle,
      DB writes, IPC surface (zod-gated channels + preload bridge).
      Redacted Journal events landed 2026-09-10: `ChatMessageSent` (a truncated SHA-256 of the
      conversation id + account + protocol id + ts — no body / sender / room / secret) on every send,
      `ChatAccountAdded` (account + protocol) on add; `EventJournal.append(..., redacted: true)`,
      journal failure can never break a send.
- [x] **`background-connection` supervisor integration** — keep-alive, backoff, drop on disable /
      profile switch / kill-switch; per-account state machine pushed to the renderer.
- [x] **Offline send queue** wired to `chat-core/send-queue`.
- [x] **Autodiscover** — XMPP `SRV` (`_xmpp-client._tcp`), host-meta for WebSocket/BOSH endpoints,
      manual override.

### Functional DoD
- [~] A user adds **two** XMPP accounts; both connect, load the roster with presence, exchange 1:1
      messages, and backfill history via MAM. **Connect + message exchange + MAM backfill verified
      live (2026-09-12)** against a real, unprivileged local Prosody (no root, no Docker — an
      `apt-get download` + `dpkg -x` user-space install, see the IRC note below for the same
      technique): two accounts (`alice@localhost`/`bob@localhost`) connect over STARTTLS + SASL
      PLAIN, exchange a 1:1 message, and a reconnect's MAM query actually returns it. Unlike the IRC
      run this one found no adapter bug — a useful negative result. Kept as a permanent opt-in
      regression check: `packages/chat-transport-node/src/xmpp-live-prosody.manual.test.ts`, gated
      behind `TEPEGOZ_LIVE_XMPP=1`. **Still open:** roster-with-presence wasn't exercised (the test
      only proved messaging + MAM), and this is still the adapter directly, not the desktop app —
      the Playwright `_electron` e2e (X-chat.10) is what closes the rest of this bullet.
- [ ] Network drop → XEP-0198 resumption (no missed/duplicated messages); a longer outage →
      clean reconnect + MAM catch-up.
- [ ] Kill-switched profile: accounts show "blocked", no socket opens.
- [ ] XMPP stanza engine meets the `packages/**` coverage floor against fixtures.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.2 — Roster & conversation UI

**Status:** 🟢 Code-complete (2026-09-09) — `@tepegoz/chat-ui` built (incl. safe media rendering) and
wired into `extensions/ext-chat`; only the runtime Functional DoD + the desktop `resolveMedia` bridge
method (X-chat.1 follow-up) remain. `@tepegoz/chat-ui` scaffolded
(en/tr dict + parity test, leaf dep-cruiser rule, coverage registration). Landed: `linkifySegments`
(safe — only `http(s)` becomes a link, never auto-navigated / fetched), `groupByDay` +
`daySeparatorLabel` (timeline day buckets), `presenceMeta` + `<PresenceBadge>`, and the
**conversation list** — `sortConversations` (recency, id-tiebroken) / `groupConversationsByAccount`
(account order, trailing unknown bucket) / `conversationTitle` + `<ConversationList>` (recency-first,
per-account grouping when >1 account, unread/mention badges capped at 99+, DM presence dots, muted
marker); and the **message timeline** — `buildTimeline` (day separators, one "new messages" divider
positioned from `lastReadId`, consecutive same-sender grouping with a time window, system messages
never grouped) + `<MessageTimeline>` (linkified body — links routed through an `onOpenLink` callback,
never auto-navigated, inert text without one; redacted placeholder; edited marker; reactions row;
own-message delivery state); and the **composer** — `composer-draft` (`isSendKey` — plain Enter sends,
Shift/Alt/Ctrl/Meta-Enter and Enter-during-IME newline; `draftToBody` trim/reject-empty; `canSend` /
`isOverLimit` / `remainingChars` against `CHAT_MESSAGE_BODY_MAX`) + `<Composer>` (auto-growing
textarea, Enter-to-send, reply / edit context banners with cancel-on-✕-or-Escape, live char countdown
near the limit, over-limit block + error); and the **account setup form** — `account-form`
(`deriveAccountId` label→slug matching `CHAT_ACCOUNT_ID_PATTERN`, `validateXmppAccountForm` — field
checks then a `ChatAccountSchema` safeParse backstop, produces a persist-ready draft + the plaintext
secret that crosses once) + `<AccountSetupForm>` (label / JID / password, collapsible connection
settings for host / port / STARTTLS-vs-TLS / WebSocket URL, per-field `role="alert"` errors, busy
lock; XMPP-only for now); and the **roster panel** — `roster` (`groupRoster` — a contact in each of
its groups, named groups Turkish-sorted, ungrouped bucket last; within a group connected-first by
presence rank then `turkishCompare`; `filterRoster` fold-matches name/address) + `<RosterPanel>`
(grouped list with per-group online count, presence dots, `search` box + no-match line, add-contact
row, per-row remove, `from`-subscription "awaiting response" marker); and the **renderer state
reducer** — `chat-store` (`ChatClientState` = conversations / roster / windowed messages / typing;
`seedConversations` / `seedRoster` / `seedHistory` from the IPC reads; `applyChatChange` folds a
main-pushed `ChatStateChange` — message upsert+dedup, edit/redact, unread-count patch, roster
add/remove, presence-by-address, idempotent typing sets — immutably, same-ref on no-op).
and the **`useChatState` hook** — binds a `ChatClientPort` (the bridge, or a fake) to a live view:
accounts (order-sorted) + per-account `ChatConnState`, the active account's conversations
(recency-sorted), lazy per-conversation history load + auto mark-read on open, `chat:state`
subscription for the hook's lifetime, `send()` / `setActiveAccount()` / `refresh()`. Port shapes
(`ChatClientPort`, `ChatStateEvent`, `ChatAccountsSnapshot`) are defined in `chat-ui` itself
(structurally mirroring `@tepegoz/desktop-ipc`'s `ChatApi`) so the leaf takes no IPC-contract
dependency; and **`<ChatWorkspace>`** — the whole surface composed over `useChatState`: account
switcher (>1 account), a chats / contacts left column, and the open conversation (title + typing
indicator + `<MessageTimeline>` + `<Composer>`); no-account state invites adding one. Presentational
glue — every effect goes through the injected port. **113 tests, S99.8/B93.8/F95.6/L99.8.**

**Wired in (2026-09-09):** `extensions/ext-chat`'s sidebar + page now render `<ChatWorkspace>` over
the host bridge (the old "coming soon" surfaces are gone); the add-account flow swaps in
`<AccountSetupForm>` and hands the completed row + plaintext secret to `addChatAccount` once.
`window.tepegoz` (already carrying `ChatApi` from X-chat.1) satisfies `ChatClientPort` structurally,
so the desktop adapter is a pass-through — `apps/desktop` typecheck holds (still only the 2
pre-existing unrelated errors). ext-chat: 4 panel tests.

**Modern-messenger pass (2026-09-11):** `chat-ui.css` reworked from the Pidgin-plain two-pane into a
contemporary IM skin — a new `<Avatar>` (deterministic-hue disc, initials drawn by the stylesheet so
no `textContent` leak) in the conversation list / roster / room + member list / DM & room headers with
the presence dot ringed on its corner; tailed elevated bubbles with an own-message accent gradient;
sticky rounded day chips; pill account switcher / tab bar / composer (focus ring, rounded send);
thin themed scrollbars. **Theme-robust:** accent tints are `color-mix`-derived from `--cu-primary` +
the surface (the app leaves `--primary-subtle` unset under a custom theme colour, where the old code
fell back to the fixed brand cyan and washed everything monochrome); the canvas is a gentle step off
the base surface, panels separate by border/elevation. **Buddy-list header:** the left column has a
permanent "Chat" title + a gear button (inline SVG, no icon dep) that opens account management even
with zero accounts; the no-account notice is a compact inline hint. **Narrow surface:** a `@container`
query collapses the two-pane layout to one column with a back button in the sidebar dock.
Then (2026-09-12) a **live-found race fix** — `chat-store`'s message-append fold only tracks a
conversation once its window is seeded (`state.messages[id] !== undefined`, a deliberate bound so an
unopened conversation isn't tracked forever), but `useChatState.selectConversation` only seeded the
window *after* its `getChatHistory` call resolved. A message arriving in that gap — the server's echo
of one you just sent, most reliably — was silently dropped from the timeline (the unread badge still
bumped, since that fold path is unconditional, so the only symptom was a message that never
rendered). Fixed by seeding the window with `[]` synchronously before the fetch starts;
`seedHistory`'s existing merge-by-`protocolId` combines the eventual real page with whatever arrived
in between instead of clobbering it. Found by the same live Playwright e2e that found X-chat.3's
groupchat bug — this was the second half of why the e2e's sent message never appeared.

Then (2026-09-12) **add/remove-contact wired end-to-end.** `RosterPanel`'s `onAddContact` /
`onRemoveContact` had existed since it was built, with their own component tests, but nothing above
them ever called a real adapter — this doc previously listed "add/remove contact" as an already-shipped
`@tepegoz/chat-ui` deliverable on the strength of that leaf-level UI alone. Closed as two matching
vertical slices: `ChatAdapter.addContact?`/`removeContact?` (XMPP: RFC 6121 §2.3.1 roster-add + a
presence `subscribe`, ordered so a failed add never leaves a dangling subscription; §2.5.2 roster-remove
is one `iq set` with `subscription="remove"` that also cancels any existing subscription, no second
stanza needed) → `ChatAccountRunner` (throws for protocols with no roster concept, e.g. IRC/Matrix) →
`ChatService` → zod-gated `chat:add-contact` / `chat:remove-contact` IPC → preload → `ChatClientPort` →
`useChatState` (`null` when the port/protocol doesn't support it) → `ChatWorkspace`'s `<RosterPanel>`.
Extending `e2e/chat-live-xmpp.spec.ts` with a live add/remove-contact round trip against Prosody found
an **eighth** real bug the same day: `addContact`/`removeContact` silently produced no `roster-change`
event on a session that hadn't called `roster()` first, because RFC 6121 §2.1 only pushes roster
changes live to a resource that has requested its roster at least once ("interested resource") —
confirmed at the wire level in `xmpp-live-prosody.manual.test.ts` (no `roster()` call ⇒ Prosody acks the
add with an empty `<iq type="result"/>` and nothing else; add `roster()` first ⇒ the expected push
arrives). Fixed by having `addContact`/`removeContact` call `roster()` themselves the first time a
session needs it, instead of depending on some earlier caller having done so — see
`XmppSession.rosterInterested` / `ensureRosterInterest`.

**Remaining:** the runtime Functional DoD (media round-trip needs a live account). · **Depends on:**
X-chat.1 · **Branch:** `main` · **Risk:** low.

### Deliverables
- [x] **`@tepegoz/chat-ui`** — conversation list (unread/mention badges, account grouping + colour),
      roster panel (presence, groups, add/remove contact — wired to a real adapter 2026-09-12, XMPP
      only, see below — `from`-subscription pending marker), account
      setup flow (XMPP fields **+ IRC + Matrix, closed 2026-09-12** — `AccountFormState` became a
      protocol-tagged superset, `validateIrcAccountForm` / `validateMatrixAccountForm` joined
      `validateXmppAccountForm`, `<AccountSetupForm>` grew a Protocol selector switching the rendered
      field set. Found and closed while writing X-chat.10's live e2e, which had needed the XMPP-only
      fallback for exactly this gap). The **message timeline
      is windowed** (`buildTimeline` `maxMessages`, default `TIMELINE_WINDOW` = 200) — a very long room
      keeps only the most-recent N in the DOM behind one "N earlier messages not shown" row, with the
      day separators and the "new messages" divider recomputed against the visible slice. _Conversation
      list virtualization: still a later windowing pass._
- [x] **Message timeline** — linkified text (safe — no auto-navigation), reactions row,
      edited/redacted markers, system events, delivery/read state, typing indicator, date separators,
      "new messages" divider, **reply quoting** (a one-line preview of the replied-to original when it
      is in the loaded window; an optional `onJumpToMessage` makes it a jump button). _Full
      "jump to unread" auto-scroll still deferred — `onJumpToMessage` is the seam for it._
- [x] **Composer** — text, attachment hook (`OutgoingMessage.mediaPath`), reply/edit affordances,
      send on Enter / newline on Shift-Enter. _Emoji picker: deferred._ Per-conversation mute landed
      2026-09-10 — a header toggle (DM + room), `useChatState.setMuted` (optimistic
      `patchConversation` + `chat:set-muted` bridge), `ChatSetMutedSchema`, `ChatService.setMuted`.
- [x] **Media rendering** — `<MessageMedia>` loads strictly through an injected `resolveMedia` (host
      reads the quarantined part); inline image / `controls`-no-autoplay video / audio, click-to-open
      chip otherwise; `isSafeMediaResource` rejects any URL that is not `blob:` / `data:` so a preview
      can never become a beacon. Wired through `<MessageTimeline>` + `<ChatWorkspace>` (optional prop;
      the desktop `resolveMedia` bridge method is X-chat.1 follow-up work). _No remote fetch — tested._
- [x] IPC read channels: conversation list, history page, roster, account live state; write channels
      for send / mark-read / **mute** (`chat:set-muted`, all zod-gated).

### Functional DoD
- [ ] A human holds a real XMPP conversation across two accounts: send/receive, reactions, edits,
      typing, read receipts, an image attachment round-trips through the sandbox.
- [x] `@tepegoz/chat-ui` component tests (125); the media path asserts no remote fetch
      (`MessageMedia` / `MessageTimeline` tests).
- [ ] Sub-phase DoD template ✔.

---

## X-chat.3 — MUC / rooms

**Status:** 🟡 In progress (2026-09-09) — `@tepegoz/chat-adapters` `xmpp/muc.ts` landed: the pure
XEP-0045 primitives — `buildMucJoin` (nick + password + history control), `buildMucLeave`,
`buildMucChangeSubject`, `buildMucInvite`; `parseMucPresence` → `MucOccupant` (nick from the resource,
affiliation/role, real JID when non-anonymous, self from status 110, raw status codes),
`parseMucSubject` (topic vs message), `parseMucError` (wrong-password / banned / nick-conflict /
… classification). Then `@tepegoz/chat-core` `room.ts` — `RoomView` (joined / selfNick / subject /
occupants-by-nick) with `applyOccupant` (offline removes; status-110 self sets selfNick + joined,
self-offline marks left), `applySubject`, `leaveRoom`, `occupantList` (role rank then
`turkishCompare`). Then the **room UI** in `@tepegoz/chat-ui` — `mention-autocomplete`
(`findMentionQuery` locates the `@token` under the caret at a word boundary; `rankMentionCandidates`
fold-aware, exact-prefix first; `applyMention` splices `@nick `) + `<RoomMemberList>` (role-ranked
occupants with a count, presence dots, owner / admin / mod badges, click-to-pick). **35 tests,
S99.8/B94/F96/L99.8.** Then `@tepegoz/chat-adapters` `xmpp/disco.ts` — XEP-0030: `buildDiscoItems` /
`buildDiscoInfo` requests, `parseDiscoItems` (a MUC service's advertised room list),
`parseDiscoInfo` (identities + features + the XEP-0045 `muc#roominfo` extras — occupant count,
password / members-only / hidden flags, description — recognising a room by the `muc` feature or a
`conference/text` identity). 7 tests. Then `@tepegoz/chat-core` `notify.ts` — `decideNotification`:
own echo → silent; **a direct nick mention always notifies (even muted, even "mentions", even
"none")** — `isMention` was split so `isDirectMention` excludes the room ping; a room-wide ping
notifies at "all" / "mentions" but respects "none"; a plain room message follows level then the mute
flag; a DM notifies unless muted. 8 tests. Then **`XmppAdapter` MUC wiring** — `joinRoom` (writes a
XEP-0045 join with our nick + `<history maxstanzas="30"/>`, returns a room `ChatConversation`),
`leaveRoom` (unavailable presence, forgets the room); `handleLiveElement` now routes a **joined**
room's `<presence>` through `handleRoomPresence` → a `room-membership` event (tracking the occupant
nick set / count) or a conversation-scoped `error` event — a room we have not joined still falls
through to a normal `presence`, and an unmodelled room presence is swallowed rather than leaking a
JID. **6 adapter tests (27 total).** Then **downstream consumption** — `room-membership` gained
`self` / `affiliation` / `role` / `realJid` in `@tepegoz/shared-types` (additive, defaulted);
`normalizeEvent` capability-gates it on `rooms`; `ChatAccountState.applyRoomMembership` folds it into a
per-conversation `RoomView` (via `chat-core` `applyOccupant`) and emits a new `{ kind: 'room' }`
`ChatStateChange`, also exposed via `roomView(id)`; `chat-ui`'s `chat-store` reducer keeps
`state.rooms` by conversation id; the desktop `account-runner` passes the change straight to the
renderer (no room table yet). Then the **room-browser UI** — `room-browser` (`RoomListing`,
`filterRoomListings` fold-match on jid/name/description, `sortRoomListings` most-populated-first,
`roomListingLabel`) + `<RoomBrowser>` (a service field → `discoverRooms` callback, a filterable list
with occupant counts + password / members-only flags + description, and a "join by address" field).
**43 tests, S99.6/B93.4/F95.7/L99.6.** Then **`XmppAdapter.discoverRooms`** — `disco#items` for the
service's room list (capped at 80), then a bounded parallel `disco#info` per room for occupant count /
flags / description; a room whose info errors still lists with defaults. Added `RoomSummary` to the
`ChatAdapter` contract. 4 adapter tests. Then **`<RoomHeader>`** (room name + live subject with a
stored-topic fallback + occupant count + a members toggle) wired into `<ChatWorkspace>`: a room
conversation now shows the header instead of the plain title, and toggling reveals `<RoomMemberList>`
from `chat.client.rooms[id]`. **46 chat-ui tests for rooms; S99.8/B94.4/F95.7/L99.8.** Then **`<RoomBrowser>` into the workspace** —
`ChatClientPort` gained optional `discoverRooms` / `joinRoom`; `useChatState` exposes a `rooms`
handle (`discover` / `join` — join `refresh()`es and selects the new room) only when the port
supports MUC; `<ChatWorkspace>` shows a third "Find a room" left-column tab in that case, and joining
from it switches back to the chats list. **148 chat-ui tests.** Then a **stylesheet** — `chat-ui.css` (imported by `<ChatWorkspace>` /
`<AccountSetupForm>` like `@tepegoz/reader`'s `reader-view.css`): a Pidgin-style two-pane layout
(account rail · chats/contacts/rooms column · conversation), message bubbles (own vs peer, grouped),
presence dots by tone, a real composer, roster / room-browser / setup-form skins — all off the app's
`--surface-*` / `--text-*` / `--primary` design tokens, so light/dark tracks automatically. (The
components were shipping raw semantic HTML with no styles.) Then the **desktop room bridge** — `chat:discover-rooms` / `chat:join-room`
channels + `schemas-chat` guards; `ChatIpcService` / `ChatService` / `ChatAccountRunner` gained
`discoverRooms` (adapter pass-through, `[]` when the adapter lacks MUC) + `joinRoom` (persists the room
`ChatConversation`); `ChatApi` + `apps/desktop/src/preload/api-chat.ts` gained `discoverChatRooms` /
`joinChatRoom`. `chat-ui`'s `ChatClientPort` optional MUC methods were renamed to match (so
`window.tepegoz` satisfies them structurally and the ext-chat panel needs no adapter). Coverage held
(`apps/desktop/**` F floor met by new `chat-service` / `account-runner` tests). Then the **per-room notification-level picker** — `<RoomHeader>` gains a `notifyLevel` select
(all / mentions / none) shown when an `onSetNotifyLevel` handler is passed; `useChatState`'s
`setRoomNotifyLevel` patches `client.conversations[id].notifyLevel` optimistically then calls the
optional `port.setChatRoomNotifyLevel`; `chat-store` `patchConversation` merges local edits. **151
chat-ui tests.** Then the **`chat:set-room-notify-level` desktop bridge** — channel + schema (enum
guard); `ChatIpcService` / `ChatService` / `ChatAccountRunner` `setRoomNotifyLevel` (reads the stored
conversation, patches `notifyLevel`, upserts — creating a stub row if the room has no row yet);
`ChatApi` + preload `setChatRoomNotifyLevel`. `window.tepegoz` satisfies the optional
`ChatClientPort` method structurally, so the ext-chat panel is unchanged. Then **`decideNotification`
on inbound** — `ChatAccountRunner` gained a `notify?` dep; on a `message` change `maybeNotify` looks
up the conversation, runs `decideNotification` (own-echo / redaction / room level / mute) and, if it
survives, raises a `ChatNotification` (title = sender name, body capped at 180);
`chat-service.electron.ts` wires it to
`NotificationHost.push({ source: 'chat', channels: ['center', 'native'] })`, `'chat'` added to
`NOTIFICATION_SOURCES`. Then, alongside X-chat.4's `room-topic` primitive (2026-09-10), the **XMPP MUC
subject wiring** — `XmppAdapter.handleLiveElement` now routes a `<message type="groupchat">` that
carries only a `<subject>` (XEP-0045 §8.1) from a joined room through `parseMucSubject` to a
`room-topic` event (setter from the resource), so a live topic change reaches `<RoomHeader>` and the
persisted conversation row the same way IRC's does. Then the **room "who's typing" indicator** —
`chat-ui` `roomTypingLabel` folds the room's typing-address set into a localized line ("Bea is
typing…" / "Bea & Cy are typing…" / "Several people are typing…", en + tr) shown under the room
header; a DM keeps the plain "typing…". Then **involuntary-removal surfacing across all three native
adapters** — an IRC `KICK`, an XMPP MUC removal presence (status 301/307/321/322/332) and a Matrix
`m.room.member` ban / third-party leave each emit a `system` message into the room
(`<who> was kicked/banned by <actor>: <reason>`, actor + reason when the protocol reports them)
alongside the `room-membership` leave, so a removal is visible in the timeline instead of an occupant
silently vanishing (`ircKickSystemMessage` / `mucRemovalText` / `matrixMemberSystemMessage`).
Then (2026-09-11) the **room-invite vertical slice** — `ChatAdapter.inviteToRoom` on XMPP
(`buildMucInvite`), IRC (`buildIrcInvite` → `INVITE`) and Matrix (`POST …/invite`), wired through
`chat:invite-to-room` (`ChatInviteToRoomSchema`), `ChatService`/`ChatAccountRunner.inviteToRoom`,
`ChatApi.inviteToChatRoom` + preload, `useChatState.inviteToRoom`, and an **Invite** field in
`<RoomHeader>`. The `buildMucInvite` deliverable is closed.
Then (2026-09-11) **leave-room reaches the human, not just the agent** — `chat_delete_item` already
let the agent leave a room, but a person had no UI path to do the same; `chat:leave-room`
(`ChatLeaveRoomSchema`) + `ChatIpcService.leaveRoom` (was a no-op passthrough gap) +
`ChatApi.leaveChatRoom` + preload + `useChatState.leaveRoom` + a **Leave** icon action in
`<RoomHeader>` (two-click confirm, closes the panel on leave). Then **reactions become interactive** —
`<MessageTimeline>`'s reaction row was display-only; `onReact` + an optimistic `toggleReaction` fold in
`chat-store` wire it to `useChatState.react` → `chat:react` (new channel + `ChatReactSchema`) →
`ChatService.react` (already existed for the agent's `chat_update_item`, now reachable from the UI
too). The **XMPP wire implementation landed alongside it** — XEP-0444 `<reactions>` stanza build/parse
in `chat-adapters` (`buildReactions` / `parseReactionsStanza`), `XmppAdapter.react()` (resends the
whole current set, per the wire protocol), and a live-message handler that diffs the always-complete
incoming set into the add/remove `reaction` events the fold already understood from Matrix. Then a
**MUC-history bug fix** — `XmppAdapter.history()` was querying the account's personal MAM archive for
a room conversation; XEP-0313 §5 archives a room's history under the room's own JID, not reflected
into members' archives, so a room with real history showed none (or, where a server did reflect it,
could show the bare room JID as sender instead of the occupant nick). `MamQuery.to` routes a room
query to `s.rooms`-tracked room JIDs. Then **reconnect resilience** — `ChatAccountRunner` now rejoins
every previously-known room on connect (a room's presence subscription only ever lived in the live
session, so a cold start or a reconnect silently left every room un-joined with no way to send until
the user manually rejoined); `history()` on first open of a conversation now returns what is already
in local storage immediately (merged with a live fetch when connected) rather than depending on
connectivity to show anything. Also fixed: **own-message detection for rooms** was DM-only
(`senderAddress !== peerAddress`), so every room message rendered as someone else's; both
`ChatWorkspace`'s bubble-alignment and the account-runner's own-echo notification suppression now
compare against the room's `selfNick` the same way `chat-core`'s `RoomView` already tracks it. Then
the **accounts manager** — `<AccountsManager>`, the Pidgin-style "Accounts" window (every account +
live connection state + two-click remove), reachable from the workspace gear icon, which previously
just called `onAddAccount` directly — a single configured account had no visible confirmation
anywhere in the UI. Paired with `<ProtocolBadge>` (a small xmpp/irc/matrix/bridge glyph, dependency-free)
shown on account/conversation-list avatars. Then (2026-09-12) a **real, live-found bug fix** —
`XmppAdapter.sendMessage()` never sent `type="groupchat"` for a room message (only `react()` had the
`s.rooms.has(...)` check that decides it), so every room message sent through this adapter was
silently going nowhere: XEP-0045 requires `groupchat` for a MUC service to broadcast to occupants, a
plain `type="chat"` to a room JID is not relayed. No fixture-based unit test had caught this; a live
Playwright e2e against a real Prosody did (see X-chat.10's e2e note) — the composer accepted and
cleared the input, the message just never arrived anywhere. Fixed + a regression test asserting the
stanza's `type` attribute for a room send, which no existing test checked.
**X-chat.3 is now code-complete — only the runtime DoD (live server) + the sub-phase DoD template
remain.** ·
**Depends on:** X-chat.2 · **Branch:** `main` · **Risk:** low-medium.

### Deliverables
- [x] **XMPP MUC (XEP-0045)** — join/leave by JID, nickname, room roster + affiliations/roles,
      history-on-join limit, password rooms. `xmpp/muc.ts` (join/leave/subject/invite builders +
      presence/subject/error parse) + `chat-core` `RoomView` + `XmppAdapter` join/leave/presence
      routing + downstream `room-membership` folding through `ChatAccountState` / reducer / runner.
      A live `<subject>` change now surfaces as a `room-topic` event (`handleRoomSubject`), and the
      room header can **set** the topic — `ChatAdapter.setRoomTopic` (XMPP `buildMucChangeSubject`,
      IRC `TOPIC`, Matrix `PUT …/state/m.room.topic`) → `ChatService.setRoomTopic` →
      `chat:set-room-topic` bridge → `<RoomHeader>` inline editor (Enter commits, Escape cancels).
      IRC `KICK`, XMPP MUC removal (status 301/307/321/322/332) and Matrix `m.room.member` ban /
      third-party leave all surface a `system` message (`ircKickSystemMessage` / `mucRemovalText` /
      `matrixMemberSystemMessage`), actor + reason included when reported.
      Room invite: `ChatAdapter.inviteToRoom(session, conv, invitee)` on all three native adapters
      (XMPP MUC mediated `<invite>` via `buildMucInvite`, IRC `INVITE nick #chan` via
      `buildIrcInvite`, Matrix `POST /rooms/{id}/invite`), wired end-to-end — `chat:invite-to-room`
      channel + `ChatInviteToRoomSchema` + `ipc-chat` handler + `ChatService`/`ChatAccountRunner`
      + `ChatApi.inviteToChatRoom` + preload, and an **Invite** field in `<RoomHeader>` (reveal on
      click, commit on Enter, hide on Escape) surfaced through `useChatState.inviteToRoom`. The
      `buildMucInvite` deliverable is closed.
- [x] **Room browser** — service discovery of a MUC service's public rooms, search, join-by-address.
      `xmpp/disco.ts` + `XmppAdapter.discoverRooms` + `<RoomBrowser>` + `useChatState` wiring + the
      `chat:discover-rooms` / `chat:join-room` desktop bridge. _Only the runtime DoD remains._
- [x] **UI for rooms** — member list, mention autocomplete, per-room notification level
      (all / mentions / none), topic display, "who's typing". `<RoomMemberList>` + mention
      autocomplete + `<RoomHeader>` (topic + member count + notify-level `<select>`, wired into
      `<ChatWorkspace>`) + the `chat:set-room-notify-level` bridge + `roomTypingLabel` (chat-ui:
      "Bea is typing…" / "Bea & Cy are typing…" / "Several people are typing…", en + tr) shown under
      the room header.
- [x] **Mention routing** — a room-ping / nick-highlight raises a notification even when the room is
      muted for "all messages". `chat-core/notify.ts` `decideNotification` + `ChatAccountRunner.maybeNotify`
      + `NotificationHost.push({ source: 'chat' })`.

### Functional DoD
- [ ] Join a public MUC, send/receive, get pinged, leave; notification levels behave.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.4 — IRC adapter

**Status:** 🟡 In progress (2026-09-10) — `@tepegoz/chat-adapters` `irc/parse.ts` landed: the pure
IRCv3 line parser (`parseIrcLine` — `@tags` with unescaping / `:prefix` / command uppercase-or-numeric
/ params with `:trailing`, bounded at 8703 bytes / 15 params / 64 tags, `null` on anything malformed),
`formatIrcLine` (round-trips), `parseIsupport` (005 `KEY=value` / bare / `-KEY`). 12 tests,
S100/B94/F100/L100. Then `irc/messages.ts` — `ircMessageToEvent` (PRIVMSG / NOTICE → a `message`,
channel-vs-DM keyed by an RFC-1459-folded conversation id, `server-time` → originTs, `msgid` →
protocolId with a `time~nick~body` fallback, CTCP ACTION → `/me`, other CTCP dropped; JOIN / PART /
KICK → `room-membership`, `self` from the nick, KICK attributed to the kicked nick) + line builders
(`buildIrcPrivmsg` / `Action` / `Join` / `Part` / `Nick` / `Away`). 14 tests. Then
`irc/registration.ts` — `IrcRegistration`, a pure handshake state machine: `CAP LS 302` (multi-line
aware) → `CAP REQ` the offered subset of `IRC_WANTED_CAPS` → optional SASL PLAIN (`AUTHENTICATE
PLAIN` → base64 creds → 903 / 904) → `CAP END` → `PASS`/`NICK`/`USER`, `433 ERR_NICKNAMEINUSE` retry
(3×, `_`-suffixed), `registered` on `001`. 13 tests. Then `irc/adapter.ts` — `IrcAdapter`
(`ChatAdapter`) + `IrcSession` (incremental CRLF line buffer bounded at 1 MiB, backpressured event
queue): `connect` drives `IrcRegistration` over `transport.openTCP` (6697/6667 default), auto-`PONG`,
reads `CHANTYPES` from `005`; live lines → `ircMessageToEvent`; own `JOIN`/`PART` tracked in
`session.joined` for auto-rejoin; `sendMessage` / `joinRoom` / `leaveRoom` / `setPresence` (→ `AWAY`)
/ `changeNick`; `roster` / `history` / `markRead` inert (IRC has none / `chathistory` is a later
slice). 15 tests. Then **wired into the desktop** — `ChatService.makeAdapter` returns `new IrcAdapter()` for
an `irc` account (was a 501); `chat-service.test.ts` now proves an IRC account spins up a runner and a
`matrix` account still errors. Then **IRCv3 `chathistory` backfill** — `IrcSession` tracks the ACKed
IRCv3 caps + open `BATCH` refs; `history()` sends `CHATHISTORY BEFORE <target> <timestamp|*> 50` and
resolves from the `chathistory` batch (messages sorted oldest-first, `nextCursor` = the oldest
`originTs` as ISO), with a 15 s timeout and cleanup on disconnect; a non-`chathistory` batch falls
through to the live stream. 4 tests. Then the **recorded-trace fixture suite** (`irc/recorded-trace.test.ts`,
a full Libera-style session). Then **ISUPPORT `CASEMAPPING`** — `foldIrcTarget(target, mapping)` +
`asIrcCasemapping` replace the hardcoded RFC-1459 fold; `IrcSession.casemapping` (default `rfc1459`) is
read from `005` and threaded through every conversation-id fold (live events, membership tracking,
`chathistory` batch target, `history()`, `joinRoom`/`leaveRoom`), so an `ascii`-casemapping server no
longer mis-keys `#foo[1]` as `#foo{1}` and a `joinRoom` key matches the server's echoed `JOIN`. 10 new
tests. Then **ISUPPORT `PREFIX` + `RPL_NAMREPLY` (353)** — `parseIrcPrefixSpec` reads `(modes)symbols`
to the ordered symbol string, `IrcSession.prefixSymbols` (default `@+`) is set from `005`, and
`namesReplyToEvents` fans a `353` line out to one `room-membership` (`joined: true`) per occupant with
the leading status symbol peeled and mapped to `role` (`~&@%` → moderator, else participant); `366` is
ignored and does not stall the stream. The recorded-trace suite now asserts the fanned NAMES batch. 9
new tests. Then the **anti-flood send queue** — client-initiated lines (PRIVMSG / JOIN / PART / NICK /
AWAY / CHATHISTORY) go through an ircd-style penalty pacer on `IrcSession` (a short burst back-to-back,
then `FLOOD_PENALTY_MS` spacing) so a burst does not trip the server's excess-flood kill;
`write()` stays immediate for registration / PONG / QUIT, `enqueue()` is the paced path, disconnect
drops the pending queue. Then the **"not encrypted" UI marker** — IRC's caps already carry
`e2ee: false`; `@tepegoz/chat-ui` now renders a `<NotEncryptedBadge>` (self-localized `notEncrypted`
/ `ircPlaintext`, en + tr) in both the DM and room conversation headers for any account whose protocol
is `irc`, derived from the account protocol so the presentational leaf takes no adapter-caps IPC
round-trip. **The `Caps` deliverable is now closed.** Then **SASL `EXTERNAL`** — `ircServer` gained an
optional `saslMechanism: 'plain' | 'external'` (absent ⇒ `plain`, so rows written before the field
parse unchanged — no migration); `RegistrationConfig.sasl` widened to a discriminated union
(`{ mechanism: 'PLAIN', username, password }` | `{ mechanism: 'EXTERNAL', authzid? }`); the state
machine sends `AUTHENTICATE EXTERNAL` then a bare `+` (or a base64 authzid), and `IrcAdapter.connect`
builds the EXTERNAL config with **no secret on the wire** — the TLS client cert (CertFP) carries the
identity, the transport supplies the cert. New `saslExternal()` helper in `xmpp/sasl.ts`. 8 new tests
(registration ×3, adapter ×1, sasl helper ×2, schema ×1, +1 recount). Then **`TOPIC` surfacing** — a
new `room-topic` `ChatEvent` variant (`{ conversationId, topic, setBy?, ts? }`, capability-gated on
`rooms`); `ChatAccountState` folds it through `chat-core`'s `applySubject` into the `RoomView.subject`
and re-emits the existing `{ kind: 'room' }` change only when the topic actually changed, so
`<RoomHeader>` picks it up with **no UI change**; the desktop `ChatAccountRunner` persists a topic
change onto the `chat_conversations` row (feeds the header's stored-topic fallback across a reload).
The IRC adapter maps `TOPIC` (live, with setter + ts), `332 RPL_TOPIC` (on join, no setter) and
`331 RPL_NOTOPIC` (→ empty topic / a clear); numerics route through `ircMessageToEvent` already, so
no adapter dispatch change. 11 new tests (shared-types ×2, normalize ×1, account-state ×2,
irc/messages ×4, account-runner ×1, +1 recount). Then the **NickServ pre-SASL fallback** —
`ircServer.preSaslAuth: 'pass' | 'nickserv'` (optional, absent ⇒ `pass`, no migration); when
`nickserv` and SASL is off with a secret, `IrcAdapter` sends `PRIVMSG NickServ :IDENTIFY <secret>`
once after `001` instead of a connection `PASS` (`buildIrcNickServIdentify`), SASL still wins when
on. 5 new tests (adapter ×3, schema ×2). **The X-chat.4 `IRC adapter` deliverable is now
closed** — only the runtime DoD (local ergo) remains, needing a live server.
XMPP `parseMucSubject` and Matrix `m.room.topic` can now
emit the same `room-topic` event — follow-up wiring under X-chat.3 / .5. ·
**Depends on:** X-chat.1 (contract) + X-chat.2/.3 (UI) · **Branch:** `main` · **Risk:** low-medium.

### Deliverables
- [x] **IRC adapter** (`irc/`) — RFC 2812 message parser, connection registration (`PASS`/`NICK`/
      `USER`), SASL (`PLAIN`, `EXTERNAL`), IRCv3 capability negotiation (`server-time`,
      `message-tags`, `account-tag`, `echo-message`, `batch`, `chathistory`, `multi-prefix`,
      `away-notify`, `extended-join`), channel join/part/topic/names, PRIVMSG/NOTICE, CTCP
      (`ACTION`), `chathistory` backfill, auto-rejoin on reconnect, ISUPPORT
      parsing (`CHANTYPES`, `PREFIX`, `CASEMAPPING`), flood-protection send queue. NickServ
      interaction is via SASL, with an opt-in `PRIVMSG NickServ :IDENTIFY` fallback for pre-SASL
      servers (`ircServer.preSaslAuth: 'nickserv'`, sent once after `001`).
- [x] **Caps** — `e2ee: false` (protocol has none), `edits: false`, `reactions: false`,
      `receipts: false` unless `message-tags` + a draft spec is present. `IRC_CAPS` sets all four
      off; `@tepegoz/chat-ui`'s `<NotEncryptedBadge>` marks every IRC conversation (DM + room
      headers) "Not encrypted" / "Şifresiz", with the plaintext explanation as its tooltip.
- [x] Recorded-trace fixture suite — `irc/recorded-trace.test.ts` plays a full Libera-style session
      (`CAP LS 302` multi-line → SASL PLAIN → `001`–`005` ISUPPORT split across lines → MOTD → JOIN +
      `353`/`366` NAMES, channel PRIVMSG, CTCP ACTION, NOTICE, DM, KICK, QUIT) through `IrcAdapter`
      and asserts exactly the surfaced message / membership events, numerics ignored.

### Functional DoD
- [~] Connect to a local IRC server (ergo), join a channel, send/receive, backfill via
      `chathistory`, reconnect + auto-rejoin; the UI correctly shows IRC as unencrypted.
      **Protocol half verified live (2026-09-12)** — a real `ergo` instance run locally (no Docker:
      the static release binary, under WSL, reachable from the Windows host over the WSL2
      localhost-forwarding path) and driven through the *real* `IrcAdapter` +
      `@tepegoz/chat-transport-node` (not a fixture): connect, join, send/receive between two live
      sessions, disconnect + reconnect + rejoin, and a chathistory backfill that actually returns
      the pre-reconnect message. This is what found and fixed a real bug (see X-chat.10's fuzz/
      regression note below and the commit `fix(chat-adapters): IRC never actually requested the
      chathistory cap`) — `IRC_WANTED_CAPS` never listed `chathistory`/`draft/chathistory`, so a real
      ircd's CAP REQ never asked for it and `history()` silently returned nothing forever; every unit
      test missed it because the fake test server ACKs whatever the test script scripts it to,
      independent of what the client's `CAP REQ` line actually contained. Kept as a permanent
      opt-in regression check: `packages/chat-transport-node/src/irc-live-ergo.manual.test.ts`,
      gated behind `TEPEGOZ_LIVE_IRC=1` so it can't break anyone's default `pnpm test` / CI run
      without a live server running. **The desktop-app half closed too (2026-09-12)** —
      `e2e/chat-live-irc.spec.ts` (X-chat.10) drives the real app: real account-setup form
      (needed IRC fields added to `AccountSetupForm` first, see X-chat.2), real room-browser
      join-by-address, real composer. It found **two more real bugs**: `chat:add-account` rejected
      an empty secret (blocking every no-auth IRC account — IRC is the one protocol that doesn't
      always need one — the vault and adapter already treated empty as "no credential", only the
      IPC schema disagreed), and `IrcAdapter.sendMessage()` fabricated a receipt id never sent on
      the wire, so on any server with the `echo-message` cap (ergo, most modern networks) the
      account-runner's optimistic-echo reconcile and the live echo landed as two different rows —
      **every message you sent in a room rendered twice.** Both fixed; `IrcSession` gained
      `ownEchoWaiters` (mirrors the existing `historyWaiters` pattern) so `sendMessage` now resolves
      with whatever protocolId the echo actually carries. `<NotEncryptedBadge>` verified rendering
      for real in the running window as part of the same e2e pass.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.5 — Matrix adapter

**Status:** 🟢 Code-complete (2026-09-10) — the Matrix adapter, media repo (resolve + upload) and the
Synapse fixture suite are on `main`; only the runtime Functional DoD (needs a live homeserver
account) and the DoD-template checklist remain. The build history: `@tepegoz/chat-adapters`
`matrix/events.ts` landed first — the pure CS-API event mapping. `matrixTimelineEvent` → `m.room.message` (text / `m.emote` → `/me` / `m.notice`
→ system / image·file·video·audio → `media` + `mxc://` ref from `content.url` or `content.file.url`),
reply relations → `replyToId`, `m.replace` → `message-edit`, `m.room.redaction` → `message-redact`,
`m.room.member` join/leave/ban → `room-membership`; `matrixEphemeralEvents` → `m.typing` /
`m.receipt`. Lenient — an unmodelled shape returns `null` / `[]`. 14 tests, S100/B91/F100/L100.
Then a **`reaction` `ChatEvent` variant** — `{ type:'reaction', conversationId, protocolId, emoji,
senderAddress, add }` in `@tepegoz/shared-types`, capability-gated on `reactions` in `normalizeEvent`,
folded into `message.reactions[]` by `chat-core` `foldEvent`/`account-state` (count + `me`, drops at
zero) and re-emitted as `message-updated`; Matrix `m.reaction` maps to it (removal — a redaction of
the reaction event — is adapter-tracked, a later slice). 4 new tests across the stack. Then `matrix/sync.ts` — `parseSyncResponse`, the pure
`/sync` walker: flattens every `rooms.join[id]` timeline + ephemeral block into `ChatEvent`s, reads
each room's name / topic / member count from state (`m.room.name` / `m.room.topic` / `m.room.member`,
`m.joined_member_count` wins when higher), reports `limited` + `prev_batch` for gappy backfill, plus
`invites` and `left`; defensive coercion throughout. 6 tests, S100/B92/F100/L100. Then the
`MatrixAdapter` over `transport.fetch` — password/token login (long-opaque-secret heuristic), a
priming `/sync` + a backgrounded long-poll loop with `since`, `M_UNKNOWN_TOKEN` re-login and
exponential backoff, message send / edit / react, backwards history paging, room join/leave, read
receipts, presence; wired into `ChatService.makeAdapter` (matrix accounts get a real adapter, only
`bridge` is 501). Then `matrix/media.ts` — `parseMxc` + `mxcDownloadUrl` / `mxcThumbnailUrl`
(authenticated CS-API v1) and a new `ChatAdapter.resolveMedia(session, ref) → MediaLocator`; the
desktop `resolveMedia` bridge (`chat:resolve-media` IPC → runner egress-bound GET → 12 MiB cap →
`data:` URL → `<MessageMedia>`). Then **spaces** — `parseSyncResponse` reads `m.room.create`'s type;
a space is reported in `SyncRoom` but its timeline / membership are not surfaced as a conversation.
Then media **upload** — `ChatFetchInit.body` takes `Uint8Array`, `OutgoingMedia`, and
`MatrixAdapter.uploadMedia` → `/_matrix/media/v3/upload` → `mxc://`. Then a **recorded Synapse
`/sync` fixture suite** (initial: room + space + invite + media + typing/receipts; incremental: edit
+ reaction + redaction + leave) plus a pre-room-v11 top-level `redacts` fix. Then (2026-09-10,
alongside X-chat.3/.4) a **timeline `m.room.topic` → `room-topic` event** — `matrixTimelineEvent`
maps it (setter = `ev.sender`, ts = `origin_server_ts`); the initial topic still comes from the room
state summary, a *change* now surfaces the same way IRC's `TOPIC` and XMPP's `<subject>` do. ·
**Depends on:** X-chat.1 (contract) + X-chat.2/.3 (UI); E2EE is X-chat.7 · **Branch:** `main` ·
**Risk:** medium-high.

### Deliverables
- [x] **Matrix adapter** (`matrix/`) — login (password / token), `/sync` loop with `since`, room
      state + timeline, `m.room.message` (text/emote/notice/image/file), `m.reaction`,
      `m.room.redaction`, edits (`m.replace`), `m.room.topic` → `room-topic`, read markers +
      receipts, typing, presence, `/rooms/{id}/send`, media repo upload/download (`mxc://` resolve),
      spaces (`m.space`), invites.
      _Threads (`m.thread`) and a room directory are deferred to X-chat hardening._
- [x] **Caps** — everything on except E2EE (`MATRIX_ADAPTER_CAPS = { ...MATRIX_CAPS, e2ee: false }`).
- [x] **State resilience** — a dropped `/sync` resumes from the last token; `M_UNKNOWN_TOKEN` forces
      a clean re-login; gappy sync (`limited: true`) is reported for backfill.
- [x] Recorded-exchange fixture suite (Synapse shapes).

**Remaining:** the runtime Functional DoD below (needs a live homeserver account) and the
DoD-template checklist.

### Functional DoD
- [~] A Matrix account adds, syncs rooms + spaces, sends/receives text + media + reactions + edits in
      **unencrypted** rooms, survives a sync drop and a token invalidation. **Connect + room message
      exchange + history backfill verified live (2026-09-12)** against a real, unprivileged local
      Synapse (no root, no Docker — `matrix-synapse` installs from prebuilt PyPI wheels into a plain
      `python3 -m venv`, no Rust/C toolchain needed; the generated config already binds a plaintext
      HTTP listener with SQLite storage, exactly right for a throwaway test server): two accounts
      connect, exchange a room message, and a `/messages` backfill returns it after a reconnect. No
      adapter bug found in that pass — a useful negative result. Kept as a permanent opt-in
      regression check: `packages/chat-transport-node/src/matrix-live-synapse.manual.test.ts`, gated
      behind `TEPEGOZ_LIVE_MATRIX=1`. **The desktop-app e2e attempt found — and closed — a real bug
      the adapter-level test structurally couldn't (2026-09-12).** `e2e/chat-live-matrix.spec.ts`
      (needs a second, TLS listener on the test Synapse: the schema requires `homeserverUrl` to
      start with `https://`, unlike the manual adapter test's plain `:8008`) showed the account stuck
      `reconnecting`, never `online` — a fresh `POST /login` roughly every ~1s, each one succeeding
      server-side. Root-caused with temporary main-process `console.error` instrumentation (piped via
      Playwright's `app.process().stdout`): `ChatConnectionManager.pump()` treats any error thrown
      while processing an event as "the connection dropped" and reconnects; the actual error was
      `FOREIGN KEY constraint failed` from `ChatStore.upsertMessage`, from two compounding gaps: (1)
      `MatrixAdapter.syncOnce()` pushed a batch's `message` events before that batch's
      `room-membership` events, and (2) more fundamentally, `ChatAccountRunner.applyChange`'s
      `'room'` case only ever *updated* an existing conversation row, never created one — fine for a
      room joined interactively (`joinRoom()` persists its row directly) but Matrix reports every
      room the account is *already* a member of on its first `/sync`, with no `joinRoom()` call
      involved. **Any real Matrix account with pre-existing room history could never get past its
      own initial sync.** Both fixed; the adapter-level manual test never caught either because its
      fake in-memory store has no foreign key to violate — only the real SQLite-backed app does.
      **Still open:** spaces, media, reactions, edits, sync-drop recovery, token invalidation — the
      e2e so far only exercises connect + room message + join.
- [ ] Sub-phase DoD template ✔.

---

## X-chat.6 — Agent capabilities

**Status:** 🟡 In progress (2026-09-10) — the capability table, the `chat-core` agent-view guards and
`ChatCapabilityHost` (all ten `chat_*` tools wired over `ChatService` + `ChatStore`, registered into
`CapabilityRegistry` gated on `com.tepegoz.chat`) are on `main`. The build: `extensions/ext-chat`
`capabilities.ts` — the tool table on `defineCapabilities`, ids `ToolNameSchema`-compliant (`join a
room` → `chat_create_membership`), reads auto-allow, `chat_create_message` / `chat_create_membership`
`state_changing` + idempotency key, leave is `destructive`. Then `@tepegoz/chat-core` `agent-view.ts`
— `wrapChatContent` + `CHAT_UNTRUSTED_NOTE` (delimiter-breakout-safe), `agentMessageView` (body /
sender wrapped, redacted → placeholder, attachment bytes → an opaque `mediaRef` handle), and the
unknown-contact gate `isConversationAgentVisible` / `filterAgentConversations`. Then
`ChatStore.searchMessages` — Turkish-fold substring search over `body_fold`, account/conversation
scopable, LIKE-metachar-escaped, redacted rows excluded. Then `ChatCapabilityHost` itself
(`apps/desktop/src/main/chat/chat-capability-host.ts`, IO-free by injection): the read half
(`chat_list_items` / `chat_get_item` / `chat_get_history` / `chat_search_items`) folds every path
through the agent-view + gate, then the write half (`chat_create_message` → `sendMessage`,
`chat_create_membership` → `joinRoom`, `chat_delete_item` → `leaveRoom`, `chat_update_item` mark-read
/ mute / reaction) once `ChatService` grew `leaveRoom` / `setMuted` / `react`, then `chat_get_media`
— `ChatStore.getMessage` by id → gate → `ChatService.resolveMedia` → decode → a new
`FileOperationsHost.writeAttachment` (binary sibling of `writeExport`, fixed `~/tepegoz/attachments/`)
→ `{ sandboxPath }`. Session opt-ins for the gate live in `chat-service.electron.ts`. ·
**Depends on:** X-chat.1 + X-chat.2 (+ .3/.4/.5 for breadth) · **Branch:** `main` · **Risk:**
medium-high — the untrusted-DM + unknown-contact guards are the sharpest in the whole product.

### Deliverables
- [x] **`capabilities.ts`** — the tool table on `defineCapabilities`, ids passing `ToolNameSchema`,
      `dangerClass` per the table, idempotency key on `chat_create_message` /
      `chat_create_membership`.
- [x] **`ChatCapabilityHost`** — `wrapChatContent` on every read path (bodies, sender display names,
      room topics); the **unknown-contact gate** (a non-roster DM is excluded from
      `chat_get_history` / `chat_list_items` / `chat_search_items` unless the user opted that
      conversation in); media manifest excludes bytes; `chat_get_media` → quarantine → sandbox.
- [x] **`chat_create_message` confirm payload** — target conversation (name + account + kind) +
      rendered body, via a new `confirmSummary(args, host)` hook on the extension-SDK capability
      contract → `RegisteredTool` → `ToolGateway` (awaited onto `ConfirmRequest.summary`, a throw is
      swallowed) → `ipc-agent-run` → the ext-agent approval modal (renders `summary` in place of the
      raw args preview). _The unattended-profile fail-closed path is the generic sealed-narrowing
      behaviour — no chat-specific work._
- [x] **AIAdaptor grouping** — `chatCapabilities()` descriptors carry `source: 'extension'` +
      `provenance: 'com.tepegoz.chat'` (stamped by `defineCapabilities`), so `buildAiAdaptors` folds
      all ten `chat_*` tools into one `kind: extension` adaptor titled "Chat" / "Sohbet" from the
      catalog manifest — verified in `ai-adaptors.test.ts`.
- [~] **Agent-eval scenarios** in `@tepegoz/orchestrator` / `@tepegoz/agent-eval` — (a) summarize a
      room backlog; (b) draft a reply and stop (no send); (c) `chat_create_message` blocked at HITL;
      (d) **an unknown-contact DM is not fed to the model**; (e) **a prompt-injection DM does not
      change agent behaviour**; (f) media → sandbox; (g) no auto-reply loop can be armed.
      **Fixture-infra slice 1 landed (2026-09-11):** the scenario schema is no longer
      page-fixture-shaped — `EvalTargetSchema` gained a `{ chatFixture }` member and
      `@tepegoz/shared-types` a `ChatEvalFixtureSchema` (seed account / roster / conversations /
      messages, `knownContact` + `optedIn` per conversation, size-capped, `safeParse`d as untrusted
      disk input); `@tepegoz/agent-eval` `chat-fixture.ts` loads `<name>.chat.json` (name-guarded,
      never throws) + `isSeedConversationAgentVisible` mirrors the unknown-contact gate so a scenario
      author can assert "this DM is withheld" without booting the host. `planRun` skips a
      `chatFixture` target for now. **Slice 2 landed (2026-09-11):** all seven scenarios + seeds
      exist — `packages/agent-eval/chat-fixtures/{room-backlog,draft-reply,send-hitl,unknown-dm,
      injection-dm,media-attachment,auto-reply}.chat.json` + `scenarios/chat-agent.json` (each a
      judge-rubric scenario; the backlog one also carries a ground-truth `expectedValue`).
      `registry-integrity` asserts every `chatFixture` scenario names a seed that loads clean and
      every `*.chat.json` on disk parses. **Slice 2b (2026-09-11):** the shipped `unknown-dm` /
      `injection-dm` seeds are now run against the **real** `@tepegoz/chat-core` guards in
      `chat-fixture.test.ts` — `isConversationAgentVisible` withholds the stranger DM and keeps the
      roster DM (scenario **d**), and `wrapChatContent` on the `[[SYSTEM]]` body is delimiter-safe
      (scenario **e**) — so those two scenarios are discharged as pure unit tests without an agent or
      an API key (`@tepegoz/chat-core` added as an agent-eval dep). 23 tests across slices 1+2.
      _Remaining: **slice 3** — the `ChatStore` seed-and-run wiring in the app's eval runner (needs
      the real app) + the run itself (API-spend-gated). Safety properties (c)/(f)/(g) are unit-tested
      in `capabilities.test.ts` + `chat-capability-host.test.ts`._

**Remaining:** the agent-eval seed-and-run wiring (slice 3, needs the real app; the run is
API-gated) and the Functional DoD run (needs a live account). The capability table, the agent-view
guards, `ChatCapabilityHost` (all ten tools), the confirm payload and the AIAdaptor grouping are
landed on `main`.

### Functional DoD
- [~] The agent can list / read / search / summarize / draft across accounts and protocols;
      **cannot send without the unsuppressible HITL confirm**; unknown-contact messages are withheld
      by default; the injection eval passes (agent resists). _Safety half proven by unit tests:
      cannot-send-without-HITL (`capabilities.test.ts` — `chat_create_message` is `state_changing`
      + `confirmSummary`), unknown-contact withholding (`chat-capability-host.test.ts` +
      `chat-fixture.test.ts` scenario d), injection-resistance (`agent-view.test.ts` +
      `chat-fixture.test.ts` scenario e). The list/read/search paths are covered in
      `chat-capability-host.test.ts`. The summarise/draft **competence** half needs the agent-eval
      run (slice 3 + API spend)._
- [x] Disabling `com.tepegoz.chat` removes every `chat_*` tool from `CapabilityRegistry.list()`.
      Proven by composition: `capabilities.test.ts` pins `chatCapabilities()` to exactly the ten
      `chat_*` ids under `com.tepegoz.chat`; `@tepegoz/extension-host` `supervisor.test.ts`
      ("registers only enabled providers and unregisters on disable") proves a disabled extension's
      capabilities are all unregistered from a real registry; `capability-supervisor.electron.test.ts`
      proves the desktop `isEnabled` closure is prefs-backed and `setEnabled` reconciles.
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

**Status:** 🟡 In progress (2026-09-10) — the adapter-event fuzz / zod-rejection boundary suite
landed (`chat-core` `normalize-fuzz.test.ts` — ~50 hostile inputs + a randomised sweep prove
`normalizeEvent` never throws and never emits a `ChatEvent` that fails `ChatEventSchema`, plus a
prototype-pollution guard; `account-state.test.ts` adds a hostile-stream test proving `applyRaw`
does not corrupt a folded view). Then the **kill-switch half** — `ChatCapabilityHost` gained a
`mayEgress` dep; every network-touching agent action (`chat_create_message` / `chat_create_membership`
/ `chat_delete_item` / `chat_update_presence` / `chat_update_item` mark-read + reaction /
`chat_get_media`) now fails closed with a **403** on a kill-switched profile, while local reads and a
local-only mute still work; `ChatService.notifyEgressChange` is proven to fan the block out so every
account's `ChatConnState` goes `blocked` and recovers. Then **redacted Journal events + the redaction
property test** — `ChatMessageSent` / `ChatAccountAdded` go in with `redacted: true` carrying only a
conv-id hash / account / protocol id / ts, and tests assert the emitted facts contain no body, no
room/JID address and no vault secret (new `ChatMessageSent` / `ChatAccountAdded` `EventType`s).
The property is asserted at **both** ends now (2026-09-11): `account-runner.test.ts` on the
`ChatAuditEvent` the runner emits, and `chat-service.electron.test.ts` on the `EventJournal.append`
entry `chatAudit` writes — `type` / `redacted: true` / exact payload key set (`accountId` +
`conversationHash` + `protocolId`, or `accountId` + `protocol`), a serialized scan for body / `@` /
secret substrings, a throwing `append` is swallowed, and a closed DB is a no-op.
Then the **search-latency half of the perf pass** — `ChatStore.searchMessages` now runs against the
`chat_search` FTS5 index instead of a `body_fold LIKE '%…%'` scan: migration 23 backfills the index
+ adds an `AFTER DELETE` trigger, `upsertMessage`/`redactMessage` keep it in step through one
`syncSearchRow` (fold stays in JS), and the query folds + token-prefix-matches (`toplantı` finds
`toplantısı`, multi-word is an AND, FTS operators in user text are inert). Signature unchanged.
Then (2026-09-11) the **trust-claim regression audit** — every bullet in "Trust & security" now has
a test that fails if the property regresses: renderer/adapter never open a socket or reach the vault
(the CI-enforced `chat-ui-is-a-leaf` / `chat-adapters-no-app-no-electron-no-node` /
`chat-core-no-app-no-electron` dependency-cruiser rules — no `apps/` / `electron` / `node:`);
**TLS required** — `chat.test.ts` now asserts an XMPP `security: 'none'` and a `http://` Matrix
homeserver are un-representable (the `matrixServer.homeserverUrl` schema gained an `https://` refine —
the CS-API carries the access token), IRC keeps `tls` default-true with the UI badge as the opt-out
signal; account never carries a secret (`secretRef` only); vault refuses plaintext when the keychain
is down; media quarantined into the file-ops sandbox; kill-switch → 403 + `blocked`; Journal facts
redacted at both ends. Bridge-payload fuzz + the profile-switch bridge half + bridge sandbox + e2e +
perf remain (the first three wait on X-chat.8). Then (2026-09-11) the **event-queue memory bound** —
a shared `event-queue.ts` caps every adapter session's between-the-wire queue at 4096
(`MatrixSession` / `IrcSession` / `XmppSession`); a stalled consumer no longer grows process memory
without limit (oldest dropped + `droppedEvents` + a re-armable out-of-band `error` gap notice). ·
**Depends on:** X-chat.2–.7 · **Branch:** `feat/chat-hardening` · **Risk:** low — mostly tests.

### Deliverables
- [x] **Adapter-event fuzz / zod-rejection tests** — malformed XMPP stanza, Matrix sync event and
      IRC line all reject cleanly at their own parsers (existing suites) and, consolidated, at the
      `normalizeEvent` boundary: no throw on any input, no `ChatEvent` emitted that would not
      re-validate, no state corruption in `ChatAccountState.applyRaw`, no prototype pollution.
      _Bridge-payload fuzz is deferred to X-chat.8 (no bridge contract exists yet)._
- [ ] **Bridge sandbox tests** — no FS escape, no cross-account reach, crash isolation, egress
      binding enforced, RPC surface minimal.
- [x] **Journal redaction property test** — asserted at both ends: the `ChatAuditEvent` the runner
      emits (`account-runner.test.ts`) **and** the `EventJournal.append` entry `chatAudit` writes
      (`chat-service.electron.test.ts` — `type`, `redacted: true`, exact payload key set, a
      substring scan for body / address / secret, a throwing append swallowed, a closed DB a no-op).
      The `ChatMessageSent` fact contains no message body, no room/JID address and no vault secret
      (only a conv-id hash); the
      `ChatAccountAdded` fact contains no secret. Both go in with `redacted: true`.
- [x] **Kill-switch + profile-switch tests** (native path) — bound-blocked profile denies agent chat
      tools (`ChatCapabilityHost.mayEgress` → 403 on every wire action; `notifyEgressChange` fan-out
      to `blocked` proven); a profile switch (ADR-0045 process swap → `before-quit` →
      `ChatMessenger.stop()`) drops every connection, `stop()` is idempotent and stops emitting, and
      the next profile's `ChatService` only ever knows what its own profile-scoped `loadAccounts`
      returns. _Bridge-path drop + isolation waits on X-chat.8._
- [~] **Playwright `_electron` e2e** — against a local Prosody (XMPP) + ergo (IRC), and a local
      Synapse (Matrix) if CI budget allows: add account → roster → 1:1 send/receive → join a room →
      get pinged. A second e2e for the agent path (summarize → draft → HITL-stop → unknown-DM
      withheld). **XMPP slice landed (2026-09-12)** — `e2e/chat-live-xmpp.spec.ts` drives the real
      app through a real local Prosody (no Docker/root — see the X-chat.1 Functional DoD note for
      how it's stood up): the actual account-setup form (host/port/security, since `localhost` has
      no SRV record), the actual room-browser join-by-address field, the actual composer. Gated
      behind `TEPEGOZ_LIVE_XMPP=1`. **This is what found two real bugs no fixture-based unit test
      had caught** — recorded under X-chat.3 (`sendMessage` never used `type="groupchat"`, so a
      room message went nowhere) and X-chat.2 (a message arriving between `selectConversation` and
      its history fetch resolving was silently dropped from the timeline). Both fixed same-day.
      **IRC slice landed the same day** — `e2e/chat-live-irc.spec.ts` (`TEPEGOZ_LIVE_IRC=1`),
      needed the IRC fields added to `AccountSetupForm` first (X-chat.2). Found two more real bugs,
      both fixed same-day (see X-chat.4's Functional DoD note): `chat:add-account` rejected an empty
      (no-auth) secret, and `IrcAdapter.sendMessage()` duplicated every room message you sent on a
      server with `echo-message`. **Matrix slice landed the same day too** — `e2e/chat-live-matrix.spec.ts`
      (`TEPEGOZ_LIVE_MATRIX=1`, needs a TLS listener added to the test Synapse). Found and fixed the
      biggest bug of the three: a real Matrix account with any pre-existing room history could never
      complete its own initial sync (a foreign-key violation on the first message for a passively-
      discovered room, treated by `ChatConnectionManager` as a dropped connection — an infinite
      reconnect loop). See X-chat.5's Functional DoD note for the full diagnosis. **All three
      protocol e2e slices are now green.** **Still open:** the agent-path e2e, and broadening each
      protocol's e2e beyond "connect, join, send one message" (roster/presence, media, reactions,
      edits, XEP-0198 resumption, kill-switch).
- [x] **Perf pass** — a 20k-message room: **timeline windowing ✔** (`buildTimeline` `maxMessages`
      caps the DOM at the most-recent 200 messages + a "N earlier" row). **Search ✔** —
      `searchMessages` hits the `chat_search` FTS5 index (migration 23 backfill + delete trigger;
      `syncSearchRow` on every write; folded token-prefix query), no more `body_fold` scan.
      **event-queue memory ✔** — a shared `event-queue.ts` (`boundEventQueue` / `takeGapNotice` /
      `rearmGapNotice`) caps every adapter session's between-the-wire queue at `MAX_QUEUED_EVENTS`
      (4096). If the consumer stalls while the wire keeps delivering (a Matrix `/sync` loop, an IRC
      channel firehose, an XMPP MAM burst) the oldest events are dropped — the queue length never
      exceeds the cap — `droppedEvents` counts them, and one out-of-band `error` event is delivered
      before the surviving backlog so `ChatAccountState` surfaces a "resync needed" (re-armed once the
      queue drains). Applied to `MatrixSession`, `IrcSession` and `XmppSession`. 12 tests
      (`event-queue.test.ts` ×6 + Matrix session ×3 + IRC session ×1 + the XMPP handshake suite
      exercises `push`/`flush`/`nextEvent` transitively).

### Functional DoD
- [x] Every trust claim in "Trust & security" above has a test that fails if the property regresses
      (audit 2026-09-11 — see the status note; the two open items, bridge sandbox + isolation, are
      X-chat.8 work with no contract to test against yet).
- [ ] Both e2e flows green in CI. _(needs a local Prosody / ergo / Synapse.)_
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
