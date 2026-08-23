# ADR-0039: User-granted sensitive capabilities — the lockout becomes a grant, not a wall

- **Status:** Accepted (decision layer only — see Consequences)
- **Date:** 2026-08-23
- **Supersedes (in part):** [ADR-0006](0006-policy-kernel-hitl.md) (sensitive-site lockout as an
  absolute deny; CAPTCHA/2FA as a mandatory human handoff)
- **Refines:** [ADR-0033](0033-transaction-mandate-kernel.md) (a mandate now *authorizes* within the
  financial class rather than only narrowing it), [ADR-0035](0035-governed-agent-endpoints.md) (the
  inbound-token rule gains the grant as an additional precondition)
- **Unaffected:** [ADR-0029](0029-devtools-expose-boundary.md) — DevTools exposure is a separate
  boundary and stays user-only, never an agent tool, never on a sensitive site.

## Context

ADR-0006 made four capabilities structurally unreachable: sensitive-site categories (bank / crypto /
health / password-manager), automated clearing of CAPTCHA and 2FA, unattended spending, and unattended
deletion. That was the right default for a product with no way to express user intent ahead of time,
and it closed the whole excessive-agency vulnerability class in deterministic code.

It also made the product unable to do the work people actually want done. The tasks with real value —
pay this invoice, reconcile this statement, log into this portal and file the form — live almost
entirely inside the locked categories. A browser that refuses all of them is safe in the way an
unplugged browser is safe.

The question this ADR answers is **not** "should the agent be trusted with these" — the answer to that
is still no. It is: **can the user authorize a specific, bounded capability ahead of time, in a way the
agent cannot influence, widen, or talk its way into?**

The distinction that makes this tractable is one ADR-0006 already half-drew. It established that
*autonomy* can skip a prompt the kernel raised but can never overturn a `deny`. A **grant** is a
different kind of object from an autonomy level: an autonomy level is a global posture the agent
operates under, while a grant is a specific, revocable, user-authored authorization for one category or
one wallet. Conflating the two is what would be dangerous. Keeping them separate is what makes this
safe enough to ship.

## Decision

**A sensitive capability is unreachable until the user grants it, and a grant is the only thing that
can lift a kernel `deny`. Autonomy still cannot, and the agent still cannot.**

### 1. The lockout becomes a per-category grant, default off

The category map from ADR-0006 (`banking` / `government` / `crypto` / `password-manager` / `health`) is
retained verbatim. What changes is the resolution:

- Every category resolves to `deny` with **no grant present**. That is the shipped state; there is no
  build, profile, or first-run path that starts with one enabled.
- A grant is created only by an explicit user action in the privileged process, carries the category it
  covers, and is independently revocable. Revocation takes effect on the next classification, not at
  the end of the run.
- **`resolveAutonomy` still cannot overturn a `deny`.** The invariant from ADR-0006 is unchanged and
  its test coverage stays. Grants are resolved on a separate input to the kernel, before autonomy is
  consulted at all, so no autonomy level — including `auto` — can synthesize one.
- The agent has no tool that creates, widens, extends, or re-enables a grant. There is no such call in
  the capability plane, which makes this a missing capability rather than a refused one.

Everything else ADR-0006 established about these sites still applies once a grant exists: the calls are
still classified, still tainted when web-derived, still journaled, and biometric confirmation still
applies to anything the kernel marks high-risk.

### 2. CAPTCHA and 2FA are cleared automatically

The Human Handoff Controller stops being the default path and becomes the fallback.

- **Two-factor codes are completed by the Credential Broker**, on the same seam that already fills
  passwords. The model never receives the code, and the code never enters a prompt, a log, or the
  Journal payload — the existing redaction path covers it unchanged.
- **CAPTCHA challenges are attempted automatically.** A challenge the browser cannot clear raises a
  handoff to the user rather than being retried, which is also what the loop detector already enforces.
- This is the one part of this ADR with no security argument in its favour. It is a product decision
  that trades a deliberate limit for task completion, and it is recorded as such. Whether automating a
  given site is permitted remains a matter between the user and that site's terms; the product states
  this in `/legal/terms` rather than implying the question does not exist.

### 3. A wallet mandate authorizes, instead of only narrowing

ADR-0033 built `mandateCovers` / `consumeMandate` as a *narrowing* layer: a mandate could add a
confirmation but never remove the unconditional HITL that the `financial` class requires. That
constraint is what made mandates unable to do the thing they were designed for.

- **Inside an active, unexpired, unrevoked mandate with sufficient remaining limit, the mandate
  satisfies the `financial` HITL requirement.** The user confirmed once, ahead of time, with the
  ceiling, the payee set and the expiry written down — that is a stronger and more auditable consent
  than a modal answered mid-run.
- **Outside a mandate, nothing changes.** A financial call with no covering mandate still forces HITL
  with biometric confirmation exactly as ADR-0006 requires.
- Everything replay-safety-related in ADR-0033 is untouched and load-bearing: `consumeMandate` still
  runs the idempotency check before expiry, so a retried or resumed run cannot double-charge.
- `hitlThreshold` keeps its meaning — a user can still require a prompt above a chosen amount inside an
  otherwise-authorizing mandate.
- **Deletion is not included.** Unattended destructive calls still require an explicit, specific
  confirmation. There is no destructive equivalent of a mandate, because there is no bound that makes
  one safe: a spend has a ceiling, a deletion does not.

### 4. Inbound tokens gain the grant as a precondition

ADR-0035 required the sensitive-site lockout to apply regardless of what a Bearer token claimed. That
rule survives with one added clause: **an inbound token may reach a sensitive category only if a user
grant for that category is active at call time.** A token cannot carry, imply, or substitute for a
grant. The refusal order becomes:

```
revoked → expired → sensitive-site category with no active user grant → tool scope → danger-class scope
```

A token scoped to a category the user has not enabled is still reported as `sensitive_site_lockout`,
for the reason ADR-0035 gave: the site is the structural reason, and reporting the scope failure
instead would be misleading.

## Consequences

- **The strongest claim the product could previously make is gone.** "No autonomy level unlocks them"
  was checkable, absolute, and easy to trust. "Off until you turn it on" is weaker and depends on the
  user understanding what they enabled. Every surface that stated the old claim — the website, the
  threat model, `ai-transparency.md`, the package READMEs — is corrected in the same change rather than
  left to drift.
- **The blast radius of a successful prompt injection now includes whatever the user has granted.** The
  injection still cannot create a grant, but it can act inside one. This raises the value of the
  taint-tracking and egress-firewall layers considerably, and it means the adversarial battery must
  grow scenarios that assume a granted category rather than only unlocked ones.
- **The kernel's structural argument survives intact**, and this is the whole reason the decision is
  shippable: the deny is still deterministic, still pre-model, still in the privileged process, and
  still unreachable by the renderer or the agent. Only the user moved.
- **Automated CAPTCHA clearing removes a defence the project previously advertised**, and it aligns the
  product with the category norm rather than against it. The reputational argument for the old position
  was real and is being spent deliberately.
- Grants and mandates are user-visible state that can be forgotten. A review surface that lists every
  active grant and mandate with its scope and expiry is a prerequisite for this being honest, not a
  follow-up.

### Rejected alternatives

- **Keep the lockout absolute and ship recipes for locked sites anyway.** Rejected: it would put the
  exception in a place with no user-visible record, which is worse than a grant.
- **One global "advanced mode" that unlocks all categories at once.** Rejected: it is an autonomy level
  wearing a grant's clothes, and it breaks the per-category revocability that makes the blast radius
  bounded.
- **Let the agent request a grant mid-run.** Rejected outright: a request the model can initiate is a
  request an injected page can initiate. Grants are created out-of-band or not at all.
