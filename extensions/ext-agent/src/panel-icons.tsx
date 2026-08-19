import type { ReactNode } from 'react';
import type { AgentAutonomy, AgentEvent } from './types';

/**
 * Inline SVG icons used by the Agent panel. Pure presentational components — no state, no logic.
 * Extracted from `panel.tsx` (ADR-0010 file-size split).
 */

export function Svg({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
export const SparkIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
    <path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7z" />
  </svg>
);
export const CloseIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const TrashIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a1 1 0 01-1 1H7a1 1 0 01-1-1V7m4 4v6m4-6v6" /></Svg>
);
export const SkillsIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H6.5A2.5 2.5 0 004 20.5zM19 18v3H6.5" /></Svg>
);
export const NewTaskIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M12 5v14M5 12h14" /></Svg>;
export const ScheduleIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M9 2h6" /></Svg>
);
export const HistoryIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M3 12a9 9 0 109-9M3 3v6h6M12 7v5l3 2" /></Svg>
);
export const SendIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>;
export const StopIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
export const PauseIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
);
export const PlayIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);
export const ChevronDown = ({ className }: { className?: string }) => <Svg className={className}><path d="M6 9l6 6 6-6" /></Svg>;
export const CheckIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M20 6L9 17l-5-5" /></Svg>;
export const AskIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M8 12V7a2 2 0 114 0M6 12V9a2 2 0 114 0m0-1a2 2 0 114 0v1m0-1a2 2 0 114 0v6a5 5 0 01-5 5h-2a5 5 0 01-4-2l-3-4a2 2 0 013-2l2 1.5" /></Svg>;
export const ActIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M4 5l7 7-7 7M13 5l7 7-7 7" /></Svg>;
export const AutoIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>
);
export const DangerousIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></Svg>
);
export const AUTONOMY_ICON: Record<AgentAutonomy, (p: { className?: string }) => ReactNode> = {
  ask: AskIcon,
  act: ActIcon,
  auto: AutoIcon,
  dangerous: DangerousIcon,
};
export const GaugeIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M12 13l3.5-3.5M4 19a8 8 0 1116 0" />
  </Svg>
);
/** Cog / settings gear — the composer's combined run-config control (model · autonomy · effort). */
export const GearIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Svg>
);
export const PaperclipIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></Svg>
);
export const CursorIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M4 4l7.07 17 2.51-7.39L21 11.07z" /></Svg>
);
export const CameraIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></Svg>
);

/** Dot color per event kind, used both in the collapsed "Progress" list and the response stream. */
export const KIND_DOT: Record<AgentEvent['kind'], string> = {
  plan: 'bg-text-secondary',
  decision: 'bg-indigo-400',
  step_start: 'bg-text-secondary',
  step_ok: 'bg-green-500',
  step_error: 'bg-red-500',
  awaiting_approval: 'bg-amber-500',
  input_action: 'bg-sky-400',
  handoff: 'bg-amber-500',
  grant: 'bg-amber-500',
  paused: 'bg-amber-500',
  resumed: 'bg-green-500',
  steered: 'bg-indigo-400',
  done: 'bg-green-600',
  error: 'bg-red-600',
};
