/**
 * Secure DNS (DNS over HTTPS) configuration — the pure half.
 *
 * Turns the three preferences into what Electron's `app.configureHostResolver` takes. Kept free of
 * Electron so every rule is table-testable: which server a provider means, what a custom URL has to look
 * like, and — the part worth pinning — that an unusable choice degrades to the system resolver rather than
 * to "secure mode with no servers", which would leave the browser unable to resolve anything.
 */

import type { SecureDnsMode, SecureDnsProvider } from '@tepegoz/desktop-ipc';
import { isSecureDnsServerUrl } from '@tepegoz/shared-types';

/** The RFC 8484 endpoints of the built-in providers. */
export const SECURE_DNS_PROVIDER_URLS: Readonly<
  Record<Exclude<SecureDnsProvider, 'custom'>, string>
> = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  google: 'https://dns.google/dns-query',
  quad9: 'https://dns.quad9.net/dns-query',
};

export interface SecureDnsPrefs {
  secureDnsMode?: SecureDnsMode | undefined;
  secureDnsProvider?: SecureDnsProvider | undefined;
  secureDnsCustomUrl?: string | undefined;
}

export interface SecureDnsConfig {
  mode: SecureDnsMode;
  servers: string[];
  /** True when the user asked for secure DNS but the choice was unusable, so the system resolver is used. */
  degraded: boolean;
}

export function resolveSecureDns(prefs: SecureDnsPrefs): SecureDnsConfig {
  const mode = prefs.secureDnsMode ?? 'off';
  if (mode === 'off') return { mode: 'off', servers: [], degraded: false };
  const provider = prefs.secureDnsProvider ?? 'cloudflare';
  const server =
    provider === 'custom'
      ? (prefs.secureDnsCustomUrl ?? '').trim()
      : (SECURE_DNS_PROVIDER_URLS[provider] ?? '');
  if (!isSecureDnsServerUrl(server)) return { mode: 'off', servers: [], degraded: true };
  return { mode, servers: [server], degraded: false };
}
