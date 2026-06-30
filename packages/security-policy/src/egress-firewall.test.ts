import { describe, it, expect } from 'vitest';
import EgressFirewall, {
  inspectEgress,
  shannonEntropy,
  type EgressFindingKind,
} from './egress-firewall';

function kinds(payload: string): EgressFindingKind[] {
  return inspectEgress(payload).findings.map((f) => f.kind);
}

describe('inspectEgress — secrets (block)', () => {
  it('blocks an Anthropic-style API key', () => {
    const v = inspectEgress('here is the key sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
    expect(v.decision).toBe('block');
    expect(v.findings.map((f) => f.kind)).toContain('secret_token');
  });

  it('blocks AWS access keys, GitHub tokens, Google keys, JWTs and Bearer tokens', () => {
    expect(EgressFirewall.isBlocked('AKIAIOSFODNN7EXAMPLE')).toBe(true);
    expect(EgressFirewall.isBlocked('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')).toBe(true);
    expect(EgressFirewall.isBlocked('AIzaSyA1234567890ABCDEFGHIJKLMNOPQRSTUVW')).toBe(true);
    expect(
      EgressFirewall.isBlocked(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36',
      ),
    ).toBe(true);
    expect(EgressFirewall.isBlocked('Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456')).toBe(
      true,
    );
  });

  it('blocks a private key header', () => {
    expect(EgressFirewall.isBlocked('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
  });
});

describe('inspectEgress — PII (warn)', () => {
  it('warns on an email address', () => {
    const v = inspectEgress('contact john.doe@example.com for details');
    expect(v.decision).toBe('warn');
    expect(v.findings.map((f) => f.kind)).toContain('pii_email');
  });

  it('warns on a Luhn-valid card number but not an invalid one', () => {
    expect(kinds('pay with 4111 1111 1111 1111 today')).toContain('pii_card');
    expect(kinds('pay with 4111 1111 1111 1112 today')).not.toContain('pii_card');
  });

  it('warns on an IBAN', () => {
    expect(kinds('send to DE89370400440532013000 please')).toContain('pii_iban');
  });
});

describe('inspectEgress — encoded blobs (warn)', () => {
  it('flags a long Base64 run', () => {
    const blob = 'VGhpcyBpcyBhIHNlY3JldCBwYXlsb2FkIGZvciBleGZpbHRyYXRpb24xMjM=';
    expect(kinds(`payload=${blob}`)).toContain('base64_blob');
  });

  it('flags a high-entropy non-base64 token', () => {
    expect(kinds('token a9$Kf2@Lm8#Qz1!Xb7%Wd4&Rt6^Yu0Vc3')).toContain('high_entropy');
  });

  it('does not flag ordinary prose', () => {
    const v = inspectEgress('Please summarize the three articles about local-first software.');
    expect(v.decision).toBe('allow');
    expect(v.findings).toEqual([]);
  });
});

describe('inspectEgress — decision aggregation', () => {
  it('block dominates warn', () => {
    const v = inspectEgress('mail me at a@b.co with key sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ01');
    expect(v.decision).toBe('block');
    expect(v.findings.length).toBeGreaterThanOrEqual(2);
  });
});

describe('redaction', () => {
  it('never echoes the raw secret in a finding', () => {
    const secret = 'sk-ant-api03-SUPERSECRETVALUE0123456789';
    const v = inspectEgress(`leak ${secret}`);
    const serialized = JSON.stringify(v);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('SUPERSECRETVALUE');
    expect(v.findings[0]?.sample).toContain('chars');
  });
});

describe('shannonEntropy', () => {
  it('is 0 for empty or single-symbol strings', () => {
    expect(shannonEntropy('')).toBe(0);
    expect(shannonEntropy('aaaaaa')).toBe(0);
  });
  it('is ~1 bit for a balanced two-symbol string', () => {
    expect(shannonEntropy('abab')).toBeCloseTo(1);
  });
});
