import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import {
  buildOmniboxSuggestions,
  parseOmniboxCommand,
  parseOmniboxQuery,
  type OmniboxBookmarkCandidate,
  type OmniboxSuggestion,
  type OmniboxSuggestLabels,
} from '@tepegoz/omnibox';
import type { TabsState } from '@tepegoz/desktop-ipc';
import { AGENT_PANEL_OPEN_KEY } from './agent-dock';

/** Re-exported from the package so the host and the builder cannot drift on the label set. */
export type { OmniboxSuggestLabels } from '@tepegoz/omnibox';

export interface OmniboxHistoryResult {
  onOmniboxSuggest: (query: string) => Promise<OmniboxSuggestion[]>;
  onActivateTabFromOmnibox: (tabId: string) => void;
  /** `@agent <task>` — the one omnibox path that crosses into AI, and only from an explicit prefix. */
  onAgentTaskFromOmnibox: (task: string) => void;
  /** `@skill <name>` — runs the skill's own stored prompt, never text the omnibox invented. */
  onRunSkillFromOmnibox: (id: string) => void;
  /** `@download <query>` — opens the downloads page. */
  onOpenDownloadFromOmnibox: (id: string) => void;
}

/** The host of a download's source URL, or the raw string when it will not parse. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 80);
  }
}

/**
 * Omnibox suggestions (history + bookmarks + open tabs + navigate/search) and the `tepegoz://history`
 * page's data-source bindings. Split out of `App.tsx` (ADR-0010 250-line cap).
 */
export function useOmniboxAndHistory(
  tabsRef: MutableRefObject<TabsState>,
  labels: OmniboxSuggestLabels,
  bookmarksRef: MutableRefObject<OmniboxBookmarkCandidate[]>,
  onCloseSurface: () => void,
): OmniboxHistoryResult {
  // Ref keeps the injected callback stable so the Omnibox effect doesn't refetch every render; mirrors
  // latest state.
  const suggestLabelsRef = useRef(labels);
  /** The skills the last `@skill` fetch saw, so running one can use its stored PROMPT rather than the
   *  name the dropdown displayed. */
  const skillsRef = useRef<{ id: string; prompt: string }[]>([]);
  useEffect(() => {
    suggestLabelsRef.current = labels;
  }, [labels]);

  const onOmniboxSuggest = useCallback(
    async (query: string): Promise<OmniboxSuggestion[]> => {
      // `@`-command mode needs different sources and must not touch history at all — searching
      // history for "@agent book a flight" would be a wasted round trip whose results are discarded.
      const command = parseOmniboxCommand(query);
      const inCommandMode = command.kind !== 'none';

      const { term } = parseOmniboxQuery(query);
      let history: Awaited<ReturnType<typeof window.tepegoz.searchHistory>> = [];
      if (!inCommandMode) {
        try {
          history =
            term.length > 0
              ? await window.tepegoz.searchHistory({ query: term, forOmnibox: true })
              : [];
        } catch {
          history = []; // history unavailable → still surface tabs/bookmarks + navigate/search
        }
      }

      // Fetched only in the mode that uses them. Both degrade to an empty list rather than throwing:
      // a command that finds nothing SAYS so, which is a better answer than a broken dropdown.
      let downloads: { id: string; name: string; source: string }[] = [];
      let skills: { id: string; name: string; description?: string }[] = [];
      if (command.kind === 'command' && command.id === 'download') {
        try {
          downloads = (await window.tepegoz.listDownloads()).map((d) => ({
            id: d.id,
            name: d.filename,
            // The origin it came from, which is what a user searching their downloads remembers when
            // the file name does not help. Falls back to the raw URL if it will not parse.
            source: hostOf(d.url),
          }));
        } catch {
          downloads = [];
        }
      }
      if (command.kind === 'command' && command.id === 'skill') {
        try {
          // Tombstoned skills are deleted; showing them would offer to run something that is gone.
          const records = (await window.tepegoz.listAgentSkills()).filter((sk) => !sk.tombstone);
          skillsRef.current = records.map((sk) => ({ id: sk.id, prompt: sk.prompt }));
          skills = records.map((sk) => ({
            id: sk.id,
            name: sk.name,
            description: sk.startUrl ?? '',
          }));
        } catch {
          skills = [];
        }
      }

      const state = tabsRef.current;
      return buildOmniboxSuggestions(
        query,
        {
          // Don't offer switching to the tab that's already active.
          tabs: state.tabs
            .filter((tb) => tb.id !== state.activeId)
            .map((tb) => ({
              id: tb.id,
              title: tb.title,
              url: tb.url,
              faviconUrl: tb.faviconUrl,
            })),
          history: history.map((h) => ({
            url: h.url,
            title: h.title,
            visitCount: h.visitCount,
            faviconUrl: h.favicon,
          })),
          bookmarks: bookmarksRef.current,
          downloads,
          skills,
        },
        suggestLabelsRef.current,
      );
    },
    [tabsRef, bookmarksRef],
  );

  /**
   * Start an agent run from the omnibox, in a way the user can SEE.
   *
   * Three steps, and the middle one is the point: ensure a group exists, **open its Agent Console**,
   * then start the run. Firing a run without opening the console would hand a task to something
   * invisible — the user would have typed a sentence and watched nothing happen, which is a worse
   * failure than not having the command at all.
   *
   * Never throws out of the omnibox: a run that cannot start leaves the console open, which is where
   * the error belongs and where the user is already looking.
   */
  const startAgentRun = useCallback(
    (prompt: string, skillId?: string): void => {
      onCloseSurface();
      void window.tepegoz.ensureActiveGroup().then(
        (groupId) => {
          window.tepegoz.updateTabGroup(groupId, { settings: { [AGENT_PANEL_OPEN_KEY]: true } });
          void window.tepegoz
            .runAgent({ prompt, groupId, ...(skillId === undefined ? {} : { skillId }) })
            .catch(() => undefined);
        },
        () => undefined,
      );
    },
    [onCloseSurface],
  );

  const onAgentTaskFromOmnibox = useCallback(
    (task: string): void => {
      startAgentRun(task);
    },
    [startAgentRun],
  );

  const onRunSkillFromOmnibox = useCallback(
    (id: string): void => {
      // The skill's OWN prompt is what runs. The omnibox knows the skill's name, not its instructions,
      // and sending the name as a prompt would quietly turn "run my saved skill" into "ask the agent
      // about a word".
      const skill = skillsRef.current.find((sk) => sk.id === id);
      if (skill === undefined) return;
      startAgentRun(skill.prompt, skill.id);
    },
    [startAgentRun],
  );

  const onOpenDownloadFromOmnibox = useCallback((): void => {
    onCloseSurface();
    window.tepegoz.navigateTab('tepegoz://downloads');
  }, [onCloseSurface]);

  const onActivateTabFromOmnibox = useCallback(
    (tabId: string): void => {
      onCloseSurface();
      window.tepegoz.activateTab(tabId);
    },
    [onCloseSurface],
  );

  return {
    onOmniboxSuggest,
    onActivateTabFromOmnibox,
    onAgentTaskFromOmnibox,
    onRunSkillFromOmnibox,
    onOpenDownloadFromOmnibox,
  };
}
