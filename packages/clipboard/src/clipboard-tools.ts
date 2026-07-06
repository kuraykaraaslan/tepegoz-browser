import { z } from 'zod';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { ToolDescriptor } from '@tepegoz/shared-types';
import type { ClipboardReadTextInput, ClipboardWriteTextInput } from './index';
import { ClipboardReadTextInputSchema, ClipboardWriteTextInputSchema } from './schemas';

export interface ClipboardToolsHost {
  readText(input: ClipboardReadTextInput): string;
  writeText(input: ClipboardWriteTextInput): unknown;
}

const NoArgs = z.object({}).strip();

function descriptor(
  id: string,
  dangerClass: ToolDescriptor['dangerClass'],
  description: string,
  requiresIdempotencyKey = false,
): ToolDescriptor {
  return {
    id,
    description,
    dangerClass,
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey,
    aiTask: 'none',
    category: 'clipboard',
  };
}

export function registerClipboardTools(deps: { host: ClipboardToolsHost }): void {
  const { host } = deps;

  CapabilityRegistry.register({
    descriptor: descriptor(
      'clipboard_get_text',
      'state_changing',
      'Read text from the OS clipboard. Treated as HITL-gated because clipboard contents may contain secrets.',
    ),
    inputSchema: ClipboardReadTextInputSchema.or(NoArgs),
    handler: (args) => host.readText({ ...args, actor: 'agent' }),
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'clipboard_create_text',
      'state_changing',
      'Write text to the OS clipboard. Args: { text, origin?, idempotencyKey? }. Requires HITL.',
      true,
    ),
    inputSchema: ClipboardWriteTextInputSchema,
    handler: (args) => {
      host.writeText({ ...args, actor: 'agent' });
      return { ok: true };
    },
  });
}
