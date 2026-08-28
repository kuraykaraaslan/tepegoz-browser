# ADR-0038: Release & update hardening — the recovery contract

- **Status:** Accepted — design 2026-08-21; safe-mode + crash-counter runtime landed 2026-08-28. The
  updater, `crashReporter` and fresh-profile rungs stay gated on the first public release.
- **Date:** 2026-08-21
- **Closes:** Phase 0 DoD — _"Release & update hardening designed (auto-update + signed rollback +
  crashReporter + safe-mode + corrupt-profile recovery)"_
- **Relates to:** [ADR-0019](0019-chromium-update-cadence.md) (which engine we ship) · this ADR is _how_
  we ship it and what happens when a shipped build turns out to be bad.

## Context

Phase 0's DoD asks for this to be **designed**, with the runtime activated before the first public
release. That split is not procrastination — two of the five pieces cannot be honestly built yet:

- **Update-signature verification** needs a signing identity, and the ship line
  ([`phases/README.md`](../../phases/README.md)) permanently defers Windows code-signing to the production
  gate. Code that claims to verify a signature but has never verified a real one is worse than absent
  code: it reads as a control in review while being untested.
- **Staged rollout / rollback** needs a published feed with more than one version in it.

The other three — crash reporting, safe-mode boot, corrupt-profile recovery — need no certificate. They
are gated only because they are meaningless without an update path to recover _to_.

What must be decided **now** is the shape, because the shape constrains Phase 0 code that already exists:
where user data lives, what a fail-safe read looks like, and what a boot flag may switch off.

## Decision

### 1. The recovery ladder

A browser that will not start is unrecoverable by its own user — there is no UI left to click. Every
failure therefore has to degrade to the rung below rather than to a crash loop:

| Rung          | Trigger                                           | Behaviour                                                                     |
| ------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Normal        | —                                                 | Full app.                                                                     |
| Degraded      | a subsystem fails to initialise                   | That subsystem no-ops, the app runs, the failure is logged.                   |
| Safe mode     | `--safe-mode`, or 2 crashes within 60 s of launch | Extensions + agent + session restore disabled; chrome and one blank tab only. |
| Fresh profile | user data is unreadable or fails migration        | The profile is renamed aside, a new one is created, the app starts.           |

**Degraded is already the rule, not an aspiration.** `database.electron.ts` catches a failed open and
runs with history/journal disabled; `SessionStore` treats a malformed snapshot as "start fresh". This ADR
generalises that existing behaviour into the contract every subsystem follows, rather than inventing a
new mechanism.

**Never delete user data to recover.** A fresh profile renames the old directory
(`tepegoz` → `tepegoz.corrupt-<epoch>`); it does not remove it. A recovery path that destroys the thing
it failed to read is indistinguishable from the bug.

### 2. Safe mode

- Entered by `--safe-mode`, or automatically after **two crashes within 60 s of launch** (a crash counter
  in the user-data directory, cleared once a session survives 60 s).
- Disables: extension host, agent runtime, session restore, MCP connections.
- Keeps: chrome, tabs, preferences, and the settings surface — the user must be able to _fix_ the thing
  that broke, which means reaching settings without the subsystem that broke.

**Shipped 2026-08-28** — `apps/desktop/src/main/recovery/` (`crash-counter.ts` + `safe-mode.ts`), gated
into `index.ts` at the six call sites the list above names. Two details that the design above leaves
implicit and the implementation had to settle:

- **A launch is presumed crashed until it proves otherwise.** The counter is not written by a crash
  handler — a main process killed by the GPU, the OOM killer or a wedged renderer runs no handler. Each
  launch stamps `pending: true`; surviving 60 s or reaching `before-quit` clears it, and the next launch
  reading `pending: true` back is reading a launch that neither survived nor said goodbye.
- **Not restoring is only safe while not persisting.** Safe mode opens one blank tab, so the session it
  would write back is one blank tab — over the only copy the user has. `TabManagerBase.persistNow` is
  therefore suppressed in safe mode; the two halves are one decision, not two features.

The ladder is exercised against the real app in `e2e/crash-recovery.spec.ts`, which kills the process
tree rather than closing it: crash → restore + notice, crash again → safe mode with no restore, clean
quit → the session comes back whole.

### 2b. What the user is told (added 2026-08-28)

Safe mode announces itself (notification center + toast), because a launch with extensions and the agent
switched off is otherwise indistinguishable from a launch where they silently broke.

A restore that followed an **unclean** shutdown also raises a toast, carrying an undo that closes exactly
the tabs the restore opened. This is the deliberate answer to Chrome's blocking "Restore pages?" dialog:
that dialog charges every unclean shutdown — including a power cut — a modal, and asks a question the
user cannot yet answer, since they do not know whether the tabs are what killed the browser. Restoring
first and offering the way back costs a user who does not care nothing at all, and the crash-loop case
the dialog really exists for is covered one rung up, by safe mode. An ordinary launch says nothing.

### 3. Crash reporting — opt-in, redacted, off by default

- `crashReporter` stays **off** unless the user turns it on. No first-run prompt that defaults to yes.
- Minidumps only; no page content, no URLs, no form data.
- Every attached string passes `Logger.redact` (the existing API-key/token redaction) before upload.
- The upload endpoint is configuration, not a constant: a self-hosted collector must be substitutable,
  because "local-first" is a product claim and an unconditional third-party crash endpoint contradicts it.

### 4. Auto-update — refuse rather than trust

When the runtime lands, the ordering is: **verify, then stage, then swap.**

- An update installs only if its signature verifies against the pinned release key **and** its channel
  matches. A failed verification is a silent no-op plus a log line — never a prompt asking the user to
  decide, because the user cannot evaluate a signature.
- Rollback keeps the last-known-good version on disk and reverts if the new version fails to reach a
  successful start twice in a row — the same crash counter safe mode uses.
- Until a signing identity exists, **the updater is not wired at all**. `electron-builder.yml` carries no
  `publish` block on purpose: a half-configured feed is how an unsigned build reaches a user.

### 5. What this forbids

- No "phone home on every launch" telemetry. Update checks are the only unsolicited outbound call, and
  they carry version + channel, nothing else.
- No claim, in any phase document, that a build is signed or that updates are verified, until a real
  certificate has produced a real signed artifact. The ship line already states this; it is repeated here
  because this is the ADR someone will read when wiring the updater.

## Consequences

- Phase 0 closes on the design, honestly, with the certificate-dependent runtime named as deferred rather
  than quietly ticked.
- The crash counter is shared by safe mode and update rollback — one mechanism, two consumers, so a bad
  update and a bad extension recover through the same tested path.
- The fresh-profile rung means a corrupt profile costs the user their session, not their data.
- **Landed (2026-08-28):** the crash counter and the safe-mode switch, with the session-restore notice +
  undo built on the same signal. See section 2 above.
- **Still owed before the first public release:** the updater runtime, opt-in `crashReporter`, and the
  profile-rename (fresh-profile) recovery. None of those three is claimed as present today.
