import { cn } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';
import type { AIProvider } from '@tepegoz/shared-types/providers';
import type { AgentStrings } from './i18n';
import type { AgentAutonomy, AgentConfig, AgentEffort, AgentSkill } from './types';
import { Dropdown } from './panel-dropdown';
import { RunConfigMenu } from './panel-run-config';
import { SkillsPicker } from './panel-skills';
import {
  CameraIcon,
  CloseIcon,
  CursorIcon,
  GearIcon,
  BackgroundIcon,
  PaperclipIcon,
  PauseIcon,
  PlayIcon,
  SendIcon,
  StopIcon,
} from './panel-icons';
import { NOTICE_STYLE, type Attachment, type GroupState, type Notice } from './panel-state';
import { ICON_BTN } from './panel-styles';

/**
 * The Agent panel's bottom section: the dynamic notices strip above the composer plus the composer form
 * itself (attachment chips, prompt textarea, attach buttons, run-config gear, and the pause/steer/stop/
 * send controls). Extracted from `panel.tsx` (ADR-0010 file-size split).
 */
interface PanelComposerProps {
  a: AgentStrings;
  c: Resources;
  notices: Notice[];
  onDismissNotice: (id: string) => void;
  attachments: Attachment[];
  expandedFiles: Set<string>;
  prompt: string;
  running: boolean;
  paused: boolean;
  config: AgentConfig | null;
  configTooltip: string;
  mutateActive: (fn: (s: GroupState) => GroupState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onPauseResume: () => void;
  /** Park the window and let the run continue (S8). Only offered while a run is live. */
  onContinueInBackground: () => void;
  removeAttachment: (id: string) => void;
  onAttachSelection: () => void;
  onAttachFiles: () => void;
  onAttachScreenshot: () => void;
  chooseProvider: (provider: AIProvider) => void;
  chooseModel: (model: string) => void;
  chooseAutonomy: (level: AgentAutonomy) => void;
  chooseEffort: (level: AgentEffort) => void;
  chooseStrictGuard: (on: boolean) => void;
  /** Skills library reads/writes. Notably absent: anything that could START a run.  */
  skillsApi: {
    listAgentSkills(): Promise<AgentSkill[]>;
    saveAgentSkill(input: { name: string; prompt: string }): Promise<AgentSkill[]>;
    deleteAgentSkill(id: string): Promise<AgentSkill[]>;
  };
  onUseSkill: (skill: AgentSkill) => void;
}

export function PanelComposer({
  a,
  c,
  notices,
  onDismissNotice,
  attachments,
  expandedFiles,
  prompt,
  running,
  paused,
  config,
  configTooltip,
  mutateActive,
  onSubmit,
  onCancel,
  onPauseResume,
  onContinueInBackground,
  removeAttachment,
  onAttachSelection,
  onAttachFiles,
  onAttachScreenshot,
  chooseProvider,
  chooseModel,
  chooseAutonomy,
  chooseEffort,
  chooseStrictGuard,
  skillsApi,
  onUseSkill,
}: PanelComposerProps) {
  return (
    <>
      {/* Notices strip */}
      {notices.length > 0 && (
        <div className="space-y-1.5 px-3 pt-2 pb-1">
          {notices.map((n) => (
            <div
              key={n.id}
              className={cn(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
                NOTICE_STYLE[n.severity],
              )}
            >
              <span className="flex-1">
                <span className="font-semibold">{n.title}</span> {n.body}
              </span>
              <button
                type="button"
                aria-label={c.window.close}
                onClick={() => onDismissNotice(n.id)}
                className="shrink-0 opacity-60 hover:opacity-100 focus-visible:outline-none"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        className="px-3 pt-1.5 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="rounded-lg border border-border bg-surface-raised focus-within:ring-2 focus-within:ring-border-focus">
          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-1 px-3 pt-2 pb-1">
              {attachments.map((att) => {
                const isFile = att.kind === 'file';
                const expanded = isFile && expandedFiles.has(att.id);
                return (
                  <div key={att.id} className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1 rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary self-start">
                      {att.kind === 'selection' && <CursorIcon className="h-3 w-3 shrink-0" />}
                      {att.kind === 'file' && <PaperclipIcon className="h-3 w-3 shrink-0" />}
                      {att.kind === 'screenshot' && <CameraIcon className="h-3 w-3 shrink-0" />}
                      {isFile ? (
                        <button
                          type="button"
                          onClick={() =>
                            mutateActive((s) => {
                              const next = new Set(s.expandedFiles);
                              if (next.has(att.id)) next.delete(att.id);
                              else next.add(att.id);
                              return { ...s, expandedFiles: next };
                            })
                          }
                          className="max-w-[14rem] truncate text-left underline-offset-2 hover:underline focus-visible:outline-none"
                        >
                          {att.label}
                        </button>
                      ) : (
                        <span className="max-w-[10rem] truncate">{att.label}</span>
                      )}
                      <button
                        type="button"
                        aria-label={a.attach.removeLabel}
                        onClick={() => removeAttachment(att.id)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-surface-base focus-visible:outline-none"
                      >
                        <CloseIcon className="h-2.5 w-2.5" />
                      </button>
                    </span>
                    {expanded && (
                      <pre className="max-h-40 overflow-auto rounded-md bg-surface-base px-2 py-1.5 text-xs text-text-secondary [overflow-wrap:anywhere] whitespace-pre-wrap">
                        {att.content}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <textarea
            rows={2}
            value={prompt}
            placeholder={running ? a.steerPlaceholder : a.runPlaceholder}
            aria-label={running ? a.steerPlaceholder : a.runPlaceholder}
            onChange={(e) => {
              const value = e.target.value;
              mutateActive((s) => ({ ...s, prompt: value }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="block w-full resize-none bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex min-w-0 items-center gap-0.5">
              {/* Attachment buttons */}
              <button
                type="button"
                title={a.attach.addSelection}
                aria-label={a.attach.addSelection}
                onClick={() => {
                  onAttachSelection();
                }}
                className={cn(ICON_BTN, 'p-1')}
              >
                <CursorIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={a.attach.addFile}
                aria-label={a.attach.addFile}
                onClick={() => {
                  onAttachFiles();
                }}
                className={cn(ICON_BTN, 'p-1')}
              >
                <PaperclipIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={a.attach.addScreenshot}
                aria-label={a.attach.addScreenshot}
                onClick={() => {
                  onAttachScreenshot();
                }}
                className={cn(ICON_BTN, 'p-1')}
              >
                <CameraIcon className="h-3.5 w-3.5" />
              </button>

              {/* Skills: pick a saved prompt. Fills the composer and stops — the send gesture stays human. */}
              <SkillsPicker api={skillsApi} labels={a.skills} prompt={prompt} onUse={onUseSkill} />

              <div className="mx-1 h-4 w-px bg-border" />

              {/* Run-config popover (gear): provider · model · autonomy · effort, each its own dropdown row. */}
              <Dropdown
                direction="up"
                menuClassName="w-72"
                ariaLabel={a.config}
                title={configTooltip}
                trigger={
                  <span className="flex items-center gap-1.5">
                    <GearIcon className="h-3.5 w-3.5 text-text-secondary" />
                    {a.config}
                  </span>
                }
              >
                {() =>
                  config === null ? (
                    <p className="px-2 py-2 text-xs text-text-secondary">{a.history.loading}</p>
                  ) : (
                    <RunConfigMenu
                      t={a}
                      config={config}
                      onProvider={chooseProvider}
                      onModel={chooseModel}
                      onAutonomy={chooseAutonomy}
                      onEffort={chooseEffort}
                      onStrictGuard={chooseStrictGuard}
                    />
                  )
                }
              </Dropdown>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {running && (
                <button
                  type="button"
                  onClick={onContinueInBackground}
                  aria-label={a.background}
                  title={a.background}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-text-primary hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <BackgroundIcon className="h-4 w-4" />
                </button>
              )}
              {running && (
                <button
                  type="button"
                  onClick={onPauseResume}
                  aria-label={paused ? a.resume : a.pause}
                  title={paused ? a.resume : a.pause}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-text-primary hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  {paused ? <PlayIcon className="h-4 w-4" /> : <PauseIcon className="h-4 w-4" />}
                </button>
              )}
              {running && prompt.trim().length === 0 && attachments.length === 0 ? (
                // Running with an empty composer → the primary button STOPS the run (square). Type
                // something and it becomes "steer" instead (fold the message into the live run).
                <button
                  type="button"
                  onClick={onCancel}
                  aria-label={a.stop}
                  title={a.stop}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-text-primary hover:bg-red-500/15 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <StopIcon className="h-3.5 w-3.5" />
                </button>
              ) : (
                // Idle → start the run; running WITH text → steer it into the live run.
                <button
                  type="submit"
                  disabled={prompt.trim().length === 0 && attachments.length === 0}
                  aria-label={running ? a.steer : a.send}
                  title={running ? a.steer : a.send}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <SendIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
