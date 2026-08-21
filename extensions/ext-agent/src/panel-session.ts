import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { AgentDeltaSchema } from '@tepegoz/shared-types';
import type { AgentAutonomy, AgentConfig, AgentHostApi } from './types';
import { createDeltaCoalescer } from './delta-coalescer';
import {
  appendLiveDelta,
  applyAgentEvent,
  emptyGroupState,
  stateFromConversation,
  type GroupState,
} from './panel-state';

/**
 * State container for the Agent panel: per-group session state (keyed by tab-group id), the active
 * group, run config, transient header UI flags, and every subscription/effect that keeps them in sync
 * with the host. Extracted from `panel.tsx` (ADR-0010 file-size split). Returns raw state plus the
 * `mutateGroup`/`mutateActive` helpers; behaviour handlers live in `useAgentActions`.
 */
export interface AgentSession {
  config: AgentConfig | null;
  setConfig: Dispatch<SetStateAction<AgentConfig | null>>;
  dismissedNotices: Set<string>;
  setDismissedNotices: Dispatch<SetStateAction<Set<string>>>;
  scheduleOpen: boolean;
  setScheduleOpen: Dispatch<SetStateAction<boolean>>;
  logExported: boolean;
  setLogExported: Dispatch<SetStateAction<boolean>>;
  exportError: string | null;
  setExportError: Dispatch<SetStateAction<string | null>>;
  activeGroupId: string | null;
  listRef: MutableRefObject<HTMLDivElement | null>;
  autonomy: AgentAutonomy;
  activeState: GroupState;
  mutateGroup: (groupId: string, fn: (s: GroupState) => GroupState) => void;
  mutateActive: (fn: (s: GroupState) => GroupState) => void;
  /**
   * How long the latest run took to produce its first visible fragment, in ms — measured in main from
   * run start and reported on the first delta. Null before any run has streamed. This is the S8
   * time-to-first-feedback metric: a felt-latency target judged by feel is not a target.
   */
  firstFeedbackMs: number | null;
}

export function useAgentSession(api: AgentHostApi): AgentSession {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(new Set());
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Transient "log saved" confirmation shown on the header star after a successful export.
  const [logExported, setLogExported] = useState(false);
  /** Time-to-first-feedback for the latest run, in ms. Null until a run streams (S8 DoD ≤1.5s p50). */
  const [firstFeedbackMs, setFirstFeedbackMs] = useState<number | null>(null);
  // Transient export failure message (surfaced so a blocked/failed export is never silent).
  const [exportError, setExportError] = useState<string | null>(null);

  // Active tab-group id — the agent session key.
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Per-group state: keyed by groupId.
  const [groupStates, setGroupStates] = useState<Map<string, GroupState>>(new Map());

  const listRef = useRef<HTMLDivElement | null>(null);
  // Display value only — it drives the mode dropdown's label. The approval DECISION is main's; there is
  // deliberately no ref mirroring it into the IPC subscriptions any more.
  const autonomy: AgentAutonomy = config?.autonomy ?? 'ask';

  // Helpers to read/mutate the active group's state.
  const activeState: GroupState =
    activeGroupId !== null
      ? (groupStates.get(activeGroupId) ?? emptyGroupState())
      : emptyGroupState();

  function mutateGroup(groupId: string, fn: (s: GroupState) => GroupState): void {
    setGroupStates((prev) => {
      const cur = prev.get(groupId) ?? emptyGroupState();
      const next = new Map(prev);
      next.set(groupId, fn(cur));
      return next;
    });
  }

  function mutateActive(fn: (s: GroupState) => GroupState): void {
    if (activeGroupId === null) return;
    mutateGroup(activeGroupId, fn);
  }

  // On mount: ensure the active tab is in a group and get the groupId.
  useEffect(() => {
    void api.ensureActiveGroup().then(
      (gid) => {
        setActiveGroupId(gid);
      },
      () => {
        /* no active tab */
      },
    );
  }, [api]);

  // Subscribe to active-group changes (when user switches tab groups).
  useEffect(() => {
    return api.onActiveGroupChange((gid) => {
      if (gid !== null) {
        // Ensure group exists in the state map (create empty entry if first visit).
        setGroupStates((prev) => {
          if (prev.has(gid)) return prev;
          const next = new Map(prev);
          next.set(gid, emptyGroupState());
          return next;
        });
      }
      setActiveGroupId(gid);
    });
  }, [api]);

  useEffect(() => {
    if (activeGroupId === null) return;
    let cancelled = false;
    void api.getCurrentAgentConversation(activeGroupId).then(
      (detail) => {
        if (cancelled || detail === null) return;
        mutateGroup(activeGroupId, () => stateFromConversation(detail));
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [api, activeGroupId]);

  // Subscribe to agent events, approvals, plan previews, and token usage.
  useEffect(() => {
    const offEvent = api.onAgentEvent((e) => {
      setGroupStates((prev) => {
        const gid = e.groupId;
        const cur = prev.get(gid) ?? emptyGroupState();
        const updated = applyAgentEvent(cur, e); // routes by runId; drops stragglers (returns cur unchanged)
        if (updated === cur) return prev;
        const next = new Map(prev);
        next.set(gid, updated);
        return next;
      });
    });

    // Streamed model fragments (ADR-0025): DISPLAY ONLY. Unsettled, unvalidated output — shown so the
    // user sees work happening, never parsed and never persisted (it lives outside `turns`).
    //
    // Batched at ~40ms (S8 PR1) rather than applied per fragment: a fast provider emits one every few
    // milliseconds, and a setState each would re-render the panel per token.
    const coalescer = createDeltaCoalescer((batch) => {
      setGroupStates((prev) => {
        let next: Map<string, GroupState> | null = null;
        for (const [groupId, text] of batch) {
          const cur = next?.get(groupId) ?? prev.get(groupId) ?? emptyGroupState();
          const updated = appendLiveDelta(cur, text);
          if (updated === cur) continue;
          next ??= new Map(prev);
          next.set(groupId, updated);
        }
        return next ?? prev;
      });
    });
    const offDelta = api.onAgentDelta((d) => {
      // Validated on arrival even though main sent it: the SENDER is trusted, the raw model text it
      // carries is not, and an unbounded fragment would grow this buffer without end.
      const parsed = AgentDeltaSchema.safeParse(d);
      if (!parsed.success) return;
      if (parsed.data.firstFeedbackMs !== undefined) {
        // Time-to-first-feedback (S8 DoD, ≤1.5s p50). Measured in main from run start, reported once,
        // and recorded here rather than eyeballed — a felt-latency target judged by feel is not a target.
        setFirstFeedbackMs(parsed.data.firstFeedbackMs);
      }
      coalescer.push(parsed.data.groupId, parsed.data.text);
    });

    // DISPLAY-ONLY. The renderer is untrusted, so it does NOT decide approvals — main reads the
    // autonomy level from its own preference store and simply never sends a request it has already
    // auto-approved. Anything that arrives here is a request main wants a HUMAN to answer; show it and
    // relay the click (panel-actions.ts), nothing more.
    const offApproval = api.onAgentApprovalRequest((req) => {
      setGroupStates((prev) => {
        const gid = req.groupId;
        const cur = prev.get(gid) ?? emptyGroupState();
        const next = new Map(prev);
        next.set(gid, { ...cur, approval: req });
        return next;
      });
    });

    const offPlan = api.onAgentPlanPreview((preview) => {
      setGroupStates((prev) => {
        const gid = preview.groupId;
        const cur = prev.get(gid) ?? emptyGroupState();
        const next = new Map(prev);
        next.set(gid, { ...cur, planPreview: preview, skipIds: new Set() });
        return next;
      });
    });

    const offTokens = api.onTokenUsage((usage) => {
      // Token usage is associated with the active group.
      setGroupStates((prev) => {
        const gid = activeGroupId;
        if (gid === null) return prev;
        const cur = prev.get(gid) ?? emptyGroupState();
        const next = new Map(prev);
        next.set(gid, { ...cur, tokens: usage });
        return next;
      });
    });

    void api.getAgentConfig().then(setConfig, () => {
      /* config unavailable */
    });
    return () => {
      coalescer.dispose();
      offEvent();
      offDelta();
      offApproval();
      offPlan();
      offTokens();
    };
  }, [api, activeGroupId]);

  // Auto-scroll conversation to bottom on new events.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [activeState.turns]);

  // Reset dismissed notices when autonomy changes.
  useEffect(() => {
    setDismissedNotices(new Set());
  }, [autonomy]);

  return {
    config,
    setConfig,
    dismissedNotices,
    setDismissedNotices,
    scheduleOpen,
    setScheduleOpen,
    logExported,
    setLogExported,
    exportError,
    setExportError,
    activeGroupId,
    listRef,
    autonomy,
    activeState,
    mutateGroup,
    mutateActive,
    firstFeedbackMs,
  };
}
