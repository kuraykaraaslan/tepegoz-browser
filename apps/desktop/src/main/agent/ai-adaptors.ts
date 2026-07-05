import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { EXTENSION_HOST_ID } from '@tepegoz/extension-host';
import { isLocalCapable, type ToolDescriptor } from '@tepegoz/shared-types';
import type { AIAdaptor, AIAdaptorAction, AIAdaptorKind } from '@tepegoz/desktop-ipc';
import { extensionLabel, manifestById } from '../../shared/extensions';
import McpService from '../mcp/supervisor.electron';

/**
 * Build the **AIAdaptor** inventory for Settings → Cost & performance: fold the single CapabilityRegistry
 * into typed, titled groups. System tool groups (browser / file operations / journal / the extension host),
 * each extension, and each MCP server all become adaptors, so the list needs no maintenance as tools land.
 *
 * Grouping is driven by the tool's `source` + `provenance` + `category` (no per-tool bespoke logic):
 *  - `extension` tools group by `provenance` (extensionId) → one adaptor per extension, titled by its
 *    localized manifest name. The always-on management host (`com.tepegoz.host`) is treated as a `system`
 *    "Extensions" group, not a user extension.
 *  - `mcp` tools group by `provenance` (server id), titled by the server's label.
 *  - `builtin`/other tools group by `category` (else the id's `{domain}` prefix) as a `system` adaptor.
 */

/** English fallback titles for system adaptors; the renderer localizes these by adaptor id. */
const SYSTEM_TITLES: Record<string, string> = {
  browser: 'Browser',
  file: 'File operations',
  journal: 'Journal & audit',
  extensions: 'Extensions',
};

const KIND_ORDER: Record<AIAdaptorKind, number> = { system: 0, extension: 1, mcp: 2 };

interface AdaptorMeta {
  id: string;
  kind: AIAdaptorKind;
  provenance?: string;
}

/** The adaptor a descriptor belongs to (id + kind), from its source/provenance/category. */
function adaptorMetaOf(d: ToolDescriptor): AdaptorMeta {
  if (d.source === 'extension') {
    const provenance = d.provenance ?? 'extensions';
    // The built-in management host is core, not a user extension → a `system` "Extensions" group.
    if (provenance === EXTENSION_HOST_ID) return { id: 'extensions', kind: 'system' };
    return { id: provenance, kind: 'extension', provenance };
  }
  if (d.source === 'mcp') {
    const provenance = d.provenance ?? 'mcp';
    return { id: provenance, kind: 'mcp', provenance };
  }
  return { id: d.category ?? d.id.split('_')[0] ?? 'other', kind: 'system' };
}

/** The localized/resolved title for an adaptor group. */
function titleOf(meta: AdaptorMeta, locale: string, mcpLabels: Map<string, string>): string {
  if (meta.kind === 'system') return SYSTEM_TITLES[meta.id] ?? meta.id;
  if (meta.kind === 'extension') {
    const manifest = manifestById(meta.id);
    return manifest !== undefined ? extensionLabel(manifest, locale).name : meta.id;
  }
  return mcpLabels.get(meta.id) ?? meta.id;
}

function actionOf(d: ToolDescriptor, adaptorId: string): AIAdaptorAction {
  const action: AIAdaptorAction = {
    id: d.id,
    description: d.description,
    dangerClass: d.dangerClass,
    source: d.source,
    aiTask: d.aiTask ?? 'none',
    localCapable: isLocalCapable(d),
    adaptorId,
  };
  if (d.provenance !== undefined) action.provenance = d.provenance;
  return action;
}

export function buildAiAdaptors(locale: string): AIAdaptor[] {
  const mcpLabels = new Map<string, string>(McpService.getStatus().map((s) => [s.id, s.label]));
  const byId = new Map<string, AIAdaptor>();

  for (const d of CapabilityRegistry.list()) {
    const meta = adaptorMetaOf(d);
    let adaptor = byId.get(meta.id);
    if (adaptor === undefined) {
      adaptor = { id: meta.id, title: titleOf(meta, locale, mcpLabels), kind: meta.kind, actions: [] };
      if (meta.provenance !== undefined) adaptor.provenance = meta.provenance;
      byId.set(meta.id, adaptor);
    }
    adaptor.actions.push(actionOf(d, meta.id));
  }

  return [...byId.values()].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title),
  );
}
