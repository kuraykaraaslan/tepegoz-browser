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
  },
  window: {
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    close: 'Close',
  },
  errors: {
    unauthorized: 'Authentication required',
    forbidden: 'Action blocked by policy',
    badState: 'Invalid state for this operation',
    upstreamDown: 'Service unavailable',
    renderFailure: 'Something went wrong — please restart the app',
  },
};

/** Shape contract derived from the English source (values widened to string). */
export type Resources = typeof en;
