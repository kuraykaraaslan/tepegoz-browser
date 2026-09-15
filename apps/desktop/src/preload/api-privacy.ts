import {
  IpcChannels,
  type DataRightsExportRequest,
  type DataRightsExportResult,
  type TepegozApi,
} from '@tepegoz/desktop-ipc';
import { invoke } from './ipc-invoke';

/** Data Rights bridge methods (Phase 7 KVKK/GDPR self-service). Its own file rather than folded into
 *  `api-bookmarks-history.ts`, which is already at the ADR-0010 250-line cap. */
export const privacyApi: Pick<TepegozApi, 'exportDataRights'> = {
  exportDataRights: (request: DataRightsExportRequest) =>
    invoke<DataRightsExportResult>(IpcChannels.dataRightsExport, request),
};
