import type { ReactNode } from 'react';
import type { Resources } from '@tepegoz/i18n';
import type { ExtensionManifest } from '@tepegoz/extension-sdk';
import { agentManifest, AgentPanel } from '@tepegoz/ext-agent';
import type { ExtensionId } from '../../../shared/ipc-contract';

/**
 * Renderer registry of internal extensions. Each entry pairs a schema-validated {@link ExtensionManifest}
 * (from the extension's own package) with a toolbar icon and its panel. The panel receives the host
 * API (`window.tepegoz`, which structurally satisfies the extension's own host-API contract) — the
 * extension package never reaches the global bridge itself. Add a built-in extension here + its id in
 * ipc-contract `EXTENSION_IDS`. (Real MV3/third-party extensions are a later phase.)
 */
export interface ExtensionPanelProps {
  t: Resources;
  onClose: () => void;
}

export interface ExtensionDef {
  id: ExtensionId;
  manifest: ExtensionManifest;
  icon: ReactNode;
  panel: (props: ExtensionPanelProps) => ReactNode;
}

function AgentIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2 l1.4 3.2 L12.6 6.6 9.4 8 8 11.2 6.6 8 3.4 6.6 6.6 5.2 Z" fill="currentColor" />
    </svg>
  );
}

export const EXTENSIONS: readonly ExtensionDef[] = [
  {
    id: 'agent',
    manifest: agentManifest,
    icon: <AgentIcon />,
    panel: ({ t, onClose }) => <AgentPanel t={t} api={window.tepegoz} onClose={onClose} />,
  },
];
