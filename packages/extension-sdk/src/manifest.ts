import { z } from 'zod';

/**
 * Extension SDK — the developer API for Tepegöz internal extensions. An extension is declared by a
 * manifest that conforms to this schema (validated at the trust boundary), plus runtime modules (a
 * renderer surface, and later main-process tools). This mirrors a web-extension manifest: a small,
 * declarative, versioned contract that the host validates before loading anything.
 */

/**
 * How an extension can surface. A Chrome-style toolbar icon binds click/double-click to one of these:
 * - `popup`   — a small card anchored under the toolbar icon.
 * - `modal`   — a centered dialog (the shared kui-react Modal).
 * - `panel`   — a full content-area overlay (hides the page while open).
 * - `sidebar` — a resizable dock beside the page; the page stays visible and shrinks to fit.
 * - `page`    — an internal tab at `tepegoz://<id>`, addressable like Chrome's `chrome://`.
 */
export const ExtensionSurfaceKindSchema = z.enum(['popup', 'modal', 'panel', 'sidebar', 'page']);
export type ExtensionSurfaceKind = z.infer<typeof ExtensionSurfaceKindSchema>;

/**
 * Extension id format: reverse-DNS, e.g. `com.tepegoz.agent` — at least two dot-separated segments,
 * lowercase alphanumerics with hyphens inside segments. Exported so the host's preferences validator
 * shares the exact same rule (single source).
 */
export const EXTENSION_ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;

/** The closed set of capabilities an extension may request — a manifest naming anything else is
 *  rejected at the trust boundary (no free-form permission strings). Extend the enum as new host
 *  capabilities ship; enforcement lands with the Policy Kernel integration (Phase 3). */
export const ExtensionPermissionSchema = z.enum([
  'tabs',
  'read-page',
  'write-page',
  'navigate',
  'network',
]);
export type ExtensionPermission = z.infer<typeof ExtensionPermissionSchema>;

/** Per-locale display overrides. Keyed by a locale string (e.g. 'tr') to avoid coupling the SDK to
 *  @tepegoz/i18n's Locale union; the host falls back to the top-level `name`/`description`. */
const LocaleLabelSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(300).optional(),
});

/**
 * An MCP server an extension provides, so its "skills" (tools) become usable by the internal agent
 * (routed through the host's ToolGateway PEP — ADR-0018). Validated at the manifest trust boundary.
 * Phase 1a wires only `stdio`; `http_sse` is reserved.
 */
export const McpServerDeclSchema = z
  .object({
    transport: z.enum(['stdio', 'http_sse']),
    command: z.string().min(1).max(1024).optional(),
    args: z.array(z.string().max(1024)).max(64).default([]),
    env: z.record(z.string().max(4096)).default({}),
    url: z.string().url().max(2048).optional(),
  })
  .superRefine((decl, ctx) => {
    if (decl.transport === 'stdio' && (decl.command === undefined || decl.command.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['command'],
        message: 'stdio requires "command"',
      });
    }
    if (decl.transport === 'http_sse' && decl.url === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: 'http_sse requires "url"',
      });
    }
  });
export type McpServerDecl = z.infer<typeof McpServerDeclSchema>;

export const ExtensionManifestSchema = z
  .object({
    /** Stable machine id, reverse-DNS (e.g. "com.tepegoz.agent"). */
    id: z.string().regex(EXTENSION_ID_RE, 'id must be reverse-DNS (e.g. com.vendor.name)'),
    /** Human-readable name shown in the manager/toolbar (default/source locale). */
    name: z.string().min(1).max(60),
    /** Semantic version x.y.z. */
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver x.y.z'),
    description: z.string().max(300).default(''),
    /** Toolbar-icon identifier (a stable slug the host maps to a rendered icon). Data-driven so the
     *  registry carries icon identity instead of the renderer hardcoding a node per extension; the
     *  host falls back to a generic icon for an unknown id. */
    icon: z.string().min(1).max(64).default('puzzle-piece'),
    /** The surfaces this extension implements (at least one). */
    surfaces: z.array(ExtensionSurfaceKindSchema).min(1),
    /** Chrome-style toolbar-icon bindings. `click` defaults to the first declared surface. */
    actions: z
      .object({
        click: ExtensionSurfaceKindSchema.optional(),
        doubleClick: ExtensionSurfaceKindSchema.optional(),
      })
      .default({}),
    /** Per-locale name/description overrides; host falls back to the top-level fields. */
    labels: z.record(LocaleLabelSchema).default({}),
    /** Capabilities the extension requests (enforced by the Policy Kernel / host later). */
    permissions: z.array(ExtensionPermissionSchema).default([]),
    /** Optional MCP server this extension provides; its tools reach the agent via the ToolGateway PEP. */
    mcpServer: McpServerDeclSchema.optional(),
  })
  .transform((m) => ({
    ...m,
    // Default the click action to the primary surface so every extension has a working icon click.
    actions: { click: m.actions.click ?? m.surfaces[0], doubleClick: m.actions.doubleClick },
  }))
  .superRefine((m, ctx) => {
    // A bound action must reference a surface the extension actually implements.
    for (const [key, action] of [
      ['click', m.actions.click],
      ['doubleClick', m.actions.doubleClick],
    ] as const) {
      if (action !== undefined && !m.surfaces.includes(action)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['actions', key],
          message: `actions.${key} "${action}" is not one of the declared surfaces`,
        });
      }
    }
  });
export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;

/** Declare an extension manifest with validation (throws on an invalid manifest — dev-time contract). */
export function defineExtension(manifest: unknown): ExtensionManifest {
  return ExtensionManifestSchema.parse(manifest);
}

/** Validate an (untrusted) manifest — e.g. one loaded from disk/a third party — without throwing. */
export function validateManifest(
  manifest: unknown,
): { success: true; data: ExtensionManifest } | { success: false; error: z.ZodError } {
  return ExtensionManifestSchema.safeParse(manifest);
}
