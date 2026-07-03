import { z } from 'zod';
import { ToolNameSchema, type RiskLevel, type ToolDescriptor } from '@tepegoz/shared-types';
import { EXTENSION_ID_RE } from './manifest';

/**
 * Agent-callable capability contract for internal extensions (ADR-0021). An extension MAY declare
 * capabilities — tools the internal agent can discover and invoke — that register into the single
 * `CapabilityRegistry` behind the single `ToolGateway` PEP, exactly like builtin/MCP tools (the
 * ADR-0007 uniform-tool-plane invariant: adding a capability changes neither agent code, policy
 * engine, nor UI).
 *
 * Unlike `manifest.mcpServer` (an out-of-process stdio server, ADR-0018), these run IN-PROCESS with
 * host access (CDP driver, tabs, the extension's own store) via an injected host `H`, so a
 * first-party extension can actually drive the browser. The package stays Electron-free: the concrete
 * host is supplied by the main process at registration time (see `@tepegoz/extension-host`).
 */

/** Author-facing definition of one capability (the host `H` is injected into the handler at run time). */
export interface ExtensionCapabilityDef<A = unknown, H = unknown> {
  /** Tool id — MUST be `{domain}_{verb}_{noun}` with an approved verb (see {@link ToolNameSchema}). */
  id: string;
  /** Model-facing description; include the argument shape (the planner only sees id/description/danger). */
  description: string;
  /** Danger class — fail-safe: only `read` may auto-allow; everything else is HITL-gated at the PEP. */
  dangerClass: RiskLevel;
  /** create/upload-style tools must carry an idempotency key (exactly-once-ish). */
  requiresIdempotencyKey?: boolean;
  /** Zod validator for the (untrusted) arguments — the trust boundary; the gateway validates here. */
  inputSchema: z.ZodType<A>;
  /** Executes the capability; receives validated args + the injected host. May be sync or async
   *  (the gateway awaits the result). */
  handler: (args: A, host: H) => unknown;
}

/**
 * A normalized, validated capability: a full {@link ToolDescriptor} + its zod validator + a
 * host-taking handler. `A` is erased to `unknown` at this boundary (the gateway validates args with
 * `inputSchema` before the handler runs, so the cast inside {@link capability} is sound).
 */
export interface ExtensionCapability<H = unknown> {
  descriptor: ToolDescriptor;
  inputSchema: z.ZodType<unknown>;
  handler: (args: unknown, host: H) => unknown;
}

/** The capability set contributed by one extension (its id + its normalized capabilities). */
export interface ExtensionCapabilitySet<H = unknown> {
  extensionId: string;
  capabilities: readonly ExtensionCapability<H>[];
}

/**
 * Normalize one author definition into an {@link ExtensionCapability}. Keeps the author's `handler`
 * strongly typed as `(args: A, host: H)` while erasing `A` at the registry boundary. Throws on an
 * invalid id (dev-time contract, like {@link defineExtension}).
 */
export function capability<A, H>(def: ExtensionCapabilityDef<A, H>): ExtensionCapability<H> {
  const id = ToolNameSchema.parse(def.id);
  const descriptor: ToolDescriptor = {
    id,
    description: def.description,
    dangerClass: def.dangerClass,
    source: 'extension',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: def.requiresIdempotencyKey ?? false,
  };
  return {
    descriptor,
    inputSchema: def.inputSchema,
    // The gateway has already validated `args` against `inputSchema` by the time this runs.
    handler: (args: unknown, host: H) => def.handler(args as A, host),
  };
}

/**
 * Declare an extension's agent capabilities (validated — throws on an invalid/duplicate id, a
 * dev-time contract like {@link defineExtension}). Stamps `provenance = extensionId` on every
 * descriptor so the host and audit trail can attribute the tool to its extension.
 */
export function defineCapabilities<H>(
  extensionId: string,
  capabilities: readonly ExtensionCapability<H>[],
): ExtensionCapabilitySet<H> {
  if (!EXTENSION_ID_RE.test(extensionId)) {
    throw new Error(`defineCapabilities: invalid extension id "${extensionId}"`);
  }
  const seen = new Set<string>();
  const stamped = capabilities.map((cap): ExtensionCapability<H> => {
    if (seen.has(cap.descriptor.id)) {
      throw new Error(`defineCapabilities: duplicate capability id "${cap.descriptor.id}"`);
    }
    seen.add(cap.descriptor.id);
    return { ...cap, descriptor: { ...cap.descriptor, provenance: extensionId } };
  });
  return { extensionId, capabilities: stamped };
}
