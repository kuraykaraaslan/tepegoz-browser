import { foldForSearch } from '@tepegoz/i18n';
import {
  matchingCommands,
  OMNIBOX_COMMANDS,
  type OmniboxCommandId,
  type OmniboxCommandParse,
} from './omnibox-commands';
import type {
  OmniboxSuggestion,
  OmniboxSuggestLabels,
  OmniboxSuggestSources,
} from './omnibox-suggest';

/**
 * Suggestions for `@`-command mode. Split from `omnibox-suggest.ts` for the 250-line cap, and because
 * it is the one part of the omnibox with a different rule: command mode NEVER emits a navigate action,
 * so a stray Enter in `@…` cannot open a page.
 */

const MAX_PER_COMMAND = 8;

function describe(id: OmniboxCommandId, labels: OmniboxSuggestLabels): string {
  if (id === 'agent') return labels.commandAgent;
  if (id === 'download') return labels.commandDownload;
  return labels.commandSkill;
}

/** The discovery list for a partial `@…`. Without this, command mode is invisible. */
function commandMenu(typed: string, labels: OmniboxSuggestLabels): OmniboxSuggestion[] {
  return matchingCommands(typed).map((c) => ({
    key: `cmd:${c.id}`,
    kind: 'command' as const,
    title: c.prefix,
    subtitle: describe(c.id, labels),
    // Fills the box rather than running anything: the user still has to type an argument and press
    // Enter, so picking a command from a menu can never itself be the action.
    action: { type: 'fillCommand' as const, prefix: `${c.prefix} ` },
  }));
}

function agentSuggestions(term: string, labels: OmniboxSuggestLabels): OmniboxSuggestion[] {
  if (term.length === 0) {
    return [
      {
        key: 'agent:empty',
        kind: 'agent',
        title: OMNIBOX_COMMANDS[0]?.prefix ?? '@agent',
        subtitle: labels.agentEmpty,
        // No action worth taking with no task — but still not a navigate, so Enter does nothing
        // rather than opening a search for the word "@agent".
        action: { type: 'fillCommand', prefix: '@agent ' },
      },
    ];
  }
  return [
    {
      key: 'agent:run',
      kind: 'agent',
      title: labels.agentAsk.replace('{task}', term),
      // Says plainly that this leaves the deterministic surface. The user typed `@agent` on purpose;
      // they should still be told what it means before they press Enter.
      subtitle: labels.agentHint,
      action: { type: 'agentTask', task: term },
    },
  ];
}

function downloadSuggestions(
  sources: OmniboxSuggestSources,
  needle: string,
  labels: OmniboxSuggestLabels,
): OmniboxSuggestion[] {
  return (sources.downloads ?? [])
    .filter((d) => needle.length === 0 || foldForSearch(`${d.name} ${d.source}`).includes(needle))
    .slice(0, MAX_PER_COMMAND)
    .map((d) => ({
      key: `download:${d.id}`,
      kind: 'download' as const,
      title: d.name,
      subtitle: d.source.length > 0 ? d.source : labels.download,
      action: { type: 'openDownload' as const, id: d.id },
    }));
}

function skillSuggestions(
  sources: OmniboxSuggestSources,
  needle: string,
  labels: OmniboxSuggestLabels,
): OmniboxSuggestion[] {
  return (sources.skills ?? [])
    .filter(
      (s) =>
        needle.length === 0 || foldForSearch(`${s.name} ${s.description ?? ''}`).includes(needle),
    )
    .slice(0, MAX_PER_COMMAND)
    .map((s) => ({
      key: `skill:${s.id}`,
      kind: 'skill' as const,
      title: s.name,
      subtitle:
        s.description !== undefined && s.description.length > 0 ? s.description : labels.skill,
      action: { type: 'runSkill' as const, id: s.id },
    }));
}

/** Build the suggestions for a parsed command. Never returns a navigate action. */
export function commandSuggestions(
  parsed: OmniboxCommandParse,
  sources: OmniboxSuggestSources,
  labels: OmniboxSuggestLabels,
): OmniboxSuggestion[] {
  if (parsed.kind === 'none') return [];
  if (parsed.kind === 'partial') return commandMenu(parsed.typed, labels);

  const needle = foldForSearch(parsed.term);
  if (parsed.id === 'agent') return agentSuggestions(parsed.term, labels);

  const found =
    parsed.id === 'download'
      ? downloadSuggestions(sources, needle, labels)
      : skillSuggestions(sources, needle, labels);

  // An empty result SAYS so instead of collapsing to the ordinary navigate/search list. Falling back
  // there would silently turn "@download tax return" into a web search for it — the implicit routing
  // this whole mode is written to avoid, pointed the other way.
  if (found.length > 0) return found;
  return [
    {
      key: `${parsed.id}:empty`,
      kind: parsed.id,
      title: labels.commandNoResults,
      subtitle: describe(parsed.id, labels),
      action: { type: 'fillCommand', prefix: '' },
    },
  ];
}
