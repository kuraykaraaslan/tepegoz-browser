# ADR-0029: DevTools expose boundary — for the user, never for the agent, never on a bank

- **Status:** Accepted
- **Date:** 2026-08-19
- **Refines:** [ADR-0006](0006-policy-kernel-hitl.md) (sensitive-site lockout) ·
  **complements** [ADR-0007](0007-capability-plane-mcp.md) (single tool plane)
- **Phase:** [2b — Daily-Driver Browser UX](../../phases/product/phase-2b-daily-driver-ux.md)

## Context

A browser without DevTools is not a credible daily driver for the people most likely to try this one.
Chromium already ships every panel — network, performance, memory, console, accessibility, security,
storage — so exposing them is a wiring decision, not a feature to build.

But this browser also contains an agent that drives the UI, and it contains a policy kernel that locks
automation out of banking, crypto, health and password-manager sites. A DevTools window is a live,
scriptable console attached to an authenticated session. Wiring it in without deciding where it may open
would quietly hand the most powerful surface in the product to exactly the pages the rest of the product
refuses to touch.

The phase required this ADR **before any code**. Part of the decision was already made and shipped
without one: "Inspect element" in the page context menu has been opening DevTools on any page, including
a bank.

## Decision

**DevTools is exposed to the user and is never an agent capability.** There is no `devtools_*` tool in
the Capability Plane and there will not be one. This is enforced by a committed test
([`no-devtools-tool.test.ts`](../../packages/capability-plane/src/no-devtools-tool.test.ts)) rather than
by this sentence, because the failure mode is a plausible one: somebody adds `devtools_get_console` to
help the agent debug a stuck page, and it looks helpful right up until a prompt-injected model has a
scriptable console on an authenticated session.

**DevTools does not open on a sensitive site.** The gate is
[`mayOpenDevTools`](../../packages/security-policy/src/devtools-policy.ts), which reuses the _same_
sensitive-site list the kernel already locks automation out of. One list, one meaning: the sites where a
session is worth the most are the sites where the most powerful surface stays shut.

This is not protecting the user from themselves. "The agent cannot open DevTools" and "nothing that
reaches the chrome can open DevTools on a bank" are different guarantees, and only the second survives a
compromised renderer or a mis-wired context menu.

**The gate sits at the one place DevTools is opened**, so a future caller cannot route around it —
including "Inspect element", which is DevTools with a starting point rather than a different capability.

**A refusal is explained, not silent.** `mayOpenDevTools` returns a reason and callers surface it. A
shortcut that quietly does nothing reads as a broken browser, and a user who thinks the browser is
broken goes looking for one that is not.

## Consequences

**Positive.** Chromium's panels come free, the agent's tool plane gains nothing, and the sites where a
session matters most keep their strongest surface closed. The existing "Inspect element" hole is closed
by the same change that adds the shortcut.

**Negative / accepted.** A developer who genuinely needs to debug their own banking application in this
browser cannot, and will have to use another one. That is a real cost, accepted deliberately: the
alternative is a per-site override, which is a setting that exists to be turned on by whoever is asking
for it — including a page that asks convincingly.

**Owed, and stated rather than implied.** The menu entry and the F12 / Ctrl+Shift+I accelerator are not
wired; only the gate and the toggle behind it are. Device/mobile emulation is not exposed. The
production-hardening reconciliation with `disableDebugger` is not done. Recording device-emulation state
as a journal observation is not done, because emulation is not exposed yet.

## Correction (2026-09-22) — the accelerator half of "owed" was stale; the menu entry never was owed

Checked against the running code rather than assumed, because this paragraph had gone stale in two
different directions at once:

- **Ctrl+Shift+I was already fully wired**, not owed. `@tepegoz/shortcuts` registers it
  (`{ id: 'devTools', key: 'i', ctrlOrCmd: true, shift: true, scope: 'main' }`), `keyboard-shortcuts.ts`
  dispatches it straight to `toggleDevToolsGated` — the same gated entry point `mayOpenDevTools` sits
  behind — and `keyboard-shortcuts.test.ts` ("Ctrl+Shift+I routes to the gated DevTools toggle") has
  covered the routing since the change that closed the original "Inspect element" hole. This ADR's own
  Decision section already said as much ("The gate sits at the one place DevTools is opened"); the Owed
  paragraph below it had simply not been updated to match.
- **F12 genuinely was unbound** — confirmed by reading `@tepegoz/shortcuts`' registry (no `f12` entry
  existed) and finding no other binding for it anywhere in the app. Closed in the same change as this
  correction: `@tepegoz/shortcuts` gained `{ id: 'devToolsF12', key: 'f12', scope: 'main' }`, a second id
  for the same action rather than a new one — the shape `focusAddressBar`/`focusAddressBarAlt` already
  uses — and `keyboard-shortcuts.ts` routes both `devTools` and `devToolsF12` to the identical
  `toggleDevToolsGated` call. No second gate, no second path.
- **The menu entry was never actually owed; it is an intentional non-goal.** `application-menu.ts`'s own
  header explains the design: Windows/Linux ship no application menu at all, and macOS keeps only App +
  Edit (both role-only, editing-focused); "the keys it used to answer are registered in
  `@tepegoz/shortcuts` ... Nothing that reaches DevTools, zoom, or window lifecycle is in it." One owner
  per key, on purpose, so a menu row can never become a second, ungated way to reach DevTools. This
  correction removes the menu entry from "owed" rather than building one.

**What remains owed, unchanged by this correction:** device/mobile emulation is still not exposed, the
`disableDebugger` production-hardening reconciliation is still not done, and device-emulation state is
still not recorded as a journal observation (because emulation is still not exposed). None of those three
were investigated as part of this correction and none should be inferred closed.
