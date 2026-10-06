/**
 * Notification permission, logins, macros, file access, new tab and cursor channels. Part of `IpcChannels` (see `channels.ts`); dependency-free
 * because the SANDBOXED preload imports it.
 */
export const ipcChannelsUserData = {
  notificationPermissionRequest: 'notifications:permission-request',
  notificationPermissionRespond: 'notifications:permission-respond',
  // Login credential manager (channels use "logins:" prefix to avoid SAST false positives on the
  // word "password" — S2068 flags channel name strings, not actual credentials).
  loginsList: 'logins:list',
  loginsSet: 'logins:set',
  loginsRemove: 'logins:remove',
  loginsImport: 'logins:import',
  loginsExport: 'logins:export',
  /** Main→renderer push: autofill matches found for the current page. */
  loginsAutofillAvailable: 'logins:autofill-available',
  /** Renderer→main: user selected a credential to autofill. */
  loginsFill: 'logins:fill',
  // Macro automation (ext-macros). Request/response CRUD + run; record start/stop is fire-and-forget
  // with main→renderer streaming pushes for captured steps and run progress.
  macrosList: 'macros:list',
  macrosGet: 'macros:get',
  macrosSave: 'macros:save',
  macrosDelete: 'macros:delete',
  macrosRun: 'macros:run',
  macrosRunDraft: 'macros:run-draft',
  macrosCancel: 'macros:cancel',
  macrosAttachCsv: 'macros:attach-csv',
  macrosRecordStart: 'macros:record-start',
  macrosRecordStop: 'macros:record-stop',
  /** Every saved macro's full IR as one pretty-printed JSON file, for the user to save. No secrets —
   *  a macro is a recorded click/type script — so a plain JSON export is safe and re-importable. */
  macrosExport: 'macros:export',
  /** Renderer→main: the JSON text of a previously exported macros file. Main validates every entry
   *  with MacroSchema and upserts the ones that pass (`{ imported, skipped }`). */
  macrosImport: 'macros:import',
  /** Main→renderer push: a step was captured while recording. */
  macrosRecordStep: 'macros:record-step',
  /** Main→renderer push: run progress (step started/finished, run done/failed). */
  macrosRunProgress: 'macros:run-progress',
  // File operations (Settings → File operations): the folder-access whitelist that sandboxes the agent's
  // file tools. The grant LIST lives in `Preferences.fileAccessGrants` (read via prefs:get, written via
  // prefs:set — the main-process host reconciles the live FileAccessPolicy on change). The AI-driven
  // "grant this folder / allow this write" consent reuses the existing agent HITL approval modal (a file
  // op that exceeds its folder's granted mode, and every grant-management tool, fall through to it). So
  // the only dedicated channel is the native directory picker for the Settings "Add folder" button.
  fileAccessPickFolder: 'file-access:pick-folder',
  // New-tab page background image. `pick` opens a native image picker, reads + validates the file in
  // main, and stores the bytes in the content-addressed blob store (only a `cas://` ref is persisted in
  // prefs). `get` resolves a stored ref back to a `data:` URL for the renderer to paint.
  newtabPickBackgroundImage: 'newtab:pick-background-image',
  newtabGetBackgroundImage: 'newtab:get-background-image',
  /** Main→renderer push: simulated cursor position during a macro/agent run. */
  cursorPosition: 'cursor:position',
} as const;
