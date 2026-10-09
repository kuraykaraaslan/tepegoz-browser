/**
 * The opt-out signals a browsing session adds to every request it sends.
 *
 * `Sec-GPC: 1` is Global Privacy Control — the one with legal force (CCPA/CPRA, and the EU's view of it as
 * a valid objection). `DNT: 1` is the older Do Not Track header, kept as an explicit opt-in because no site
 * is obliged to honour it and an extra header is one more bit that tells browsers apart.
 *
 * Pure so the rule is table-testable; the session wiring feeds it the preferences at request time, so
 * flipping a setting needs no restart.
 */
export interface PrivacySignalPrefs {
  globalPrivacyControl?: boolean | undefined;
  doNotTrack?: boolean | undefined;
}

export function privacySignalHeaders(prefs: PrivacySignalPrefs): Record<string, string> {
  const out: Record<string, string> = {};
  // `!== false`: a preferences object that predates the field reads as the default (on).
  if (prefs.globalPrivacyControl !== false) out['Sec-GPC'] = '1';
  if (prefs.doNotTrack === true) out['DNT'] = '1';
  return out;
}
