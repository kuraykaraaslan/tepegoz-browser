/**
 * English is the PRIMARY / SOURCE locale for the SHARED CORE dictionary (cross-cutting strings used
 * everywhere: common controls, native window captions, boundary error messages). Its shape is the
 * contract — `tr.ts` must match it exactly (enforced by the `Resources` type and the parity test).
 * Feature strings live with their owning package/extension (its own `src/i18n/`), not here.
 */
export const en = {
  common: {
    appName: 'Tepegöz',
    ok: 'OK',
    cancel: 'Cancel',
    retry: 'Retry',
    save: 'Save',
    settings: 'Settings',
    showPassword: 'Show',
    hidePassword: 'Hide',
    loading: 'Loading…',
  },
  window: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
  },
  errors: {
    badRequest: 'Invalid request',
    notFound: 'Not found',
    downloadNotFound: 'That download is no longer in the list.',
    downloadNotReleased: 'Open the download from the notification first — it is still quarantined.',
    downloadNotReadyToRelease: 'That download is not ready to be released yet.',
    downloadBlocked: 'That download was blocked by the trust policy.',
    downloadFileMissing: 'The downloaded file could not be found on disk.',
    downloadNoActivePage: 'Open a web page before starting a download.',
    uploadNotFound: 'That upload is no longer in the list.',
    uploadNoActivePage: 'Open a web page before starting an upload.',
    unsupportedCommand: 'That action is not supported here.',
    noApiKey: 'No API key configured. Add one in Settings → Providers.',
    unknownModel: 'That model is no longer available.',
    modelNotInstalled: 'That model is not installed yet.',
    modelDownloadFailed: 'The model could not be downloaded. Check your connection and try again.',
    inferenceUnavailable: 'On-device inference is not available on this machine.',
    imageTooLarge: 'That image is too large (8 MB maximum).',
    unsupportedImageType: 'That image format is not supported.',
    storageUnavailable: 'Storage is unavailable right now.',
    databaseUnavailable: 'The local database is unavailable right now.',
    extensionDisabled: 'That extension is disabled. Enable it in Extensions.',
    recordingInProgress: 'A recording is already in progress.',
    recordingSensitiveSite:
      'Recording is not allowed on sensitive sites (banking, crypto, passwords, health).',
    agentRunInProgress: 'An agent task is already running for this group.',
    dictionaryNotFound: 'That dictionary is no longer available.',
    dictionaryDownloadFailed: 'The dictionary could not be downloaded.',
    dictionaryChecksumMismatch: 'The downloaded dictionary failed its integrity check.',
    catalogEmpty: 'No built-in extensions could be loaded.',
    taskNotFound: 'That task no longer exists.',
    keyNotFound: 'That key no longer exists.',
    forbidden: 'Action blocked by policy',
    unauthorized: 'Authentication required',
    badState: 'Invalid state for this operation',
    upstreamDown: 'Service unavailable',
    renderFailure: 'Something went wrong — please restart the app',
  },
};

/** Shape contract derived from the English source (values widened to string). */
export type Resources = typeof en;
