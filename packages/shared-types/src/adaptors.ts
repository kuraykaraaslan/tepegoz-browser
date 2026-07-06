export const ADAPTOR_KINDS = ['mcp', 'rest', 'graphql', 'oauth_service', 'local'] as const;
export type AdaptorKind = (typeof ADAPTOR_KINDS)[number];

export const ADAPTOR_CAPABILITIES = [
  'mail',
  'drive',
  'docs',
  'calendar',
  'files',
  'browser',
  'web',
  'webhook',
] as const;
export type AdaptorCapability = (typeof ADAPTOR_CAPABILITIES)[number];

export const ADAPTOR_PERMISSION_STATES = ['not_configured', 'connected', 'revoked', 'error'] as const;
export type AdaptorPermissionState = (typeof ADAPTOR_PERMISSION_STATES)[number];

export interface AdaptorPermission {
  capability: AdaptorCapability;
  scopes: string[];
  state: AdaptorPermissionState;
  grantedAt?: number | undefined;
  lastAuditAt?: number | undefined;
  reason?: string | undefined;
}

export interface AdaptorConnection {
  id: string;
  label: string;
  kind: AdaptorKind;
  provider: string;
  accountLabel?: string | undefined;
  state: AdaptorPermissionState;
  authKind: 'oauth' | 'api_key' | 'local' | 'none';
  permissions: AdaptorPermission[];
  auditRequired: boolean;
  toolCount: number;
  lastAuditAt?: number | undefined;
}
