import { z } from 'zod';

/**
 * Canonical, provider-agnostic **message content blocks** (S1).
 *
 * `CanonMessage.content` was a bare `string`, which structurally blocked two things at once: the model
 * could never be shown an image (a screenshot is captured today and then thrown away — the AI-8A vanity
 * flag), and a tool call could only ride *inside prose* as JSON, which is why a verbose model truncating
 * its own output shows up as a decision-parse failure rather than a transport error.
 *
 * The canonical shape stays **provider-agnostic** (ADR-0005): each adapter normalizes its vendor's
 * blocks *into* these and never leaks a vendor shape back out. A plain `string` remains a legal, and the
 * normalized default, `content` — blocks are opt-in, so every existing caller is unaffected.
 */

/** Ordinary model-visible text. */
export const CanonTextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * The image media types every adapter we ship can carry. Deliberately a closed enum: an unknown media
 * type is a request we cannot honestly send, and silently dropping it would make the model *look* like
 * it saw a picture it never received.
 */
export const CANON_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type CanonImageMediaType = (typeof CANON_IMAGE_MEDIA_TYPES)[number];

/** A raster image as base64 bytes (no data: prefix — adapters add whatever envelope their vendor wants). */
export const CanonImageBlockSchema = z.object({
  type: z.literal('image'),
  mediaType: z.enum(CANON_IMAGE_MEDIA_TYPES),
  /** Base64-encoded bytes. Never a URL: the gateway does not fetch on the model's behalf (SSRF). */
  data: z.string().min(1),
});

/**
 * The model's *native* request to run a tool, as an assistant-turn block. `id` is the vendor's
 * correlation handle — a `tool_result` must echo it back or the provider rejects the follow-up turn.
 */
export const CanonToolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  /** Opaque here; the capability plane is the authority on tool argument schemas (ADR-0007). */
  input: z.unknown(),
});

/**
 * The observation flowing back for one `tool_use`. Text-only by design: a tool result is UNTRUSTED page
 * data, and it goes through the inbound content-guard as text before it is ever handed back to a model.
 */
export const CanonToolResultBlockSchema = z.object({
  type: z.literal('tool_result'),
  toolUseId: z.string().min(1).max(200),
  content: z.string(),
  /** The tool failed. Providers that carry a native error flag map it; others prefix the text. */
  isError: z.boolean().optional(),
});

export const CanonContentBlockSchema = z.discriminatedUnion('type', [
  CanonTextBlockSchema,
  CanonImageBlockSchema,
  CanonToolUseBlockSchema,
  CanonToolResultBlockSchema,
]);

/**
 * What a message's `content` may be. A `string` is the normalized default and stays first-class — the
 * union is widened, never replaced, so no existing caller has to change to keep compiling.
 */
export const CanonMessageContentSchema = z.union([z.string(), z.array(CanonContentBlockSchema)]);

export type CanonTextBlock = z.infer<typeof CanonTextBlockSchema>;
export type CanonImageBlock = z.infer<typeof CanonImageBlockSchema>;
export type CanonToolUseBlock = z.infer<typeof CanonToolUseBlockSchema>;
export type CanonToolResultBlock = z.infer<typeof CanonToolResultBlockSchema>;
export type CanonContentBlock = z.infer<typeof CanonContentBlockSchema>;
export type CanonMessageContent = z.infer<typeof CanonMessageContentSchema>;
