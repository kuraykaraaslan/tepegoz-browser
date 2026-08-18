import type Anthropic from '@anthropic-ai/sdk';
import type { CanonMessageContent } from '@tepegoz/shared-types';
import { isBlockContent } from '../content';

/**
 * Canonical content blocks → Anthropic content blocks (S1 PR2).
 *
 * This is the one adapter that carries the canonical blocks **natively** rather than flattening them to
 * text: Anthropic's Messages API has a first-class shape for each of the four, so a `tool_use` really is
 * a tool call to the API (not JSON inside prose) and an image really is an image. The mapping lives in
 * its own module so the adapter file stays inside the 250-line cap.
 *
 * A plain `string` passes straight through — the API accepts it and it is the normalized default, so the
 * overwhelmingly common turn pays nothing for a capability it does not use.
 */
export function toAnthropicContent(
  content: CanonMessageContent,
): string | Anthropic.ContentBlockParam[] {
  if (!isBlockContent(content)) return content;
  return content.map<Anthropic.ContentBlockParam>((block) => {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'image':
        return {
          type: 'image',
          source: { type: 'base64', media_type: block.mediaType, data: block.data },
        };
      case 'tool_use':
        // `id` must survive the round trip: the follow-up `tool_result` echoes it, and the API rejects
        // a result whose `tool_use_id` matches no call in the preceding assistant turn.
        return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
      case 'tool_result': {
        const result: Anthropic.ToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: block.toolUseId,
          content: block.content,
        };
        if (block.isError === true) result.is_error = true;
        return result;
      }
    }
  });
}
