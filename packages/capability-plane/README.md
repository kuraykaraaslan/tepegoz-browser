# @tepegoz/capability-plane (L5)

The **single Tool/Capability Plane** (ADR-0007): every action the agent can take — built-in tool,
MCP tool, extension capability, or future adapter — is a normalized `ToolDescriptor` registered here
and reached only through **one gateway**, the ToolGateway PEP (Policy Enforcement Point). The fixed
invocation order is lookup → idempotency check → zod input validation (untrusted args) →
`@tepegoz/security-policy`'s `PolicyKernel` → HITL confirm (if "ask") → execute → audit — so the
agent can never bypass policy regardless of which tool source it called. Electron-free; the HITL
confirm handler and audit sink are wired in by the app at runtime.

## Exports
- **`CapabilityRegistry`** — the single map of registered tools (`register`/`unregister`/`get`/`list`);
  enforces the `{domain}_{verb}_{noun}` naming convention (`ToolNameSchema`) at registration.
- **`ToolGateway`** — the PEP itself: `invoke(toolName, rawArgs, ctx)` runs the full
  validate → policy → HITL → execute → audit pipeline and returns the result or a standard `ToolError`
  envelope (never throws across the boundary); `setConfirmHandler`/`setAuditHandler` wire the UI/audit
  sinks (an unset confirm handler fails "ask" decisions safe to denied).
- **`AuditEntry`**, **`ConfirmRequest`**, **`InputValidator`**, **`InvokeContext`**, **`RegisteredTool`**
  — supporting types for registering a tool and driving one invocation.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
