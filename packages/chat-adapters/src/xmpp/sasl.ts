/**
 * SASL client mechanisms for XMPP (RFC 6120 §6): PLAIN and SCRAM-SHA-1 / SCRAM-SHA-256 (RFC 5802).
 *
 * Node- and Electron-free: hashing/HMAC use the Web Crypto global (`crypto.subtle`), not
 * `node:crypto`. All byte/base64 conversion goes through `btoa`/`atob` binary-string form (portable
 * to Node >= 18 and the renderer).
 *
 * SCRAM is a two-step exchange: `startScram` -> `scramClientFirst` (the `<auth/>` payload), then
 * `scramFinal` consumes the server-first message and yields the `<response/>` payload, then
 * `scramVerify` checks the server-final signature.
 */

const NUL = String.fromCharCode(0);

export function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** PLAIN: `base64(authzid NUL authcid NUL passwd)`. Caller guarantees TLS is active. */
export function saslPlain(username: string, password: string, authzid = ''): string {
  return bytesToB64(enc.encode(authzid + NUL + username + NUL + password));
}

// ── SCRAM ───────────────────────────────────────────────────────────────────

export type ScramHash = 'SHA-1' | 'SHA-256';

const HASH_FOR_MECH: Record<string, ScramHash> = {
  'SCRAM-SHA-1': 'SHA-1',
  'SCRAM-SHA-256': 'SHA-256',
};

export interface ScramState {
  hash: ScramHash;
  password: string;
  clientNonce: string;
  /** `n=user,r=nonce` — the client-first-message-bare, part of the auth message. */
  clientFirstBare: string;
  gs2Header: string;
}

/** `n,,` — channel binding (`-PLUS`) is not implemented, so the header is constant. */
const GS2_HEADER = 'n,,';

function stripControls(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  return out;
}

function randomNonce(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // SCRAM nonce forbids ',' (0x2C); base64 never emits it. Drop '=' padding by convention.
  return bytesToB64(bytes).replace(/=+$/g, '');
}

export function startScram(
  mechanism: string,
  username: string,
  password: string,
  clientNonce: string = randomNonce(),
): ScramState | null {
  const hash = HASH_FOR_MECH[mechanism];
  if (hash === undefined) return null;
  const user = stripControls(username).replace(/=/g, '=3D').replace(/,/g, '=2C');
  return {
    hash,
    password: stripControls(password),
    clientNonce,
    clientFirstBare: `n=${user},r=${clientNonce}`,
    gs2Header: GS2_HEADER,
  };
}

/** The `<auth/>` payload: `base64(gs2-header + client-first-message-bare)`. */
export function scramClientFirst(state: ScramState): string {
  return bytesToB64(enc.encode(state.gs2Header + state.clientFirstBare));
}

async function hmac(key: Uint8Array, data: Uint8Array, hash: ScramHash): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

async function sha(data: Uint8Array, hash: ScramHash): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest(hash, data));
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hi(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  hash: ScramHash,
): Promise<Uint8Array> {
  let u = await hmac(password, concat(salt, Uint8Array.of(0, 0, 0, 1)), hash);
  let result = u;
  for (let i = 1; i < iterations; i += 1) {
    u = await hmac(password, u, hash);
    result = xor(result, u);
  }
  return result;
}

function parseServerFirst(msg: string): { nonce: string; salt: string; iterations: number } | null {
  const parts = new Map<string, string>();
  for (const kv of msg.split(',')) {
    const eq = kv.indexOf('=');
    if (eq > 0) parts.set(kv.slice(0, eq), kv.slice(eq + 1));
  }
  const nonce = parts.get('r');
  const salt = parts.get('s');
  const iterations = Number.parseInt(parts.get('i') ?? '', 10);
  if (nonce === undefined || salt === undefined || !Number.isFinite(iterations) || iterations < 1) {
    return null;
  }
  return { nonce, salt, iterations };
}

export interface ScramFinalResult {
  /** `base64` of the client-final-message — the `<response/>` payload. */
  response: string;
  /** `base64(ServerSignature)` — compare against the server's `v=` in its final message. */
  expectedServerSignature: string;
}

/** Step 2: consume `base64(server-first-message)`, produce the client-final-message. */
export async function scramFinal(
  state: ScramState,
  serverFirstB64: string,
): Promise<ScramFinalResult | null> {
  const serverFirst = dec.decode(b64ToBytes(serverFirstB64));
  const parsed = parseServerFirst(serverFirst);
  if (parsed === null) return null;
  // The server must extend our nonce, not merely echo it.
  if (!parsed.nonce.startsWith(state.clientNonce) || parsed.nonce === state.clientNonce) return null;

  const channelBinding = bytesToB64(enc.encode(state.gs2Header));
  const clientFinalNoProof = `c=${channelBinding},r=${parsed.nonce}`;
  const authMessage = enc.encode(`${state.clientFirstBare},${serverFirst},${clientFinalNoProof}`);

  const saltedPassword = await hi(
    enc.encode(state.password),
    b64ToBytes(parsed.salt),
    parsed.iterations,
    state.hash,
  );
  const clientKey = await hmac(saltedPassword, enc.encode('Client Key'), state.hash);
  const storedKey = await sha(clientKey, state.hash);
  const clientSignature = await hmac(storedKey, authMessage, state.hash);
  const clientProof = xor(clientKey, clientSignature);

  const serverKey = await hmac(saltedPassword, enc.encode('Server Key'), state.hash);
  const serverSignature = await hmac(serverKey, authMessage, state.hash);

  return {
    response: bytesToB64(enc.encode(`${clientFinalNoProof},p=${bytesToB64(clientProof)}`)),
    expectedServerSignature: bytesToB64(serverSignature),
  };
}

/** Step 3: check `base64(server-final-message)` carries the expected `v=ServerSignature`. */
export function scramVerify(serverFinalB64: string, expectedServerSignature: string): boolean {
  const msg = dec.decode(b64ToBytes(serverFinalB64));
  for (const kv of msg.split(',')) {
    if (kv.startsWith('v=')) return kv.slice(2) === expectedServerSignature;
    if (kv.startsWith('e=')) return false; // server-error
  }
  return false;
}
