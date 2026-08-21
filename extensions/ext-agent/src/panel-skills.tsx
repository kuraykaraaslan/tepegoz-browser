import { useCallback, useEffect, useState } from 'react';
import { cn } from '@tepegoz/ui';
import type { AgentSkill } from './types';
import { Dropdown } from './panel-dropdown';
import { SkillsIcon, TrashIcon } from './panel-icons';
import { ICON_BTN } from './panel-styles';

/**
 * The skills library (S9 PR4): saved prompt **templates** in the composer's toolbar.
 *
 * The one property this component exists to preserve: **picking a skill fills the composer, and stops.**
 * It never calls `runAgent`. A saved prompt that starts itself would move the gesture that authorises a
 * task from the human to a stored row — which is precisely the thing memory must not be able to do. The
 * strings say "fills the box below", not "runs", for the same reason.
 *
 * `grantProfile` is shown as *what this skill expects*, never applied. The policy kernel is untouched by
 * what a skill claims about itself; every gated call is still asked for exactly as on a typed prompt.
 */

interface SkillsLabels {
  label: string;
  title: string;
  empty: string;
  loading: string;
  save: string;
  saveTitle: string;
  namePlaceholder: string;
  startUrl: string;
  grantProfile: string;
  hint: string;
  delete: string;
  saveEmpty: string;
}

const ROW =
  'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

export function SkillsPicker({
  api,
  labels,
  prompt,
  onUse,
}: {
  api: {
    listAgentSkills(): Promise<AgentSkill[]>;
    saveAgentSkill(input: { name: string; prompt: string }): Promise<AgentSkill[]>;
    deleteAgentSkill(id: string): Promise<AgentSkill[]>;
  };
  labels: SkillsLabels;
  /** The composer's current text — what "save this prompt as a skill" would store. */
  prompt: string;
  /** Fill the composer from a skill. Deliberately the ONLY thing selecting a skill can do. */
  onUse: (skill: AgentSkill) => void;
}) {
  const [skills, setSkills] = useState<AgentSkill[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const load = useCallback((): void => {
    void api.listAgentSkills().then(setSkills, () => {
      // A store that cannot be read is an empty library, never a broken panel: the composer still works.
      setSkills([]);
    });
  }, [api]);

  useEffect(load, [load]);

  const save = (close: () => void): void => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || prompt.trim().length === 0) return;
    void api.saveAgentSkill({ name: trimmed, prompt: prompt.trim() }).then(setSkills, load);
    setName('');
    setNaming(false);
    close();
  };

  return (
    <Dropdown
      direction="up"
      menuClassName="w-72"
      ariaLabel={labels.label}
      title={labels.title}
      showChevron={false}
      triggerClassName={cn(ICON_BTN, 'p-1')}
      trigger={<SkillsIcon className="h-3.5 w-3.5" />}
    >
      {(close) => (
        <div className="flex flex-col">
          <p className="px-2 py-1.5 text-[11px] leading-snug text-text-secondary">{labels.hint}</p>
          <div className="my-1 h-px bg-border" />

          {skills === null && (
            <p className="px-2 py-2 text-xs text-text-secondary">{labels.loading}</p>
          )}
          {skills !== null && skills.length === 0 && (
            <p className="px-2 py-2 text-xs text-text-secondary">{labels.empty}</p>
          )}
          {skills !== null && skills.length > 0 && (
            <ul className="max-h-64 overflow-y-auto">
              {skills.map((skill) => (
                <li key={skill.id} className="flex items-start gap-1">
                  <button
                    type="button"
                    className={cn(ROW, 'min-w-0 flex-1')}
                    onClick={() => {
                      onUse(skill);
                      close();
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-primary">{skill.name}</span>
                      {skill.startUrl !== undefined && (
                        <span className="block truncate text-[11px] text-text-secondary">
                          {labels.startUrl} {skill.startUrl}
                        </span>
                      )}
                      {skill.grantProfile !== undefined && (
                        <span className="block truncate text-[11px] text-text-secondary">
                          {labels.grantProfile} {skill.grantProfile}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={labels.delete}
                    title={labels.delete}
                    className={cn(ICON_BTN, 'mt-1.5 shrink-0 p-1')}
                    onClick={() => {
                      void api.deleteAgentSkill(skill.id).then(setSkills, load);
                    }}
                  >
                    <TrashIcon className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="my-1 h-px bg-border" />
          {naming ? (
            <div className="flex items-center gap-1 px-2 py-1.5">
              <input
                autoFocus
                value={name}
                maxLength={80}
                placeholder={labels.namePlaceholder}
                aria-label={labels.saveTitle}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    save(close);
                  }
                  if (e.key === 'Escape') {
                    setNaming(false);
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-border bg-surface-base px-2 py-1 text-xs text-text-primary placeholder:text-text-disabled focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
            </div>
          ) : (
            <button
              type="button"
              className={cn(ROW, 'text-xs text-text-secondary')}
              disabled={prompt.trim().length === 0}
              title={prompt.trim().length === 0 ? labels.saveEmpty : labels.save}
              onClick={() => {
                setNaming(true);
              }}
            >
              {labels.save}
            </button>
          )}
        </div>
      )}
    </Dropdown>
  );
}
