/**
 * Preferences shape + the value types it references (split out of `contract.ts` per ADR-0010's
 * 250-line file cap). This file must stay dependency-free (no zod) so the sandboxed preload can
 * import it; re-exported from `contract.ts` for the single public surface.
 */
import type { AgentAutonomy, AgentEffort } from '@tepegoz/ext-agent/types';
import type { AdblockSettings } from '@tepegoz/ext-adblock/types';
import type { PopupBlockerSettings } from '@tepegoz/ext-popup-blocker/types';
import type { TypoSettings } from '@tepegoz/ext-typo/types';
import type { SearchEngine } from '@tepegoz/shared-types/search-engines';
import type { FileAccessGrant } from '@tepegoz/shared-types/file-access';
import type { AIProvider as ProviderId } from '@tepegoz/shared-types/providers';
import type { SitePermissionState } from '@tepegoz/shared-types/notifications';
import type { ExtensionState } from './contract';

// Canonical value lists — the ONE place these unions are spelled out. The zod validators (schemas.ts,
// preferences.model.ts) build their z.enum from these same arrays, so schema/type drift is impossible.
// Plain `as const` arrays keep this file dependency-free for the sandboxed preload. (Provider identity
// comes from @tepegoz/shared-types/providers — see the import block above.)
export const THEME_PREFS = ['system', 'light', 'dark'] as const;
export type ThemePref = (typeof THEME_PREFS)[number];
export const LOCALE_PREFS = ['system', 'en', 'tr'] as const;
export type LocalePref = (typeof LOCALE_PREFS)[number];

export const MCP_TRANSPORTS = ['stdio', 'http_sse'] as const;
export type McpTransportId = (typeof MCP_TRANSPORTS)[number];

// New-tab page background kinds. `default` = the theme surface; `color` = a solid color (optionally
// overlaid with a preset SVG pattern); `image` = an uploaded image stored in the content-addressed
// blob store. The zod validator builds its enum from this same array.
export const NEWTAB_BG_KINDS = ['default', 'color', 'image'] as const;
export type NewTabBackgroundKind = (typeof NEWTAB_BG_KINDS)[number];

// How an uploaded background image is sized in the page: `cover` fills + crops, `contain` fits whole,
// `fill` stretches to the frame, `center` shows it at natural size, `tile` repeats it.
export const NEWTAB_IMAGE_FITS = ['cover', 'contain', 'fill', 'center', 'tile'] as const;
export type NewTabImageFit = (typeof NEWTAB_IMAGE_FITS)[number];

/**
 * A user-configured MCP server (persisted in preferences). Its tools are surfaced to the agent through
 * the single ToolGateway PEP (ADR-0018). Extensions can also declare servers in their manifest; those
 * are not stored here. In Phase 1a only `stdio` is wired; `http_sse` is reserved.
 */
export interface McpServerPref {
  id: string;
  label: string;
  transport: McpTransportId;
  // Optional fields include `| undefined` to match the zod `.optional()` output shape under
  // exactOptionalPropertyTypes (the preferences schema `satisfies z.ZodType<Preferences>`).
  command?: string | undefined;
  args?: string[] | undefined;
  env?: Record<string, string> | undefined;
  url?: string | undefined;
  enabled: boolean;
}

/** Read-only connection status for the Settings "Connections / MCP" list (never carries secrets). */
export type McpServerState = 'idle' | 'connecting' | 'ready' | 'error';
export interface McpServerStatusInfo {
  id: string;
  label: string;
  transport: McpTransportId;
  state: McpServerState;
  toolCount: number;
  error?: string;
}

/** One shortcut tile on the new-tab page — the user's own list, independent of bookmarks. */
export interface NewTabShortcut {
  /** Stable id (generated uuid) — needed to edit/remove the tile. */
  id: string;
  title: string;
  url: string;
}

/**
 * New-tab page background customization.
 *  - `kind: 'default'` — the theme surface (no custom background); other fields are ignored.
 *  - `kind: 'color'`   — a solid `color`, optionally overlaid with a preset SVG pattern (`svgId`).
 *  - `kind: 'image'`   — an uploaded image, stored as a `cas://` blob referenced by `imageRef`.
 * `opacity` (0..1) fades the whole background layer toward the theme surface — the "dimness" control.
 */
export interface NewTabBackground {
  kind: NewTabBackgroundKind;
  /** Hex color for `kind: 'color'` (e.g. '#1e293b'). */
  color: string;
  /** Preset SVG-pattern id overlaid on the color ('' = none). Only meaningful for `kind: 'color'`. */
  svgId: string;
  /** `cas://<hash>` reference to the uploaded image blob. Only meaningful for `kind: 'image'`. */
  imageRef: string;
  /** How the uploaded image is sized (cover/contain/fill/center/tile). Only for `kind: 'image'`. */
  imageFit: NewTabImageFit;
  /** Focal point of the uploaded image as x/y percentages (0..100), driving CSS `background-position`
   *  (50/50 = centered). Set by dragging the image in the adjust popup. Only for `kind: 'image'`. */
  imagePositionX: number;
  imagePositionY: number;
  /** Zoom factor for the uploaded image (1 = 100%, up to 4). Scales toward the focal point. */
  imageZoom: number;
  /** Background-layer opacity, 0..1 (lower = paler; the theme surface shows through). */
  opacity: number;
}

export interface Preferences {
  theme: ThemePref;
  /**
   * Custom single-color theme (hex, e.g. '#7c3aed'); '' = follow `theme` (system/light/dark). When
   * set, it becomes the base surface and text auto-contrasts (dark color → light text, and vice-versa).
   */
  themeColor: string;
  locale: LocalePref;
  telemetryEnabled: boolean;
  /** Cost-saver: route simple/local-eligible capabilities to the on-device model. Mirrors
   *  `localProvider.mode !== 'off'` (kept as the single public boolean the router reads as `costSaver`). */
  useLocalModelForSimpleTasks: boolean;
  /** On-device (local) provider config: how it participates + which downloaded model is selected. */
  localProvider: LocalProviderPref;
  /** Per-action "run locally" overrides, keyed by action (tool) id → run-on-device. Absent id ⇒ the
   *  action's default (derived from its `aiTask`). Only affects `localCapable` actions. */
  localActions: Record<string, boolean>;
  /** Per-run provider chosen from the Agent panel selector; `null` = no override (fall back to the
   *  default resolution: whole-agent-local, then the highest-priority stored key). Only applied when
   *  usable (a cloud provider needs a key; `'local'` needs an installed model). */
  agentProviderOverride: ProviderId | null;
  /** Agent autonomy: `'ask'` = HITL plan + per-tool approval (default, safe); `'auto'` = "act without
   *  asking" (the panel auto-approves; `deny`-class policy still hard-blocks). */
  agentAutonomy: AgentAutonomy;
  /** Agent reasoning-effort preset for a run: raises reasoning depth (Anthropic `output_config.effort`)
   *  AND the per-call max-token budget. Set from the Agent panel effort dropdown. */
  agentEffort: AgentEffort;
  /** Account-wide total-token quota (input+output) across runs; 0 = unlimited/off. Feeds the Token
   *  Ledger quota indicator, the 80% warning, and the pre-flight budget gate. Set in Settings → Agent. */
  agentTokenQuota: number;
  /**
   * The default AI provider — DERIVED from the credential vault's key order (the provider of the
   * top/highest-priority key) and synced by main whenever keys change. There is no separate UI for it;
   * reorder the keys to change it.
   */
  defaultProvider: ProviderId;
  /** Region/country (ISO 3166 code, e.g. 'TR'); '' = follow the OS. Drives date/number formatting. */
  region: string;
  /** Date-format style (Intl `dateStyle`): 'short' | 'medium' | 'long' | 'full'. */
  dateFormat: string;
  /** The selected default search engine id (see @tepegoz/shared-types/search-engines). */
  searchEngineId: string;
  /** One-time first-run sentinel. False only for a brand-new profile that has not completed welcome. */
  onboardingCompleted: boolean;
  /** User-added search engines, merged with the built-in list in the picker + omnibox resolution. */
  customSearchEngines: SearchEngine[];
  /** The home / new-tab page URL (opened for a new tab, the Home button, and a blank omnibox submit). */
  homepageUrl: string;
  /** Show the bookmarks bar strip under the nav toolbar (Chrome-style; toggled from the Bookmarks menu). */
  showBookmarksBar: boolean;
  /** New-tab page shortcut tiles — the user's own list, independent of bookmarks (starts empty). */
  newTabShortcuts: NewTabShortcut[];
  /** New-tab page background (solid color / color + SVG pattern / uploaded image, plus a dimness level). */
  newTabBackground: NewTabBackground;
  /** Absolute directory for released downloads. Empty = OS default Downloads folder. */
  downloadDirectory: string;
  /** Ask for a target path before each user-initiated browser download. */
  downloadAskEachTime: boolean;
  /** Per-extension status (managed at tepegoz://extensions). Unlisted extensions default to enabled. */
  extensions: ExtensionState[];
  /** Active User-Agent override for browsed pages (User-Agent switcher extension); null = default. */
  userAgent: string | null;
  /** External MCP servers whose tools the agent may use (routed through the ToolGateway PEP). */
  mcpServers: McpServerPref[];
  /** Master switch for native OS + in-app notifications (Settings → Notifications). */
  notificationsEnabled: boolean;
  /** Per-origin web-capability permissions (currently the Web Notification API consent state). */
  sitePermissions: Record<string, SitePermissions>;
  /** Popup Blocker (strict) extension settings. */
  popupBlocker: PopupBlockerSettings;
  /** Adblock Shield extension settings. Recent blocked URLs stay session-only and are not persisted. */
  adblock: AdblockSettings;
  /** Typo extension settings. Dictionaries live in userData/dictionaries and are not persisted here. */
  typo: TypoSettings;
  /** One-time sentinel: true after the curated default trusted origins have been seeded into
   *  `popupBlocker.trustedOrigins`, so an intentionally removed default is never re-added. Not
   *  user-facing. */
  popupBlockerSeeded: boolean;
  /** Master switch for the agent's local file operations (Settings → File operations). When off, every
   *  `file_*`/`fileaccess_*` tool refuses regardless of grants. */
  fileOperationsEnabled: boolean;
  /** The folders the agent may operate in, each with a permission mode (the whitelist sandbox). Empty =
   *  no filesystem access. The main process seeds `~/tepegoz` (full) once — see `fileAccessSeeded`. */
  fileAccessGrants: FileAccessGrant[];
  /** One-time sentinel: true after the default `~/tepegoz` grant has been seeded, so an intentionally
   *  emptied list is never re-seeded. Not user-facing. */
  fileAccessSeeded: boolean;
  /** Translucent "glass" chrome (Windows 11 Mica backdrop behind the tab/toolbar/bookmarks bars).
   *  Private (not exposed to extensions); only takes visible effect on Win11 — see `isMicaSupported`. */
  glassChrome: boolean;
}

/**
 * How the on-device provider participates in a run:
 *  - `'off'`     — never use the local model.
 *  - `'simple'`  — local for simple/local-eligible actions only (cloud handles plan/decide).
 *  - `'default'` — run the WHOLE agent on-device (plan + exec), fully offline.
 */
export type LocalProviderMode = 'off' | 'simple' | 'default';

/** On-device provider config (keyless — the "key" is a downloaded model selected from the catalog). */
export interface LocalProviderPref {
  mode: LocalProviderMode;
  /** Selected installed model id, or '' when none selected. */
  selectedModelId: string;
}

/** One on-device model row for the Settings model-management UI (catalog entry + live install state). */
export interface LocalModelInfo {
  id: string;
  name: string;
  /** Parameter count in billions (a size/RAM hint). */
  paramsB: number;
  ctx: number;
  recommended: boolean;
  installed: boolean;
  downloading: boolean;
  /** 0..1 download progress while `downloading`. */
  progress: number;
  selected: boolean;
}

/** Per-origin web-capability grants. Keyed by origin in `Preferences.sitePermissions`. */
export interface SitePermissions {
  notifications?: SitePermissionState | undefined;
  clipboardRead?: SitePermissionState | undefined;
  clipboardWrite?: SitePermissionState | undefined;
}

/** Result of the native directory picker (Settings → File operations → Add folder). */
export interface FileAccessFolderPickResult {
  /** Absolute path(s) the user chose (canonical). Empty when cancelled. */
  paths: string[];
  cancelled: boolean;
}

/** Result of the new-tab background image picker (native dialog → content-addressed blob store). */
export interface NewTabBackgroundImagePick {
  /** `cas://<hash>` reference to the stored image, or '' when cancelled. */
  ref: string;
  /** `data:` URL of the image for immediate display, or '' when cancelled. */
  dataUrl: string;
  cancelled: boolean;
}
