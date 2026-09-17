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

  it('blocks common vendor credential formats the sk- rule misses (Stripe/GitHub-PAT/Slack/SendGrid)', () => {
    // Stripe uses an underscore, so the hyphen-anchored sk- rule never matches it — its own rule must.
    expect(EgressFirewall.isBlocked('sk_live_51H8xEXAMPLEstripeKEY0123456789abcdEF')).toBe(true);
    expect(EgressFirewall.isBlocked('rk_test_51H8xEXAMPLEstripeKEY0123456789abcdEF')).toBe(true);
    expect(EgressFirewall.isBlocked('github_pat_11ABCDEFG0aBcDeFgHiJkL_mNoPqRsTuVwXyZ')).toBe(true);
    expect(EgressFirewall.isBlocked('xoxb-1234567890-ABCDEFGHIJKLMNOP')).toBe(true);
    expect(
      EgressFirewall.isBlocked('SG.ABCDEFGHIJKLMNOPqrstuv.ABCDEFGHIJKLMNOPqrstuvwxyz012345'),
    ).toBe(true);
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

  it('flags a long hex run', () => {
    const hex =
      '736b2d616e742d61706930332d4142434445464748494a4b4c4d4e4f505152535455565758595a303132333435';
    expect(kinds(`payload=${hex}`)).toContain('hex_blob');
  });

  it('flags a run of 10+ percent-encoded byte triples', () => {
    const pct =
      '%73%6b%2d%61%6e%74%2d%61%70%69%30%33%2d%41%42%43%44%45%46%47%48%49%4a%4b%4c%4d%4e%4f%50%51%52%53%54%55%56%57%58%59%5a%30%31%32%33%34%35';
    expect(kinds(`payload=${pct}`)).toContain('percent_blob');
  });

  it('does not flag a short percent-encoded fragment (below the 10-triple threshold)', () => {
    expect(kinds('redirect to /path%20with%20spaces')).not.toContain('percent_blob');
  });
});

describe('inspectEgress — decode-and-rescan an encoded blob (CometJacking, S6 PR8)', () => {
  // The channel CometJacking actually used: a secret shaped a scanner would catch in plaintext, hidden
  // inside a Base64/hex/percent-encoded blob so a shape-only scanner sees nothing but "looks encoded".
  const secret = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

  it('BLOCKS a secret hidden inside a Base64 blob, not just warns "looks encoded"', () => {
    const b64 = Buffer.from(secret, 'utf8').toString('base64');
    const v = inspectEgress(`exfil payload: ${b64}`);
    expect(v.decision).toBe('block');
    expect(v.findings.map((f) => f.kind)).toContain('secret_token');
    // The redacted decoded sample never leaks the raw key.
    for (const f of v.findings) expect(f.sample).not.toContain(secret);
  });

  it('BLOCKS a secret hidden inside a hex blob', () => {
    const hex = Buffer.from(secret, 'utf8').toString('hex');
    const v = inspectEgress(`exfil payload: ${hex}`);
    expect(v.decision).toBe('block');
    expect(v.findings.map((f) => f.kind)).toContain('secret_token');
  });

  it('BLOCKS a secret hidden inside a percent-encoded blob', () => {
    const pct = Buffer.from(secret, 'utf8')
      .toJSON()
      .data.map((b: number) => `%${b.toString(16).padStart(2, '0')}`)
      .join('');
    const v = inspectEgress(`exfil payload: ${pct}`);
    expect(v.decision).toBe('block');
    expect(v.findings.map((f) => f.kind)).toContain('secret_token');
  });

  it('a Base64 blob decoding to plain prose stays a WARN, not a false block', () => {
    // Existing "flags a long Base64 run" fixture decodes to ordinary prose with no secret shape.
    const blob = 'VGhpcyBpcyBhIHNlY3JldCBwYXlsb2FkIGZvciBleGZpbHRyYXRpb24xMjM=';
    const v = inspectEgress(`payload=${blob}`);
    expect(v.decision).toBe('warn');
  });

  it('does not attempt to decode past the bounded prefix', () => {
    // One CONTIGUOUS base64-alphabet run (no '=' in the middle, or the regex stops matching at it): a
    // 5000-char run of the valid-but-inert base64 char 'A', with the secret's encoded form appended past
    // the 4000-char decode bound. Bounded cost, not bounded safety — the blob itself is still flagged.
    const padding = 'A'.repeat(5000);
    const b64 = Buffer.from(secret, 'utf8').toString('base64').replace(/=+$/, '');
    const blob = `${padding}${b64}`;
    const v = inspectEgress(`payload=${blob}`);
    expect(v.findings.map((f) => f.kind)).toContain('base64_blob');
    expect(v.findings.map((f) => f.kind)).not.toContain('secret_token');
    expect(v.decision).toBe('warn');
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
