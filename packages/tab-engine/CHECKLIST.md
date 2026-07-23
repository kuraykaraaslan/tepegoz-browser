# @tepegoz/tab-engine CHECKLIST

Status verified against the implementation (2026-07-23); checked items have concrete code backing them.

- [x] Support a pure tab state store independent of Electron.
- [x] Support creating tab records with allocated identifiers.
- [x] Support retrieving tab records by identifier.
- [x] Support deleting tab records.
- [x] Support selecting the active tab.
- [x] Support insertion-ordered tab storage.
- [x] Support projecting state to renderer-facing tab DTOs.
- [x] Support pinned tabs.
- [x] Support pinned tabs as a contiguous leading run.
- [x] Support tab groups with names and colors.
- [x] Support assigning tabs to groups.
- [x] Support removing tabs from groups.
- [x] Support creating groups.
- [x] Support pruning empty groups.
- [x] Support keeping each group's members contiguous.
- [x] Support preventing pinned tabs from belonging to groups.
- [x] Support clearing group membership when pinning a tab.
- [x] Support clearing pinned state when grouping a tab.
- [x] Support Chrome-style fixed group color palette.
- [x] Support group collapse metadata.
- [x] Support web and internal tab kinds.
- [x] Support navigation availability projection from host data.
- [x] Support built-in tab capabilities for the agent.
- [x] Support listing live tabs through an injected host.
- [x] Support creating live tabs through an injected host.
- [x] Support activating live tabs through an injected host.
- [x] Support closing live tabs through an injected host.
- [x] Support ToolGateway policy path for tab capabilities.
- [x] Support tests for ordering, grouping, and pinning invariants.
- [ ] Support future tab metadata without making groups a policy boundary.
