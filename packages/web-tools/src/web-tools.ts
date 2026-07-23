import { CapabilityRegistry } from '@tepegoz/capability-plane';
import { toolSuccess, type ToolDescriptor } from '@tepegoz/shared-types';
import type { WebToolsHost } from './index';
import { WebFetchInputSchema, WebSearchInputSchema } from './schemas';
import { buildWebFetchContent, buildWebSearchContent, withGuardFlags } from './web-perception';

export type { WebToolsHost } from './index';

function descriptor(id: string, description: string): ToolDescriptor {
  return {
    id,
    description,
    dangerClass: 'read',
    source: 'builtin',
    inputSchema: { type: 'object' },
    requiresIdempotencyKey: false,
    aiTask: 'extract',
    localCapable: false,
    category: 'web',
  };
}

export function registerWebTools(deps: { host: WebToolsHost }): void {
  const { host } = deps;

  CapabilityRegistry.register({
    descriptor: descriptor(
      'web_search_items',
      'Search the public web when the destination is genuinely off THE CURRENT site or its URL is ' +
        'unknown. Returns normalized link results with snippets. This is NOT a shortcut around on-page ' +
        'work: if the answer is reachable on the current page (via a link, menu, modal, or form), do that ' +
        'instead — search only after the on-page route is exhausted.',
    ),
    inputSchema: WebSearchInputSchema,
    handler: async (input) => {
      const results = await host.search(input);
      // Search titles/snippets are page-authored text any site can rank into the agent's context, so
      // they are fenced exactly like browser perception. Verbatim URLs stay in artifacts/pageRefs.
      const guarded = buildWebSearchContent(input.query, results);
      return toolSuccess(
        withGuardFlags(`Found ${String(results.length)} web result(s) for "${input.query}".`, guarded.flags),
        {
          content: guarded.content,
          artifacts: results.map((result, index) => ({
            id: `web-result-${String(index + 1)}`,
            kind: 'link',
            title: result.title,
            url: result.url,
            ...(result.snippet !== undefined ? { summary: result.snippet } : {}),
          })),
          pageRefs: results.map((result) => ({ url: result.url, title: result.title })),
        },
      );
    },
  });

  CapabilityRegistry.register({
    descriptor: descriptor(
      'web_get_page',
      'Fetch and extract text from one public http(s) URL. Returns bounded, untrusted text.',
    ),
    inputSchema: WebFetchInputSchema,
    handler: async (input) => {
      const result = await host.fetch(input);
      // Bytes from an arbitrary URL the agent chose — the least trusted input in the product. Fenced
      // and sanitized before the model sees it, and emitted as a STRING so the runtime taints it.
      const guarded = buildWebFetchContent(result);
      const status = `Fetched ${result.finalUrl} (HTTP ${String(result.status)})${result.truncated ? ', truncated' : ''}.`;
      return toolSuccess(withGuardFlags(status, guarded.flags), {
        content: guarded.content,
        pageRefs: [{ url: result.finalUrl, ...(result.title !== undefined ? { title: result.title } : {}) }],
      });
    },
  });
}
