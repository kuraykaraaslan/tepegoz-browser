import type { CanonMessage } from '../types';
import { isBlockContent } from '../content';

/**
 * Canonical messages → OpenAI Chat Completions messages (S1 PR3).
 *
 * Chat Completions splits what the canonical shape keeps together: a tool call rides on the *assistant*
 * message as `tool_calls`, and each result comes back as its **own** `role: 'tool'` message keyed by
 * `tool_call_id`. So one canonical message can expand into several here — which is exactly why this
 * mapping is a list→list function rather than a per-message one.
 */

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  /** Arguments are a JSON *string* on this API, not an object (they are parsed back on the way in). */
  function: { name: string; arguments: string };
}

/** A content part, used only when a turn carries an image (a text-only turn stays a plain string). */
export type OpenAIContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[] | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

/** One canonical message → the one-or-more OpenAI messages it becomes. */
function expand(message: CanonMessage): OpenAIChatMessage[] {
  if (!isBlockContent(message.content)) {
    return [{ role: message.role, content: message.content }];
  }
  const parts: OpenAIContentPart[] = [];
  const toolCalls: OpenAIToolCall[] = [];
  const results: OpenAIChatMessage[] = [];
  let hasImage = false;
  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        parts.push({ type: 'text', text: block.text });
        break;
      case 'image':
        hasImage = true;
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${block.mediaType};base64,${block.data}` },
        });
        break;
      case 'tool_use':
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
        break;
      case 'tool_result':
        // A tool result is its own message on this API, and must FOLLOW the assistant turn that called.
        results.push({ role: 'tool', tool_call_id: block.toolUseId, content: block.content });
        break;
    }
  }

  const out: OpenAIChatMessage[] = [];
  const textOnly = parts.every((p) => p.type === 'text');
  // Keep the plain-string form whenever it is faithful: it is what every existing turn sends, and the
  // parts array is only required once an image is in play.
  const content =
    hasImage || !textOnly ? parts : parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
  if (toolCalls.length > 0) {
    // `content: null` is the API's shape for an assistant turn that is purely a tool call.
    const assistant: OpenAIChatMessage = {
      role: 'assistant',
      content: typeof content === 'string' && content.length === 0 ? null : content,
      tool_calls: toolCalls,
    };
    out.push(assistant);
  } else if (parts.length > 0) {
    out.push({ role: message.role, content });
  }
  out.push(...results);
  return out;
}

export function toOpenAIMessages(messages: readonly CanonMessage[]): OpenAIChatMessage[] {
  return messages.flatMap(expand);
}
