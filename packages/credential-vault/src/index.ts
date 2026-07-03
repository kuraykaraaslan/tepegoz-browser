/**
 * `@tepegoz/credential-vault` — BYO-key vault for AI provider API keys. Encrypts via an injected
 * `SecretCrypto` (the desktop app wires Electron `safeStorage`/DPAPI) and persists base64 ciphertext
 * to an injected file path. Raw keys never leave the caller. Extracted from `apps/desktop` per
 * docs/package-map.md.
 */
export {
  default,
  type SecretCrypto,
  type ProviderKeyStatus,
  type ProviderKeyMeta,
} from './credential-vault';
