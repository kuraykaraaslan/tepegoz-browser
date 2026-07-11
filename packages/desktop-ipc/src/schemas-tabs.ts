import { z } from 'zod';

export const TabIdSchema = z.string().min(1).max(64);
export const TabGroupIdSchema = z.string().min(1).max(64);
/** The fixed Chrome-style group palette (ADR-0020). Mirrors `TabGroupColor` in the contract. */
export const TabGroupColorSchema = z.enum([
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
]);

/** `tabs:move` — drag-reorder a tab. `intoGroupId`: a group id joins, null ungroups, omitted infers. */
export const TabMoveSchema = z.object({
  id: TabIdSchema,
  toIndex: z.number().int().min(0),
  intoGroupId: TabGroupIdSchema.nullable().optional(),
});

/** `tabs:pin` — pin/unpin a tab. */
export const TabPinSchema = z.object({ id: TabIdSchema, pinned: z.boolean() });

/** `tabs:group-create` — group these tabs (empty/omitted → the active tab). */
export const TabGroupCreateSchema = z.object({
  memberIds: z.array(TabIdSchema).max(500).optional(),
});

/** `tabs:group-move` — reorder a whole group's run. */
export const TabGroupMoveSchema = z.object({
  groupId: TabGroupIdSchema,
  toIndex: z.number().int().min(0),
});

/** A single per-tab-group setting value (`TabGroupSettingKey` → value) — flat and JSON-safe. */
export const TabGroupSettingValueSchema = z.union([
  z.string().max(2048),
  z.number(),
  z.boolean(),
  z.null(),
]);

/** The extensible per-group settings bag (agent enabled/open today; VPN/Tor bindings later). */
export const TabGroupSettingsSchema = z.record(
  z.string().min(1).max(128),
  TabGroupSettingValueSchema,
);

/** `tabs:group-update` — patch a group's name/color/collapsed/settings (only provided keys change;
 *  `settings` itself is a merge-patch — only its provided keys change). */
export const TabGroupUpdateSchema = z
  .object({
    groupId: TabGroupIdSchema,
    name: z.string().max(200),
    color: TabGroupColorSchema,
    collapsed: z.boolean(),
    settings: TabGroupSettingsSchema,
  })
  .partial({ name: true, color: true, collapsed: true, settings: true });

/** `tabs:group-assign` — add a tab to an existing group. */
export const TabGroupAssignSchema = z.object({ tabId: TabIdSchema, groupId: TabGroupIdSchema });

// ── Tab tear-off (drag out of the strip → new/another window) ──────────────────────────────────────

/** The dragged item for `tabs:drag-begin` — a single tab or a whole group (its header). */
const TabDragItemSchema = z.object({
  kind: z.enum(['tab', 'group']),
  id: TabIdSchema, // tab id or group id; both are bounded strings
});

/** `tabs:drag-begin` — a strip drag left the strip: identify the item + the floating-preview chip. */
export const TabDragBeginSchema = z.object({
  item: TabDragItemSchema,
  title: z.string().max(2048),
  faviconUrl: z.string().max(8192).nullable(),
  grabOffset: z.object({ x: z.number(), y: z.number() }),
  width: z.number(),
  height: z.number(),
  active: z.boolean(),
  pinned: z.boolean(),
  groupColor: z.string().max(32).nullable(),
});

/** `tabs:drag-move` / `tabs:drag-end` — cursor in desktop-global screen coords (DIP) + torn flag. */
export const TabDragPointSchema = z.object({
  screenX: z.number(),
  screenY: z.number(),
  torn: z.boolean(),
});

/** `tabs:report-strip` — this window's strip rect + per-tab slots, in client (renderer) coords. */
export const TabStripGeometrySchema = z.object({
  strip: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  slots: z
    .array(
      z.object({
        id: TabIdSchema,
        left: z.number(),
        width: z.number(),
      }),
    )
    .max(500),
});

export const NavigateInputSchema = z.string().max(4096);
export const CreateTabInputSchema = z.string().max(4096).optional();
/** `tabs:create-background` payload — a required URL to open in a background tab. */
export const CreateBackgroundTabSchema = z.string().min(1).max(4096);
export const ContentVisibleSchema = z.boolean();
