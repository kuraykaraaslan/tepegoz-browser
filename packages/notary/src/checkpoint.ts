import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
  type KeyObject,
} from 'node:crypto';

/**
 * Signed checkpoints over a hash-chain root (Phase 7 NotaryService).
 *
 * A hash chain alone proves internal consistency — that the events, in order, were not altered *after*
 * the chain was built. It does not prove the chain was not simply rebuilt from scratch by whoever holds
 * the database: nothing external anchors it. A checkpoint is that anchor: a device-held Ed25519 key
 * signs the chain root, so a receipt can be checked against a public key the verifier already trusts
 * (or has seen before), without needing the private key or tepegöz itself.
 *
 * Ed25519 over the built-in `node:crypto`, deliberately: it is a single-pass signature (no `update`
 * calls, no hash-algorithm choice to get wrong), it is fast enough to sign every checkpoint without a
 * noticeable pause, and it needs no dependency beyond Node itself — the same property the standalone
 * verify CLI needs to run with nothing installed but Node.
 *
 * Key custody is deliberately OUT of this module. Where the private key is generated, how it is
 * persisted (via `safeStorage` in the main process), and when a new checkpoint key is rotated are main-
 * process concerns; this module only signs and verifies given key material, so it stays testable without
 * Electron and reusable by the standalone CLI.
 */

export interface SigningKeyPair {
  /** PEM-encoded Ed25519 private key. Never logged, never leaves the process that generated it. */
  privateKeyPem: string;
  /** PEM-encoded Ed25519 public key. Safe to embed in a receipt — it is what the receipt is checked against. */
  publicKeyPem: string;
}

/** Generate a fresh device signing keypair. Called once per device by the main process; the private key
 *  is handed to `safeStorage` immediately by the caller and never returned from this module again. */
export function generateSigningKeyPair(): SigningKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export interface Checkpoint {
  /** The hash-chain root this checkpoint attests to (see `hash-chain.ts` `chainRoot`). */
  chainRoot: string;
  /** Epoch ms the checkpoint was made — part of what is signed, so it cannot be edited after the fact
   *  without invalidating the signature. */
  signedAt: number;
  /** Base64 Ed25519 signature over `chainRoot` + `signedAt`. */
  signature: string;
  /** PEM public key the signature verifies against — embedded so the receipt is self-contained. */
  publicKeyPem: string;
}

/** What a checkpoint actually signs: binding the root to the moment, so a stale root cannot be replayed
 *  as if it were signed just now. Exported so `verifyCheckpoint` and `signCheckpoint` sign the identical
 *  bytes — a mismatch here would make every checkpoint unverifiable, so it is written once. */
function checkpointMessage(root: string, signedAt: number): Buffer {
  return Buffer.from(`tepegoz-checkpoint-v1:${root}:${String(signedAt)}`, 'utf8');
}

export function signCheckpoint(root: string, keyPair: SigningKeyPair, signedAt = Date.now()): Checkpoint {
  const privateKey = createPrivateKey({ key: keyPair.privateKeyPem, format: 'pem', type: 'pkcs8' });
  const signature = nodeSign(null, checkpointMessage(root, signedAt), privateKey);
  return {
    chainRoot: root,
    signedAt,
    signature: signature.toString('base64'),
    publicKeyPem: keyPair.publicKeyPem,
  };
}

export type CheckpointVerdict = { valid: true } | { valid: false; reason: 'bad_signature' | 'bad_key' };

/**
 * Verify a checkpoint against the public key it CARRIES (never a caller-trusted key), because the
 * verifier's job is to check "does this signature actually match this public key", not "do I like this
 * public key" — trust in the key itself is a separate, out-of-band decision (pinning, a fingerprint the
 * user compares) that this function does not make on the caller's behalf.
 */
export function verifyCheckpoint(checkpoint: Checkpoint): CheckpointVerdict {
  let publicKey: KeyObject;
  try {
    publicKey = createPublicKey({ key: checkpoint.publicKeyPem, format: 'pem', type: 'spki' });
  } catch {
    return { valid: false, reason: 'bad_key' };
  }
  const ok = nodeVerify(
    null,
    checkpointMessage(checkpoint.chainRoot, checkpoint.signedAt),
    publicKey,
    Buffer.from(checkpoint.signature, 'base64'),
  );
  return ok ? { valid: true } : { valid: false, reason: 'bad_signature' };
}
