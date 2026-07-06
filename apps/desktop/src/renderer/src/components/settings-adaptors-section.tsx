import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Badge, Card } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { AdaptorConnection } from '@tepegoz/desktop-ipc';

const STATE_VARIANT: Record<AdaptorConnection['state'], 'success' | 'warning' | 'error' | 'neutral'> = {
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

function visibleScopes(scopes: string[]): string {
  if (scopes.length === 0) return '';
  const head = scopes.slice(0, 4).join(', ');
  return scopes.length > 4 ? `${head}, +${String(scopes.length - 4)}` : head;
}

export function AdaptorsSection() {
  const s = useT(settingsDict);
  const [adaptors, setAdaptors] = useState<AdaptorConnection[]>([]);

  useEffect(() => {
    void window.tepegoz.listAdaptors().then(setAdaptors, () => {
      setAdaptors([]);
    });
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
                    const scopes = visibleScopes(permission.scopes);
                    return (
                      <p
                        key={`${adaptor.id}-${permission.capability}`}
                        className="font-mono text-xs text-text-secondary"
                      >
                        {permission.capability}
                        {scopes.length > 0 ? `: ${scopes}` : ''}
                      </p>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
