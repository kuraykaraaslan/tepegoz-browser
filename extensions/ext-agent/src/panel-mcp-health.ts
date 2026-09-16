import { useEffect, useState } from 'react';
import type { AgentStrings } from './i18n';
import type { AgentHostApi, AgentMcpServerHealth } from './types';
import type { Notice } from './panel-state';

/**
 * MCP server connection health as the panel's own notices (S8 PR7 residue). "Installed, panel open,
 * nothing happens" is the single largest rival-evidence complaint cluster (Atlas/Claude-for-Chrome
 * studies) — an MCP server the agent depends on can silently disconnect, and today that is visible
 * ONLY in a separate Settings page nobody re-checks after enabling it.
 *
 * Polled every 3s while the panel is mounted — the same cadence `settings-mcp-servers.tsx` already
 * uses for the identical data, so this adds no new refresh rate to reason about. Returns one Notice
 * per server currently in `error` state; `idle`/`connecting`/`ready` produce nothing, and no
 * configured servers at all is the common case and produces nothing, never a false alarm.
 *
 * Notice ids include the error text, not just the server id: dismissing "connection refused" must not
 * permanently silence a LATER, different failure on the same server — only a recurrence of the exact
 * same problem stays dismissed, matching how a person actually re-reads a repeated warning.
 */
export function useMcpHealthNotices(
  api: Pick<AgentHostApi, 'getMcpStatus'>,
  strings: Pick<AgentStrings, 'mcpHealth'>,
): Notice[] {
  const [servers, setServers] = useState<AgentMcpServerHealth[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = (): void => {
      void api.getMcpStatus().then((rows) => {
        if (!cancelled) setServers(rows);
      });
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // `api` is a stable prop for the panel's lifetime (injected once from `window.tepegoz`).
  }, []);

  return servers
    .filter((s) => s.state === 'error')
    .map((s) => ({
      id: `mcp-health-${s.id}-${s.error ?? ''}`,
      severity: 'warning' as const,
      title: strings.mcpHealth.title.replace('{label}', s.label),
      body: s.error !== undefined && s.error.length > 0 ? s.error : strings.mcpHealth.body,
    }));
}
