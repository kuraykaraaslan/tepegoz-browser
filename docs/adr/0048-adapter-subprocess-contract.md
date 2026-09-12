# ADR-0048: Adapter-as-subprocess contract — one reusable out-of-process shape for third-party protocol adapters and bridges

- **Status:** Proposed (design only — no implementation; unblocks X-chat.8/X-chat.9, see
  [`phases/extensions/ext-chat.md`](../../phases/extensions/ext-chat.md), and any future `ext-mail`
  third-party provider)
- **Date:** 2026-09-12
- **Refines:** [ADR-0018](0018-mcp-client.md) (subprocess isolation + stdio transport — the starting
  point named in [`phases/extensions/README.md`](../../phases/extensions/README.md#shared-prerequisite-work-blocks-both-docs))
  · [ADR-0021](0021-agent-controllable-extensions.md) (the injected-host capability-provider pattern
  this seam plugs into)
- **Generalizes:** [ADR-0047](0047-chat-protocol-adapter-and-bridge-trust-model.md) §4 "Bridge
  subprocess isolation" — that section is the first CONCRETE instance of the contract this ADR names;
  read together, not as competing designs
- **Expected second instance:** ADR-0046 (Mail adapter trust model — owed, `ext-mail` X-mail.1) should
  consume this contract for any third-party mail provider that cannot be a trusted in-process adapter
- **Relates to:** [ADR-0011](0011-vpn-network-privacy.md) (egress binding / kill switch) ·
  [ADR-0039](0039-user-granted-sensitive-capabilities.md) (per-use grants) ·
  [ADR-0045](0045-multi-profile-isolation.md) (per-profile isolation) · the **`background-connection`
  supervisor** shared prerequisite in `phases/extensions/README.md` (related, deliberately **not**
  folded into this ADR — see Non-goals)

## Context

Two extension roadmaps in `phases/extensions/` each need to run code we do not control, against a
network we do not run, on the user's behalf:

- `ext-chat`'s X-chat.9 bridges (Telegram, Slack, Discord, and — caveated — WhatsApp) are not
  protocols we can implement from a public spec the way XMPP/IRC/Matrix are. The practical "adapter"
  is a third-party daemon (`mautrix`-style) or an unofficial client library.
- `ext-mail`'s X-mail phases may eventually face the same shape for a provider with no safe
  in-process client.

Both docs describe this as **out-of-process, ADR-0018-shaped, egress-bound, results re-validated,
every tool behind the one PEP** — but neither has a shared contract to point at. `ext-chat`'s own
ADR-0047 §4 already wrote down a concrete, correct answer for chat specifically:

> A bridge child process gets: no filesystem access beyond its own `Bridges/<id>/state/` directory;
> its own egress binding; no host RPC beyond the `ChatAdapter` methods; a wall-clock + memory budget
> and crash isolation; a signed package, never bundled.

Left as chat-only prose, a second consumer (a future mail bridge, or a third extension years from now)
either re-derives the same reasoning from scratch or copies ADR-0047's wording without inheriting its
reasoning — exactly the drift `phases/extensions/README.md`'s "shared contract" section exists to
prevent for the in-process half of this same problem. This ADR is that document for the
**out-of-process** half: it takes ADR-0047 §4's answer, strips the `ChatAdapter`-specific nouns, and
states the reusable shape so `ext-mail` (or anyone) can build against a contract instead of a chat
essay.

**What ADR-0018 already gives this for free:** the subprocess isolation *mechanics* — a supervised
child process, a `Transport` seam, boundary re-validation with zod, exact-pinned dependencies,
reconnect-with-backoff, `CapabilityRegistry.unregister` on disconnect. **What ADR-0018 does not
give**: ADR-0018 is specifically an **MCP client** — the wire shape is MCP's own `tools/list` /
`tools/call` JSON-RPC, and the thing on the other end of the pipe speaks MCP. A protocol bridge does
not speak MCP; it speaks whatever RPC shape the *consuming extension's own adapter interface* implies
(`ChatAdapter`'s connect/roster/send/events, or mail's eventual equivalent). Bolting a real mail or
chat bridge onto MCP's tool-call semantics would be a worse fit than just extending the *isolation*
pattern ADR-0018 already proved and letting the RPC payload be the extension's own interface,
zod-validated in both directions. That is the generalization this ADR names.

## Decision

### 1. A named manifest capability, parallel to `manifest.mcpServer`

`@tepegoz/extension-sdk`'s manifest schema gains `manifest.adapterSubprocess` (shape TBD at
implementation time, not fixed by this ADR): a declaration that this extension provides one or more
protocol adapters as a supervised child process rather than in-process code, alongside the existing
`manifest.mcpServer` field ADR-0018 defined. The two are siblings, not the same field — an extension
can declare either, both, or neither.

### 2. Isolation guarantees — the part this ADR fixes, independent of what protocol rides inside

Every adapter subprocess, regardless of which extension owns it or which wire protocol it bridges to,
gets the same four guarantees ADR-0047 §4 first wrote down for chat:

1. **No filesystem access beyond its own state directory** — `<extension-id>/<adapter-instance-id>/state/`,
   never the extension's own data, never another instance's, never the host filesystem generally.
2. **Its own egress binding** — placed on the active profile's network binding exactly like a native
   in-process adapter ([ADR-0011](0011-vpn-network-privacy.md)); a kill-switched profile blocks a
   bridge's socket the same way it blocks a native one. A bridge cannot special-case its way around
   the kill-switch by virtue of being a separate process.
3. **No host RPC beyond the declared adapter interface.** The child can call back into the parent only
   through the specific typed methods the consuming extension's adapter contract defines (`ChatAdapter`
   for chat; mail's equivalent when it exists) — never a general IPC surface, never filesystem or
   process-spawn access to the host.
4. **A wall-clock + memory budget, and crash isolation.** A bridge exceeding its budget or crashing
   surfaces as *that adapter instance* going into an error state — nothing else in the extension, no
   other account, no other bridge is affected.

Plus the two guarantees ADR-0018 already established and this ADR does not relitigate: **exact-pinned
dependencies** (no floating subprocess dependency versions) and **a signed package**
([Phase 3](../../phases/product/phase-3-backend-cloud-extensions.md) supply-chain gate) — bridges are
never bundled with the app itself, matching ADR-0047 §8's WhatsApp caveat pattern generalized to every
bridge, not just that one.

### 3. Typed RPC, not MCP semantics

The transport mechanics reuse ADR-0018's proven shape (a supervised child, a `Transport` seam,
exact-pinned SDK-equivalent, reconnect-with-backoff) — but the **message shape is the consuming
extension's own adapter interface**, not MCP's `tools/call`. Concretely: the RPC envelope carries
method calls and events matching (for chat) `ChatAdapter`'s connect / roster / presence / history /
send / edit / react / markRead / joinRoom / uploadMedia / events surface, each request and response
`safeParse`d against that extension's own zod schemas at the boundary — the same
`normalizeEvent`-shaped validation ADR-0047 §3 already applies to native adapters, applied identically
to whatever crosses the subprocess pipe. A bridge is never more trusted than the wire it came in on;
crossing a process boundary does not exempt an event from validation, it is the reason validation
exists here.

### 4. One shared supervisor shape, not one per extension

`ext-chat`'s `ChatService` and any future mail equivalent should each compose a `SubprocessAdapterHost`
that speaks this contract, rather than each hand-rolling process supervision, backoff, and the
signed-package check independently. Where exactly this shared code lives (a new small package, or
folded into `@tepegoz/mcp-client`'s existing supervisor machinery) is an implementation decision for
whoever builds the first bridge, not fixed here — the requirement this ADR states is that it **is**
shared, not duplicated per extension the way ADR-0047 §4's prose currently is.

## Non-goals

- **No bridge is implemented here.** This is a design document; `@tepegoz/ext-chat` X-chat.8 (the
  actual bridge framework) and X-chat.9 (the first bridges) remain separate, later work — this ADR
  exists specifically so that work has a contract to build against, not to shortcut it.
- **The `background-connection` supervisor** (`phases/extensions/README.md`'s other shared
  prerequisite — keeping an account connected with every surface closed) is a **related but distinct**
  problem: it is about extension *lifecycle* relative to renderer surfaces, applies equally to
  in-process and subprocess adapters, and already has bespoke chat-only wiring
  (`ChatMessenger.init/stop/reconcile/notifyEgressChange`) that this ADR does not touch. Promoting
  that to a generic `@tepegoz/extension-host` mechanism is separate work, tracked separately.
- **MCP itself is untouched.** `manifest.mcpServer` / `@tepegoz/mcp-client` keep meaning exactly what
  ADR-0018 says. `manifest.adapterSubprocess` is a new, parallel capability declaration for a
  different job — a protocol bridge is not "an MCP server ext-chat happens to use," and forcing it
  through MCP's tool-call shape to reuse ADR-0018 verbatim would be the wrong fit, per Context above.

## Consequences

- `ext-chat`'s X-chat.8/X-chat.9 (and any future `ext-mail` third-party provider) have a named
  contract to build against instead of re-deriving ADR-0047 §4's reasoning from scratch or copying its
  chat-specific wording.
- ADR-0047 stays the correct, concrete chat instance of this contract; nothing in it needs to change —
  this ADR sits alongside it, generalizing rather than superseding.
- The `phases/extensions/README.md` "Adapter-as-subprocess contract" shared-prerequisite bullet points
  here as its resolution; the bullet itself should be checked off once this file lands, with the
  actual subprocess package/framework remaining tracked as X-chat.8's own deliverable.
- **Residual risk**, generalized from ADR-0047 §4/Consequences: a compromised or malicious bridge
  binary cannot read outside its state dir, reach another account or instance, egress off the
  profile's binding, or take down the host extension's service — the same guarantee chat already
  states, now named as a contract rather than chat-specific prose.
