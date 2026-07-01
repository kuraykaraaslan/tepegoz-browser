import type { ReactNode } from 'react';
import type { Resources } from '@tepegoz/i18n';
import type { ExtensionId } from '../../../shared/ipc-contract';
import { AgentConsole } from '../components/AgentConsole';

/**
 * Renderer registry of internal extension panels. Each entry maps an {@link ExtensionId} to a toolbar
 * icon + a chrome-rendered panel that opens over the content area. This is the single place a built-in
 * extension is wired on the UI side — add one here, plus its id in ipc-contract `EXTENSION_IDS` and
 * its title in i18n `extensions.names`. (Real MV3/third-party extensions are a later phase.)
 */
export interface ExtensionPanelProps {
  t: Resources;
  onClose: () => void;
}

export interface ExtensionDef {
  id: ExtensionId;
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

export const EXTENSIONS: readonly ExtensionDef[] = [{ id: 'agent', icon: <AgentIcon />, panel: AgentConsole }];
