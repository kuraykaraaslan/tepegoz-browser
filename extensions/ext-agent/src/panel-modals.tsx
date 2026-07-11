import { Modal } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';
import type { AgentStrings } from './i18n';
import type { AgentApprovalRequest, AgentPlanPreview } from './types';
import { BTN_GHOST, BTN_PRIMARY } from './panel-styles';

/**
 * The Agent panel's two blocking dialogs: the plan-preview modal (approve/skip steps before a run) and
 * the HITL tool-approval modal. Extracted from `panel.tsx` (ADR-0010 file-size split).
 */
interface PanelModalsProps {
  a: AgentStrings;
  c: Resources;
  planPreview: AgentPlanPreview | null;
  approval: AgentApprovalRequest | null;
  skipIds: Set<string>;
  onRespondPlan: (approved: boolean) => void;
  onToggleStep: (id: string) => void;
  onRespond: (approved: boolean) => void;
}

export function PanelModals({
  a,
  c,
  planPreview,
  approval,
  skipIds,
  onRespondPlan,
  onToggleStep,
  onRespond,
}: PanelModalsProps) {
  return (
    <>
      {/* Plan preview modal */}
      {planPreview !== null && (
        <Modal open onClose={() => onRespondPlan(false)} title={a.planTitle} ariaLabel={a.planTitle} size="md" closeOnBackdrop={false}>
          <p className="mt-1 text-xs text-text-secondary">{a.planBody}</p>
          {planPreview.goal.length > 0 && <p className="mt-2 text-sm text-text-primary">{planPreview.goal}</p>}
          <ul className="mt-3 space-y-1.5 overflow-auto">
            {planPreview.steps.map((step, i) => (
              <li key={step.id}>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!skipIds.has(step.id)}
                    onChange={() => { onToggleStep(step.id); }}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="font-mono text-text-primary">{String(i + 1)}. {step.tool}</span>
                    {step.rationale.length > 0 && (
                      <span className="ml-1 break-words text-text-secondary">— {step.rationale}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => onRespondPlan(false)} className={BTN_GHOST}>{c.common.cancel}</button>
            <button type="button" onClick={() => onRespondPlan(true)} disabled={skipIds.size === planPreview.steps.length} className={BTN_PRIMARY}>
              {a.planRun}
            </button>
          </div>
        </Modal>
      )}

      {/* HITL approval modal */}
      {approval !== null && (
        <Modal open onClose={() => onRespond(false)} title={a.approvalTitle} ariaLabel={a.approvalTitle} size="sm" closeOnBackdrop={false}>
          <p className="mt-2 text-sm text-text-secondary">{a.approvalBody}</p>
          <p className="mt-3 font-mono text-sm text-text-primary">{approval.toolName}</p>
          <p className="text-xs text-text-secondary">{approval.reason}</p>
          <pre className="mt-2 max-h-24 overflow-auto rounded bg-surface-base p-2 text-xs text-text-secondary">
            {approval.argsPreview}
          </pre>
          {approval.biometric && <p className="mt-2 text-xs text-amber-600">{a.biometricNote}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => onRespond(false)} className={BTN_GHOST}>{a.deny}</button>
            <button type="button" onClick={() => onRespond(true)} className={BTN_PRIMARY}>{a.approve}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
