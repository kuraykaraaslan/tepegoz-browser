# Track — Omnibox competitive parity

- **Status:** 📋 **Proposed — not approved, not scheduled.** Nothing here has an owner's sign-off yet.
  Section A (confirmed defects) is the exception in kind, not in status: those are measured bugs in
  shipped code, and one of them hangs the renderer.
- **Origin:** a 2026-08-28 audit of the suggestion dropdown against Chrome / Firefox / Safari / Arc /
  Edge / Vivaldi. Six analysis lanes (ranking, data sources, visual, interaction, performance,
  competitor reference) + two adversarial critics (repo-rules, value-vs-cost) over 72 raw findings.
  Roughly a third of the raw findings were killed by the critics; the survivors are below, and what was
  killed is recorded in [§ Explicitly out of scope](#explicitly-out-of-scope) so it is not re-proposed.
- **Owner decisions owed** (none of these are mine to take):
  1. Does this become a numbered phase, fold into
     [Phase 2c](../../phases/product/phase-2c-classic-browser-essentials.md), or stay a track?
  2. **Zero-suggest default** — painting history the instant the box is focused is a new
     shoulder-surfing surface. Proposed default **OFF**.
  3. **Search-result-URL → search-row conversion** — changes what Enter does (re-runs the query on the
     _current_ engine rather than opening the recorded URL). Needs an explicit, tested decision.
  4. Whether the `history` table's missing sync-meta gets fixed here or stays a recorded deviation.
- **Companion ADR:** none yet. A unified ranking function is architecture-shaping under
  engineering-rules §8 and should get one before code.

## Why

The address bar is the surface a user compares against Chrome within ten seconds of opening the
browser, and `@tepegoz/omnibox` is well-built where it exists: pure, deterministic, injected-source,
unit-tested, and correctly walled off from the agent (the "Comet lesson" — the box must never start an
AI thread it was not explicitly told to). The gap is not architectural. It is that most of the
mechanisms that make a competitor's omnibox feel like one were never written.

There is no relevance score anywhere. [`buildOmniboxSuggestions`](../../packages/omnibox/src/omnibox-suggest.ts)
concatenates candidates in a hardcoded source order — primary → quick-settings → tabs → bookmarks →
history — and the only ordering _within_ a source is history's raw lifetime `visitCount`. Membership is
decided by a boolean substring `includes()`, so every candidate containing the typed text anywhere is
exactly as good as every other one and only the source order separates them. On top of that: no
favicons, no matched-substring emphasis, no inline autocomplete, no URL eliding, and a dedup pass that
compares raw strings.

A single screenshot of the dropdown showed four rows, three of which are direct consequences: a
`navigate` row wearing a search icon, and two near-identical history rows that differ only in URL
encoding (`?q=Sinem+Yayla&ia=web` vs `?q=Sinem%20Yayla`).

### Correction to the Phase 1a record

[`phase-1a-walking-skeleton-mvp.md`](../../phases/product/phase-1a-walking-skeleton-mvp.md) line 67 marks the
deterministic omnibox `[x]` and claims "suggestion source zod-validated" and "full keyboard nav
(↑/↓/Enter/Esc) + ARIA combobox/listbox". Measured against the code today, that is overstated on three
counts:

- **Enter is not in the keyboard handler at all.** `onKeyDown` handles ArrowDown / ArrowUp / Escape;
  Enter reaches the `<form onSubmit>` by implicit submission, which is why no modifier combination
  (Alt / Ctrl / Shift + Enter) can be distinguished.
- **ARIA is partial.** `aria-autocomplete` is absent, the `<ul role="listbox">` has no accessible name,
  and the result count is never announced.
- **The IPC boundary uses raw `.parse()`, not the repo's helper.** `ipc-content-browsing.ts` contains
  **0** uses of `parsePayload` against **13** raw `Schema.parse(` calls (measured), and the preload
  return path is an unchecked `as T` cast.

Additionally, line 15 of the same phase records the Turkish-search fix — `foldForSearch` extracted from
the omnibox into `@tepegoz/i18n` and shared across five surfaces, "locked by a rendered test". That fix
is real and correct, **and it does not reach browsing history**, for the reason in A2 below. The phase
row should be re-read as "the renderer folds correctly", not "history search works in Turkish".

None of this argues for reopening Phase 1a. It argues for the row's prose being narrowed to what the
code does.

## A. Confirmed defects

These are not proposals. Each was verified by reading the code, and the first three by measurement.

### A1 — Typing arithmetic hangs the renderer (unbounded synchronous render loop)

[`omnibox.tsx`](../../packages/omnibox/src/omnibox.tsx) computes `calc` fresh on every render; that
object sits in the suggestion effect's dependency array; the effect body unconditionally calls
`setSuggestions([])`, which is a new array every time and so never hits React's identity bail-out. New
array → new state → re-render → new `calc` identity → deps changed → effect re-runs. Forever.

Measured, two tests in one file against the real component:

| Input              | Result                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| `"duck"` (control) | ✅ passes in 52 ms, 0 extra renders                                               |
| `"2+2"`            | ⛔ test worker killed at the 240 s timeout — the 8 s per-test timeout never fired |

The per-test timeout being unable to fire is the diagnostic: the loop is **synchronous** and never
yields to the event loop. The user-visible failure is that the address bar's own advertised feature —
the inline calculator — freezes the UI the moment it activates.

**Fix:** depend on a stable primitive (`calc?.formatted ?? null`) instead of the object, **and** guard
the clear with `suggestions.length > 0`. Either removes the loop; both is correct. _(**Fixed
2026-09-01.** `omnibox.tsx` now derives `isCalc = calc !== null` and depends on that boolean; the
clear is an identity-preserving functional update (`prev.length === 0 ? prev : []`). Regression test
`omnibox.test.tsx` — "does not spin the suggestion effect when arithmetic is typed" — asserts the
render count stays bounded; the omnibox package gained the jsdom + `@testing-library/react` dev
harness it lacked. A2–A11 are still open.)_

### A2 — Turkish history search is broken end to end

The renderer folds correctly. The SQL does not, and it runs first, so the fold never sees the row.
[`HistoryStore.search`](../../packages/persistence/src/history-store.ts) is
`WHERE url LIKE ? OR title LIKE ?`, and SQLite's built-in `LIKE` case-folds **ASCII only**.

Measured on real `node:sqlite` (the runtime the app ships):

| Stored title       | Query        | Match |
| ------------------ | ------------ | ----- |
| `Şişli Gezisi`     | `%şişli%`    | **0** |
| `Şişli Gezisi`     | `%sisli%`    | **0** |
| `Ürünler`          | `%ürünler%`  | **0** |
| `İSTANBUL Rehberi` | `%istanbul%` | **0** |
| `Page Fifty`       | `%FIFTY%`    | 1 ✓   |

A user cannot find a Turkish page they visited themselves, typed the way they typed it the first time.
In a product whose primary market is Turkey and which claims Turkish as a first-class locale, this is
the most serious correctness finding in the audit. `foldForSearch` in the renderer cannot recover it —
a post-filter can only narrow the SQL result set, never widen it.

**Fix:** fold at write time into `url_fold` / `title_fold` columns, with a `FOLD_VERSION` constant and a
backfill on bump. This also makes the index range-seekable (verified: a range predicate on a folded
column plans as `SEARCH … USING INDEX`, while `LIKE 'abc%'` plans as `SCAN`). Couple
`@tepegoz/persistence` to `@tepegoz/i18n` so there is exactly one `foldForSearch` definition.

> **Fixed 2026-09-01.** Migration 16 adds `history.url_fold` / `title_fold`; `HistoryStore.record` /
> `setTitle` write them via `foldForSearch` from `@tepegoz/i18n` (now a `@tepegoz/persistence`
> dependency — one definition), and `search` matches `%fold(query)%` against them. `HISTORY_FOLD_VERSION`
>
> - `HistoryStore.reindexFoldsIfStale` (called after `migrate` in `database.electron.ts`) owns both the
>   one-time backfill of pre-v16 rows and re-folding after the rule changes. Five `history-store.test.ts`
>   cases cover the Şişli / Ürünler / İSTANBUL matches, title-refine sync, and the backfill/no-op. The
>   `LIKE`-still-uses-`LIKE` plan-shape optimisation and the `LIKE`-wildcard-leak (§ A3) are **not** in
>   this change — the columns are indexed but `search` still does `LIKE '%…%'`.

> Note on scope discipline: this is a **correctness** fix, not a performance one. FTS5 is available in
> `node:sqlite` (verified) and is _not_ needed here — a 90-day-pruned single-user history is thousands
> of rows. Do not let this grow into a search-engine rewrite.

### A3 — `LIKE` wildcard leak

`like = '%' + query + '%'` with no `ESCAPE` clause. Typing `_` or `%` returns the entire history
(measured: 3/3 rows). Parameterised, so not injection — but the results are wrong.

> **Fixed 2026-09-01.** New node-free `@tepegoz/persistence/sql-like` (`escapeLikeLiteral` /
> `likeContains` / `LIKE_ESCAPE`) escapes `%`, `_` and `\`; `HistoryStore.search` and
> `BookmarkTreeStore.search` (the identical leak — the bookmark manager returned every row on `%`)
> both use it now and pair every `LIKE ?` with `ESCAPE '\'`. Covered by `sql-like.test.ts` (5 cases
> against a real `LIKE ? ESCAPE` statement) plus a `§ A3` case in each store's suite.

### A4 — Candidate window is recency-shaped, ranking is frequency-shaped

SQL takes `ORDER BY ts DESC LIMIT 50`; the TS layer then re-sorts those 50 by `visitCount`. A
heavily-visited page that is not among the 50 most _recent_ matches can never be scored at all. The
"most-visited first" comment is true only inside a recency window nobody declared.

### A5 — Dedup compares raw strings

`dedupeByNavTarget` keys on the literal navigate input, which is why the two DuckDuckGo rows in the
screenshot both survive, and why typing `example.com` never collapses against a history row for
`https://example.com/`. The existing test passes only because it types a fully-qualified URL.

> **Fixed 2026-09-01.** `dedupeByNavTarget` now compares `canonicalNavKey(input)` — scheme + host
> lowercased, a lone trailing slash dropped, the query re-serialised so `+` and `%20` agree; non-URL
> text stays literal + case-folded. The emitted `action.input` is untouched, so navigation still uses
> exactly what was typed/stored. Two `omnibox-suggest.test.ts` cases: bare host vs its `https://` URL,
> and two query encodings of one search URL. Full canonical **ranking** (a relevance score, § below)
> is still unbuilt — this is dedup only.

### A6 — `SuggestionIcon` covers 3 of 11 kinds

`navigate`, `bookmark`, `command`, `agent`, `download`, `skill` and `calc` all fall through to the
magnifying glass. This is exactly why row 1 of the screenshot — a typed URL — wears a search icon.

> **Fixed 2026-09-01.** `SUGGESTION_ICONS` is now a total `Record<kind, IconDefinition>` — globe /
> bookmark / calculator / terminal / robot / download / wand for the seven that used to fall through,
> matching how each concept is drawn elsewhere in the app. Test: "gives a navigation suggestion a
> globe, not the search glyph (§ A6)".

### A7 — No keyboard path to the address bar

`SHORTCUTS` has 15 entries and none focuses the omnibox. No Ctrl+L, no Alt+D, no F6. The address bar is
mouse-only, which fails WCAG 2.1.1 on its own (engineering-rules §7).

### A8 — Enter leaves the dropdown open

`submitDefault()` never calls `closeSuggestions()`.

> **Fixed 2026-09-01.** `submitDefault()` now calls `closeSuggestions()` first, on both the navigate
> and the calc path. Test: "closes the dropdown when Enter submits the typed value (§ A8)".

### A9 — Stale re-open after choosing a row

`closeSuggestions()` bumps `reqIdRef`, but a still-pending debounce timer mints a **new** id when it
fires, so it always matches its own guard and re-opens the list. **Fix:** `clearTimeout` inside
`closeSuggestions`, and capture the generation at schedule time.

> **Fixed 2026-09-01.** The generation (`reqId = ++reqIdRef.current`) is now captured at _schedule_
> time, not inside the timer callback, so a `closeSuggestions()` before the fetch resolves makes its
> result fail the `reqIdRef.current === reqId` guard. And the pending timer handle lives in
> `debounceRef` so `closeSuggestions()` can `clearTimeout` it outright. Test: "a debounced fetch in
> flight cannot reopen a dropdown that was already dismissed (§ A9)".

### A10 — Mouse movement silently re-targets Enter

Row `onMouseEnter` writes the same `selected` state the arrow keys write, and that state backs
`aria-activedescendant`. Moving the mouse one pixel changes what Enter opens and re-announces a row to a
screen reader. Hover state and keyboard state must be separate.

> **Fixed 2026-09-01.** Split into two pieces of state: `selected` (keyboard only — arrow keys write
> it, and it alone backs `aria-activedescendant` / `aria-selected` and what Enter opens) and `hovered`
> (pointer only — `onMouseEnter` / `onMouseLeave`, tints a row, touches no ARIA and no Enter target; a
> live keyboard selection takes visual precedence). Tests: "hovering a row never moves
> aria-activedescendant or re-targets Enter (§ A10)" and "arrow keys drive aria-activedescendant and
> what Enter opens (§ A10)".

### A11 — `omnibox.tsx` has no test file

The package tests `omnibox-suggest` / `calc` / `commands` / `units` — all four pure modules. The
component itself, which owns the debounce, the request-id guard, focus/blur, selection and the render
loop in A1, has **zero** coverage. Every item in this track lands without a regression net until this
changes. The two tests written to prove A1 are the natural first commit.

> **Resolved 2026-09-01.** `omnibox.test.tsx` exists (jsdom + `@testing-library/react`, added with the
> A1 fix) and now carries nine cases across A1, A2-adjacent clearing, A6, A8, A9 and A10. Further
> track items extend it rather than create it.

## B. Tier 0 — what a side-by-side comparison notices first

Small effort, high visibility. This is the tier that closes the felt gap.

| #   | Item                                                    | Why                                                                                                                                                                                                                                                                                                                                                                                                           | Effort |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Favicons on tab + bookmark rows**                     | The single biggest visual gap. `TabInfo.faviconUrl` and `BookmarkEntry.favicon` **already exist** and the host discards both when mapping candidates; `TabFavicon` (globe fallback) already exists in `@tepegoz/tab-strip`. This is dropped local data, not a missing fetch.                                                                                                                                  | **S**  |
| 2   | **Canonical dedup**                                     | Scheme / `www` / trailing-slash / fragment normalisation + percent-decode + parameter ordering → one key. Removes the screenshot's duplicate and returns a slot.                                                                                                                                                                                                                                              | S      |
| 3   | **Matched-substring emphasis**                          | Chrome and Firefox both bold the typed span. Critical detail: folding is not index-preserving, so a fold→original index map is required — build it **once** in `@tepegoz/i18n`, not per call site. React children, never `dangerouslySetInnerHTML`.                                                                                                                                                           | S      |
| 4   | **Icon coverage for all 11 kinds**                      | Fixes A6.                                                                                                                                                                                                                                                                                                                                                                                                     | XS     |
| 5   | **Split the overloaded `subtitle`**                     | It carries a localized _verb_ for tabs/bookmarks/settings and a raw _URL_ for history — the same column is sometimes label, sometimes data. `subtitle` = data, new `actionLabel` = verb. This is what frees width for the URL. Keep "Switch to tab" **visible** on unselected rows: Chrome shows it persistently, and "this is already open" is the fact that changes the user's choice _before_ they select. | S      |
| 6   | **Ctrl+L / Alt+D / F6**                                 | Fixes A7. Three lines.                                                                                                                                                                                                                                                                                                                                                                                        | XS     |
| 7   | **URL eliding**                                         | Hide `https://` and `www.`, emphasise the registrable domain, dim path/query. Show `http://` explicitly — that is the correct security call. **Must land after item 2**, or the two duplicate rows render byte-identical. **Do not** percent-decode for display: that is a permanent homograph/spoofing surface bought for cosmetics, and no one has written the IDN/punycode display rule it would need.     | S      |
| 8   | **Secondary-text contrast on raised surfaces**          | `theme.ts` solves `--text-secondary` for 4.5:1 against `--surface-base` only, but the dropdown paints on `--surface-raised` and the selected row on `--surface-overlay`. Reported measurement for a custom teal: 4.55:1 on base, **3.89:1** on the list, **3.43:1** on the selected row — i.e. the dropdown fails WCAG 1.4.3 while the token that governs it passes.                                          | S      |
| 9   | **`max-height` + `overflow-y-auto` + `scrollIntoView`** | The list is `overflow-hidden` with no cap today, so anything that grows a row silently clips it. Hard prerequisite for two-line rows and zero-suggest.                                                                                                                                                                                                                                                        | S      |

## C. Tier 1 — a ranking engine

- **One scoring function, one total sort**, replacing the accidental concatenation order. Four declared
  inputs: match tier, source weight, `frecencyNorm`, recency — with small documented weights. **Do not
  copy Chrome's 1300/1200/900/700/1410 band table**; it is cargo-culted precision nobody here can
  justify or tune. Three existing tests encode the current source order and will need rewriting — call
  that out in review rather than discovering it.
- **Three match tiers** — host-prefix > word-start > substring. Nine hand-weighted tiers is over-built
  for a single-user history. Fold in the one good idea from the rejected typo-tolerance proposal:
  **multi-token AND matching** across title+URL in any order — cheap, deterministic, most of the
  benefit.
- **frecency v0 from the existing schema.** `ts` + `visit_count` is enough. Inject `now` so the ranking
  stays deterministic and reproducible in tests (engineering-rules: no `Math.random`, no time-of-day).
- **One `searchForOmnibox` query.** Three lanes independently found A4 and proposed three incompatible
  SQL shapes and two new IPC channels; consolidate to a single signature with `nowTs` injected _before_
  any of it is written. Raising the candidate window (currently 50) needs a measured justification —
  every extra row is history crossing into the untrusted renderer.
- **Per-host cap**, plus one guaranteed slot for each source that matched and the remainder filled
  purely by score. Do **not** ship a tunable `SLOT_BUDGET` record — it is the untestable-heuristic
  surface the proposal itself warned about.
- **Demote unrecognised `?q=` history rows.** This attacks the screenshot harder than dedup does: N
  search-result URLs should not occupy N slots. Ship the demotion penalty first (pure, no new
  dependency). The full URL→search-row conversion is **owner decision 3** — it silently re-runs the
  query on the current default engine, which changes what Enter does, and it needs a user-visible label.

## D. Tier 2 — keyboard and interaction

- **Escape, two stages.** First Escape: close **and revert the box to the current tab URL**
  (renderer-only, no IPC). Defer the second stage (return focus to the page) — it needs a new
  focus-stealing renderer→main channel with a sender check and a zod `safeParse` even on an empty
  payload, and most users do that with a click.
- **Tab / Shift+Tab cycle the list** — **only alongside the Escape revert.** Hijacking Tab inside a text
  input is a WCAG 2.1.2 keyboard-trap risk that is acceptable solely because a working exit exists.
- **Alt+Enter and middle-click → open in a new tab.** `createTab` / `createTabInBackground` already
  exist; no new IPC. Route `onSubmit` and `onKeyDown` through one `submit(modifiers)` function so the
  two dispatch paths cannot drift.
  > **Ctrl+Enter `.com` wrapping is deliberately excluded** — a US-centric default hardcoded into a
  > Turkish-first product. If it ever ships it derives from locale or a preference.
- **Shift+Delete removes a history suggestion.** The IPC (`history:delete`) already exists. Keyboard
  only, strictly gated on `kind === 'history'`. No in-row × button — it collides with the row's own
  `onMouseDown` dispatch. Note the debt rather than fixing it here: `HistoryStore.deleteUrl` is a hard
  `DELETE` against a table with no tombstone, so a deleted row resurrects after Phase 3 sync. That is a
  pre-existing deviation the History page already carries — record it per §10, do **not** bundle a
  schema migration into a keyboard-shortcut PR.
- **ARIA conformance** — add `aria-autocomplete`, name the listbox, announce the result count via a live
  region (string comes from the host dictionary; the omnibox is a leaf and must not grow its own dict
  per ADR-0016), separate hover from keyboard selection (A10), add Home / End / PageUp / PageDown. WCAG
  2.2 AA is binding, so most of this is not optional.
- **Inline autocomplete** — the most-felt competitor feature and entirely absent. Deliberately **last**:
  it is XL, it changes what Enter opens, and it is the classic "I typed a search and it navigated
  somewhere else" bug. Non-negotiable details: build the completion from the user's **own typed
  prefix**, never from the folded form; suppress while deleting and during IME composition (extend
  `e2e/ime-turkish-text.spec.ts`); never fire in `@`-command mode.

## E. Tier 3 — differentiation

- **Keyword search engines / Tab-to-search.** The groundwork exists: a 10-entry built-in registry plus
  user-added engines validated by `isSafeSearchTemplate`. The only missing data is a `keyword` field on
  `SearchEngine`. Two design constraints, both load-bearing: use **bare tokens, not `@`** — `@` must
  remain the single AI door, and `parseOmniboxCommand` returns `partial` for any unknown `@…`, so
  `@youtube cats` would render the agent discovery menu; and resolve keywords in **main** (via
  `searchUrlForQuery`), keeping the renderer display-only. A keyword that shadows a real hostname must
  lose to the URL reading, refused at save time. Effort is **L** (prefs schema + settings UI + main
  resolver + builder + Tab-to-search + en/tr strings) — it goes _after_ every visible-parity item.
- **Zero-suggest** (see owner decision 2). A focused empty box showing nothing is a dead surface, but
  the private-window gate and the off switch are load-bearing, not polish. Ships together with the
  recently-closed source and the `@` discovery menu — a closed-tab row rarely matches typed text, so its
  value is almost entirely here. `rememberClosedTab` / `recentlyClosedTabs` already exist (verified), so
  this is a new _source_ over an existing API, not new plumbing. One real finding attached:
  `rememberClosedTab` has **no `isPrivate` guard**, unlike the history write path.
- **Cross-window tab search.** Genuine Chrome parity. The `isPrivate` filter must be applied in **main**
  — a private window's tabs reaching a normal window's omnibox is a private-browsing leak. Exclude
  hidden / agent-parked tabs rather than labelling them: activating one collides with the
  parked-off-screen invariant. Defer cross-window _focus_ (a new focus-stealing path); ship the listing
  with an "other window" label.
- **`tepegoz://` internal pages.** `looksNavigable` does not recognise the scheme, so typing an internal
  URL is labelled "Search the web" even though `navigateActive` resolves it correctly. Take the two
  cheap correct parts: teach `looksNavigable` the scheme, and collapse the two hand-maintained page
  lists into one registry carrying a title **key**, not a resolved string (main uses `mainStrings()`,
  the omnibox needs renderer strings). **`tepegoz://developer` must stay excluded** — it is deliberately
  unlisted (commit `91d973c`), and that undiscoverability is the gate.

## Explicitly out of scope

Recorded so they are not re-proposed. Each was killed by an adversarial critic after being argued for.

| Rejected                                            | Reason                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local full-text index of visited page content       | The most sensitive artifact the app would ever hold. Needs its own ADR, opt-in flow, size ceiling with eviction and an explicit no-sync decision — a separate product with its own threat model, not an omnibox feature.                                                                                             |
| `omnibox_picks` — learned per-prefix ranking        | A behavioural dossier in a local-first product, and it makes a surface whose contract is _determinism_ non-reproducible for the same input.                                                                                                                                                                          |
| Search-**query** history (new table)                | A more sensitive data class than URLs, and sync-meta does not settle it — sync-meta means it eventually leaves the device. Canonical dedup + `?q=` demotion deliver "search that again" from rows the app already has.                                                                                               |
| Per-row security badge                              | `security-policy/safe-browsing.ts` has **zero** callers in `apps/desktop` and nothing populates a prefix database; a badge rendering from an empty set is a fail-open safety signal (§3, severe). Prefix matching also has false positives by construction. The verdict belongs on the post-navigation interstitial. |
| Ctrl+Enter `.com` wrapping                          | US-centric default in a Turkish-first product.                                                                                                                                                                                                                                                                       |
| Suggestion-provider registry / plugin seam          | Architecture ahead of need for a five-source builder, and it opens precisely the door the Comet rule forbids. Its one valuable line — a test asserting no path except `@agent` can emit `agentTask` — costs ten lines and **should be taken standalone**.                                                            |
| Keyboard-layout-variant and edit-distance matching  | Fuzzy matching in a surface contracted to determinism needs evidence before code. A user on the wrong layout notices within two characters.                                                                                                                                                                          |
| Find-in-page escalation row                         | Ctrl+F is reflexive; the row would compete for the last of eight slots against rows carrying real intent.                                                                                                                                                                                                            |
| An always-present `@agent` row                      | Spends a slot on every keystroke to advertise what the `@` discovery menu already shows the instant `@` is typed. Absorbed by zero-suggest (empty input only).                                                                                                                                                       |
| Per-visit `history_visits` table                    | A visit timeline is materially more sensitive than the coalesced table and needs its own ADR. frecency v0 absorbs the ranking motive at a fraction of the cost. Revisit only if measurement shows v0 is wrong.                                                                                                       |
| Renderer-supplied `source: 'omnibox'` on navigation | engineering-rules §1: the renderer relays, never decides. "It's only a ranking hint" is the argument that erodes the rule. If a typed-count signal is ever needed, the main-side handshake is the compliant shape.                                                                                                   |
| Drag-and-drop URL onto/out of the box               | Low impact, and the drop half adds a self-XSS target to the one widget that navigates.                                                                                                                                                                                                                               |
| Merged input+dropdown surface                       | Pure aesthetics with a real hazard: the focus ring is the only keyboard-focus indicator and was deliberately darkened to clear WCAG 1.4.11. Land only with the ring moved to the wrapper and re-verified.                                                                                                            |

## Sequencing constraints

Two orderings are load-bearing; violating either is expensive to undo.

1. **Canonical dedup (B2) before URL eliding (B7).** Eliding makes the near-duplicate rows visually
   identical, so shipping it first hides the bug instead of fixing it.
2. **`max-height` + scroll (B9) before anything that changes row height** — two-line rows, zero-suggest,
   or an empty-state row. The container is `overflow-hidden` today; taller rows clip silently.

A third is a decision, not an ordering: **the dropdown-layering mechanism must be settled once, before
zero-suggest or two-line rows.** Opening the dropdown today calls `captureActiveTab()` — a full-viewport
`capturePage()` → base64 PNG across IPC — and then detaches the live `WebContentsView` (verified in
`App-effects.ts`). Zero-suggest fires that path on every focus, including every click into an empty box.
Options are to make it cheaper (set `omniboxViewHidden` optimistically, cache the still per tab until
navigation, add hysteresis on the close edge) or to replace it with an inset content bounds — the latter
is the better end state but reflows live pages and touches the same `setContentVisible` path the Agent
Console and extension overlays share. Do not add surfaces that open the dropdown more often until this
is decided.

Note also that `apps/desktop/src/main/tabs-window-nav.ts` is already over the ADR-0010 250-line cap, so
any addition there needs a split first.

## Work items (indicative — not a DoD)

- **`packages/omnibox`** — the A1 dependency fix; icon coverage; `actionLabel` split; highlight
  rendering; canonical nav key; scoring function + match tiers; keyboard handler rewrite
  (`submit(modifiers)`, Escape stage 1, Tab cycling, Home/End/PageUp/PageDown, hover/keyboard split);
  ARIA additions. Watch the 250-line cap — `omnibox-suggest.ts` is already at 356 and the scorer must
  not grow it further.
- **`packages/persistence`** — `url_fold` / `title_fold` columns + `FOLD_VERSION` + backfill migration;
  `ESCAPE` on the `LIKE` predicates; one `searchForOmnibox` with `nowTs` injected. Adds a
  `@tepegoz/i18n` dependency for the single `foldForSearch` definition.
- **`packages/i18n`** — the fold→original index map, built once, exported for both highlighting and
  match-tier computation.
- **`packages/shortcuts`** — Ctrl+L / Alt+D / F6.
- **`apps/desktop` host wiring** — stop discarding `faviconUrl` and `favicon` when mapping candidates;
  pass `ts` through; `parsePayload` instead of raw `.parse()` at the history IPC boundary.
- **`packages/ui` / `theme.ts`** — solve `--text-secondary` against the raised and overlay surfaces, not
  base alone.
- **i18n** — every new label into the **host** dictionaries (`en` + `tr`), never into the omnibox leaf
  (ADR-0016).
- **Tests** — first: a jsdom suite for `omnibox.tsx` (A11), starting with the A1 loop regression and the
  A9 stale-reopen case. Then: Turkish history round-trip through real SQL (the A2 matrix as a fixture);
  canonical-dedup fixtures including the two DuckDuckGo URLs; scoring fixtures; a standalone test
  asserting no path except `@agent` can emit `agentTask`.
- **Docs** — an ADR for the ranking policy; a note in ADR-0010 for any new deviation; the Phase 1a prose
  correction; Phase Status Report on close-out.
