import { z } from 'zod';
import { EXTENSION_ID_RE } from '@tepegoz/extension-sdk';
import { PROVIDER_IDS, type AppInfo, type BookmarkImportInput } from './contract';

/**
 * Runtime (zod) validation for IPC payloads — MAIN PROCESS ONLY. Kept separate from `ipc-contract.ts`
 * so the sandboxed preload never pulls zod into its bundle (sandboxed preloads can't require external
 * modules at runtime). Validates the UNTRUSTED direction: inputs arriving from the renderer.
 */
export const AppInfoSchema: z.ZodType<AppInfo> = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  glassAvailable: z.boolean(),
});

const ProviderIdSchema = z.enum(PROVIDER_IDS);
/** A stored-key id (generated uuid). Bounded to keep the untrusted payload small. */
const KeyIdSchema = z.string().min(1).max(128);

/** `credentials:add` payload — the only channel that carries a raw key (renderer → main). */
export const AddProviderKeyInputSchema = z.object({
  provider: ProviderIdSchema,
  label: z.string().min(1).max(64),
  apiKey: z.string().min(1).max(500),
});

/** `credentials:remove-by-id` payload. */
export const RemoveKeyByIdSchema = z.object({
  keyId: KeyIdSchema,
});

/** `credentials:rename` payload (label only — the secret is never touched). */
export const RenameProviderKeyInputSchema = z.object({
  keyId: KeyIdSchema,
  label: z.string().min(1).max(64),
});

/** `credentials:reorder` payload — the full key-id list in the new priority order (top = default). */
export const ReorderKeysSchema = z.object({
  orderedIds: z.array(KeyIdSchema).max(200),
});

export const ContentBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

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

/** `agent:run` payload — prompt + the tab-group id that owns this agent session. */
export const AgentRunInputSchema = z.object({
  prompt: z.string().min(1).max(4000),
  groupId: z.string().min(1).max(64),
  displayPrompt: z.string().min(1).max(4000).optional(),
  attachmentMeta: z
    .array(
      z.object({
        kind: z.enum(['selection', 'file', 'screenshot']),
        label: z.string().min(1).max(512),
        mimeType: z.string().max(256).optional(),
        sizeBytes: z.number().int().nonnegative().optional(),
      }),
    )
    .max(10)
    .optional(),
});
/** `agent:new-conversation` payload — the group whose history to clear. */
export const AgentNewConversationSchema = z.string().min(1).max(64);
export const AgentRunIdSchema = z.string().min(1).max(64);
export const AgentApprovalResponseSchema = z.object({
  approvalId: z.string().min(1).max(64),
  approved: z.boolean(),
});

export const AgentPlanResponseSchema = z.object({
  planId: z.string().min(1).max(64),
  approved: z.boolean(),
  skipStepIds: z.array(z.string().max(64)).max(100).optional(),
});

/** `agent:open-file` payload — an absolute path the agent produced; opened only if inside a grant. */
export const AgentOpenFileSchema = z.string().min(1).max(4096);

/** `agent:export-conversation` payload — the rendered chat-log text plus an optional title used to
 *  derive the filename (the main process sanitizes it and stamps a timestamp). */
export const AgentExportConversationSchema = z.object({
  content: z.string().min(1).max(5_000_000),
  title: z.string().max(200).optional(),
});

/** `agent:export-bundle` payload — the rendered chat-log text (written as `chat.md`), the agent session
 *  group id whose tabs/memory the main process gathers, and optional display meta echoed into the
 *  manifest. The heavy diagnostics (tab DOM/PNG snapshots, model-visible memory, journal, environment)
 *  are collected in the main process, which is the only side that can reach a tab's webContents. */
export const AgentExportBundleSchema = z.object({
  chatContent: z.string().min(1).max(5_000_000),
  groupId: z.string().min(1).max(200),
  meta: z
    .object({
      provider: z.string().max(100).optional(),
      autonomy: z.string().max(50).optional(),
      effort: z.string().max(50).optional(),
      tokens: z
        .object({
          inputTokens: z.number().optional(),
          outputTokens: z.number().optional(),
          totalTokens: z.number().optional(),
        })
        .optional(),
      title: z.string().max(200).optional(),
    })
    .optional(),
});

export const HistoryQuerySchema = z.string().max(200);
export const HistoryUrlSchema = z.string().min(1).max(4096);

export const HistoryPageParamsSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});
export const HistorySearchParamsSchema = z.object({
  query: z.string().max(200).default(''),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

/** `bookmarks:toggle` payload — the page URL + its title (title defaults to the URL if empty) + the
 *  page's current favicon URL (http(s)/data:) captured at save time. */
export const BookmarkToggleSchema = z.object({
  url: z.string().min(1).max(4096),
  title: z.string().max(2048),
  favicon: z.string().max(100000).nullish(),
});
/** `bookmarks:is-bookmarked` payload — a single URL to look up. */
export const BookmarkUrlSchema = z.string().min(1).max(4096);

// Bookmark tree ops. A node id is a uuid or one of the two fixed roots. Handlers refuse the roots where
// it matters (delete/move a root). Folder ops carry no URL, so `isBookmarkable` is applied to bookmark
// ops only (not present here — the bar creates folders + moves; bookmarks are still added via the star).
const BookmarkNodeId = z.string().min(1).max(64);
/** `bookmarks:create-folder` — a new folder under `parentId` (optionally at `index`). */
export const BookmarkCreateFolderSchema = z.object({
  parentId: BookmarkNodeId,
  title: z.string().min(1).max(2048),
  index: z.number().int().min(0).max(100000).optional(),
});
/** `bookmarks:rename` — set a node's title. */
export const BookmarkRenameSchema = z.object({
  id: BookmarkNodeId,
  title: z.string().min(1).max(2048),
});
/** `bookmarks:remove` — delete a node (recursive; handler refuses roots). */
export const BookmarkRemoveSchema = BookmarkNodeId;
/** `bookmarks:move` — reparent + reorder a node to `index` within `newParentId`. */
export const BookmarkMoveSchema = z.object({
  id: BookmarkNodeId,
  newParentId: BookmarkNodeId,
  index: z.number().int().min(0).max(100000),
});
/** `bookmarks:context-menu` — pop the native menu for a node (renderer→main). `variant` 'folder-item'
 *  is the reduced menu shown inside a bar folder-dropdown popup (Open / Move to bar / Delete). */
export const BookmarkContextMenuSchema = z.object({
  id: BookmarkNodeId,
  type: z.enum(['folder', 'bookmark']),
  variant: z.enum(['default', 'folder-item']).optional(),
});

export const BookmarkImportSchema = z.object({
  source: z.enum(['chrome', 'edge', 'firefox', 'brave', 'other']),
  format: z.literal('html'),
  data: z.string().max(10_485_760),
}) satisfies z.ZodType<BookmarkImportInput>;

/** `user-agent:set` payload — a UA string to apply, or null to reset to the browser default. */
export const UserAgentSelectionSchema = z.string().max(512).nullable();

/** `popup-blocker:set` payload — a partial settings patch (only provided keys change). */
export const PopupBlockerPatchSchema = z
  .object({
    enabled: z.boolean(),
    showNotifications: z.boolean(),
    trustedOrigins: z.array(z.string().max(2048)).max(500),
  })
  .partial();

/** `popup-blocker:trust` payload — an origin to add to the trust allowlist. */
export const PopupOriginSchema = z.string().min(1).max(2048);

/** `adblock:set` payload — a partial settings patch (only provided keys change). */
export const AdblockPatchSchema = z
  .object({
    enabled: z.boolean(),
    blockingMode: z.literal('ads-and-trackers'),
    cosmeticFiltering: z.boolean(),
    disabledOrigins: z.array(z.string().max(2048)).max(500),
  })
  .partial();

/** `adblock:site-set` payload — enable or pause protection for one http(s) origin. */
export const AdblockSiteEnabledSchema = z.object({
  origin: z.string().min(1).max(2048),
  enabled: z.boolean(),
});

/** `extension:context-menu` payload — the reverse-DNS id of the toolbar icon that was right-clicked. */
export const ExtensionIdSchema = z.string().regex(EXTENSION_ID_RE).max(128);

/**
 * `popup:open` payload — the reusable native popup primitive. `surface` is the surface kind (e.g.
 * 'main-menu' | 'ext'); `id` is required only for the extension surface; `anchor` is the trigger's rect
 * to anchor under; `height` is an optional desired content height (clamped to the work area in main).
 */
export const PopupOpenSchema = z.object({
  surface: z.string().min(1).max(64),
  // A surface-specific target id: an extension id (ext popup) OR a bookmark node id/root (bookmark
  // surfaces). Kept a loose bounded string here; each surface handler re-validates it (the ext handler
  // via manifestById, the bookmark handlers via the tree store), so an unknown id is simply ignored.
  id: z.string().min(1).max(128).optional(),
  anchor: ContentBoundsSchema,
  height: z.number().int().positive().max(2000).optional(),
});

/** `popup:resize` payload — the open popup reports its measured content height so main shrinks the
 *  window to fit (removing the empty strip from the open-time height estimate). Clamped in main. */
export const PopupResizeSchema = z.object({
  height: z.number().int().positive().max(2000),
});

/** `page-menu:action` payload — which wired action of the web-page right-click menu to run. */
export const PageMenuActionSchema = z.enum([
  'back',
  'forward',
  'reload',
  'view-source',
  'inspect',
  'print',
  'save',
  'copy',
  'cut',
  'paste',
  'select-all',
  'search-selection',
  'copy-link',
  'open-link-new-tab',
  'copy-image',
  'copy-media-link',
  'save-media',
  'open-media-new-tab',
]);

/** `page-menu:contribution-action` payload — dispatches an item selected from a contributed section. */
export const PageMenuContributionActionSchema = z.object({
  menuId: z.string().min(1).max(128),
  contributorId: z.string().min(1).max(128),
  sectionId: z.string().min(1).max(128),
  itemId: z.string().min(1).max(128),
  actionId: z.string().min(1).max(128),
  payload: z.unknown().optional(),
});

/** `submenu:open` payload — a flyout submenu opened beside the main menu popup (its own native window). */
export const SubmenuOpenSchema = z.object({
  kind: z.string().min(1).max(32),
  anchor: ContentBoundsSchema,
  height: z.number().int().positive().max(2000).optional(),
});

/** `notifications:dismiss` / `notifications:mark-read` payload — a single notification id. */
export const NotificationIdSchema = z.string().min(1).max(128);

/** `notifications:permission-respond` payload — the user's answer to a Web Notification consent prompt. */
export const NotificationPermissionResponseSchema = z.object({
  requestId: z.string().min(1).max(128),
  allow: z.boolean(),
  remember: z.boolean(),
});

export { DownloadCommandInputSchema, DownloadCreateInputSchema } from '@tepegoz/downloads/schemas';
export { UploadCommandInputSchema, UploadCreateInputSchema } from '@tepegoz/uploads/schemas';
export {
  TaskCommandInputSchema,
  TaskDefinitionSchema,
  TaskSaveInputSchema,
} from '@tepegoz/tasks/schemas';
export {
  AgentConversationIdSchema,
  AgentConversationListInputSchema,
  AgentConversationOpenInputSchema,
} from '@tepegoz/ext-agent/history-schemas';
export {
  ClipboardOperationInputSchema,
  ClipboardReadTextInputSchema,
  ClipboardWriteTextInputSchema,
} from '@tepegoz/clipboard/schemas';

// Login credential manager schemas (logins:* channels).
/** `logins:set` — the only channel that carries a plaintext secret (renderer → main). Main encrypts
 *  immediately via safeStorage; the raw value is never stored or returned. */
export const LoginSetSchema = z.object({
  url: z.string().min(1).max(4096),
  username: z.string().min(1).max(512),
  /** Plaintext — encrypted in main on arrival. */
  secret: z.string().min(1).max(4096),
  title: z.string().max(512).optional(),
  notes: z.string().max(4096).optional(),
});
export const LoginIdSchema = z.string().min(1).max(128);
export const LoginImportSchema = z.object({
  data: z.string().max(10_485_760),
  format: z.enum(['google-csv', 'generic-csv']),
});
export const LoginExportSchema = z.enum(['google-csv', 'generic-csv']);
/** `logins:fill` — renderer tells main which stored credential to inject into the active page. */
export const LoginFillSchema = z.object({
  credentialId: z.string().min(1).max(128),
  tabId: z.string().min(1).max(64).optional(),
});

// ── Macros (ext-macros) ────────────────────────────────────────────────────────────────────────
// The macro IR validator (MacroSchema) is owned by @tepegoz/shared-types (the single schema source);
// re-exported here so the main-process IPC handlers validate at the boundary from one import surface.
import { MacroSchema, parseMacro } from '@tepegoz/shared-types';
export { MacroSchema, parseMacro };

export const MacroIdSchema = z.string().min(1).max(128);

/** `macros:run` payload. */
export const MacroRunInputSchema = z.object({
  macroId: MacroIdSchema,
  variables: z.record(z.string().max(64), z.string().max(10_000)).optional(),
});

/** `macros:run-draft` payload — run an UNSAVED macro IR directly (record/edit → play, no persist). */
export const MacroRunDraftSchema = z.object({
  macro: MacroSchema,
  variables: z.record(z.string().max(64), z.string().max(10_000)).optional(),
});

/** `macros:attach-csv` payload — CSV text stored as a content-addressed blob; returns its hash. */
export const MacroAttachCsvSchema = z.object({
  content: z.string().max(10_485_760),
});

/** A content-addressed blob reference (`newtab:get-background-image` payload). */
export const CasRefSchema = z.string().startsWith('cas://').max(128);
