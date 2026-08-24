import { useEffect, useState } from 'react';
import { type SettingsStrings } from '@tepegoz/settings-ui';
import { Button, Card } from '@tepegoz/ui';
import {
  WEB_PERMISSION_CAPABILITIES,
  type SitePermissionState,
  type WebPermissionCapability,
} from '@tepegoz/shared-types';
import type { AgentCapabilityRow, Preferences } from '@tepegoz/desktop-ipc';

/**
 * The Permissions Center: what each site may do, and what the agent may do.
 *
 * Two halves that must not be confused, which is why they are one surface with two clearly separate
 * sections rather than two settings pages. **Site permissions are editable** — they are the user's
 * decisions about the web. **The agent matrix is read-only** — it is a VIEW over the Policy Kernel,
 * not a second decision engine, and a UI that let you edit it here would be exactly the parallel
 * permission flow the phase's own rule forbids.
 */

/**
 * The three answers, in the order they are offered. `prompt` is a REAL stored state, not the absence of
 * one — `SITE_PERMISSION_STATES` has always had it — and storing it is the difference between "I have
 * never been asked about this site" (no entry at all) and "I decided I want to be asked every time".
 * The broker treats anything that is not `allowed` as not-allowed, so choosing it is safe by
 * construction rather than by a rule this file has to remember.
 */
const STATES: readonly SitePermissionState[] = ['prompt', 'allowed', 'denied'];

function capabilityLabel(c: WebPermissionCapability, s: SettingsStrings): string {
  return s.permissionsCenter.capability[c];
}

/** One site's row: every brokered capability, each independently settable. */
function SiteRow({
  origin,
  perms,
  s,
  onSet,
}: {
  origin: string;
  perms: Preferences['sitePermissions'][string] | undefined;
  s: SettingsStrings;
  onSet: (origin: string, capability: WebPermissionCapability, state: SitePermissionState) => void;
}) {
  return (
    <li className="rounded-md border border-border px-3 py-2">
      <p className="mb-2 truncate font-mono text-xs text-text-primary">{origin}</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {WEB_PERMISSION_CAPABILITIES.map((c) => {
          // No entry means the site has never been asked about this capability, which behaves the
          // same as `prompt` and is displayed as it.
          const value: SitePermissionState = perms?.[c] ?? 'prompt';
          return (
            <label key={c} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-text-secondary">{capabilityLabel(c, s)}</span>
              <select
                value={value}
                aria-label={`${origin} — ${capabilityLabel(c, s)}`}
                onChange={(e) => {
                  onSet(origin, c, e.target.value as SitePermissionState);
                }}
                className="rounded border border-border bg-surface-base px-1.5 py-0.5 text-xs text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                {STATES.map((st) => (
                  <option key={st} value={st}>
                    {s.permissionsCenter.state[st]}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </li>
  );
}

export function PermissionsCenter({
  sitePermissions,
  s,
  onSet,
  onReset,
}: {
  sitePermissions: Preferences['sitePermissions'];
  s: SettingsStrings;
  onSet: (origin: string, capability: WebPermissionCapability, state: SitePermissionState) => void;
  onReset: (origin: string) => void;
}) {
  const origins = Object.keys(sitePermissions).sort((a, b) => a.localeCompare(b));
  return (
    <Card title={s.permissionsCenter.sitesTitle} subtitle={s.permissionsCenter.sitesSubtitle}>
      {origins.length === 0 ? (
        // Says WHY it is empty. "No sites" reads like a broken list; "nothing has asked yet" is the
        // actual state, and it also tells the user this fills itself rather than needing setup.
        <p className="text-sm text-text-secondary">{s.permissionsCenter.sitesEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {origins.map((origin) => (
            <li key={origin} className="flex flex-col gap-1">
              <ul>
                <SiteRow origin={origin} perms={sitePermissions[origin]} s={s} onSet={onSet} />
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="self-end"
                onClick={() => {
                  onReset(origin);
                }}
              >
                {s.permissionsCenter.forgetSite}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-text-secondary">{s.permissionsCenter.screenNote}</p>
    </Card>
  );
}

/**
 * The per-agent matrix — a READ-ONLY view over the Policy Kernel's own verdicts.
 *
 * Read-only is the design, not a shortcut. The Policy Kernel is the single place that decides what an
 * agent may do; a matrix you could edit here would be a second engine holding a second opinion, and the
 * first time the two disagreed the user would have no way to know which one was in force. So this
 * renders what the kernel says and offers no control at all — the way to change a verdict is to change
 * the policy the kernel reads.
 */
export function AgentPermissionMatrix({ s }: { s: SettingsStrings }) {
  const [rows, setRows] = useState<AgentCapabilityRow[] | null>(null);

  useEffect(() => {
    let live = true;
    void window.tepegoz.listAgentCapabilities().then(
      (r) => {
        if (live) setRows(r);
      },
      () => {
        if (live) setRows([]);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const badge: Record<AgentCapabilityRow['decision'], string> = {
    allow: 'text-emerald-500',
    ask: 'text-amber-500',
    deny: 'text-rose-500',
  };

  return (
    <Card title={s.permissionsCenter.agentTitle} subtitle={s.permissionsCenter.agentSubtitle}>
      <p className="mb-2 text-xs text-text-secondary">{s.permissionsCenter.agentReadOnly}</p>
      {rows === null ? (
        <p className="text-sm text-text-secondary">{s.permissionsCenter.agentLoading}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-secondary">{s.permissionsCenter.agentEmpty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
            >
              <span className="min-w-0 truncate font-mono text-xs text-text-primary">{r.id}</span>
              <span className={`shrink-0 text-xs ${badge[r.decision]}`}>
                {s.permissionsCenter.decision[r.decision]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
