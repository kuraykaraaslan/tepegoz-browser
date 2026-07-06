import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import type { JournalReader } from './host';

/**
 * The agent's built-in **`journal_search_events` capability** — read recent audit events from the
 * append-only Event Journal. Registered directly into the single `CapabilityRegistry` behind the
 * ToolGateway PEP as an always-on `source: 'builtin'` tool (the `@tepegoz/file-operations` pattern),
 * bound to an injected {@link JournalReader} so this package stays Electron- and persistence-free.
 * Moved off the Agent extension (ADR-0021/0024 update): the audit journal is its own domain.
 */

const JournalQueryArgs = z.object({
  limit: z.number().int().positive().max(200).optional(),
  correlationId: z.string().min(1).max(200).optional(),
});

/** Build the `journal_*` builtin ToolDescriptor (mirrors `@tepegoz/file-operations`'s local helper). */
function descriptor(
  id: string,
  dangerClass: ToolDescriptor['dangerClass'],
  description: string,
): ToolDescriptor {
  return {
    id,
    description,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
    aiTask: 'none',
    category: 'journal',
  };
}

/** Registers the `journal_*` agent tool into the `CapabilityRegistry`, bound to `deps.host`. */
export function registerJournalTools(deps: { host: JournalReader }): void {
  const { host } = deps;

  CapabilityRegistry.register({
    descriptor: descriptor(
      'journal_search_events',
      'read',
      'Read recent audit events from the Event Journal (this run by default). ' +
        'args: { limit?: number (default 20, max 200), correlationId?: string } — ' +
        'returns an array of { type, ts, actor, correlationId, summary }, newest first.',
    ),
    inputSchema: JournalQueryArgs,
    handler: (args) => host.recentEvents(args.limit ?? 20, args.correlationId),
  });
}
