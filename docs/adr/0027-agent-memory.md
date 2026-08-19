# ADR-0027: Agent memory is advisory, tainted, and re-validated — never a second instruction channel

- **Status:** Accepted
- **Date:** 2026-08-19
- **Refines:** [ADR-0006](0006-policy-kernel-hitl.md) (deterministic policy kernel + HITL) ·
  **complements** [ADR-0003](0003-sqlite-persistence.md) (SQLite persistence) and
  [ADR-0014](0014-user-data-layout-db-connector.md) (user-data layout)
- **Phase:** [S9 — Memory & Skills](../../phases/ai-agent-super/phase-s9-memory-skills.md) PR1–PR5

## Context

Without cross-run memory the agent re-derives the same site every visit: it re-reads the same catalogue,
re-discovers the same drawer, and re-spends the same tokens. That is the ordinary case for making a
browser agent remember things.

The uncomfortable case is the other one. A store that shapes future behaviour is a place an attacker can
leave instructions, and a browser visits attacker-controlled pages *by definition*. The attack is not
hypothetical and not novel — it is **seed on visit 1, cash on visit 2**: a page publishes a "site tip for
automated assistants", the agent writes it down as a helpful fact about the domain, and on the next visit
that text arrives in the context window wearing the user's own trust. Retrieval-time filtering does not
answer this, because by then the attacker's text is already sitting in the user's database, waiting.

So memory cannot be designed as storage with security bolted on afterwards. The threat model has to be
part of the data structure.

## Decision

**Remembered content is third-party text with no authority, at every point in its lifecycle.** Four
properties, each enforced by construction rather than by convention:

1. **Filtered on WRITE, not only on read.** `decideWrite` runs `detectThreats` before anything is
   persisted, and returns the threat kinds with the refusal so the drop is journallable. A silent discard
   would hide an attack in progress. Retrieval-side sanitization still runs — a stored note is
   third-party text *every* time it is used, not just the first time.
2. **Advisory by construction.** Recalled notes are injected as `role: 'user'` observations **outside**
   the trusted task fence. They can inform a decision and can never be one; anything they suggest still
   crosses the ToolGateway PEP exactly like a fresh model decision. The policy ceiling is therefore
   unchanged by what a site remembers about itself.
3. **Re-validated against the live DOM.** A hint carries a durable descriptor (`tag`/`role`/`name`),
   never a positional ref, and is discarded if that descriptor no longer resolves. Staleness must degrade
   to *no hint*, never to a wrong click.
4. **Quarantine keeps the row.** A hint whose use preceded a *policy denial* stops being offered and
   **stays**, flagged. Deleting it would erase the evidence along with the attack. Quarantine requires a
   denial, never mere task failure: conflating the two would quarantine the whole store on a bad day.

**The store does not trust its own rows.** Every read `safeParse`s and drops what fails. A row written by
an older build, or left by a poisoning attempt that predates the write filter, is untrusted input exactly
like page text — a store that trusts itself is one an attacker only has to reach once.

**Remembered grants cannot creep.** `expires_at` is `NOT NULL`, expiry is applied *in the query* so an
unswept grant is still dead, a grant is scoped to a task **and** a host (never global), and a SQL `CHECK`
keeps `credential`, `financial`, and `destructive` out of the table entirely. Those tiers are only ever
asked. A remembered grant skips re-asking for something the user already agreed to, inside a window they
can see and revoke; it can never raise the ceiling.

**Sync-ready from day 0.** All three tables carry sync-meta (UUID PK, `device_id`, `updated_at`,
`version`, `tombstone`), so Phase-3 cloud sync owes no migration. Deletes are soft, because a hard delete
on one device is indistinguishable from a row that never synced.

**A skill can never start itself, and never chooses a scheme.** Selecting a skill fills the composer and
stops — the send gesture that authorises a task stays with the human. Its stored start URL is validated
to `http`/`https` before it reaches a tab: a skill row is persisted data that can arrive from an older
build, a restored profile, or a future import path, and `javascript:` is a scheme.

**A remembered grant is scoped to a named skill and bound by its stored prompt.** An ad-hoc typed task
can neither mint nor match one — there would be nothing for the user to recognise or revoke weeks later.
The renderer supplies the skill id and the main process honours it only while the run prompt still
matches that skill's stored prompt, which is what stops an untrusted renderer from naming whichever
skill holds the widest grant. Grants are consulted in order of narrowing authority: plan grant (one
run) → remembered grant (one skill, one site, 30 days) → autonomy level (every run). A taint prompt is
never covered: when the kernel asked *because* web-derived data reached a side-effecting call, a saved
answer from last week is not consent for what the page said today.

**A skill is a template, not a recipe.** A named prompt + start URL + expected grant profile, which still
runs the ordinary reactor loop over a live page. The ownership test against Phase 6 is *"if the model
could be removed from the replay, it's Phase 6"* — a skill is a starting point, not a signed
deterministic replay.

## Consequences

**Positive.** The seed-and-cash attack has to defeat a write filter, a read-side sanitizer, an
out-of-fence injection point, and the PEP — four independent controls, not one. Poisoned rows that do get
in are quarantined rather than destroyed, so an investigation can still see what was planted and when.
Grants expire whether or not anything sweeps them.

**Negative / accepted.** The write filter is a heuristic and will drop legitimate notes that happen to
read like instructions — this is not theoretical: it redacted a framing sentence in our own recall block
during development, and the sentence had to be reworded. The guard cannot tell whose text it is reading,
and we prefer that failure direction. Re-validation costs a DOM resolve per descriptor-bearing hint.
Capping hints per host means a site with a lot to say gets partially remembered.

**Deviation (placement, twice).** There is no `@tepegoz/agent-memory` package. The decision layer lives in
`@tepegoz/tool-executor`, which already owns `content-guard` (the write filter) and `dom-path`
(`findByLocators`, the re-validation resolver); memory sits beside the two things it is made of rather
than importing both across a new boundary. The tables are in `@tepegoz/persistence` with the other
stores. Neither is `apps/desktop`, which is what the extraction rule protects.

Nor does the grant consult live inside `policy-kernel.ts`, where the phase plan put it. The kernel is a
pure function of (tool, taint, target) with no I/O, and giving it a database handle would make every
security decision depend on storage being reachable. The coverage **rule** is pure and unit-tested in
`security-policy/remembered-grants.ts`; the row-reading lives in the main process and is consulted at the
same pre-model point as the plan grant. ADR-0006 ordering is preserved: the kernel decides first, and a
grant is only ever consulted where it already said *ask*.

**Owed, and stated rather than implied.** The domain-memory recall seam has no host wiring, so no
production run reads or writes a *hint* today — that mechanism landed, that behaviour is not switched on.
Revocation of a single saved permission means deleting the skill that holds it; a standalone grant manager
is not built. And the efficiency claim (≥25% wall-clock **and** tokens on a
repeat visit) plus the poisoned-hint ship gate (0 violations at N≥10) are **measurement-owed**, blocked
on a funded model key.
