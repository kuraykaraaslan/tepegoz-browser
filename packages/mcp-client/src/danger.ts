import type { RiskLevel } from '@tepegoz/shared-types';
import type { McpToolAnnotations } from './schemas';

/**
 * Map an MCP tool's (untrusted, advisory) annotations to a dangerClass (ADR-0018). Fail-safe:
 * annotations are controlled by the external server, so only `readOnlyHint === true` may LOWER a tool
 * to auto-allow (`read`), and even that stays behind the Policy Kernel's sensitive-site lockout. A
 * `destructiveHint` raises to `destructive` (ask + biometric). Everything else defaults to
 * `state_changing` (→ `ask`), so a missing/false hint on a side-effecting tool still requires a human.
 */
export function dangerClassFor(annotations: McpToolAnnotations | undefined): RiskLevel {
  if (annotations?.readOnlyHint === true) return 'read';
  if (annotations?.destructiveHint === true) return 'destructive';
  return 'state_changing';
}

/**
 * Derive `requiresIdempotencyKey` (parity with the builtin convention + the gateway's create/upload
 * rule): destructive tools and create/upload verbs must carry an idempotency key.
 */
export function requiresIdempotencyFor(verb: string, danger: RiskLevel): boolean {
  return danger === 'destructive' || verb === 'create' || verb === 'upload';
}
