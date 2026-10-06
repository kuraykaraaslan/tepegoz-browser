import type { ToolDescriptor } from '@tepegoz/shared-types';

/** Build a `browser_*` builtin ToolDescriptor (mirrors `@tepegoz/file-operations`'s local helper). */
export function descriptor(
  id: string,
  dangerClass: ToolDescriptor['dangerClass'],
  description: string,
  opts: { aiTask?: ToolDescriptor['aiTask']; capability?: ToolDescriptor['capability'] } = {},
): ToolDescriptor {
  return {
    id,
    description,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
    aiTask: opts.aiTask ?? 'none',
    category: 'browser',
    ...(opts.capability !== undefined ? { capability: opts.capability } : {}),
  };
}
