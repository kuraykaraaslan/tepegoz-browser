import { z } from 'zod';

/**
 * Extension SDK — the developer API for Tepegöz internal extensions. An extension is declared by a
 * manifest that conforms to this schema (validated at the trust boundary), plus runtime modules (a
 * renderer panel, and later main-process tools). This mirrors a web-extension manifest: a small,
 * declarative, versioned contract that the host validates before loading anything.
 */
export const ExtensionKindSchema = z.enum(['panel']);
export type ExtensionKind = z.infer<typeof ExtensionKindSchema>;

export const ExtensionManifestSchema = z.object({
  /** Stable machine id, lowercase kebab-case (e.g. "agent"). */
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'id must be lowercase kebab-case'),
  /** Human-readable name shown in the manager/toolbar. */
  name: z.string().min(1).max(60),
  /** Semantic version x.y.z. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver x.y.z'),
  description: z.string().max(300).default(''),
  /** How the extension surfaces. Phase 1a: a chrome-rendered panel. */
  kind: ExtensionKindSchema,
  /** Capabilities the extension requests (enforced by the Policy Kernel / host later). */
  permissions: z.array(z.string()).default([]),
});
export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;

/** Declare an extension manifest with validation (throws on an invalid manifest — dev-time contract). */
export function defineExtension(manifest: unknown): ExtensionManifest {
  return ExtensionManifestSchema.parse(manifest);
}

/** Validate an (untrusted) manifest — e.g. one loaded from disk/a third party — without throwing. */
export function validateManifest(
  manifest: unknown,
):
  | { success: true; data: ExtensionManifest }
  | { success: false; error: z.ZodError } {
  return ExtensionManifestSchema.safeParse(manifest);
}
