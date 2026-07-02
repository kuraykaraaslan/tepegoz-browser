import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot, faUserSecret } from '@fortawesome/free-solid-svg-icons';
import type { ExtensionManifest, ExtensionSurfaceKind } from '@tepegoz/extension-sdk';
import { agentManifest, AgentPanel } from '@tepegoz/ext-agent';
import { userAgentManifest, UserAgentPopup, UserAgentPage } from '@tepegoz/ext-user-agent';

/**
 * Renderer registry of internal extensions. Each entry pairs a schema-validated {@link ExtensionManifest}
 * (from the extension's own package — also the source of truth for id/surfaces/actions in the shared
 * `shared/extensions.ts`) with a toolbar icon and a map of SURFACE renderers. A surface receives the
 * host API (`window.tepegoz`, which structurally satisfies each extension's host-API contract) — the
 * extension package never reaches the global bridge itself. Add a built-in extension here + to
 * `BUILTIN_MANIFESTS`. (Real MV3/third-party extensions are a later phase.)
 */
export interface ExtensionSurfaceProps {
  onClose: () => void;
}

export interface ExtensionDef {
  id: string;
  manifest: ExtensionManifest;
  icon: ReactNode;
  /** Renderers for the surfaces this extension implements (must cover `manifest.surfaces`). */
  surfaces: Partial<Record<ExtensionSurfaceKind, (props: ExtensionSurfaceProps) => ReactNode>>;
}

function AgentIcon() {
  return <FontAwesomeIcon icon={faRobot} className="h-4 w-4" aria-hidden />;
}

function UserAgentIcon() {
  return <FontAwesomeIcon icon={faUserSecret} className="h-4 w-4" aria-hidden />;
}

export const EXTENSIONS: readonly ExtensionDef[] = [
  {
    id: agentManifest.id,
    manifest: agentManifest,
    icon: <AgentIcon />,
    surfaces: {
      // The AI console lives in the resizable sidebar so the page stays visible beside it.
      sidebar: ({ onClose }) => <AgentPanel api={window.tepegoz} onClose={onClose} />,
    },
  },
  {
    id: userAgentManifest.id,
    manifest: userAgentManifest,
    icon: <UserAgentIcon />,
    surfaces: {
      popup: ({ onClose }) => <UserAgentPopup api={window.tepegoz} onClose={onClose} />,
      page: ({ onClose }) => <UserAgentPage api={window.tepegoz} onClose={onClose} />,
    },
  },
];

/** The registry entry for `id`, or undefined. */
export function extensionDefById(id: string): ExtensionDef | undefined {
  return EXTENSIONS.find((ext) => ext.id === id);
}
