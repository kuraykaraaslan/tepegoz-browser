import { BrowserWindow } from 'electron';
import { z } from 'zod';
import {
  IpcChannels,
  isExtensionEnabled,
  type LocalModelInfo,
  type Macro,
  type MacroSummary,
} from '@tepegoz/desktop-ipc';
import { AppError } from '@tepegoz/libs';
import { macrosManifest } from '@tepegoz/ext-macros/manifest';
import {
  MacroAttachCsvSchema,
  MacroIdSchema,
  MacroRunDraftSchema,
  MacroRunInputSchema,
  MacroSchema,
} from '@tepegoz/desktop-ipc/schemas';
import ModelManager from '../model-catalog/model-manager.electron';
import MacroService, { type MacroCursorOpts } from '../macro/macro-service.electron';
import PreferenceStore from '@tepegoz/preferences';
import TabManager from '../tabs';
import { handle, handleAsync, onAction } from './ipc-helpers';

/**
 * On-device model management + macros (ext-macros) IPC handlers (extracted from `ipc-content.ts`,
 * ADR-0010 250-line cap).
 */

/** Register on-device model management + macros handlers. */
export function registerToolsIpc(): void {
  // On-device model management. Progress/install changes are pushed to every window via models:state.
  ModelManager.setProgressListener((models) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send(IpcChannels.modelsState, models);
    }
  });
  const ModelIdSchema = z.string().min(1).max(64);
  handle(IpcChannels.modelsList, (): LocalModelInfo[] => ModelManager.list());
  handleAsync(IpcChannels.modelsDownload, async (_event, payload): Promise<void> => {
    await ModelManager.download(ModelIdSchema.parse(payload));
  });
  onAction(IpcChannels.modelsCancel, ModelIdSchema, (id) => {
    ModelManager.cancel(id);
  });
  handle(IpcChannels.modelsSelect, (_event, payload): void => {
    ModelManager.select(ModelIdSchema.parse(payload));
  });
  handle(IpcChannels.modelsDelete, (_event, payload): void => {
    ModelManager.remove(ModelIdSchema.parse(payload));
  });

  // Macros (ext-macros): CRUD + CSV attach, deterministic run (streamed located progress), and record
  // (streamed captured Steps). The macro IR is validated with MacroSchema at this trust boundary.
  // Every handler refuses when `com.tepegoz.macros` is disabled — the same enabled-gate that already
  // governs the agent-capability path (ADR-0024), so the direct IPC path can't outlive the extension.
  const requireMacrosEnabled = (): void => {
    if (!isExtensionEnabled(PreferenceStore.getAll().extensions, macrosManifest.id)) {
      throw new AppError('Macros extension is disabled', 403);
    }
  };
  handle(IpcChannels.macrosList, (): MacroSummary[] => {
    requireMacrosEnabled();
    return MacroService.list();
  });
  handle(IpcChannels.macrosGet, (_event, payload): Macro | null => {
    requireMacrosEnabled();
    return MacroService.get(MacroIdSchema.parse(payload));
  });
  handle(IpcChannels.macrosSave, (_event, payload): MacroSummary => {
    requireMacrosEnabled();
    return MacroService.save(MacroSchema.parse(payload));
  });
  handle(IpcChannels.macrosDelete, (_event, payload): void => {
    requireMacrosEnabled();
    MacroService.delete(MacroIdSchema.parse(payload));
  });
  handle(IpcChannels.macrosAttachCsv, (_event, payload): string => {
    requireMacrosEnabled();
    return MacroService.attachCsv(MacroAttachCsvSchema.parse(payload).content);
  });
  handle(IpcChannels.macrosRun, (event, payload): { runId: string } => {
    requireMacrosEnabled();
    const input = MacroRunInputSchema.parse(payload);
    const sender = event.sender;
    const cursorOpts: MacroCursorOpts = {
      onCursorMove: (x, y) => {
        if (sender.isDestroyed()) return;
        const b = TabManager.getContentBounds();
        sender.send(IpcChannels.cursorPosition, { x: x + b.x, y: y + b.y, visible: true });
      },
      onCursorHide: () => {
        if (!sender.isDestroyed())
          sender.send(IpcChannels.cursorPosition, { x: 0, y: 0, visible: false });
      },
    };
    const runId = MacroService.run(
      input,
      (progress) => {
        if (!sender.isDestroyed()) sender.send(IpcChannels.macrosRunProgress, progress);
      },
      cursorOpts,
    );
    return { runId };
  });
  handle(IpcChannels.macrosRunDraft, (event, payload): { runId: string } => {
    requireMacrosEnabled();
    const { macro, variables } = MacroRunDraftSchema.parse(payload);
    const sender = event.sender;
    const cursorOpts: MacroCursorOpts = {
      onCursorMove: (x, y) => {
        if (sender.isDestroyed()) return;
        const b = TabManager.getContentBounds();
        sender.send(IpcChannels.cursorPosition, { x: x + b.x, y: y + b.y, visible: true });
      },
      onCursorHide: () => {
        if (!sender.isDestroyed())
          sender.send(IpcChannels.cursorPosition, { x: 0, y: 0, visible: false });
      },
    };
    const runId = MacroService.runDraft(
      macro,
      variables,
      (progress) => {
        if (!sender.isDestroyed()) sender.send(IpcChannels.macrosRunProgress, progress);
      },
      cursorOpts,
    );
    return { runId };
  });
  onAction(IpcChannels.macrosCancel, MacroIdSchema, (runId) => {
    if (!isExtensionEnabled(PreferenceStore.getAll().extensions, macrosManifest.id)) return;
    MacroService.cancel(runId);
  });
  handleAsync(IpcChannels.macrosRecordStart, async (event): Promise<void> => {
    requireMacrosEnabled();
    const sender = event.sender;
    await MacroService.recordStart((index, step) => {
      if (!sender.isDestroyed()) sender.send(IpcChannels.macrosRecordStep, { index, step });
    });
  });
  handleAsync(IpcChannels.macrosRecordStop, (): Promise<void> => {
    requireMacrosEnabled();
    return MacroService.recordStop();
  });
}
