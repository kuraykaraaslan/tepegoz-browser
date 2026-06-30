# @tepegoz/shared-types

**Single source of truth** for cross-layer contracts (zod schemas + inferred types). Every other
package consumes `z.infer` types from here — schemas are never copied. All trust boundaries
(`safeParse`) validate against these.

## Exports
- **Enums** (`z.enum`): `AIProviderEnum`, `PolicyDecisionEnum`, `HITLStatusEnum`, `RiskLevelEnum`,
  `McpTransportEnum`, `EventTypeEnum`, `ToolSourceEnum`, `ToolErrorCodeEnum`.
- **Event Journal**: `EventSchema` / `EventRecord` (append-only fact; `lsn`, `deviceId`, `cas://` blobRef),
  `EventInputSchema` / `EventInput` (append input — `lsn`/`deviceId` assigned by the journal).
- **Tools**: `ToolNameSchema` (`{domain}_{verb}_{noun}`), `ToolDescriptorSchema`, `ToolErrorSchema`.

## Scripts
`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
