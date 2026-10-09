import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import { resolveSecureDns } from './secure-dns';

/**
 * Apply the Secure DNS preferences to Chromium's host resolver (process-wide, once the app is ready).
 *
 * Process-wide is the honest scope: it covers ordinary and private tabs. A tab bound to Tor, a VPN or a
 * proxy hands the hostname to the tunnel (the proxy is told the NAME, not an address), so its lookups
 * happen at the far end and this setting does not touch them.
 *
 * Safe to call again whenever the preferences change; a failure is logged and leaves the previous
 * resolver in place — a DNS setting must never be able to stop the browser from starting.
 */
export function applySecureDns(): void {
  try {
    const cfg = resolveSecureDns(PreferenceStore.getAll());
    if (cfg.degraded) {
      Logger.warn('Secure DNS is on but its server is unusable; using the system resolver');
    }
    app.configureHostResolver({
      secureDnsMode: cfg.mode,
      secureDnsServers: cfg.servers,
    });
  } catch (err: unknown) {
    Logger.warn('Could not configure secure DNS', { err: String(err) });
  }
}
