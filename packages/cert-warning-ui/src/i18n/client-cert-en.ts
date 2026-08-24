export const en = {
  title: 'Identify yourself to this site?',
  /** Precedes the origin, which is rendered on its own line. */
  intro: 'This site is asking for a certificate that proves who you are:',
  /** What sending one actually means, in terms a non-specialist can act on. */
  explain:
    'Sending a certificate tells the site your name and who issued it. Most sites do not need one.',
  sendNothing: 'Do not send a certificate (recommended)',
  issuer: 'Issued by',
  expiry: 'Expires',
  /** Set below the list so the user knows how long the choice lasts before they make it. */
  rememberNote: 'This choice applies to this site until you restart the browser.',
};

export type ClientCertPickerStrings = typeof en;
