import { useEffect, useState } from 'react';
import { settingsDict } from '@tepegoz/settings-ui';
import { Button, Card } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import type { NetworkState, Preferences } from '@tepegoz/desktop-ipc';

/**
 * ADR-0041 Tier D — "mirrored, not re-owned". A settings has already picked its ONE home; this card
 * does not add a second write path to it, it only shows the current value and a deep-link back to that
 * home. `onUpdatePrefs` is deliberately not a prop here — there is nothing on this card to write.
 *
 * Every value is read through a channel the owning Settings section already uses:
 *  - `telemetryEnabled` / `safeBrowsingEnabled` come straight off the `prefs` this page already fetched
 *    (`getPreferences`, the same read `SettingsPage-sections-privacy.tsx` renders from) — no new IPC.
 *  - the default network route comes from `getNetworkState()` / `onNetworkState()`, the same push-based
 *    pair `settings-network-privacy.tsx` uses — no new IPC.
 *
 * "Open in Settings" navigates the active tab to `tepegoz://settings#<section>`, the same
 * `navigateTab()` deep-link `SiteInfoPopup.tsx` already uses to reach the Privacy section.
 *
 * Candidates considered and deferred (see docs/tracks/developer-settings-surface.md § Tier D): spellcheck
 * languages, cache size/location, and DNS-over-HTTPS all lack an owning Settings UI today, so there is
 * nowhere honest to deep-link to — mirroring them here would either fabricate a destination or duplicate
 * the write path this tier exists to avoid. They stay out until one exists.
 */
export function MirroredSettingsCard({ prefs }: { prefs: Preferences }) {
  const s = useT(settingsDict);
  const [network, setNetwork] = useState<NetworkState | null>(null);

  useEffect(() => {
    let live = true;
    void window.tepegoz.getNetworkState().then(
      (state) => {
        if (live) setNetwork(state);
      },
      () => undefined,
    );
    // Pushed, not polled — the same reasoning `NetworkPrivacySection` uses: the interesting change here
    // (the default route) can happen from another window, and a read taken once at mount would go stale.
    const unsubscribe = window.tepegoz.onNetworkState((state) => {
      if (live) setNetwork(state);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, []);

  function networkRouteValue(): string {
    if (network === null) return s.developerMirroredLoading;
    const general = network.general;
    if (general.kind !== 'connection') return s.network.direct;
    const conn = network.connections.find((c) => c.id === general.connectionId);
    return conn?.label ?? general.connectionId;
  }

  function openInSettings(sectionId: string): void {
    window.tepegoz.navigateTab(`tepegoz://settings#${sectionId}`);
  }

  const rows: Array<{ key: string; label: string; value: string; sectionId: string }> = [
    {
      key: 'telemetry',
      label: s.developerMirroredTelemetry,
      value: prefs.telemetryEnabled ? s.developerMirroredEnabled : s.developerMirroredDisabled,
      sectionId: 'privacy',
    },
    {
      key: 'safe-browsing',
      label: s.developerMirroredSafeBrowsing,
      value: prefs.safeBrowsingEnabled ? s.developerMirroredEnabled : s.developerMirroredDisabled,
      sectionId: 'privacy',
    },
    {
      key: 'network-route',
      label: s.developerMirroredNetworkRoute,
      value: networkRouteValue(),
      sectionId: 'network-privacy',
    },
  ];

  return (
    <Card title={s.developerMirroredTitle} subtitle={s.developerMirroredDesc}>
      <ul className="divide-y divide-border px-6 pb-5 pt-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="text-sm text-text-primary">{row.label}</p>
              <p className="font-mono text-xs text-text-secondary">{row.value}</p>
            </div>
            <Button size="xs" variant="outline" onClick={() => openInSettings(row.sectionId)}>
              {s.developerMirroredOpenInSettings}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
