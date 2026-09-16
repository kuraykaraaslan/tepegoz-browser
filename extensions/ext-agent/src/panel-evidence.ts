import type { CompletionEvidence } from '@tepegoz/shared-types';
import type { AgentStrings } from './i18n';

/**
 * Render the citations behind a completion-evidence verdict, for the evidence chip's tooltip (S4 → S8
 * PR2: "evidence chips resolve to their citations"). The chip's own label ("Checked" / "Unconfirmed" /
 * "Contradicted") only ever told a user THAT a rule fired; this is the record it fired on — one line
 * per item, in the order the run observed them. Returns '' when there is nothing to cite (an empty
 * evidence bundle, e.g. a pure read task with `mutating: false`), so the caller can fall back to the
 * plain category hint rather than showing an empty citation block.
 */
export function describeEvidence(evidence: CompletionEvidence, a: AgentStrings): string {
  if (evidence.items.length === 0) return '';
  return evidence.items
    .map((item) => {
      const kind = a.evidence.kind[item.kind];
      const verdict = a.evidence.verdict[item.verdict];
      return `${kind}: ${verdict} — ${item.detail}`;
    })
    .join('\n');
}

/**
 * The evidence chip's tooltip: the plain category hint, plus the citations behind it when there are
 * any. The chip's own label already says WHAT the verdict was; the tooltip's job is to say WHY.
 */
export function evidenceChipTitle(
  hint: string,
  evidence: CompletionEvidence | undefined,
  a: AgentStrings,
): string {
  const citations = evidence !== undefined ? describeEvidence(evidence, a) : '';
  return citations.length > 0 ? `${hint}\n\n${citations}` : hint;
}
