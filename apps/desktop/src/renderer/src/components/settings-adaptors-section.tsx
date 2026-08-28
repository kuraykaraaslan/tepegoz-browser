import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Button, Card } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { AdaptorConnection } from '@tepegoz/desktop-ipc';

const STATE_VARIANT: Record<
  AdaptorConnection['state'],
  'success' | 'warning' | 'error' | 'neutral'
> = {
  connected: 'success',
  not_configured: 'neutral',
  revoked: 'warning',
  error: 'error',
};

const KIND_VARIANT: Record<AdaptorConnection['kind'], 'info' | 'neutral'> = {
  mcp: 'info',
  rest: 'info',
  graphql: 'info',
  oauth_service: 'info',
  local: 'neutral',
};

/** How many scopes a collapsed row shows before it offers the rest. */
const SCOPE_PREVIEW = 4;

export function AdaptorsSection() {
  const s = useT(settingsDict);
  const [adaptors, setAdaptors] = useState<AdaptorConnection[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Re-read while the page is open. An adaptor's state changes when a token is revoked, an extension
  // is switched off or an MCP child process dies — none of which the single mount-time fetch could
  // ever notice, so the inventory could sit on screen describing a connection that no longer existed.
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void window.tepegoz.listAdaptors().then(
        (list) => {
          if (alive) setAdaptors(list);
        },
        () => {
          if (alive) setAdaptors([]);
        },
      );
    };
    load();
    const id = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <Card title={s.adaptorInventoryTitle} subtitle={s.adaptorInventorySubtitle}>
      {adaptors.length === 0 ? (
        <p className="text-sm text-text-secondary">{s.adaptorInventoryEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {adaptors.map((adaptor) => (
            <li key={adaptor.id} className="rounded-md border border-border px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{adaptor.label}</span>
                <Badge variant={KIND_VARIANT[adaptor.kind]} size="sm">
                  {s.adaptorKindLabels[adaptor.kind]}
                </Badge>
                <Badge variant={STATE_VARIANT[adaptor.state]} size="sm" dot>
                  {s.adaptorStateLabels[adaptor.state]}
                </Badge>
                {adaptor.auditRequired && (
                  <Badge variant="warning" size="sm">
                    {s.adaptorAuditRequired}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {adaptor.provider} · {s.adaptorAuthLabels[adaptor.authKind]} ·{' '}
                {String(adaptor.toolCount)} {s.adaptorToolsLabel}
              </p>
              {adaptor.permissions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {adaptor.permissions.map((permission) => {
                    const open = expanded.has(adaptor.id);
                    const shown = open
                      ? permission.scopes
                      : permission.scopes.slice(0, SCOPE_PREVIEW);
                    const hidden = permission.scopes.length - shown.length;
                    return (
                      <p
                        key={`${adaptor.id}-${permission.capability}`}
                        className="font-mono text-xs text-text-secondary"
                      >
                        {permission.capability}
                        {shown.length > 0 ? `: ${shown.join(', ')}` : ''}
                        {hidden > 0 ? `, +${String(hidden)}` : ''}
                      </p>
                    );
                  })}
                  {/* The truncated scopes used to end at "+3" with no way to read them. A list of what
                      something is permitted to do is exactly the list that must be fully readable. */}
                  {adaptor.permissions.some((p) => p.scopes.length > SCOPE_PREVIEW) && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(adaptor.id)) next.delete(adaptor.id);
                          else next.add(adaptor.id);
                          return next;
                        });
                      }}
                    >
                      {expanded.has(adaptor.id) ? s.adaptorScopesLess : s.adaptorScopesMore}
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
