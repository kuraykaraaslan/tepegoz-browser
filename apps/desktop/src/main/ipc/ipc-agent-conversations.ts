import { dialog } from 'electron';
import { AppError } from '@tepegoz/libs';
import {
  IpcChannels,
  type AgentConversationDetail,
  type AgentConversationSummary,
} from '@tepegoz/desktop-ipc';
import {
  AgentConversationIdSchema,
  AgentConversationListInputSchema,
  AgentConversationOpenInputSchema,
  AgentNewConversationSchema,
} from '@tepegoz/desktop-ipc/schemas';
import { AgentConversationStore } from '@tepegoz/persistence';
import AgentService from '../agent/agent-service.electron';
import { getDb } from '../db/database.electron';
import TabManager from '../tabs';
import { handle, handleAsync, onAction } from './ipc-helpers';
import { agentEnabled, broadcastConversationsState, requireAgentEnabled } from './ipc-agent-shared';

/** Register agent conversation-history + active-tab/attachment helper handlers. */
export function registerAgentConversationIpc(): void {
  onAction(IpcChannels.agentNewConversation, AgentNewConversationSchema, (groupId) => {
    if (!agentEnabled()) return;
    AgentService.newConversation(groupId);
  });

  handle(IpcChannels.agentConversationsList, (_event, payload): AgentConversationSummary[] => {
    requireAgentEnabled();
    const db = getDb();
    if (db === null) return [];
    const input = AgentConversationListInputSchema.parse(payload ?? {});
    return AgentConversationStore.list(db, {
      ...(input.query !== undefined ? { query: input.query } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.offset !== undefined ? { offset: input.offset } : {}),
    });
  });
  handle(IpcChannels.agentConversationsGet, (_event, payload): AgentConversationDetail | null => {
    requireAgentEnabled();
    const db = getDb();
    if (db === null) return null;
    return AgentConversationStore.get(db, AgentConversationIdSchema.parse(payload));
  });
  handle(
    IpcChannels.agentConversationsCurrent,
    (_event, payload): AgentConversationDetail | null => {
      requireAgentEnabled();
      const db = getDb();
      if (db === null) return null;
      return AgentService.currentConversation(db, AgentNewConversationSchema.parse(payload));
    },
  );
  handle(IpcChannels.agentConversationsOpen, (_event, payload): AgentConversationDetail | null => {
    requireAgentEnabled();
    const db = getDb();
    if (db === null) return null;
    const input = AgentConversationOpenInputSchema.parse(payload);
    return AgentService.openConversation(db, input.id, input.groupId);
  });
  handle(IpcChannels.agentConversationsDelete, (_event, payload): void => {
    requireAgentEnabled();
    const db = getDb();
    if (db === null) return;
    AgentConversationStore.delete(db, AgentConversationIdSchema.parse(payload));
    broadcastConversationsState();
  });
  handle(IpcChannels.agentConversationsClear, (): void => {
    requireAgentEnabled();
    const db = getDb();
    if (db === null) return;
    AgentConversationStore.clear(db);
    broadcastConversationsState();
  });

  // Ensure the active tab belongs to a tab group; creates one if needed → { groupId }.
  handleAsync(IpcChannels.agentEnsureGroup, async (): Promise<{ groupId: string }> => {
    requireAgentEnabled();
    const state = TabManager.getState();
    if (state.activeId === null) throw new AppError('No active tab', 409);
    const AgentTabGroup = (await import('../agent/agent-tab-group.electron')).default;
    const groupId = AgentTabGroup.ensureGroupForTab(state.activeId);
    return { groupId };
  });

  // Capture the active page's text selection via executeJavaScript.
  handleAsync(IpcChannels.agentCaptureSelection, async (): Promise<string> => {
    requireAgentEnabled();
    const wc = TabManager.activeWebContents();
    if (wc === null || wc.isDestroyed()) return '';
    const result: unknown = await wc.executeJavaScript(
      'window.getSelection() ? window.getSelection().toString() : ""',
      true,
    );
    return typeof result === 'string' ? result : '';
  });

  // The active tab's committed URL — used to seed a converted task's target page.
  handle(IpcChannels.agentActiveTabUrl, (): string | null => {
    const state = TabManager.getState();
    const active = state.tabs.find((tab) => tab.id === state.activeId);
    return active !== undefined && active.url.length > 0 ? active.url : null;
  });

  // Open a native file picker and read the selected files for agent attachment.
  handleAsync(IpcChannels.agentPickFiles, async () => {
    requireAgentEnabled();
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
    });
    if (canceled || filePaths.length === 0) return [];
    const fs = await import('node:fs/promises');
    const mime = (name: string): string => {
      const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
      const map: Record<string, string> = {
        pdf: 'application/pdf',
        txt: 'text/plain',
        md: 'text/markdown',
        json: 'application/json',
        csv: 'text/csv',
        html: 'text/html',
        js: 'text/javascript',
        ts: 'text/typescript',
        py: 'text/x-python',
      };
      return map[ext] ?? 'application/octet-stream';
    };
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB per file
    const results = await Promise.all(
      filePaths.slice(0, 5).map(async (fp) => {
        const stat = await fs.stat(fp);
        if (stat.size > MAX_SIZE) return null;
        const buf = await fs.readFile(fp);
        const name = fp.slice(Math.max(fp.lastIndexOf('/'), fp.lastIndexOf('\\')) + 1);
        const mimeType = mime(name);
        const isText = mimeType.startsWith('text/') || mimeType === 'application/json';
        return {
          name,
          content: isText ? buf.toString('utf8') : buf.toString('base64'),
          mimeType,
          sizeBytes: stat.size,
        };
      }),
    );
    return results.filter(Boolean);
  });
}
