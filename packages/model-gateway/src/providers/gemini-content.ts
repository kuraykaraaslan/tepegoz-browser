import type { CanonMessage } from '../types';
import { isBlockContent } from '../content';

/**
 * Canonical messages → Gemini `contents` (S1 PR3).
 *
 * Gemini keeps everything in one `parts` array per turn, so unlike OpenAI nothing splits into extra
 * messages. The one real friction is that Gemini **has no tool-call id**: a `functionResponse` is
 * correlated by function *name*. This mapper therefore walks the whole conversation first, building an
 * id → name index from the `tool_use` blocks, and resolves each `tool_result` through it. When the id is
 * unknown (a result whose call is no longer in the window) the id is used as the name — which is correct
 * for the caller convention of naming the id after the tool when the provider issued none, and is at
 * worst a name Gemini does not recognise rather than a silently dropped observation.
 */

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: unknown };
  functionResponse?: { name: string; response: { content: string } };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** id → tool name, so a `tool_result` can be given the name Gemini correlates on. */
function toolNamesById(messages: readonly CanonMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const m of messages) {
    if (!isBlockContent(m.content)) continue;
    for (const block of m.content) {
      if (block.type === 'tool_use') names.set(block.id, block.name);
    }
  }
  return names;
}

export function toGeminiParts(
  content: CanonMessage['content'],
  names: Map<string, string>,
): GeminiPart[] {
  if (!isBlockContent(content)) return [{ text: content }];
  const parts: GeminiPart[] = [];
  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push({ text: block.text });
        break;
      case 'image':
        parts.push({ inlineData: { mimeType: block.mediaType, data: block.data } });
        break;
      case 'tool_use':
        parts.push({ functionCall: { name: block.name, args: block.input } });
        break;
      case 'tool_result':
        parts.push({
          functionResponse: {
            name: names.get(block.toolUseId) ?? block.toolUseId,
            response: { content: block.content },
          },
        });
        break;
    }
  }
  return parts;
}

export { toolNamesById };
