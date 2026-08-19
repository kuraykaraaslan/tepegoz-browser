import { describe, expect, it } from 'vitest';
import { generateSigningKeyPair, signCheckpoint, verifyCheckpoint } from './checkpoint';

describe('signing a checkpoint', () => {
  it('produces a checkpoint that verifies against its OWN embedded key', () => {
    const keys = generateSigningKeyPair();
    const checkpoint = signCheckpoint('a'.repeat(64), keys);
    expect(verifyCheckpoint(checkpoint)).toEqual({ valid: true });
  });

  it('generates a DIFFERENT keypair every call', () => {
    // Two devices, or two rotations, must never accidentally share a key.
    const a = generateSigningKeyPair();
    const b = generateSigningKeyPair();
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
  });
});

describe('verifying a checkpoint', () => {
  it('FAILS a signature that does not match the chain root it claims', () => {
    const keys = generateSigningKeyPair();
    const checkpoint = signCheckpoint('a'.repeat(64), keys);
    const forged = { ...checkpoint, chainRoot: 'b'.repeat(64) };
    expect(verifyCheckpoint(forged)).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('FAILS a signature signed by a DIFFERENT key than the one embedded', () => {
    const signer = generateSigningKeyPair();
    const impostor = generateSigningKeyPair();
    const checkpoint = signCheckpoint('a'.repeat(64), signer);
    const swapped = { ...checkpoint, publicKeyPem: impostor.publicKeyPem };
    expect(verifyCheckpoint(swapped)).toEqual({ valid: false, reason: 'bad_signature' });
  });

  it('FAILS a signedAt that was edited after signing', () => {
    // signedAt is part of the signed message specifically so a stale root cannot be replayed as if it
    // had just been checkpointed.
    const keys = generateSigningKeyPair();
    const checkpoint = signCheckpoint('a'.repeat(64), keys, 1000);
    const backdated = { ...checkpoint, signedAt: 999 };
    expect(verifyCheckpoint(backdated).valid).toBe(false);
  });

  it('FAILS gracefully on a malformed embedded key, rather than throwing', () => {
    const keys = generateSigningKeyPair();
    const checkpoint = signCheckpoint('a'.repeat(64), keys);
    const corrupt = { ...checkpoint, publicKeyPem: 'not a pem key' };
    expect(verifyCheckpoint(corrupt)).toEqual({ valid: false, reason: 'bad_key' });
  });

  it('FAILS a corrupted signature rather than throwing', () => {
    const keys = generateSigningKeyPair();
    const checkpoint = signCheckpoint('a'.repeat(64), keys);
    const corrupt = { ...checkpoint, signature: 'not-base64-!!!' };
    expect(verifyCheckpoint(corrupt).valid).toBe(false);
  });
});
