# Phase AI-7 — Navigation Grounding (evidence-gated URLs, visible-nav-first, no escape-hatch)

**Status:** 🟡 In progress — **code landed + unit-tested; on-harness live measurement owed.**  ·  **Depends on:** [AI-2](phase-ai-2-perception-buildtree.md), [AI-3](phase-ai-3-agent-loop.md), [AI-4](phase-ai-4-action-vocabulary.md)  ·  **Track:** [`phases/ai`](README.md)

> **Landed 2026-07-23 (PR1, code + unit tests; provider-agnostic).** The pure capability + the wiring + the
> measurement are in; the honest **live-model on-harness numbers are still owed** (per the anti-vanity
> contract, code ≠ proven — a live N≥3 run is the remaining evidence, gated on a model key + the Electron ABI).
> - **Candidate resolver** — [`orchestrator/src/navigation-grounding.ts`](../../packages/orchestrator/src/navigation-grounding.ts):
>   pure, ranks visible-link → sitemap-backed, each tagged with its evidence source; an ungrounded origin+path
>   is **never** synthesized. `buildNavigationGuidance` emits the deterministic model-facing steer.
> - **Sitemap/robots reader** — [`web-tools/src/sitemap-reader.ts`](../../packages/web-tools/src/sitemap-reader.ts):
>   Electron-free (injected fetch seam), zod-validated, bounded (byte/entry/child-index caps), per-origin cached,
>   **SSRF-safe by same-origin construction** (+ the host fetch disables redirects). Wired into the reactor loop
>   via an additive `groundNavigation` hook (absent ⇒ legacy path unchanged; sitemap discovery over `@tepegoz/http`).
> - **`web_search_items` surfaced + gated** — reactor/planner prose now steer to it for a genuinely off-site
>   destination, and its tool description says it is **not** a shortcut around on-page work.
> - **`s31` escape metric** — [`agent-eval/src/escape-metric.ts`](../../packages/agent-eval/src/escape-metric.ts)
>   + record/metrics/report: measures how often a run left the task's site or web-searched; an **`escape-bait`**
>   fixture whose only answer is behind an on-page modal+form makes it bite.
> - **Prose subsumed (the AI-6 retirement, done here):** the blind "append `/blog`/`/posts` to the origin"
>   guidance is **removed** from `reactor.ts`/`planner.ts`, replaced by the grounded ordering; prompt-string
>   tests updated.
> - **Fixtures:** `url-hallucination-trap` (guessed `/blog` 404s; real blog behind a menu), `sitemap-only-route`
>   (path only in `sitemap.xml`), `escape-bait`, and a `sitemap.xml`+`robots.txt` added to `blog-not-linked`.
>
> **Adversarial review pass (2026-07-23).** A 12-agent review-then-verify workflow (5 dimensions ×
> refute-first verification) hardened the change; all confirmed findings were fixed + regression-tested:
> label-length cap + push the steer as a plain message (a hostile long link name can no longer collapse the
> just-read snapshot); relevance scored over **path/label tokens relative to the current directory** with a
> prefix (not substring) bonus (kills host-name / cross-word / shared-sub-path false matches); `tab_create_item`
> added to the escape vectors; the grounding await is **time-boxed + abort-re-checked** and the reader bounds
> its sitemap count (no ~180s stall on a hostile origin); the sitemap cache key is origin+dir (no bare-origin
> collision); a same-origin guard in the resolver as defense-in-depth; `escapeRate` excludes off-site runs;
> and `blog-not-linked` moved its ground truth to a **non-conventional but groundable** path so a blind `/blog`
> guess 404s while the sitemap route still resolves (no more vanity pass).
>
> **Owed (PR2):** the live N≥3 eval numbers (escape-rate down + `url_hallucination_trap`/`sitemap_only_route`
> flip to pass, held-out no-regress) on both the OpenAI cross-check and the Anthropic product default.
**Goal:** Stop the agent from **leaving the page prematurely** when the real work is *on* it. The two escape
vectors are the same anti-pattern wearing different hats: **fabricating a URL** and **bailing to
`web_search`** (or off-origin navigation) to dodge a hard in-page subtask (a menu, a modal, a form). Encode
one ordering — *exhaust the visible on-page route → search only when the destination is genuinely off-site
→ guess a conventional path only when the DOM or a sitemap supports it* — **in code**, not as a
system-prompt sentence. This is the code that lets [AI-6](phase-ai-6-consolidation.md) finally delete the
`/blog`-guessing prose.

## Why (the systematic gap — from the 2026-07 external audit, `s01`)

The "try `/blog`, `/posts`, `/about`" heuristic lives **only as prose** in the reactor
`BROWSING_STRATEGY` ([`reactor.ts:285-304`](../../packages/orchestrator/src/reactor.ts)) and the parallel
planner guidance ([`planner.ts:92-95`](../../packages/orchestrator/src/planner.ts)). Nothing in code
enforces "visible navigation first," and — worse — the prose **contradicts** the desired behaviour: it
tells the model to *append a conventional path to the origin* with **no DOM-link or sitemap gate**. A grep
for `sitemap`/`robots` across the repo returns **zero** hits — there is no sitemap/robots parsing anywhere.

Meanwhile a genuine "find X when the destination is unknown" primitive already ships and is live in the
reactor's tool set — `web_search_items` (a real DuckDuckGo fetch,
[`web-tools-host.electron.ts`](../../apps/desktop/src/main/web/web-tools-host.electron.ts), registered
always-on at [`index.ts`](../../apps/desktop/src/main/index.ts)) — but `BROWSING_STRATEGY` **never steers
the model to it**. So the model reaches for URL fabrication precisely when it should be searching or
reading the page's own links.

**The mirror-image risk (external audit `s31`): `web_search` as an escape hatch.** Surfacing search
(above) is right, but search + URL-guessing are *also the most common competence anti-pattern* — the agent
**bails off the page** rather than doing the hard on-page work (open the drawer, dismiss the modal, fill the
form, page through the list). Today `web_search_items` is a fully **un-gated** `read` tool with a neutral
description ([`web-tools.ts:26-29`](../../packages/web-tools/src/web-tools.ts)) and **nothing measures the
escape** — no "left the target origin / used search when an on-page route existed" signal exists (it is
absent from the `s26` metric set too). The only counter-force is the AI-3 don't-give-up prose + the
completion validator, and neither fires on a *search*, because a search is a legitimate-looking action, not
a `finish`. So both escapes must pass through **one** gate: *is the visible on-page route exhausted?*

This is **empirically confirmed, not hypothetical**: the first live-model run
([`eval-results-2026-07.md`](eval-results-2026-07.md), finding #4) names the escape hatch *the biggest
remaining competence anti-pattern* — on hard multi-step tasks the agent navigated to a guessed `target.com`
or web-searched "how to dismiss a cookie banner" instead of using the on-page widget, across
`blog_behind_menu`, `shadow_dom_nav`, `div_button_products`, and the new `cookie-consent`/`login-form`/
`contact-form`/`pagination` scenarios. It is called out there as **the next high-leverage competence
target**, mapping to this phase + AI-4 `s16`.

## What "grounded navigation" means (the ordering, in code)

1. **Exhaust the visible on-page route first (persistence gate).** Prefer a link/button already in the
   [AI-2](phase-ai-2-perception-buildtree.md) element snapshot (with its `href`), or one revealed by opening
   a menu/drawer, dismissing a modal, scrolling (`scroll_to_text`), or paging. Any *escape* — search,
   off-origin nav, or a guessed path — is only considered **after** this route is genuinely exhausted, not
   as a first move to dodge a hard subtask. This gate governs steps 2 and 3 below.
2. **Search only when the destination is genuinely off-site / unknown.** With the persistence gate passed,
   `web_search_items` is the first-class "I don't know the URL" primitive instead of typing a guessed URL
   (respecting the URL allow-list / Policy plane). It is **not** a shortcut around on-page work: a search
   whose answer was reachable on the current page is an *escape*, and is what the `s31` measurement below is
   built to catch.
3. **Guess only on evidence.** A conventional path (`/blog`, `/login`, `/checkout`, …) is allowed **only
   when the DOM or a sitemap supports it**: a candidate derived from an on-page link/anchor, or an entry in
   the origin's `sitemap.xml` (discovered via `robots.txt`). An ungrounded origin+path concatenation is
   **not** offered as an action; if nothing is grounded, the agent persists on-page, searches (gate
   permitting), or finishes with a clear limitation — it does not blind-poke `/blog`.

## Exit criteria (DoD)
- [x] A **navigation-candidate resolver** (pure, package-level; zod at the element-read boundary) that, given
      the goal + the current element snapshot, returns candidates ranked **visible-link → sitemap-backed path**,
      each tagged with its *evidence source*. An origin+path with **no** DOM/sitemap backing is never returned
      as a candidate. *(The planned "search-result" tier is represented by the guidance builder's search
      suggestion, not a resolver candidate — the resolver is pure and cannot itself run a search; recorded
      deviation.)*
- [x] A **sitemap/robots reader**: fetch `robots.txt` → `Sitemap:` entries → `sitemap.xml` (bounded,
      through `@tepegoz/http`, cached per origin). A path is confirmable against it; absent/unreachable
      sitemap → that path is simply ungrounded (no guess), not an error. *SSRF is closed by **same-origin
      construction** (the reader only ever fetches the current origin's own robots/sitemap) + redirect-disabled
      host fetch — there was no existing URL-allow-list/Egress plane for outbound fetches to reuse (audit gap).*
- [x] `web_search_items` is **surfaced in the browsing strategy** as the destination-unknown move.
- [x] **`s31` — the search/off-origin escape is behind the persistence gate** (steer, not block): the tool
      description + strategy make clear search is *not* a way to skip a menu/modal/form, and a grounded on-page
      candidate is preferred; a legitimately off-site task can still search.
- [x] **`s31` measurement — escape rate.** The harness records an escape metric (left the task's site / used
      `web_search`), folded into `AcceptanceMetrics.escapeRate` + surfaced in the report; the **`escape-bait`**
      fixture (answer behind an on-page modal+form) gives it teeth. *(Escape is scored over fixture "sites";
      genuinely off-site realUrl scenarios are excluded, since leaving is legitimate there.)*
- [x] The `/blog`-guessing **prose is removed** from `reactor.ts` `BROWSING_STRATEGY` and `planner.ts` (the
      [AI-6](phase-ai-6-consolidation.md) retirement, done here) — kept only as a small, general "prefer a route
      you can see or verify" nudge. Prompt-string tests updated.
- [ ] **Measured on the [AI-1](phase-ai-1-eval-harness.md) harness (OWED — PR2):** `blog_not_linked`,
      `url_hallucination_trap`, and `sitemap_only_route` flip to pass **without** the guessing prose; held-out
      no-regress; escape rate down; the agent does **not** fabricate a 404 path when an evidence-backed route
      exists. *(Needs a live model key + the Electron better-sqlite3 ABI — the standing track-wide owed item.)*
- [x] **i18n:** none (internal navigation logic + model-facing tool text in English). Unit coverage added;
      self-review done.

## Tasks
- [ ] Candidate resolver over the AI-2 snapshot: rank on-page `href`s by goal relevance; expose as guidance
      the reactor/planner can consume deterministically (no model call inside the resolver).
- [ ] Sitemap/robots reader in an Electron-free package (host-injected fetch seam), zod-validated, bounded,
      per-origin cached; wire the URL-allow-list/Policy checks so discovery can't become an SSRF vector.
- [ ] Reactor/planner: replace the "append a conventional path to the origin" prose with a code path that
      only proposes a path when the resolver/sitemap grounds it; surface `web_search_items` for the
      destination-unknown case.
- [ ] Fixtures + eval scenarios: `url-hallucination-trap` (404 on the guessed path, real route visible/behind
      a menu) and `sitemap-only-route` (target path present only in `sitemap.xml`); measure fabrication rate
      before/after.
- [ ] Fold the removed prose into the [AI-6](phase-ai-6-consolidation.md) audit trail (proven-subsumed).

## Scope notes
- This is the **code that closes `s01` and `s31`** and the concrete subsumption AI-6 was waiting on for the
  `/blog` lines — keep the two in lockstep (don't delete the prose until this phase's eval proves the fix).
- **The `s01`↔`s31` tension is resolved by one gate, not two rules.** Surfacing `web_search` (`s01`) and
  constraining it as an escape hatch (`s31`) are the same policy: *exhaust the visible on-page route, then
  escape only for a genuinely off-site/unknown destination.* Implement the persistence gate once; both
  behaviours fall out of it. Do **not** turn this into a hard block on search — that would break legitimate
  off-site research; it is a **steer + measurement**, and the escape-rate metric is what keeps it honest.
- The don't-give-up **persistence** behaviour itself is AI-3's (reveal menus, don't finish early); AI-7 adds
  the *navigation-target* discipline (where it's allowed to go), and the escape metric that scores both.
- Do **not** disable direct `browser_update_location` for genuinely known URLs (the user pasting a link, an
  `href` read from the page). The target is *fabricated* origin+path guesses, not all navigation.
- Related but distinct: AI-4's **tab auto-switch on click** (a click that spawns a new tab) — cross-reference,
  don't duplicate.
