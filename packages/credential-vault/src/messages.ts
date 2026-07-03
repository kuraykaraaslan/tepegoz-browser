/**
 * Constant error messages for the vault (internal-ai-rules: messages live in a messages file, never
 * inline at throw sites). Operator/log-facing; user-facing strings go through i18n at the boundary.
 */
export const VaultMessages = {
  EmptyApiKey: 'API key must not be empty',
  EmptyLabel: 'Key label must not be empty',
  KeyNotFound: 'No stored key with that id',
  EncryptionUnavailable: 'OS encryption is unavailable; cannot store the key securely',
  DecryptionUnavailable: 'OS encryption is unavailable; cannot read the stored key',
  NotInitialized: 'Credential vault is not initialized',
} as const;
