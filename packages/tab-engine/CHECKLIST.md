# @tepegoz/tab-engine CHECKLIST

Prepared from the package README only; implementation status was not inspected.

- [ ] Support a pure tab state store independent of Electron.
- [ ] Support creating tab records with allocated identifiers.
- [ ] Support retrieving tab records by identifier.
- [ ] Support deleting tab records.
- [ ] Support selecting the active tab.
- [ ] Support insertion-ordered tab storage.
- [ ] Support projecting state to renderer-facing tab DTOs.
- [ ] Support pinned tabs.
- [ ] Support pinned tabs as a contiguous leading run.
- [ ] Support tab groups with names and colors.
- [ ] Support assigning tabs to groups.
- [ ] Support removing tabs from groups.
- [ ] Support creating groups.
- [ ] Support pruning empty groups.
- [ ] Support keeping each group's members contiguous.
- [ ] Support preventing pinned tabs from belonging to groups.
- [ ] Support clearing group membership when pinning a tab.
- [ ] Support clearing pinned state when grouping a tab.
- [ ] Support Chrome-style fixed group color palette.
- [ ] Support group collapse metadata.
- [ ] Support web and internal tab kinds.
- [ ] Support navigation availability projection from host data.
- [ ] Support built-in tab capabilities for the agent.
- [ ] Support listing live tabs through an injected host.
- [ ] Support creating live tabs through an injected host.
- [ ] Support activating live tabs through an injected host.
- [ ] Support closing live tabs through an injected host.
- [ ] Support ToolGateway policy path for tab capabilities.
- [ ] Support tests for ordering, grouping, and pinning invariants.
- [ ] Support future tab metadata without making groups a policy boundary.
