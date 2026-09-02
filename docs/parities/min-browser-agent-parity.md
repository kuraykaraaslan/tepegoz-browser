# Track — Min browser-shell parity (no agent-capability axis)

**Status:** 📋 **Proposed — not scheduled (2026-09-02).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md): every row names its nearest
existing Tepegöz behaviour and a suggested home, so a future session can promote a row into a real
`phase-*.md` task without re-deriving the comparison.

**Source:** a same-session deep read of `.junk/min-browser` (Min v1.35.7 — a shipping, Apache-2.0,
privacy-focused minimal desktop Electron browser: `README.md`, `package.json`, `docs/statistics.md`,
`SECURITY.md`, `main/main.js`/`filtering.js`/`viewManager.js`/`UASwitcher.js`/`permissionManager.js`,
`js/pageTranslations.js`/`places/fullTextSearch.js`/`readerView.js`/`readerDecision.js`/
`userscripts.js`/`passwordManager/*`/`searchbar/instantAnswerPlugin.js`/`searchbar/
calculatorPlugin.js`/`tabState/task.js`/`preload/translate.js`, `pages/translateService/
translateService.js`, `ext/readability-master/`, `ext/abp-filter-parser-modified/`, `ext/franc/`,
`ext/textColor/textColor.js`, `localization/languages/tr.json`) against
[`docs/others/tepegoz-vs-min-browser.md`](../versus/tepegoz-vs-min-browser.md) (the prior
comparison, in Turkish, kept as written per that folder's own language note) and this repo's actual
code: `apps/desktop/src/main/tabs-window-groups.ts`, `tabs-window-closing.ts`, `tabs-shared.ts`,
`agent-tab-group.electron.ts`, `packages/tab-engine`, `packages/reader`, `docs/adr/0020-tab-boundary-
model.md`, `docs/engineering-rules.md`, `docs/website/privacy.md`, `phases/product/phase-8-local-
intelligence-sovereignty.md`, `phases/tracks/browser-settings-feature-gap.md`. Two claims in the
existing comparison doc were re-verified against source rather than trusted: `@tepegoz/notary` is
written and tested but **no file under `apps/desktop` imports it** (`grep -r "@tepegoz/notary"
apps/desktop` returns nothing) — it produces no receipt today; and S10 vision's `captureVision` hook
has **no production caller** — only `packages/orchestrator/src/reactor.ts`/`reactor-types.ts` and a
test file reference it, confirming `phases/ai-agent/README.md`'s own "ships inert, NOT WIRED"
line for S10. Neither is discussed further below because neither is relevant to a Min comparison — they
are noted here only so this document does not repeat an overclaim the source doesn't support.

## Why this track exists — and why it looks different from its siblings

**Min has no LLM/agent surface at all.** A source-tree grep for `agent`, `llm`, `openai`, `anthropic`,
`claude`, `gpt`, `chat`, `assistant`, `prompt`, `inference` across all of `.junk/min-browser` turns up
exactly one meaningful hit — `user agent` (the browser's own HTTP identity string) — and a `neural
network`-flavored code comment in `ext/textColor/textColor.js`, a text-color-contrast heuristic, not an
LLM call. Min never makes a model call, has no chat, no "Do" mode, no tool-calling, no autonomy setting.
**This is therefore not an agent-capability parity track**, unlike its siblings
([`webbrain-agent-parity.md`](webbrain-agent-parity.md),
[`aipex-agent-parity.md`](aipex-agent-parity.md)) — there is no agent axis to compare Min against, and
pretending otherwise would manufacture a comparison the source doesn't support.

The genuine overlap between the two projects sits entirely at the **browser-shell / UX layer**: both are
real, non-fork Electron browsers (not extensions); both ship tab groups, a reader mode, local-first
translation, and a privacy stance. This track confines itself to that layer, and specifically to the
axes the prior comparison actually found live overlap on — **Electron architectural patterns, the
tab-group ("Task") model, reading mode, keyboard-first UX, and performance.** Filtered against what
Tepegöz already ships or already tracks elsewhere, almost everything on that list turns out to be
either already shipped (ad/tracker blocking, the renderer-untrusted architecture — where the comparison
doc's own verdict already puts Tepegöz ahead), already named in a sibling track
(`browser-settings-feature-gap.md` owns the password-manager and tracking-protection-level rows), or a
deliberate strategy difference this track does not reopen (Min's ~35 shipped UI locales vs. Tepegöz's
enforced EN+TR parity discipline). What survives that filter is **one small, honestly-scoped
workstream** — not a shortage of effort, a shortage of genuine gap.

## How to read this

The one workstream below is written like an `ai-agent`/product-phase section (Goal → Approach →
new/changed files → ADR → DoD-shaped bullets) so it can be lifted into a real phase task with minimal
rewriting. **Nothing here is committed roadmap.** The capability inventory below is deliberately wider
than the one workstream — it records every genuine Min capability the comparison surfaced, including the
ones this track is **not** turning into work, and says why (already shipped, already routed elsewhere,
or a deliberate non-goal), so a future session doesn't have to re-derive the filtering.

## Ground rules — parity, not imitation

Unlike the WebBrain/AIPex tracks, nothing here is an **agent** capability being declined — Min has none
to decline. What follows are two places where Min's own browser-shell **architecture** choices conflict
with a rule Tepegöz already binds itself to. Naming them once so no future session reads "Min does X" as
license to relax a standing rule:

1. **Min's own chrome window is not held to the same trust boundary its web content is.** Min's UI
   window runs `nodeIntegration: true, contextIsolation: false` (`main/main.js:216-218`), while browsed
   web content gets `nodeIntegration: false, contextIsolation: true, sandbox: true`
   (`main/viewManager.js:12-19`) — Min trusts its _own_ UI process with full Node access and carves out
   the hardening only for pages it didn't author. Tepegöz's binding rule draws no such exception: _"One
   secure `createWindow()` factory. Every `BrowserWindow` is created there, with `contextIsolation` on,
   node integration off, and a typed `contextBridge` surface"_ and _"The renderer is untrusted. It
   displays and relays; it never decides"_ (`docs/engineering-rules.md` §§1, 3) apply to Tepegöz's own
   chrome UI exactly as much as to browsed content. There is nothing to adopt from Min on this axis —
   Tepegöz's rule is already stricter, which is also the verdict `docs/others/tepegoz-vs-min-browser.md`
   itself reaches (row 3 of its comparison table).
2. **Min collects usage statistics by default, opt-out** (`docs/statistics.md` in Min's own repo). Not
   adopted, even in a scoped/anonymized form: Tepegöz's public commitment is the opposite — _"No
   telemetry, no account today, no backend"_ (`docs/website/privacy.md`) — and that's a stated product
   position, not a gap waiting to be filled.

Neither of these is a Min capability being ported; both are Min architecture choices this repo already
decided against, for reasons on record before this comparison existed.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned or already shipped, cite
it, no new work needed here." **NEW** means no existing phase owns it and this track proposes one — used
exactly once below. **Not pursued** means a deliberate scope/strategy decision, not an oversight.

| #   | Min capability                                                                                                                                                                 | Nearest Tepegöz behaviour today                                                                                                                      | Gap                                                                                                                                                                                                                      | Home                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Full-text navigation-history search — every visited page's text indexed (Dexie/IndexedDB, `stemmer`, inverted index, `quick-score` fuzzy match), searchable from the searchbar | `journal_search_events` (agent audit trail) — a different thing entirely, not a user-facing history search                                           | A lexical/semantic index over the user's own browsing content                                                                                                                                                            | **Phase 8** (already planned — "Global on-device semantic history," L1/L2, profile-level FTS5 + sqlite-vec over sanitized page content — functionally a superset of Min's stemmed inverted index. Sharpens with Min's omnibox-search UX detail, not a new ask.) |
| 2   | Ad/tracker blocking — ABP-fork filter parser + EasyList/EasyPrivacy, tracking-parameter stripping, HTTPS-upgrade list, per-tab indicator                                       | `extensions/ext-adblock` ships; Safe Browsing (ADR-0043) covers unsafe-site interstitials, a different layer                                         | None to close — both ship. Min's is more tuned/mature today per the existing comparison's own verdict, not unbuilt.                                                                                                      | **Shipped** (`ext-adblock`) — cite, do not re-propose                                                                                                                                                                                                           |
| 3   | Password-manager integrations (Bitwarden CLI, 1Password CLI, OS keychain) + autofill/capture                                                                                   | No user-facing password manager; `@tepegoz/credential-vault` exists but is agent-facing, BYO-key, and **inert** (S6, no OS-auth gate wired)          | Real, but already named elsewhere                                                                                                                                                                                        | **`browser-settings-feature-gap.md`** (already carries this row, Home: Phase 2) — do not duplicate                                                                                                                                                              |
| 4   | ~35 shipped UI locales, Turkish near-complete (`tr.json` 315/319 keys)                                                                                                         | Per-package EN+TR parity **enforced as a build error** (ADR-0016); every phase ships both languages same-PR                                          | Breadth vs. depth — different strategy, not a gap in the depth strategy                                                                                                                                                  | **Not pursued** — deliberate: Tepegöz optimizes for guaranteed EN/TR parity over locale count; revisit only if a specific third locale gets real demand                                                                                                         |
| 5   | Searchbar quick-answer plugins — DuckDuckGo instant answers, `!bang` commands, an `expr-eval` calculator                                                                       | Omnibox matches/navigates only; no quick-answer plugin surface                                                                                       | A structured instant-answer registry                                                                                                                                                                                     | **Backlog**, nearest existing track is [`omnibox-competitive-parity.md`](omnibox-competitive-parity.md) (not currently in its scope — a future addendum, not opened here)                                                                                       |
| 6   | Userscript support — a Tampermonkey-header subset, `chokidar` hot-reload from a local folder                                                                                   | `ext-*` package family (`ext-translate`, `ext-typo`, `ext-macros`, …) — structured, contributor-authored, each with its own i18n dict                | End-user-authored arbitrary script injection — a different extensibility philosophy, not a smaller version of `ext-*`                                                                                                    | **Not pursued** — no contradiction with a standing ADR, just an unbuilt, lower-priority surface; revisit only on real demand                                                                                                                                    |
| 7   | **Mature "Tasks" tab-group UX** — archive (close-but-keep, not destroy), rename, restore, per-group color, overlay view                                                        | `@tepegoz/tab-engine` `TabStore` + `apps/desktop/src/main/tabs-window-groups.ts` already ship rename/recolor/collapse/ungroup/close-group (ADR-0020) | Closing a group today scatters its members into the **flat, per-tab** `closedTabs` list (`tabs-shared.ts`) — the group's name, color, and "these tabs were one project" relationship is lost, unlike a single closed tab | **NEW (small, extends ADR-0020 + existing `closedTabs`)** — see P1                                                                                                                                                                                              |
| 8   | Reader auto-decision memory (`readerDecision.js` — per-URL/per-domain "always/never/ask" reader-mode memory) + PDF viewer theme picker                                         | `@tepegoz/reader` extracts + types blocks, no decision memory; Phase 2c's PDF viewer ships, no theme picker                                          | Real, small, no daily-driver pull demonstrated for this product yet                                                                                                                                                      | **Backlog** — fold into whichever session next touches Phase 2c's PDF viewer or the reader entry point, not written up here                                                                                                                                     |
| 9   | Bergamot pure-local, guaranteed-offline full-page translation (~21 languages, no cloud path at all)                                                                            | `extensions/ext-translate` — local-first, escalates to cloud when needed (ADR-0042)                                                                  | None in normal operation — the existing comparison's own verdict is "equal, same philosophy." The only real residual gap is a _strict, never-escalate_ mode                                                              | **ADR-0042** (already the same local-first philosophy) for normal use; a strict-offline toggle is naturally **Phase 8**'s Sovereign/Air-Gapped Mode once that exists (repo-wide local-only enforcement), not a translate-specific feature                       |

---

## P1 — Group-aware close & restore (extends ADR-0020's tab-group model + the existing `closedTabs` list)

**Goal.** Match the one outcome Min's mature "Tasks" UX gets right that Tepegöz's tab groups don't yet:
closing a group of tabs the user was treating as one unit should be **undoable as that same unit** —
same member URLs, same name, same color, back together — not degraded into N unrelated entries in a
flat recently-closed list.

**Approach.**

- Today, `WindowTabsGroups.closeGroup()` (`apps/desktop/src/main/tabs-window-groups.ts`) closes each
  member tab individually through the ordinary `closeTab()` path, and each one lands separately in the
  flat, per-tab `closedTabs` array (`tabs-shared.ts`, cap 25, newest-first, exposed as
  `recentlyClosedTabs()`/`window.tepegoz.reopenClosedTab()`) — with no record that the tabs were ever a
  group. Add a `ClosedGroup` variant (`{id, name, color, members: {url, title}[], closedAt}`) and a
  `rememberClosedGroup()` recorded **once** by `closeGroup()`, instead of letting N individual
  `rememberClosedTab()` calls fire — a group-close is one entry in the recently-closed list, not N, so
  archiving a six-tab research group doesn't evict five unrelated single-tab entries out of the existing
  cap.
- Add `recentlyClosedGroups()` and a `reopenClosedGroup(id)` operation that recreates the group with
  `TabManager.createGroup()` + `renameGroup()` + `recolorGroup()`, then opens each remembered member URL
  into it in original order — reusing the exact `createTab()` + `assignToGroup()` pairing
  `AgentTabGroup.openTab()` (`apps/desktop/src/main/agent/agent-tab-group.electron.ts`) already uses for
  the agent's own per-session grouping. No new tab-creation path.
- Surface it next to the existing "reopen closed tab" affordance (`MainMenuPopup.tsx`/
  `command-palette-host.tsx`, wherever `window.tepegoz.reopenClosedTab()` is wired today) as a sibling
  "reopen closed group" entry, not a separate subsystem.
- **No security/isolation change, and no revisit of ADR-0020.** Per that ADR, a group already carries no
  partition/policy semantics — restoring one is exactly as trusted as reopening any single closed tab
  today: same `isWebUrl()` gate before remembering a URL, same main-process-owned state, no new
  `BrowserContext`. A restored group gets a **fresh** group id and starts with no Agent Console session
  binding, even if the closed group had one (ADR-0020's addendum ties `'agent.panelOpen'`/session state
  to a specific group id; that state is not resurrected — a closed agent session stays closed).

**New/changed files:** `apps/desktop` only, no new package — `tabs-shared.ts` (`ClosedGroup` type +
`rememberClosedGroup`/`recentlyClosedGroups`), `tabs-window-groups.ts` (`closeGroup` records one group
entry instead of N tab entries), `ipc-tabs-windows.ts` + `api-window-tabs.ts` (one new IPC channel +
preload method), `MainMenuPopup.tsx`/`command-palette-host.tsx` (list + restore UI). `@tepegoz/tab-engine`
needs no change — `createGroup`/`renameGroup`/`recolorGroup` already exist there.

**ADR:** none owed. This stays entirely inside ADR-0020's already-decided "groups are organizational
metadata, no policy/partition semantics" model. If a future session wants a paper trail for the
`ClosedGroup` data-shape addition, it is a short documentation addendum to ADR-0020, not a new decision
or number.

**DoD shape (draft, for whichever session promotes this):**

- [ ] Closing an N-tab group adds exactly **one** entry to the group-recall list, not N entries to the
      flat `closedTabs` list
- [ ] Restoring a closed group recreates it with its original name, color, and member URLs in original
      order
- [ ] Restoring a closed group does **not** resurrect any Agent Console session state the closed group's
      id may have carried — a test proves the restored group starts with a clean session
- [ ] The existing 25-entry recall cap's spirit is preserved: a group-close counts as one slot against
      the cap, verified by a test that closes a multi-tab group without evicting unrelated single-tab
      entries
- [ ] i18n: "Reopen closed group" menu/palette copy + any restore confirmation ships EN+TR in the same PR
      (ADR-0016), with a parity test alongside the existing dict
- [ ] Coverage on the new pure bookkeeping (`rememberClosedGroup`/`recentlyClosedGroups`), matching the
      existing `tabs-shared.test.ts` coverage style for `rememberClosedTab`

---

## Backlog (named, not written up)

- **Searchbar quick-answer plugins** (row 5) — real but no daily-driver pull demonstrated for this
  product yet; the natural owner is a future addendum to `omnibox-competitive-parity.md`, not a new
  track.
- **Reader auto-decision memory + PDF theme picker** (row 8) — small, low-priority; fold into whichever
  session next touches Phase 2c's PDF viewer or `@tepegoz/reader`'s entry point.
- **Userscript support** (row 6) — no contradiction with any ADR, just unbuilt and not currently
  prioritized against a structured `ext-*` package; revisit only on real user demand for
  bring-your-own-script extensibility.

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis)),
reference these, never duplicate them:

| Stays with                                                 | Material                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`browser-settings-feature-gap.md`**                      | Password-manager integrations, tracking-protection levels, autofill — Min ships variants of all three; that track already carries them with their own suggested home (mostly Phase 2)                                                                                 |
| **Phase 8** (`phase-8-local-intelligence-sovereignty.md`)  | Global on-device semantic/full-text history search (L1/L2, FTS5 + sqlite-vec) — Min's signature feature is functionally covered by what Phase 8 already specifies; also the natural home for a strict never-escalate-to-cloud translation mode, if one is ever wanted |
| **`ext-adblock`** (shipped) + **ADR-0043** (Safe Browsing) | Ad/tracker blocking and unsafe-site interstitials — both already ship                                                                                                                                                                                                 |
| **ADR-0042** (Page-Translation provider boundary)          | Local-first, cloud-escalating translation — already the same philosophy as Min's Bergamot engine                                                                                                                                                                      |
| **`omnibox-competitive-parity.md`**                        | The address bar / instant-answer surface — nearest existing track for a possible future quick-answer-plugin workstream, not opened here                                                                                                                               |
| **ADR-0020** (Tab Boundary Model)                          | The tab-group model itself (organizational metadata, no policy semantics) — P1 extends it, does not revisit it                                                                                                                                                        |

## ADRs owed

- **P1: none.** Stays entirely inside ADR-0020's existing decision (see P1's ADR note above). Per this
  repo's own multi-profile-track lesson (`multi-profile-isolation.md` — an ADR-number collision from
  writing a plan too far ahead of when it's actually opened), no number is reserved here for anything on
  this track, including P1.
