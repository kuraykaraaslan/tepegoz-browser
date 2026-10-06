import type { AgentRunDeps } from './agent-runtime-types';

/** Best-effort URL string from a tool call's args (for the sensitive-site lockout). */
export function urlFromArgs(args: unknown): string | undefined {
  if (args !== null && typeof args === 'object' && 'url' in args) {
    const url = (args as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return undefined;
}

/** Best-effort tab id string from a tool call's args, for tab-scoped policy context. */
export function tabIdFromArgs(args: unknown): string | undefined {
  if (args !== null && typeof args === 'object' && 'tabId' in args) {
    const tabId = (args as { tabId?: unknown }).tabId;
    if (typeof tabId === 'string' && tabId.length > 0) return tabId;
  }
  return undefined;
}

/** The sanitized page text a read tool returned, so it can be recorded as untrusted (taint). */
export function contentFromResult(result: unknown): string | undefined {
  if (result !== null && typeof result === 'object' && 'content' in result) {
    const content = (result as { content?: unknown }).content;
    if (typeof content === 'string' && content.length > 0) return content;
  }
  return undefined;
}

/** The url a read tool's result reports (perception snapshot), for handoff/URL-aware checks. */
export function urlFromResult(result: unknown): string | undefined {
  if (result !== null && typeof result === 'object' && 'url' in result) {
    const url = (result as { url?: unknown }).url;
    if (typeof url === 'string' && url.length > 0) return url;
  }
  return undefined;
}

/** `deps.listTabs()`, or `[]` when the host cannot enumerate tabs — one fallback instead of scattering
 *  `?? []` across every caller below. */
export function listTabs(
  deps: AgentRunDeps,
): { id: string; url: string; title: string; active: boolean }[] {
  return deps.listTabs?.() ?? [];
}
