import { describe, expect, it } from 'vitest';
import { privacySignalHeaders } from './privacy-signal-stamp';

describe('privacySignalHeaders', () => {
  it('sends Global Privacy Control by default, and nothing else', () => {
    expect(privacySignalHeaders({ globalPrivacyControl: true, doNotTrack: false })).toEqual({
      'Sec-GPC': '1',
    });
  });

  it('reads a preferences object that predates the fields as the defaults (GPC on, DNT off)', () => {
    expect(privacySignalHeaders({})).toEqual({ 'Sec-GPC': '1' });
  });

  it('sends nothing when the user turned both off', () => {
    expect(privacySignalHeaders({ globalPrivacyControl: false, doNotTrack: false })).toEqual({});
  });

  it('adds DNT only when the user opted in, alongside or without GPC', () => {
    expect(privacySignalHeaders({ globalPrivacyControl: true, doNotTrack: true })).toEqual({
      'Sec-GPC': '1',
      DNT: '1',
    });
    expect(privacySignalHeaders({ globalPrivacyControl: false, doNotTrack: true })).toEqual({
      DNT: '1',
    });
  });

  it('never sends a value other than "1" (the only one either specification defines)', () => {
    for (const prefs of [{}, { doNotTrack: true }, { globalPrivacyControl: true }]) {
      for (const v of Object.values(privacySignalHeaders(prefs))) expect(v).toBe('1');
    }
  });
});
