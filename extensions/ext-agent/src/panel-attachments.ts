import type { AgentStrings } from './i18n';
import type { AgentHostApi } from './types';
import type { Attachment, GroupState } from './panel-state';

/**
 * Attachment-capture handlers for the Agent composer: add/remove chips and capture the page selection,
 * picked files, or a screenshot into the active group's state. Extracted from `panel.tsx` (ADR-0010
 * file-size split); reads/writes through the injected `mutateActive` helper.
 */
export interface AgentAttachmentDeps {
  api: AgentHostApi;
  a: AgentStrings;
  mutateActive: (fn: (s: GroupState) => GroupState) => void;
}

export function useAgentAttachments({ api, a, mutateActive }: AgentAttachmentDeps) {
  function removeAttachment(id: string): void {
    mutateActive((s) => {
      const nextExpanded = new Set(s.expandedFiles);
      nextExpanded.delete(id);
      return {
        ...s,
        attachments: s.attachments.filter((a) => a.id !== id),
        expandedFiles: nextExpanded,
      };
    });
  }

  function addAttachment(att: Attachment): void {
    mutateActive((s) => ({ ...s, attachments: [...s.attachments, att] }));
  }

  async function onAttachSelection(): Promise<void> {
    try {
      const text = await api.capturePageSelection();
      if (text.trim().length === 0) return;
      const lineCount = text.split('\n').length;
      addAttachment({
        id: `sel-${String(Date.now())}`,
        kind: 'selection',
        label: `${String(lineCount)} ${a.attach.lines}`,
        content: text,
      });
    } catch {
      /* ignore */
    }
  }

  async function onAttachFiles(): Promise<void> {
    try {
      const files = await api.pickAgentFiles();
      for (const f of files) {
        addAttachment({
          id: `file-${String(Date.now())}-${f.name}`,
          kind: 'file',
          label: f.name,
          content: f.content,
        } satisfies Attachment);
      }
    } catch {
      /* ignore */
    }
  }

  async function onAttachScreenshot(): Promise<void> {
    try {
      const dataUrl = await api.capturePageScreenshot();
      if (dataUrl === null) return;
      addAttachment({
        id: `shot-${String(Date.now())}`,
        kind: 'screenshot',
        label: a.attach.screenshot,
        content: dataUrl,
      });
    } catch {
      /* ignore */
    }
  }

  return { removeAttachment, addAttachment, onAttachSelection, onAttachFiles, onAttachScreenshot };
}
