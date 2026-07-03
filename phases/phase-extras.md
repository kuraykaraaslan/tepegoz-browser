# Phase E — Extras (special-track, demand-gated)

**Status:** ⬜ Not started  ·  **Estimate:** n/a (each item is its own track)  ·  **Depends on:** demand, not a phase

**Goal:** Home for capabilities that are **sound but cannot be done in routine feature development** — they
need a separate build/signing track, a third-party license, or upstream infrastructure we don't control, and
they are **not** on the Phase 0–12 critical path. Items here are **not sequenced by number**; each is promoted
into its own branch/ADR only when concrete demand is shown. Parking them here (instead of "discovering" them
late) keeps the cost and the decision explicit.

> This is deliberately the **last** thing on the board. Nothing in Phases 0–12 depends on it. An item graduates
> out of "Extras" the moment it has a real user/buyer pull; until then it stays a recorded decision, not work.

## Items

### DRM / protected media (Widevine / EME)
- [ ] **Decision-gated, not started.** Standard Electron ships **no Widevine**, so Netflix/Spotify-class
      protected media will not play. Enabling it is **not a routine feature PR**:
  - Requires **castLabs' ECS (Electron for Content Security) build** in place of vanilla Electron, plus a
    **VMP (Verified Media Path) signature** — a separate build + signing pipeline with its own licensing.
  - Reconcile with our security fuses (`onlyLoadAppFromAsar`, asar integrity) and the code-signing identity
    (Phase 0) — the ECS build changes the base binary the whole distribution sits on.
- [ ] **Current stance:** out of scope for an agentic-automation browser. Revisit **only** if general-purpose
      streaming demand is shown; if promoted, it starts with its own ADR (media/DRM scope + ECS/VMP cost).
- **Why here:** the reviewer's "expensive to discover late" warning is real — recorded as an explicit,
  demand-gated decision rather than an assumed-supported feature.

<!-- Future special-track extras (license/build-pipeline/upstream-gated, off the 0–12 critical path) land here. -->
