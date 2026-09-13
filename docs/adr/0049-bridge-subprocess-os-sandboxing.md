# ADR-0049: Real OS-level sandboxing for a bridge subprocess — filesystem and egress confinement ADR-0047/0048 named but did not build

- **Status:** Proposed (design only — no implementation; unblocks X-chat.8's "Isolation" deliverable
  and Functional DoD, see [`phases/extensions/ext-chat.md`](../../phases/extensions/ext-chat.md))
- **Date:** 2026-09-13
- **Refines:** [ADR-0047](0047-chat-protocol-adapter-and-bridge-trust-model.md) §4 and
  [ADR-0048](0048-adapter-subprocess-contract.md) §2 — both **assert** "no filesystem access beyond
  its own state directory" and "its own egress binding" as bridge-subprocess guarantees, but neither
  names an enforcement mechanism. This ADR is that mechanism, or names honestly why one is not
  available on a given platform.
- **Relates to:** [ADR-0011](0011-vpn-network-privacy.md) (fail-closed egress binding — the policy
  convention this ADR follows) · [ADR-0022](0022-file-operations-sandbox.md) (an in-process path
  check; explicitly not a precedent that transfers to a subprocess — see Context) ·
  [ADR-0040](0040-download-trust-model.md) (risk-acknowledgement-screen pattern, reused here for the
  degraded case) · `packages/adapter-subprocess` (the generic supervisor this ADR adds a confinement
  layer underneath, not inside)

## Context

`ADR-0048 §2` states four guarantees for any adapter subprocess. Two of them — "no filesystem access
beyond its own state directory" and "its own egress binding" — were never given a mechanism, and
`ADR-0047 §4`'s original chat-specific prose has the same gap. The code built since (X-chat.8,
2026-09-13: `@tepegoz/adapter-subprocess`'s `ProcessSupervisor`, `SubprocessChatAdapter`, the real
`echo-bridge` Functional-DoD test) says so explicitly in its own docstrings: `cwd`/`env` are
**forwarded** to `spawn()`, which tells a cooperative child where to run — it does not stop a hostile
one from opening any other path or dialing any other host. This ADR was written after auditing the
rest of the codebase for anything that already closes this gap, and confirming nothing does:

- **`ADR-0022`'s file-operations sandbox** is `assertMembership(realPath)` — a path-prefix check
  inside this app's *own* IPC handlers. It constrains code that goes through that handler; it is
  meaningless against a process with its own direct filesystem syscalls, which a spawned child always
  has.
- **The Phase-5 egress binding** (`packages/socks5`, ADR-0011) is `session.setProxy(...)` on
  Chromium's own network stack. A separately-spawned child's own sockets never pass through Electron's
  `session` at all — this binds the browser, not an arbitrary OS process.
- **The renderer sandbox** (`contextIsolation`/`sandbox: true` in `apps/desktop/src/main/window.ts`)
  is real OS-level confinement (Chromium manages seccomp-bpf on Linux, job objects on Windows, an
  App-Sandbox-adjacent mechanism on macOS) — but Electron/Chromium own and drive it for a
  Chromium-hosted renderer process. It is not a mechanism this codebase can point at an arbitrary
  spawned Node/binary child; there is no equivalent lever exposed to us.
- **`packages/native-rs`** is a placeholder (`Cargo.toml`'s napi bindings are commented out, `lib.rs`
  is empty) — nothing here to build on, but see Decision §3: this ADR gives it its first concrete job.
- **The app never elevates.** `electron-builder.yml` sets no `requestedExecutionLevel` (NSIS default:
  per-user, `asInvoker`); macOS `hardenedRuntime` is not enabled. Any design assuming admin/root, a
  signed kernel driver, or a UAC prompt is a design this app cannot ship without a much larger,
  separate change to how it's installed and run — out of scope here.

**The threat model is a compromised or malicious bridge**, not a merely buggy one: X-chat.9's bridges
are either a thin wrapper this codebase writes around a vetted client library (cooperative — its
network calls are code this project controls) or a pre-built third-party daemon spawned as-is
(uncooperative — its network calls are opaque, and a common Unix convention of honoring
`ALL_PROXY`/`HTTPS_PROXY` env vars is a courtesy, not a guarantee a hostile or careless binary
observes). The mechanism below has to hold even against the uncooperative case, or it is not a
security boundary — it is the same `cwd`/`env` forwarding this ADR exists to go beyond.

## Decision

### 1. Egress: deny the capability, don't police the socket

The strongest available mechanism, and the only one available on all three OSes without elevation, is
not to firewall an arbitrary child's outbound connections — there is no no-admin way to do that
symmetrically on Windows — but to **not give the child a network capability at all**, and give it a
proxied path back to the parent's already-audited, already-egress-bound transport instead:

- **Windows:** launch the bridge inside an **AppContainer** (`CreateAppContainerProfile` +
  `CreateProcess` with the container's security capabilities) with **no network capability SID**
  granted (`internetClient`/`internetClientServer`/`privateNetworkClientServer` all omitted).
  AppContainers are a standard-user mechanism (the same one UWP/Store apps use) — no elevation
  required, available since Windows 8. A process inside one that owns no network capability cannot
  open a socket; the kernel's security reference monitor enforces it, not a firewall rule the process
  could out-drive.
- **Linux:** an unprivileged **network namespace** (`unshare -n` or the equivalent `clone()` flags)
  with no interface configured beyond loopback — the child has a working localhost (for the RPC pipe,
  which is stdio anyway, so not even needed for that) and no route to anywhere else. Unprivileged user
  namespaces are the prerequisite and are **not universally available** — some distributions disable
  `kernel.unprivileged_userns_clone` by default. See §4 for the fail-closed answer when they are.
- **macOS:** a `sandbox-exec` profile denying `network-outbound` (and `network-inbound`) entirely.
  Apple has deprecated `sandbox-exec` for third-party use and could remove it in a future release —
  flagged as a real platform risk, not a hidden one, and revisited if it happens.

**A cooperative bridge that needs the network** (which is every real one — a Telegram/Slack/Discord
client has to reach its own servers) gets it back through the RPC channel `@tepegoz/adapter-subprocess`
already carries: two new adapter-subprocess-contract methods, a bridge-initiated `openSocket` /
`fetch` **request** the parent fulfills using the same `ChatTransport` a native adapter already uses —
the one already placed on the active profile's egress binding (ADR-0011). This is not a new trust
seam; it reuses the one this codebase already audits and tests. A bridge that is an uncooperative
third-party binary talking raw TCP directly, with no knowledge of this RPC surface, simply **cannot
reach the network at all** once the OS capability is denied — which correctly fails closed for exactly
the binaries this ADR cannot otherwise vet, and is the reason X-chat.9's plan (ADR-0047 §8) already
requires **a thin wrapper this project writes**, not a bare third-party daemon spawned unmodified, for
any bridge that needs to actually communicate. The `openSocket`/`fetch` RPC shape itself is
implementation detail for whoever builds the first bridge (X-chat.9), not fixed by this ADR.

### 2. Filesystem: platform-native capability restriction, not a firewall on `open()`

Parallel reasoning, parallel mechanism family:

- **Windows:** the same AppContainer additionally scopes filesystem access — an AppContainer process
  can read/write only its own per-package storage folder and any path explicitly ACL'd to its capability
  SID. The state dir is created with that ACL; nothing else is.
- **Linux:** the same unprivileged mount namespace bind-mounts *only* the state dir into the child's
  view (a `pivot_root`/private-`/`-tree pattern, the mechanism `bwrap`/Flatpak's sandboxing already
  uses in the wild — this ADR proposes the same primitive, not a new one, whether or not this project
  ends up shelling out to an existing tool like `bwrap` versus calling the syscalls directly is an
  implementation choice for whoever builds this).
- **macOS:** the same `sandbox-exec` profile's `file-read*`/`file-write*` rules, scoped to the state
  dir subtree only.

### 3. This needs native code — `packages/native-rs` gets its first real job

Node's standard library exposes none of AppContainer creation, Linux namespace `clone()` flags beyond
what `child_process` already covers, or macOS `sandbox-exec` invocation with a programmatically-built
profile. A small `packages/native-rs` addition (`napi-rs`, already the placeholder's intended
toolchain per its own README) is the natural home: a `spawnConfined(command, args, env, stateDir,
networkCapability: boolean)` binding per platform, called from `@tepegoz/adapter-subprocess` as an
alternate `SpawnFn` implementation rather than a change to its own architecture — the injectable
`SpawnFn` seam (built in X-chat.8 specifically so a test can supply `FakeChild` without touching the
OS) is exactly the seam a confined real spawn plugs into.

### 4. Fail-closed when confinement is unavailable, matching ADR-0011's convention

If the platform-specific mechanism cannot be established — Linux with unprivileged namespaces
disabled being the realistic case, or any future platform this ADR has not accounted for — **the
bridge does not start**, surfaced as that account going to an `error` state with a message naming the
reason, not silently downgraded to unconfined. This matches ADR-0011's "fail-closed by construction"
answer to the same shape of question (an unconfined bridge is exactly the kind of silent, permanent
security regression ADR-0011 §"fail-closed" already refuses for egress). A user who wants the bridge
anyway on a machine where confinement is unavailable goes through an explicit
risk-acknowledgement screen, the same pattern ADR-0040 already established for WhatsApp's own
caveated, unofficial path — not a default, and not silent.

## Non-goals

- **No bridge is implemented here** — same posture as ADR-0048. This is the confinement mechanism
  X-chat.8's echo-bridge Functional DoD can eventually close against; building it is separate,
  scoped work, not started by this ADR.
- **No memory-budget enforcement** is added here either — still the flagged, separate gap
  `phases/extensions/ext-chat.md`'s X-chat.8 status already names (Node has no cheap cross-platform
  child RSS read without the same native-code investment this ADR already requires for §1/§2; bundling
  it into the same native-rs work once that lands is a reasonable follow-up, not decided here).
- **Cooperative proxy-env-var honoring** (`ALL_PROXY`/`HTTPS_PROXY` set for a bridge that happens to
  respect them) may still be set as a courtesy/defense-in-depth layer for a cooperative bridge, but it
  is explicitly **not** the security boundary this ADR provides — §1's capability denial is.
- **This ADR does not pick which platform gets built first.** Ordering (Linux is plausibly the
  cheapest first slice: no code-signing entitlement questions, namespace primitives are well-documented)
  is an implementation-scheduling decision for whoever picks up X-chat.8's Isolation deliverable next,
  not fixed here.

## Consequences

- X-chat.8's "Isolation" deliverable and Functional DoD gain a real mechanism to build and test against
  instead of the honestly-documented gap `phases/extensions/ext-chat.md` currently states.
- `packages/native-rs` moves from a pure placeholder to having its first concrete, justified scope —
  its README's Phase-1b placeholder status should be updated once work against this ADR starts.
- A bridge author (X-chat.9) writes to the `openSocket`/`fetch` RPC surface for any network access,
  the same way a native adapter writes to `ChatTransport` — this is a real constraint on how a bridge
  wrapper is written, not just an isolation detail; it should be stated in whatever
  bridge-authoring/manifest documentation X-chat.9 produces.
- **Residual risk, named honestly:** a platform this ADR did not anticipate, or a future OS change
  that removes `sandbox-exec` on macOS, degrades that platform back to the fail-closed
  risk-acknowledgement path (§4) rather than silently to unconfined — but a user who accepts that
  screen is, by definition, running an uncomfined bridge on their machine. This ADR reduces that to an
  explicit, rare, user-chosen exception instead of the current universal, silent default.
