import { describe, expect, it } from 'vitest';
import { classifyNetworkError } from './network-error';

/**
 * The connections overview must not show raw provider stderr (Phase 5). This locks the mapping from the
 * real thrown messages to a cause — the sentences themselves live in the settings dict and are checked
 * by `settings-network-privacy.test.tsx`.
 */

describe('classifyNetworkError', () => {
  it.each([
    ['wireproxy was not found', 'binaryMissing'],
    ['tor was not found anywhere under /opt/bin', 'binaryMissing'],
    ['This connection has no stored WireGuard profile (or it could not be decrypted)', 'badConfig'],
    ['Endpoint "vpn.example" is not host:port', 'badConfig'],
    ['No [Peer] section found', 'badConfig'],
    ['Connection chain loops back to conn-3', 'chainLoop'],
    ['No such connection: conn-9', 'noSuchConnection'],
    ['No such upstream connection: conn-9', 'noSuchConnection'],
    ['Not a usable SOCKS port: 0', 'portUnusable'],
    ['no listener on 127.0.0.1:41234 after 15000ms', 'noListener'],
    ['Nothing is listening on 127.0.0.1:9050', 'noListener'],
    ['the process exited before its listener came up', 'processExited'],
    ['wireproxy did not come up: bad key material', 'handshake'],
    ['tor did not come up: Could not bind to 127.0.0.1:9050', 'handshake'],
  ])('%s → %s', (raw, kind) => {
    expect(classifyNetworkError(raw)).toBe(kind);
  });

  it('falls back to "unknown" rather than guessing', () => {
    expect(classifyNetworkError('some novel provider message')).toBe('unknown');
    expect(classifyNetworkError('')).toBe('unknown');
    expect(classifyNetworkError('   ')).toBe('unknown');
    expect(classifyNetworkError(null)).toBe('unknown');
    expect(classifyNetworkError(undefined)).toBe('unknown');
  });

  it('prefers the specific cause over the broad one (a binary miss is not a handshake)', () => {
    // A message that mentions both — the specific pattern earlier in the list wins.
    expect(classifyNetworkError('wireproxy was not found; tunnel did not come up')).toBe(
      'binaryMissing',
    );
  });
});
