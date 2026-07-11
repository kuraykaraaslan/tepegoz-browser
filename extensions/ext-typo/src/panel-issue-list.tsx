import { useT } from '@tepegoz/i18n/react';
import { typoDict } from './i18n';
import { BOX, BTN_GHOST } from './panel-styles';
import type { TypoCheckResult, TypoIssue } from './types';

export function IssueList({
  result,
  onIgnore,
}: Readonly<{
  result: TypoCheckResult | null;
  onIgnore?: (issue: TypoIssue) => void;
}>) {
  const x = useT(typoDict);
  if (result === null) return null;
  if (result.issues.length === 0) {
    return <p className="text-sm text-text-secondary">{x.noIssues}</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {x.issues}
        </h3>
        <span className="text-xs text-text-tertiary">
          {x.sources}: {result.sourcesUsed.join(', ')}
        </span>
      </div>
      <ul className="space-y-1.5">
        {result.issues.slice(0, 20).map((issue) => (
          <li key={issue.id} className={BOX}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{issue.text}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{issue.message}</p>
              </div>
              <span className="shrink-0 rounded bg-surface-overlay px-1.5 py-0.5 text-[11px] text-text-tertiary">
                {issue.source}
              </span>
            </div>
            {issue.suggestions.length > 0 ? (
              <p className="mt-2 text-xs text-text-secondary">{issue.suggestions.join(', ')}</p>
            ) : null}
            {onIgnore !== undefined ? (
              <button
                type="button"
                className={`${BTN_GHOST} mt-2`}
                onClick={() => {
                  onIgnore(issue);
                }}
              >
                {x.addIgnored}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
