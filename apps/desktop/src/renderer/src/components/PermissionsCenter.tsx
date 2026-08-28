import { useEffect, useMemo, useState } from 'react';
import { type SettingsStrings } from '@tepegoz/settings-ui';
import { Badge, Button, Card, Input } from '@tepegoz/ui';
import { normalizeHostInput } from '@tepegoz/shared-types';
import {
  WEB_PERMISSION_CAPABILITIES,
  type SitePermissionState,
  type WebPermissionCapability,
} from '@tepegoz/shared-types';
import type { AgentCapabilityRow, Preferences } from '@tepegoz/desktop-ipc';
import { ConfirmAction } from './settings-confirm';
import { Select } from './settings-shared';

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
  onReset,
}: {
  origin: string;
  perms: Preferences['sitePermissions'][string] | undefined;
  s: SettingsStrings;
  onSet: (origin: string, capability: WebPermissionCapability, state: SitePermissionState) => void;
  onReset: (origin: string) => void;
}) {
  return (
    <li className="rounded-md border border-border px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate font-mono text-xs text-text-primary">{origin}</p>
        <ConfirmAction
          label={s.permissionsCenter.forgetSite}
          title={s.permissionsCenter.forgetSite}
          body={s.permissionsCenter.forgetSiteBody.replace('{origin}', origin)}
          confirmLabel={s.permissionsCenter.forgetSite}
          onConfirm={() => {
            onReset(origin);
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {WEB_PERMISSION_CAPABILITIES.map((c) => {
          // No entry means the site has never been asked about this capability, which behaves the
          // same as `prompt` and is displayed as it.
          const value: SitePermissionState = perms?.[c] ?? 'prompt';
          return (
            <div key={c} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-text-secondary">
                {capabilityLabel(c, s)}
              </span>
              <div className="w-28 shrink-0">
                <Select
                  id={`perm-${origin}-${c}`}
                  ariaLabel={`${origin} — ${capabilityLabel(c, s)}`}
                  value={value}
                  onChange={(next) => {
                    onSet(origin, c, next as SitePermissionState);
                  }}
                >
                  {STATES.map((st) => (
                    <option key={st} value={st}>
                      {s.permissionsCenter.state[st]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
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
  const [filter, setFilter] = useState('');
  const [newSite, setNewSite] = useState('');

  const origins = Object.keys(sitePermissions).sort((a, b) => a.localeCompare(b));
  const shown = origins.filter((o) => o.includes(filter.trim().toLowerCase()));

  // Adding a site up front was impossible: the list only ever grew from sites that had already asked,
  // so deciding about a site BEFORE visiting it — the one case where a standing "denied" is most
  // useful — had no path at all.
  const host = normalizeHostInput(newSite);
  const pendingOrigin = host === null ? null : `https://${host}`;
  const canAdd = pendingOrigin !== null && !origins.includes(pendingOrigin);

  return (
    <Card title={s.permissionsCenter.sitesTitle} subtitle={s.permissionsCenter.sitesSubtitle}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Input
            id="permissions-add-site"
            label={s.permissionsCenter.addSite}
            hint={s.permissionsCenter.addSiteHint}
            placeholder={s.permissionsCenter.addSitePlaceholder}
            value={newSite}
            onChange={(e) => {
              setNewSite(e.target.value);
            }}
          />
        </div>
        <Button
          size="sm"
          className="mb-1 h-[38px]"
          disabled={!canAdd}
          onClick={() => {
            const first = WEB_PERMISSION_CAPABILITIES[0];
            if (pendingOrigin === null || first === undefined) return;
            // Seeded with an explicit `prompt`, which is a real stored decision rather than the
            // absence of one — that is what makes the row exist at all.
            onSet(pendingOrigin, first, 'prompt');
            setNewSite('');
          }}
        >
          {s.permissionsCenter.addSiteButton}
        </Button>
      </div>

      {origins.length > 4 && (
        <div className="mt-4">
          <Input
            id="permissions-filter"
            label={s.permissionsCenter.filter}
            placeholder={s.permissionsCenter.filterPlaceholder}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
          />
        </div>
      )}

      {origins.length === 0 ? (
        // Says WHY it is empty. "No sites" reads like a broken list; "nothing has asked yet" is the
        // actual state, and it also tells the user this fills itself rather than needing setup.
        <p className="mt-4 text-sm text-text-secondary">{s.permissionsCenter.sitesEmpty}</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{s.noResults}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {shown.map((origin) => (
            <SiteRow
              key={origin}
              origin={origin}
              perms={sitePermissions[origin]}
              s={s}
              onSet={onSet}
              onReset={onReset}
            />
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
 *
 * The rows carry a `dangerClass` that the screen used to fetch and throw away. Grouping by it is the
 * difference between a flat list of tool ids and an answer to the question people actually bring here:
 * what can this thing do that I would not want done without being asked.
 */
export function AgentPermissionMatrix({ s }: { s: SettingsStrings }) {
  const [rows, setRows] = useState<AgentCapabilityRow[] | null>(null);
  const [filter, setFilter] = useState('');

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

  /** Design tokens, not raw palette classes — these carry the same meaning as every other status on
   *  the page and must change with the theme the way the rest of it does. */
  const decisionVariant: Record<AgentCapabilityRow['decision'], 'success' | 'warning' | 'error'> = {
    allow: 'success',
    ask: 'warning',
    deny: 'error',
  };

  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matched = (rows ?? []).filter((r) => r.id.toLowerCase().includes(q));
    const byClass = new Map<string, AgentCapabilityRow[]>();
    for (const row of matched) {
      const list = byClass.get(row.dangerClass) ?? [];
      list.push(row);
      byClass.set(row.dangerClass, list);
    }
    return [...byClass.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, filter]);

  return (
    <Card title={s.permissionsCenter.agentTitle} subtitle={s.permissionsCenter.agentSubtitle}>
      <p className="mb-2 text-xs text-text-secondary">{s.permissionsCenter.agentReadOnly}</p>
      {rows === null ? (
        <p className="text-sm text-text-secondary">{s.permissionsCenter.agentLoading}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-secondary">{s.permissionsCenter.agentEmpty}</p>
      ) : (
        <>
          <Input
            id="agent-capability-filter"
            label={s.permissionsCenter.filter}
            placeholder={s.permissionsCenter.agentFilterPlaceholder}
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
          />
          {groups.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">{s.noResults}</p>
          ) : (
            <div className="mt-3 space-y-4">
              {groups.map(([dangerClass, items]) => (
                <div key={dangerClass}>
                  <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {s.dangerLabels[dangerClass as keyof typeof s.dangerLabels] ?? dangerClass}
                    <span className="font-normal normal-case tracking-normal text-text-disabled">
                      {String(items.length)}
                    </span>
                  </p>
                  <ul className="space-y-1">
                    {items.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
                      >
                        <span className="min-w-0 truncate font-mono text-xs text-text-primary">
                          {r.id}
                        </span>
                        <Badge variant={decisionVariant[r.decision]} size="sm" dot>
                          {s.permissionsCenter.decision[r.decision]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
