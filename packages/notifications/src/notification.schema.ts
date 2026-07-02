import { z } from 'zod';
import {
  NOTIFICATION_ACTION_TYPES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
  NOTIFICATION_SOURCES,
  type AppNotification,
} from '@tepegoz/shared-types/notifications';

/** One actionable button on a notification (bounded type + optional target URL). */
export const NotificationActionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  type: z.enum(NOTIFICATION_ACTION_TYPES),
  url: z.string().max(4096).optional(),
});

/**
 * Trust-boundary validation for an incoming notification. A source (agent event, website via the
 * consent flow, system) provides these fields; the host assigns `id`/`ts`/`read` via
 * {@link toNotification}. `channels` defaults to the center so a bare notification is at least
 * discoverable. Built from the canonical `@tepegoz/shared-types/notifications` arrays (single source).
 */
export const NotificationInputSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  source: z.enum(NOTIFICATION_SOURCES),
  title: z.string().min(1).max(256),
  body: z.string().max(2048),
  /** Which delivery surfaces to use — the source's choice (at least one). */
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).max(3).default(['center']),
  dismissible: z.boolean().optional(),
  origin: z.string().max(2048).optional(),
  /** Up to four actionable buttons; the host executes each from its `type`. */
  actions: z.array(NotificationActionSchema).max(4).optional(),
  dedupeKey: z.string().max(256).optional(),
});

/** Validated shape (post-parse): `channels` is always present. */
export type NotificationInput = z.infer<typeof NotificationInputSchema>;

/** Caller-facing shape (pre-parse): `channels` may be omitted (defaults to the center). */
export type NotificationDraft = z.input<typeof NotificationInputSchema>;

/** Assemble a stored notification from validated input + a host-assigned id and clock. Pure. */
export function toNotification(input: NotificationInput, id: string, now: number): AppNotification {
  return {
    id,
    kind: input.kind,
    source: input.source,
    title: input.title,
    body: input.body,
    ts: now,
    read: false,
    channels: input.channels,
    ...(input.dismissible !== undefined ? { dismissible: input.dismissible } : {}),
    ...(input.origin !== undefined ? { origin: input.origin } : {}),
    ...(input.actions !== undefined ? { actions: input.actions } : {}),
    ...(input.dedupeKey !== undefined ? { dedupeKey: input.dedupeKey } : {}),
  };
}
