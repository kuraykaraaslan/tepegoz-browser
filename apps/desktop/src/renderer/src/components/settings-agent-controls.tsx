import { settingsDict } from '@tepegoz/settings-ui';
import { Card, Toggle } from '@tepegoz/ui';
import { agentDict } from '@tepegoz/ext-agent/i18n';
import { useT } from '@tepegoz/i18n/react';
import { SELECTABLE_AGENT_AUTONOMY_LEVELS } from '@tepegoz/shared-types';
import type { AgentEffort } from '@tepegoz/ext-agent/types';
import { AGENT_EFFORT_LEVELS } from '@tepegoz/desktop-ipc';
import type { Preferences } from '@tepegoz/desktop-ipc';
import { CrossLink, OptionList } from './settings-shared';

/**
 * Agent controls — the settings that decide how much the agent may do on its own.
 *
 * This section used to be a `ComingSoonCard` listing four things, three of which had already shipped
 * on other pages: the token cap under Cost, model routing on each API key, and per-tool permissions in
 * the Permissions Center. Only the fourth — the autonomy level — was genuinely missing from Settings,
 * and even that was already a real, main-enforced preference (`agentAutonomy`) with no surface outside
 * the Agent panel's own popover. So the page is now the two controls that belong to it plus honest
 * pointers to the three that live elsewhere.
 *
 * The level strings come from `@tepegoz/ext-agent`'s dictionary, not a second copy here: they describe
 * the agent extension's own concept, and two translations of "act without asking" that could drift is
 * exactly the risk a settings screen about autonomy must not take.
 */
export function AgentControlsSection({
  prefs,
  setPref,
}: {
  prefs: Preferences;
  setPref: (patch: Partial<Preferences>) => void;
}) {
  const s = useT(settingsDict);
  const a = useT(agentDict);

  // SELECTABLE, not every level the type admits: `dangerous` is reserved and deliberately not an
  // escalation — anything resolving to it is treated as `ask` — so listing it, even disabled, would
  // advertise a capability that does not exist (see `shared-types/agent-autonomy.ts`).
  const autonomyOptions = SELECTABLE_AGENT_AUTONOMY_LEVELS.map((level) => ({
    value: level,
    title: a.autonomy[level].title,
    desc: a.autonomy[level].desc,
  }));

  const effortOptions = AGENT_EFFORT_LEVELS.map((level) => ({
    value: level,
    title: a.effort[level].title,
    desc: a.effort[level].desc,
  }));

  return (
    <div className="space-y-6">
      <Card title={a.autonomyLabel} subtitle={s.agentControls.autonomyHint}>
        <OptionList<(typeof SELECTABLE_AGENT_AUTONOMY_LEVELS)[number]>
          name="agent-autonomy"
          value={
            prefs.agentAutonomy === 'dangerous'
              ? // A stale or doctored value resolves to `ask` in main; the screen must show the same
                // thing, or it would report a permission level that is not in force.
                'ask'
              : prefs.agentAutonomy
          }
          options={autonomyOptions}
          onChange={(level) => {
            setPref({ agentAutonomy: level });
          }}
        />
      </Card>

      <Card title={a.effort.title} subtitle={s.agentControls.effortHint}>
        <OptionList<AgentEffort>
          name="agent-effort"
          value={prefs.agentEffort}
          options={effortOptions}
          onChange={(level) => {
            setPref({ agentEffort: level });
          }}
        />
      </Card>

      <Card title={a.strictGuard.title}>
        <Toggle
          id="agent-strict-guard"
          label={a.strictGuard.title}
          description={a.strictGuard.desc}
          checked={prefs.agentStrictGuard}
          onChange={(value) => {
            setPref({ agentStrictGuard: value });
          }}
        />
      </Card>

      <Card title={s.agentControls.elsewhereTitle} subtitle={s.agentControls.elsewhereHint}>
        <ul className="space-y-2">
          <li>
            <CrossLink sectionId="cost">{s.agentControls.linkBudget}</CrossLink>
          </li>
          <li>
            <CrossLink sectionId="providers">{s.agentControls.linkRouting}</CrossLink>
          </li>
          <li>
            <CrossLink sectionId="site-permissions">{s.agentControls.linkPermissions}</CrossLink>
          </li>
        </ul>
      </Card>
    </div>
  );
}
