import type { ClipboardReadTextInput, ClipboardWriteTextInput } from '@tepegoz/clipboard';
import type { ClipboardToolsHost } from '@tepegoz/clipboard/tools';
import ClipboardService from './clipboard-service.electron';
import TabManager from '../tabs';

function activeOrigin(): string | undefined {
  const url = TabManager.activeWebContents()?.getURL();
  if (url === undefined) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** Electron host for clipboard_* tools. Content is never logged here; audit stays metadata-only. */
export const clipboardToolsHost: ClipboardToolsHost = {
  readText: (input: ClipboardReadTextInput) =>
    ClipboardService.readText({ ...input, actor: 'agent', origin: input.origin ?? activeOrigin() }),
  writeText: (input: ClipboardWriteTextInput) =>
    ClipboardService.writeText({
      ...input,
      actor: 'agent',
      origin: input.origin ?? activeOrigin(),
    }),
};
