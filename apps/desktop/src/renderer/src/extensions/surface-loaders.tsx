import type { ComponentType } from 'react';
import type { ExtensionSurfaceKind } from '@tepegoz/extension-sdk';
import { defaultTaskPolicy } from '@tepegoz/tasks';
import { INTERNAL_TASKS_URL } from '@tepegoz/desktop-ipc';
import type { ExtensionSurfaceProps } from './registry';

function taskDraftTitle(prompt: string, fallback: string | undefined): string {
  const title = (fallback ?? prompt.split(/\r?\n/, 1)[0] ?? '').trim().slice(0, 80);
  return title.length > 0 ? title : 'Saved agent task';
}

/**
 * The ONE renderer file with static module specifiers: it maps `extensionId → { surfaceKind → thunk }`,
 * where each thunk dynamically `import()`s the extension's surface component so Rollup code-splits it
 * into a lazy chunk loaded only when the surface opens. Each thunk also binds the host API
 * (`window.tepegoz`) so callers render `<Surface onClose=… />` while the extension keeps its
 * `{ api, onClose }` contract — the package never reaches the global bridge itself.
 *
 * This is the honest, unavoidable seam for BUNDLED first-party code (the bundler needs static
 * specifiers to split chunks; the surface→export names differ per package, ruling out glob discovery).
 * All extension METADATA is data-driven off the catalog; only these code-loading thunks live in source.
 * Adding a first-party built-in adds one entry here (plus its manifest in the catalog generator).
 */
export type SurfaceLoader = () => Promise<ComponentType<ExtensionSurfaceProps>>;

export const SURFACE_LOADERS: Record<
  string,
  Partial<Record<ExtensionSurfaceKind, SurfaceLoader>>
> = {
  'com.tepegoz.agent': {
    sidebar: () =>
      import('@tepegoz/ext-agent/panel').then(
        (m) =>
          function AgentSidebar({ onClose }: ExtensionSurfaceProps) {
            return (
              <m.AgentPanel
                api={{
                  ...window.tepegoz,
                  saveCurrentPromptAsTask: async ({ prompt, name }) => {
                    const state = await window.tepegoz.getTabsState();
                    const current = state.tabs.find((tab) => tab.id === state.activeId);
                    const targetUrl = current?.url.startsWith('http') === true ? current.url : undefined;
                    await window.tepegoz.saveTask({
                      name: taskDraftTitle(prompt, name),
                      prompt,
                      status: 'disabled',
                      triggers: [{ type: 'manual' }],
                      policy: defaultTaskPolicy(),
                      ...(targetUrl !== undefined ? { targetUrl } : {}),
                    });
                    window.tepegoz.navigateTab(INTERNAL_TASKS_URL);
                  },
                }}
                onClose={onClose}
              />
            );
          },
      ),
    page: () =>
      import('@tepegoz/ext-agent/history-page').then(
        (m) =>
          function AgentHistoryPageSurface({ onClose }: ExtensionSurfaceProps) {
            return <m.AgentHistoryPage api={window.tepegoz} onClose={onClose} />;
          },
      ),
  },
  'com.tepegoz.user-agent': {
    popup: () =>
      import('@tepegoz/ext-user-agent/panel').then(
        (m) =>
          function UserAgentPopupSurface({ onClose }: ExtensionSurfaceProps) {
            return <m.UserAgentPopup api={window.tepegoz} onClose={onClose} />;
          },
      ),
    page: () =>
      import('@tepegoz/ext-user-agent/panel').then(
        (m) =>
          function UserAgentPageSurface({ onClose }: ExtensionSurfaceProps) {
            return <m.UserAgentPage api={window.tepegoz} onClose={onClose} />;
          },
      ),
  },
  'com.tepegoz.popup-blocker': {
    popup: () =>
      import('@tepegoz/ext-popup-blocker/panel').then(
        (m) =>
          function PopupBlockerPopupSurface({ onClose }: ExtensionSurfaceProps) {
            return <m.PopupBlockerPopup api={window.tepegoz} onClose={onClose} />;
          },
      ),
    page: () =>
      import('@tepegoz/ext-popup-blocker/panel').then(
        (m) =>
          function PopupBlockerPageSurface({ onClose }: ExtensionSurfaceProps) {
            return <m.PopupBlockerPage api={window.tepegoz} onClose={onClose} />;
          },
      ),
  },
  'com.tepegoz.macros': {
    sidebar: () =>
      import('@tepegoz/ext-macros/panel').then(
        (m) =>
          function MacrosSidebar({ onClose }: ExtensionSurfaceProps) {
            return <m.MacrosPanel api={window.tepegoz} onClose={onClose} />;
          },
      ),
    page: () =>
      import('@tepegoz/ext-macros/panel').then(
        (m) =>
          function MacrosPageSurface({ onClose }: ExtensionSurfaceProps) {
            return <m.MacrosPage api={window.tepegoz} onClose={onClose} />;
          },
      ),
  },
};
