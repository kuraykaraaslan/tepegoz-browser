/**
 * Downloads, uploads and saved-task channels. Part of `IpcChannels` (see `channels.ts`); dependency-free
 * because the SANDBOXED preload imports it.
 */
export const ipcChannelsTransfers = {
  // Browser downloads (`tepegoz://downloads`). State is pushed live from the main-process DownloadService.
  downloadsList: 'downloads:list',
  downloadsCommand: 'downloads:command',
  downloadsState: 'downloads:state',
  /** Drop every finished transfer in ONE call, resolving with the count. The settings page used to do
   *  this by issuing one `downloads:command` per record — N round trips for a bulk operation main
   *  already had (`clearTerminal`) and simply never exposed. */
  downloadsClearFinished: 'downloads:clear-finished',
  /** Renderer→main: the whole downloads list as a CSV string for the user to save. Renderer is
   *  untrusted, so it only gets the string and runs the Blob download itself; main never writes a
   *  file. No on-disk paths, hashes or quarantine internals. */
  downloadsExport: 'downloads:export',
  /** Native directory picker for the download location, seeded with the current one. */
  downloadsPickDirectory: 'downloads:pick-directory',
  /** Open the download folder in the OS file manager. `false` ⇒ the path could not be opened. */
  downloadsOpenFolder: 'downloads:open-folder',
  // Browser uploads (`tepegoz://uploads`). State is pushed live from the main-process UploadService.
  uploadsList: 'uploads:list',
  uploadsCommand: 'uploads:command',
  uploadsState: 'uploads:state',
  // Saved/triggered agent tasks (`tepegoz://tasks`). State is projected by the main-process TaskService.
  tasksList: 'tasks:list',
  tasksGet: 'tasks:get',
  tasksSave: 'tasks:save',
  tasksDelete: 'tasks:delete',
  tasksRunNow: 'tasks:run-now',
  tasksCancelRun: 'tasks:cancel-run',
  tasksSetEnabled: 'tasks:set-enabled',
  tasksListRuns: 'tasks:list-runs',
  tasksListArtifacts: 'tasks:list-artifacts',
  /** A saved task's reusable configuration only (no run history/artifacts, no policy) as one JSON string
   *  the renderer downloads via Blob — same split as `macrosExport`. */
  tasksExport: 'tasks:export',
  /** Renderer→main: the JSON text of a previously exported tasks file. Main validates every entry
   *  (`TaskImportEntrySchema`, which never accepts a raw `policy`/`autonomy`) and upserts the ones that
   *  pass through the same `saveTask` path a manual save uses. */
  tasksImport: 'tasks:import',
  tasksState: 'tasks:state',
} as const;
