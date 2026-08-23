import { useState, type ReactNode } from 'react';
import { cn } from '@tepegoz/ui';
import type { AgentStrings } from './i18n';
import { AGENT_EFFORT_LEVELS } from './types';
import type { AgentAutonomy, AgentConfig, AgentEffort, AgentModelChoice } from './types';
import { AUTONOMY_ICON, CheckIcon, ChevronDown } from './panel-icons';
import { AUTONOMY_DISABLED, AUTONOMY_LEVELS_ALL } from './panel-state';

/**
 * The Agent composer's run-config menu (opened from the gear). Each setting — provider, model,
 * autonomy, effort — is its OWN collapsible dropdown row; one expands at a time. Rendered inside the
 * gear {@link Dropdown}'s single portal (the rows expand INLINE, not as nested portals), so there is no
 * portal-in-portal outside-click conflict. Selecting a value applies it immediately and keeps the menu
 * open, so several settings can be changed in one visit.
 */
type ConfigSection = 'provider' | 'model' | 'autonomy' | 'effort' | 'strictGuard';

/**
 * One picker entry's two lines: the KEY's own label on top, the provider (plus the key's last-4
 * fingerprint) underneath — so two keys of one provider are tellable apart. When the user named the key
 * after its provider, the secondary line drops the duplicate rather than printing "OpenAI · OpenAI".
 */
export function choiceLines(ch: AgentModelChoice): { title: string; sub: string } {
  const parts = ch.label === ch.providerLabel ? [] : [ch.providerLabel];
  if (ch.last4 !== undefined) parts.push(`…${ch.last4}`);
  return { title: ch.label, sub: parts.join(' · ') };
}

/** The single-line form used where there is only one line to spend (the collapsed row, the tooltip). */
export function choiceSummary(ch: AgentModelChoice): string {
  const { title, sub } = choiceLines(ch);
  return sub === '' ? title : `${title} · ${sub}`;
}

interface RunConfigMenuProps {
  t: AgentStrings;
  config: AgentConfig;
  /** Select a run target by {@link AgentModelChoice.id} (a stored key, or the on-device entry). */
  onChoice: (id: string) => void;
  onModel: (model: string) => void;
  onAutonomy: (level: AgentAutonomy) => void;
  onEffort: (level: AgentEffort) => void;
  /** S6: toggle the hardened inbound guard (PII stripped from page reads before the agent sees them). */
  onStrictGuard: (on: boolean) => void;
}

export function RunConfigMenu({
  t,
  config,
  onStrictGuard,
  onChoice,
  onModel,
  onAutonomy,
  onEffort,
}: RunConfigMenuProps) {
  const [open, setOpen] = useState<ConfigSection | null>(null);
  const toggle = (s: ConfigSection): void => {
    setOpen((cur) => (cur === s ? null : s));
  };

  const currentChoice = config.choices.find((c) => c.id === config.selectedId);
  const providerValue = currentChoice === undefined ? t.noKeys : choiceSummary(currentChoice);
  const models = currentChoice === undefined ? [] : config.models[currentChoice.provider];
  const modelValue =
    config.model === ''
      ? t.modelAuto
      : (models.find((m) => m.id === config.model)?.label ?? config.model);

  return (
    <div className="max-h-[60vh] w-full overflow-y-auto">
      {/* Run target — the API keys added under Settings → Providers & API keys, one row per KEY (in the
          vault's priority order), plus the on-device entry. Entries the runtime cannot drive yet (an
          unsupported provider, or local with no model) are shown but disabled: the user stored them, so
          hiding them would read as data loss. */}
      <Section
        label={t.provider}
        value={providerValue}
        open={open === 'provider'}
        onToggle={() => toggle('provider')}
      >
        {config.choices.map((ch) => {
          const { title, sub } = choiceLines(ch);
          return (
            <Option
              key={ch.id}
              selected={config.selectedId === ch.id}
              disabled={!ch.available}
              onClick={() => onChoice(ch.id)}
              {...(sub === '' ? {} : { desc: sub })}
            >
              {title}
            </Option>
          );
        })}
        {/* No key stored and no on-device model: say where keys come from instead of an empty menu. */}
        {config.choices.every((ch) => !ch.available) && (
          <p className="px-2 py-1.5 text-xs text-text-secondary">{t.noKeysHint}</p>
        )}
      </Section>

      {/* Model — provider-based. "Auto" clears the pin (per-task tier routing); the rest override all tiers. */}
      <Section
        label={t.modelLabel}
        value={modelValue}
        open={open === 'model'}
        onToggle={() => toggle('model')}
      >
        <Option selected={config.model === ''} onClick={() => onModel('')}>
          {t.modelAuto}
        </Option>
        {models.map((m) => (
          <Option key={m.id} selected={config.model === m.id} onClick={() => onModel(m.id)}>
            {m.label}
          </Option>
        ))}
      </Section>

      {/* Autonomy */}
      <Section
        label={t.autonomyLabel}
        value={t.autonomy[config.autonomy].title}
        open={open === 'autonomy'}
        onToggle={() => toggle('autonomy')}
      >
        {AUTONOMY_LEVELS_ALL.map((level) => {
          const Glyph = AUTONOMY_ICON[level];
          const disabled = AUTONOMY_DISABLED.has(level);
          return (
            <Option
              key={level}
              selected={config.autonomy === level}
              disabled={disabled}
              onClick={() => onAutonomy(level)}
              desc={t.autonomy[level].desc}
              icon={
                <Glyph
                  className={cn('h-4 w-4', disabled ? 'text-red-500/50' : 'text-text-secondary')}
                />
              }
            >
              {t.autonomy[level].title}
            </Option>
          );
        })}
      </Section>

      {/* Effort */}
      <Section
        label={t.effort.title}
        value={t.effort[config.effort].title}
        open={open === 'effort'}
        onToggle={() => toggle('effort')}
      >
        {AGENT_EFFORT_LEVELS.map((level) => (
          <Option
            key={level}
            selected={config.effort === level}
            onClick={() => onEffort(level)}
            desc={t.effort[level].desc}
          >
            {t.effort[level].title}
          </Option>
        ))}
      </Section>

      {/* Hardened reading (S6) — a security posture, so it reads as a plain on/off rather than a scale. */}
      <Section
        label={t.strictGuard.title}
        value={config.strictGuard ? t.strictGuard.on : t.strictGuard.off}
        open={open === 'strictGuard'}
        onToggle={() => toggle('strictGuard')}
      >
        <Option
          selected={!config.strictGuard}
          onClick={() => onStrictGuard(false)}
          desc={t.strictGuard.desc}
        >
          {t.strictGuard.off}
        </Option>
        <Option
          selected={config.strictGuard}
          onClick={() => onStrictGuard(true)}
          desc={t.strictGuard.desc}
        >
          {t.strictGuard.on}
        </Option>
      </Section>
    </div>
  );
}

/** One collapsible setting row: header (label + current value + chevron) that toggles its inline options. */
function Section({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          {label}
        </span>
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm text-text-primary">{value}</span>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 text-text-secondary transition-transform',
              open && 'rotate-180',
            )}
          />
        </span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

/** One option inside an expanded {@link Section}: optional leading glyph + label (+ desc), trailing check. */
function Option({
  selected,
  disabled = false,
  onClick,
  desc,
  icon,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  desc?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={cn(
        'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-surface-overlay',
      )}
    >
      {icon !== undefined && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-text-primary [overflow-wrap:anywhere]">{children}</span>
        {desc !== undefined && <span className="block text-xs text-text-secondary">{desc}</span>}
      </span>
      {selected && <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
    </button>
  );
}
