import { useEffect, useMemo, useState } from 'react';
import { type SettingsStrings } from '@tepegoz/settings-ui';
import { Badge, Button, Card, Input } from '@tepegoz/ui';
import { normalizeHostInput } from '@tepegoz/shared-types';
import {
  WEB_PERMISSION_CAPABILITIES,
  type SitePermissionState,
  type WebPermissionCapability,
} from '@tepegoz/shared-types';
import { explainPolicyReason, coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import type {
  AgentCapabilityRow,
  PermissionDecisionRecord,
  Preferences,
} from '@tepegoz/desktop-ipc';
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
              <span className="min-w-0 truncate text-text-secondary">{capabilityLabel(c, s)}</span>
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
            placeholder={s.permissionsCenter.addSitePlaceholder}
            value={newSite}
            onChange={(e) => {
              setNewSite(e.target.value);
            }}
          />
        </div>
        <Button
          size="sm"
          className="h-[38px]"
          disabled={!canAdd}
          onClick={() => {
            if (pendingOrigin === null) return;
            // Seeded with an explicit `prompt` on `notifications`, which is a real stored decision
            // rather than the absence of one — that is what makes the row exist at all. Seeding
            // `notifications` specifically (not `WEB_PERMISSION_CAPABILITIES[0]`, which is `camera`)
            // keeps the placeholder on the capability whose default already IS "ask", so the seeded
            // row reads identically to an unseeded one for every capability.
            onSet(pendingOrigin, 'notifications', 'prompt');
            setNewSite('');
          }}
        >
          {s.permissionsCenter.addSiteButton}
        </Button>
      </div>
      <p className="mt-1 text-xs text-text-secondary">{s.permissionsCenter.addSiteHint}</p>

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

/** Decision-kind badge tone, matching the live approval modal's escalation and `AgentPermissionMatrix`'s
 *  own `decisionVariant` above — the same three colours must mean the same thing everywhere in the app. */
const DEBUG_DECISION_VARIANT: Record<
  PermissionDecisionRecord['decision'],
  'success' | 'warning' | 'error'
> = {
  allow: 'success',
  ask: 'warning',
  deny: 'error',
};

/** One past decision: tool + site, the kernel's verdict, its reason (via the SAME lookup the live
 *  approval modal uses), and — for an `ask` — how it resolved and whether a standing permission
 *  answered it instead of a live prompt. */
function DecisionRow({ row, s }: { row: PermissionDecisionRecord; s: SettingsStrings }) {
  const c = useT(coreDict);
  const explained = explainPolicyReason(c, row.reason);
  // `ask` resolved: `outcome` says how. `allow`/`deny` are unconditional kernel verdicts — nobody was
  // asked, so there is nothing to have been "remembered" and the row says neither.
  const decisionForBadge = row.outcome === 'refused' ? 'deny' : row.decision;

  return (
    <li className="rounded-md border border-border px-3 py-2 text-xs">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-text-primary">{row.toolName}</span>
        <Badge variant={DEBUG_DECISION_VARIANT[decisionForBadge]} size="sm" dot>
          {row.outcome !== undefined
            ? s.permissionsCenter.debug.outcome[row.outcome]
            : s.permissionsCenter.decision[row.decision]}
        </Badge>
      </div>
      <p className="truncate text-text-secondary">
        {s.permissionsCenter.debug.site}:{' '}
        <span className="font-mono">{row.targetUrl ?? s.permissionsCenter.debug.noSite}</span>
      </p>
      <p className="mt-1 text-text-primary">{explained?.title ?? row.reason}</p>
      {row.decision === 'ask' && (
        <p className="mt-0.5 text-text-secondary">
          {row.rememberedBy !== undefined
            ? s.permissionsCenter.debug.rememberedBy[row.rememberedBy]
            : s.permissionsCenter.debug.askedLive}
        </p>
      )}
      <p className="mt-1 text-[10px] text-text-disabled">
        {new Date(row.ts).toLocaleString()} · {row.reason}
      </p>
    </li>
  );
}

/**
 * Permission Debug view (S8 PR7): for a chosen site/tool, a READ-ONLY history of what the Policy
 * Kernel decided — what was asked, what it decided, which reason code, and whether/why it did or did
 * not need a live prompt. Distinct from {@link AgentPermissionMatrix} above, which is the kernel's
 * live BASELINE verdict for a tool in the abstract; this is a record of concrete calls it already
 * judged, sourced from the Event Journal via `permissionDecisionHistory` — never a second decision
 * engine, exactly like the matrix it sits beside.
 */
export function PermissionDebugView({ s }: { s: SettingsStrings }) {
  const [site, setSite] = useState('');
  const [tool, setTool] = useState('');
  const [rows, setRows] = useState<PermissionDecisionRecord[] | null>(null);

  useEffect(() => {
    let live = true;
    // Debounced so a filter typed character-by-character does not fire an IPC round-trip per keystroke.
    const t = setTimeout(() => {
      void window.tepegoz
        .listPermissionDecisions({
          ...(site.trim().length > 0 ? { site: site.trim() } : {}),
          ...(tool.trim().length > 0 ? { tool: tool.trim() } : {}),
        })
        .then(
          (r) => {
            if (live) setRows(r);
          },
          () => {
            if (live) setRows([]);
          },
        );
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [site, tool]);

  return (
    <Card title={s.permissionsCenter.debug.title} subtitle={s.permissionsCenter.debug.subtitle}>
      <p className="mb-2 text-xs text-text-secondary">{s.permissionsCenter.debug.readOnly}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          id="permission-debug-site"
          label={s.permissionsCenter.debug.siteFilter}
          placeholder={s.permissionsCenter.debug.siteFilterPlaceholder}
          value={site}
          onChange={(e) => {
            setSite(e.target.value);
          }}
        />
        <Input
          id="permission-debug-tool"
          label={s.permissionsCenter.debug.toolFilter}
          placeholder={s.permissionsCenter.debug.toolFilterPlaceholder}
          value={tool}
          onChange={(e) => {
            setTool(e.target.value);
          }}
        />
      </div>
      {rows === null ? (
        <p className="mt-3 text-sm text-text-secondary">{s.permissionsCenter.debug.loading}</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">{s.permissionsCenter.debug.empty}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {rows.map((row, i) => (
            // ts+lsn are not unique alone across a busy run (two calls can share a millisecond); the
            // index disambiguates within this already-ordered, non-reordering list.
            <DecisionRow key={`${String(row.ts)}-${String(i)}`} row={row} s={s} />
          ))}
        </ul>
      )}
    </Card>
  );
}
