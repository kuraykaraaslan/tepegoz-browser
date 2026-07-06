/**
 * AIAdaptor wire types — the Settings "Cost & performance" / "run locally" surface (split out of
 * `contract.ts` per ADR-0010's 250-line file cap). Dependency-free (type-only imports erase for the
 * sandboxed preload); re-exported from `contract.ts` for the single public surface.
 */
import type { AiTask, RiskLevel, ToolSource } from '@tepegoz/shared-types';

/**
 * The kind of an {@link AIAdaptor} (the group badge in Settings). `system` = a built-in tool group
 * (browser / file operations / journal / the extension-management host); `extension` = a user-installed
 * extension's own group; `mcp` = an external MCP server. Derived from the tool source in the main process.
 */
export const AI_ADAPTOR_KINDS = ['system', 'extension', 'mcp'] as const;
export type AIAdaptorKind = (typeof AI_ADAPTOR_KINDS)[number];

/**
 * One agent action (a single registered tool), projected from the CapabilityRegistry for the Settings
 * "run locally" list. `aiTask`/`localCapable` are resolved (defaults applied); `provenance` is the
 * contributing extension/server id; `adaptorId` is the {@link AIAdaptor} it belongs to.
 */
export interface AIAdaptorAction {
  id: string;
  description: string;
  dangerClass: RiskLevel;
  source: ToolSource;
  provenance?: string;
  /** Resolved AI-task class ('none' when mechanical). */
  aiTask: AiTask;
  /** Resolved: whether this action's AI work may run on the local model. */
  localCapable: boolean;
  /** The id of the owning {@link AIAdaptor} (its group key). */
  adaptorId: string;
}

/**
 * An **AIAdaptor** — a named, typed group of agent actions surfaced in Settings → Cost & performance.
 * System tool groups (file operations, browser, journal), each extension, and each MCP server are all
 * modeled uniformly as adaptors. Built in the main process from the single CapabilityRegistry, so the
 * list needs no maintenance as tools are added. For `system` adaptors the renderer may localize `title`
 * by `id`; for `extension`/`mcp` the `title` is already resolved (manifest name / server label).
 */
export interface AIAdaptor {
  /** Group key: a system id ('browser'|'file'|'journal'|'extensions'), an extension id, or a server id. */
  id: string;
  title: string;
  kind: AIAdaptorKind;
  description?: string;
  /** Extension/server id for `extension`/`mcp` adaptors; absent for `system`. */
  provenance?: string;
  actions: AIAdaptorAction[];
}
