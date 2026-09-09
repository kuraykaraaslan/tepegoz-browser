import { describe, it, expect } from 'vitest';
import { ChatAdapterCapsSchema } from '@tepegoz/shared-types';
import { IRC_CAPS, MATRIX_CAPS, XMPP_CAPS, capsFor, negotiateCaps } from './caps';

describe('capability presets', () => {
  it('every preset is a valid ChatAdapterCaps', () => {
    for (const caps of [XMPP_CAPS, IRC_CAPS, MATRIX_CAPS]) {
      expect(ChatAdapterCapsSchema.safeParse(caps).success).toBe(true);
    }
  });

  it('IRC has no encryption, edits, reactions or receipts', () => {
    expect(IRC_CAPS.e2ee).toBe(false);
    expect(IRC_CAPS.edits).toBe(false);
    expect(IRC_CAPS.reactions).toBe(false);
    expect(IRC_CAPS.receipts).toBe(false);
  });

  it('Matrix is the broadest (threads on); XMPP has no threads', () => {
    expect(MATRIX_CAPS.threads).toBe(true);
    expect(XMPP_CAPS.threads).toBe(false);
  });

  it('capsFor returns a fresh copy per protocol', () => {
    const a = capsFor('xmpp');
    a.e2ee = false;
    expect(capsFor('xmpp').e2ee).toBe(true);
    expect(capsFor('bridge').rooms).toBe(false);
  });
});

describe('negotiateCaps', () => {
  it('narrows only — an observed false turns a capability off', () => {
    const negotiated = negotiateCaps(XMPP_CAPS, { historySync: false });
    expect(negotiated.historySync).toBe(false);
    expect(negotiated.presence).toBe(true);
  });

  it('cannot turn a capability on beyond the preset (hostile server response)', () => {
    const negotiated = negotiateCaps(IRC_CAPS, { e2ee: true, edits: true });
    expect(negotiated.e2ee).toBe(false);
    expect(negotiated.edits).toBe(false);
  });

  it('leaves the preset untouched', () => {
    negotiateCaps(XMPP_CAPS, { e2ee: false });
    expect(XMPP_CAPS.e2ee).toBe(true);
  });
});
