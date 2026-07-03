# ADR-0020: Tab Boundary Model — groups, pins, split view, workspaces

- **Status:** Accepted
- **Date:** 2026-07-03
- **Extends:** ADR-0012 (isolated `WebContentsView` per tab) — this ADR adds the *organizational* layer
  above that isolation model. **Relates to:** ADR-0013 (agent orchestration / HITL policy isolation),
  Phase 2b "Advanced tab system".

## Context
ADR-0012 fixed the browser's core trust boundary: one isolated `WebContentsView` per tab, all browsing
views sharing the `persist:tepegoz-web` session, laid out one-at-a-time in the content area. Phase 2b
now adds a modern tab UX on top of that: **tab groups** (color/name/collapse), **drag-reorder**,
**pinning**, **split view** (2+ views side-by-side), and **workspaces** (named tab sets). These features
introduce new ways to *organize and lay out* views, so they need a stated boundary: what they are, and —
critically — what they are **not**. A tab group must never be mistaken for, or usable as, a
security/isolation partition or an agent policy-isolation axis. Without this stated up front, "group"
would be an ambiguous concept that could silently accrue partition or capability semantics.

## Decision
- **The partition axis is unchanged.** Every web tab keeps sharing `persist:tepegoz-web` exactly as in
  ADR-0012. Groups, pins, split panes, and workspaces are **organizational metadata** held in the pure
  `@tepegoz/tab-engine` model (`TabStore`) — they never create a new `BrowserContext`, session
  partition, or process boundary. (Per-site / per-profile partition isolation remains a separate, later
  ADR and is orthogonal to this one.)
- **Workspace / split boundaries are view *visibility & layout* boundaries, not isolation boundaries.**
  Switching a workspace hides one set of views and shows another; splitting lays two live views into
  sub-rects of the same content area. No view is re-partitioned, re-sessioned, or torn down by these
  operations (a view may still be *discarded* for memory — that is the orthogonal tab-lifecycle
  concern, not a boundary).
- **A tab group carries no capability, permission, or policy semantics.** The agent's checkpoint/branch
  policy isolation (ADR-0013 single-active-run, Policy Kernel / ToolGateway PEP) is a distinct axis and
  must not leak into, or be inferred from, user-facing grouping. Grouping is a chrome-UI convenience;
  permission grants and agent-branch isolation continue to resolve per-surface as today. User-facing
  group membership must not be readable as a policy scope.
- **Contiguity & ordering are model invariants, enforced centrally.** The `TabStore` holds the single
  canonical order (Map insertion order — no per-tab index field). After every structural mutation
  (move, group assign/remove, pin, ungroup) a single `normalize()` pass re-establishes the invariants:
  (1) pinned tabs form a run that precedes all unpinned tabs; (2) each group's members occupy a
  contiguous run, anchored at the group's first member. **Pinned tabs cannot belong to a group** — pinning
  clears group membership and grouping clears the pinned flag (matching Chrome, and removing the
  pinned-run/group-run ordering conflict). Because contiguity is *derived* by `normalize()` rather than
  hand-maintained per method, it is trivially unit-testable in the Electron-free engine.
- **Split view is a layout over the existing view map, not a new lifecycle.** `TabManager` already owns
  one `WebContentsView` per web tab; split view attaches more than one at computed sub-rects instead of
  one at full bounds. A `SplitLayout | null` (null = today's single-active-view mode) describes panes +
  ratios + focused pane; navigation actions target the **focused pane**.

## Consequences
- "Group / workspace / split" are unambiguous: they reorganize and re-lay-out views the user already
  trusts under the ADR-0012 boundary; they add **no** new trust, partition, or policy surface. A
  security review of grouping reduces to "does it still share exactly `persist:tepegoz-web`?" — yes.
- All group/pin/order/layout logic lives in `@tepegoz/tab-engine` (pure, unit-tested without Electron),
  keeping `apps/desktop`'s `TabManager` as Electron I/O only, per the CLAUDE.md modularity constraint.
- The wire types (`TabInfo`/`TabsState`) grow **additively** (optional `pinned`/`groupId`, a `groups`
  list, later `layout`/`workspaces`); old persisted snapshots and the renderer never break mid-migration
  (session snapshots use a tolerant, versioned upconvert chain).
- Rejected: **groups as session partitions** (would conflate organization with isolation, multiply the
  trust surface, and break the "one browsing session" model for no user benefit); **an explicit per-tab
  order index** (redundant with Map order, and every mutation would have to renumber — `normalize()`
  over insertion order is simpler and less error-prone); **allowing pinned tabs inside groups** (forces
  reconciling two competing ordering runs; Chrome's mutual exclusion is simpler and familiar).
