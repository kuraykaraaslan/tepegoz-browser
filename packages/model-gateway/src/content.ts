import type { CanonContentBlock, CanonMessageContent } from '@tepegoz/shared-types';

/**
 * Pure helpers over the widened {@link CanonMessageContent} (S1 PR1). Every one of them is a *reader*:
 * the places that used to do `m.content.length` or `parts.push(m.content)` on a bare string now go
 * through here, so widening the type could not silently change what a caller measures or transmits.
 */

/** True when the message carries structured blocks rather than a plain string. */
export function isBlockContent(content: CanonMessageContent): content is CanonContentBlock[] {
  return Array.isArray(content);
}

/**
 * Flatten to the single string a **text-only** transport can carry.
 *
 * An image is rendered as an explicit `[image: …]` marker rather than dropped. Dropping it would make
 * the model appear to have been shown a picture it never received — exactly the vanity the widening
 * exists to end. A provider that genuinely carries images (S1 PR2+) maps the blocks natively and never
 * calls this.
 */
export function contentToText(content: CanonMessageContent): string {
  if (!isBlockContent(content)) return content;
  const parts: string[] = [];
  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push(block.text);
        break;
      case 'image':
        parts.push(`[image: ${block.mediaType}, not sent — this transport is text-only]`);
        break;
      case 'tool_use':
        parts.push(`[tool_use ${block.name}] ${JSON.stringify(block.input)}`);
        break;
      case 'tool_result':
        parts.push(block.isError === true ? `[tool_error] ${block.content}` : block.content);
        break;
    }
  }
  return parts.join('\n');
}

/**
 * Character count used as the input-token proxy by the deterministic providers. Image bytes are counted
 * as their base64 length: they really are what the request carries, and a proxy that ignored them would
 * under-report the cost of exactly the messages S10 makes expensive.
 */
export function contentLength(content: CanonMessageContent): number {
  if (!isBlockContent(content)) return content.length;
  let total = 0;
  for (const block of content) {
    switch (block.type) {
      case 'text':
        total += block.text.length;
        break;
      case 'image':
        total += block.data.length;
        break;
      case 'tool_use':
        total += block.name.length + JSON.stringify(block.input).length;
        break;
      case 'tool_result':
        total += block.content.length;
        break;
    }
  }
  return total;
}

/**
 * The inspectable text of one message for the Egress Firewall.
 *
 * Text, tool arguments and tool results are all included — a secret leaks just as well through a
 * `tool_use` argument as through prose. Image **bytes are excluded on purpose**: the inspector is a
 * pattern scanner over text, so megabytes of base64 would cost real time and match nothing. That is a
 * stated limitation, not an oversight — a secret rendered *inside* a screenshot is invisible to this
 * layer, and the HITL screenshot-approval path, not the firewall, is what stands between it and the
 * network.
 */
export function egressTextOf(content: CanonMessageContent): string {
  if (!isBlockContent(content)) return content;
  const parts: string[] = [];
  for (const block of content) {
    switch (block.type) {
      case 'text':
        parts.push(block.text);
        break;
      case 'image':
        parts.push(`[image ${block.mediaType}]`);
        break;
      case 'tool_use':
        parts.push(block.name, JSON.stringify(block.input));
        break;
      case 'tool_result':
        parts.push(block.content);
        break;
    }
  }
  return parts.join('\n');
}
