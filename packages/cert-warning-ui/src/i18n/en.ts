export const en = {
  title: 'This connection is not private',
  /** Precedes the origin, which is rendered on its own line. */
  intro: 'The certificate offered by this site could not be verified:',
  /** The consequence, stated plainly. Not softened — proceeding really does mean this. */
  risk: 'Someone could be reading or changing what you send to this site.',
  issuer: 'Issued by',
  expiry: 'Expires',
  errorCode: 'Error',
  back: 'Go back (recommended)',
  proceed: 'Continue anyway',
  /** Set alongside `proceed` so the user knows how long the exception lasts. */
  proceedNote: 'This choice applies until you restart the browser.',
};

export type CertWarningStrings = typeof en;
