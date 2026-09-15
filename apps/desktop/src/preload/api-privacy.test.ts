import { expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/** The Data Rights slice of the preload bridge — one stateless subject-access export call. */

const invoke = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
vi.mock('./ipc-invoke', () => ({ invoke }));
vi.mock('electron', () => ({ ipcRenderer: {} }));

const { privacyApi } = await import('./api-privacy');

it('sends the subject through to main untouched', () => {
  void privacyApi.exportDataRights({ subject: 'kaya@example.com' });
  expect(invoke).toHaveBeenCalledWith(IpcChannels.dataRightsExport, { subject: 'kaya@example.com' });
});
