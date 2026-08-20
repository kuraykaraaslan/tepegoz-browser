import VpnSecrets from './vpn-secrets.electron';

/**
 * Username/password for an OpenVPN profile that asks for one (Phase 5).
 *
 * Stored the same way the profile itself is — encrypted through the OS keychain — and handed to OpenVPN
 * over the **management socket**, never as `--auth-user-pass <file>`. That choice is the point of this
 * module: OpenVPN re-reads an auth file on every renegotiation, so a file cannot simply be deleted after
 * start, and a long-lived plaintext credential on disk is exactly what the keychain exists to avoid.
 *
 * Kept beside the profile under a distinct key so removing a connection removes both.
 */

const SUFFIX = '-auth';

export interface OpenVpnCredentials {
  username: string;
  password: string;
}

const OpenVpnCredentialStore = {
  save(connectionId: string, credentials: OpenVpnCredentials): void {
    // JSON rather than two entries: one blob, one keychain round-trip, and no way for the two halves to
    // get out of step.
    VpnSecrets.save(`${connectionId}${SUFFIX}`, JSON.stringify(credentials));
  },

  /** The stored pair, or `null` when there is none or it cannot be decrypted. */
  read(connectionId: string): OpenVpnCredentials | null {
    const raw = VpnSecrets.read(`${connectionId}${SUFFIX}`);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return null;
      const { username, password } = parsed as Record<string, unknown>;
      if (typeof username !== 'string' || typeof password !== 'string') return null;
      return { username, password };
    } catch {
      return null;
    }
  },

  has(connectionId: string): boolean {
    return OpenVpnCredentialStore.read(connectionId) !== null;
  },

  forget(connectionId: string): void {
    VpnSecrets.forget(`${connectionId}${SUFFIX}`);
  },
};

export default OpenVpnCredentialStore;
