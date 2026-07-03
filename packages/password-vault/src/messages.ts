export const VaultMessages = {
  NotInitialized: 'Password vault is not initialized',
  EncryptionUnavailable: 'OS encryption is unavailable; cannot store the password securely',
  DecryptionUnavailable: 'OS encryption is unavailable; cannot read the stored password',
  EmptyPassword: 'Password must not be empty',
  EmptyUsername: 'Username must not be empty',
  EmptyUrl: 'URL must not be empty',
  NotFound: 'Credential not found',
} as const;
