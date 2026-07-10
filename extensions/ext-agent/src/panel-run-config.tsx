import { useState, type ReactNode } from 'react';
import { cn } from '@tepegoz/ui';
import type { AIProvider } from '@tepegoz/shared-types/providers';
import type { AgentStrings } from './i18n';
import { AGENT_EFFORT_LEVELS } from './types';
import type { AgentAutonomy, AgentConfig, AgentEffort } from './types';
import { AUTONOMY_ICON, CheckIcon, ChevronDown } from './panel-icons';
import { AUTONOMY_DISABLED, AUTONOMY_LEVELS_ALL } from './panel-state';

/**
 * The Agent composer's run-config menu (opened from the gear). Each setting — provider, model,
 * autonomy, effort — is its OWN collapsible dropdown row; one expands at a time. Rendered inside the
 * gear {@link Dropdown}'s single portal (the rows expand INLINE, not as nested portals), so there is no
 * portal-in-portal outside-click conflict. Selecting a value applies it immediately and keeps the menu
 * open, so several settings can be changed in one visit.
 */
type ConfigSection = 'provider' | 'model' | 'autonomy' | 'effort';

interface RunConfigMenuProps {
  t: AgentStrings;
  config: AgentConfig;
  onProvider: (provider: AIProvider) => void;
  onModel: (model: string) => void;
  onAutonomy: (level: AgentAutonomy) => void;
  onEffort: (level: AgentEffort) => void;
}

export function RunConfigMenu({
  t,
  config,
  onProvider,
  onModel,
  onAutonomy,
  onEffort,
}: RunConfigMenuProps) {
  const [open, setOpen] = useState<ConfigSection | null>(null);
  const toggle = (s: ConfigSection): void => {
    setOpen((cur) => (cur === s ? null : s));
  };

  const currentChoice = config.choices.find((c) => c.provider === config.provider);
  const providerValue = currentChoice
    ? currentChoice.keyLabel !== undefined
      ? `${currentChoice.label} · ${currentChoice.keyLabel}`
      : currentChoice.label
    : t.modelLabel;
  const models = currentChoice?.models ?? [];
  const modelValue =
    config.model === '' ? t.modelAuto : (models.find((m) => m.id === config.model)?.label ?? config.model);

  return (
    <div className="max-h-[60vh] w-full overflow-y-auto">
      {/* Provider — every provider is listed; unusable ones (no key / no local model) are disabled. */}
      <Section label={t.provider} value={providerValue} open={open === 'provider'} onToggle={() => toggle('provider')}>
        {config.choices.map((ch) => (
          <Option
            key={ch.provider}
            selected={config.provider === ch.provider}
            disabled={!ch.available}
            onClick={() => onProvider(ch.provider)}
          >
            {ch.keyLabel !== undefined ? `${ch.label} · ${ch.keyLabel}` : ch.label}
          </Option>
        ))}
      </Section>

      {/* Model — provider-based. "Auto" clears the pin (per-task tier routing); the rest override all tiers. */}
      <Section label={t.modelLabel} value={modelValue} open={open === 'model'} onToggle={() => toggle('model')}>
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
                <Glyph className={cn('h-4 w-4', disabled ? 'text-red-500/50' : 'text-text-secondary')} />
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
          <ChevronDown className={cn('h-3 w-3 shrink-0 text-text-secondary transition-transform', open && 'rotate-180')} />
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
