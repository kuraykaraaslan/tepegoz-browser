import type { ReactNode } from 'react';
import type { Resources } from '@tepegoz/i18n';
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
  t: Resources;
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
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2 l1.4 3.2 L12.6 6.6 9.4 8 8 11.2 6.6 8 3.4 6.6 6.6 5.2 Z" fill="currentColor" />
    </svg>
  );
}

function UserAgentIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2 8 h12 M8 2 c2.4 1.8 2.4 10.2 0 12 M8 2 c-2.4 1.8 -2.4 10.2 0 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export const EXTENSIONS: readonly ExtensionDef[] = [
  {
    id: agentManifest.id,
    manifest: agentManifest,
    icon: <AgentIcon />,
    surfaces: {
      // The same console serves as a full-screen panel (click) and a docked sidebar (double-click);
      // it fills whichever container the chrome gives it.
      panel: ({ t, onClose }) => <AgentPanel t={t} api={window.tepegoz} onClose={onClose} />,
      sidebar: ({ t, onClose }) => <AgentPanel t={t} api={window.tepegoz} onClose={onClose} />,
    },
  },
  {
    id: userAgentManifest.id,
    manifest: userAgentManifest,
    icon: <UserAgentIcon />,
    surfaces: {
      popup: ({ t, onClose }) => <UserAgentPopup t={t} api={window.tepegoz} onClose={onClose} />,
      page: ({ t, onClose }) => <UserAgentPage t={t} api={window.tepegoz} onClose={onClose} />,
    },
  },
];

/** The registry entry for `id`, or undefined. */
export function extensionDefById(id: string): ExtensionDef | undefined {
  return EXTENSIONS.find((ext) => ext.id === id);
}
