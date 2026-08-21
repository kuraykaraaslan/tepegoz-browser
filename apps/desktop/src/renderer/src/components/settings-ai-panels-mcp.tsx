import { useEffect, useState } from 'react';
import { Badge } from '@tepegoz/ui';
import type { McpServerState, McpServerStatusInfo } from '@tepegoz/desktop-ipc';

/**
 * AI & Agent settings panels: MCP connections. Split out of `settings-ai-panels.tsx`
 * (ADR-0010 250-line cap).
 */

/** Read-only list of configured MCP servers + their live connection state (polled while open). */
export function McpConnectionsSection({
  getMcpStatus,
  labels,
}: {
  getMcpStatus: () => Promise<McpServerStatusInfo[]>;
  labels: {
    empty: string;
    tools: string;
    stateLabel: Record<McpServerState, string>;
  };
}) {
  const [servers, setServers] = useState<McpServerStatusInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void getMcpStatus().then(
        (s) => {
          if (alive) setServers(s);
        },
        () => {
          /* status unavailable — leave the list as-is */
        },
      );
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [getMcpStatus]);

  if (servers.length === 0) {
    return <p className="text-sm text-text-secondary">{labels.empty}</p>;
  }
  return (
    <div className="space-y-3">
      {servers.map((srv) => (
        <div key={srv.id} className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-sm font-medium text-text-primary">{srv.label}</span>
            <span className="ml-2 text-xs text-text-secondary">
              {srv.transport}
              {srv.state === 'ready' ? ` · ${String(srv.toolCount)} ${labels.tools}` : ''}
            </span>
          </div>
          <Badge
            variant={
              srv.state === 'ready' ? 'success' : srv.state === 'error' ? 'error' : 'neutral'
            }
            dot
          >
            {labels.stateLabel[srv.state]}
          </Badge>
        </div>
      ))}
    </div>
  );
}
