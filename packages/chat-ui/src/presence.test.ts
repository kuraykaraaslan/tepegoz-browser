import { describe, expect, it } from 'vitest';
import { en } from './i18n/en';
import { presenceMeta } from './presence';

describe('presenceMeta', () => {
  it('maps each XMPP show value to a label, tone and connected-ness', () => {
    expect(presenceMeta('online', en.presence)).toEqual({
      label: 'Online',
      tone: 'positive',
      online: true,
    });
    expect(presenceMeta('away', en.presence)).toEqual({
      label: 'Away',
      tone: 'caution',
      online: true,
    });
    expect(presenceMeta('xa', en.presence).tone).toBe('caution');
    expect(presenceMeta('dnd', en.presence)).toEqual({
      label: 'Do not disturb',
      tone: 'busy',
      online: true,
    });
    expect(presenceMeta('offline', en.presence)).toEqual({
      label: 'Offline',
      tone: 'neutral',
      online: false,
    });
  });
});
