# Core entities & lifecycles

Business-language definitions of the domain entities and the states they move through
(ARCHITECTURE-02). Canonical shapes live in `@tepegoz/shared-types` and the owning contract packages
(`@tepegoz/desktop-ipc`, `@tepegoz/persistence`) — this page documents *meaning and lifecycle*, not
fields.

| Entity | Owner (shape) | Lifecycle |
|---|---|---|
| **Tab** | `TabInfo` (desktop-ipc) / `TabRecord` (tab-engine) | CREATED → LOADING ⇄ LOADED → CLOSED. Two kinds: `web` (backed by a WebContentsView) and `internal` (`tepegoz://…`, chrome-rendered, no view). A closed web tab's URL enters the in-memory reopen stack (Ctrl+Shift+T, capped 25). |
| **Session snapshot** | `SessionStore` (persistence) | SAVED (debounced on every tab change; synchronously on quit) → RESTORED once at next launch → OVERWRITTEN by the next save. Only `web` tabs with real URLs are captured. |
| **History entry** | `HistoryEntry` (persistence) | RECORDED on a committed top-level navigation → COALESCED on revisit (same URL: title/ts refresh + visit count) → PRUNED after 90 days (startup retention pass) or DELETED/CLEARED by the user. |
| **Bookmark** | `BookmarkEntry` (bookmarks) | ADDED ⇄ REMOVED (toggle; re-adding the same URL refreshes the title, never duplicates). http(s) pages plus trusted system paths (`tepegoz://` internal pages, `file://`); executable/smuggling schemes rejected (`isBookmarkable`). |
| **Journal event** | `EventSchema` (shared-types, ADR-0004) | APPENDED (immutable, ordered by `lsn`) — never updated or deleted. Payloads are redacted (secret/PII stripped) *before* the write; `redacted: true` records that contract. |
| **Agent run** | ext-agent wire types + `runControllers` (main) | REQUESTED → PLAN PREVIEWED → APPROVED (optionally with skipped steps) / REJECTED → EXECUTING (per-step: START → OK / ERROR; HITL asks pause the run, fail-safe deny at 120 s) → DONE / ERROR / CANCELLED. One run at a time (Phase 1a, ADR-0013); all runs abort on quit. |
| **Plan / PlanStep** | `PlanSchema` (shared-types) | PROPOSED by the planner (untrusted → zod-validated, tools checked against the registry, goal/rationale length-capped) → APPROVED/REJECTED by the user → steps executed sequentially (Phase 1a). |
| **Preference set** | `Preferences` (desktop-ipc) | DEFAULTED at first run → PATCHED per change (validated partial updates); read by both processes. |
| **Credential (BYO key)** | `CredentialVault` (credential-vault) | SET (encrypted via OS `safeStorage`, main-only) → USED (never leaves main; renderer sees booleans) → REMOVED. Unavailable OS crypto ⇒ set/read fail closed. |
| **Extension** | `ExtensionManifest` (extension-sdk) + `ExtensionState` (desktop-ipc) | DECLARED (manifest zod-validated, closed permission set) → ENABLED ⇄ DISABLED (per user, default enabled). Real third-party loading is a later phase. |
