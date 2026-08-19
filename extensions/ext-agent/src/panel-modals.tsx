import { useEffect, useState } from 'react';
import { Modal } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';
import type { AgentStrings } from './i18n';
import type { AgentApprovalRequest, AgentPlanPreview, RiskTier } from './types';
import { BTN_GHOST, BTN_PRIMARY } from './panel-styles';

/** Escalating visual weight, so the six classes are distinguishable at a glance and not just by text.
 *  Token-styled (surface/border/text) rather than raw colours, so both themes stay consistent. */
const RISK_TONE: Readonly<Record<RiskTier, string>> = {
  read: 'border-border-subtle bg-surface-base text-text-secondary',
  'ui-write': 'border-border-subtle bg-surface-base text-text-primary',
  'data-egress': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  financial: 'border-amber-600/50 bg-amber-600/10 text-amber-800 dark:text-amber-200',
  credential: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  destructive: 'border-red-600/50 bg-red-600/10 text-red-800 dark:text-red-200',
};

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
  onRespond: (approved: boolean, remember?: boolean) => void;
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
  // Reset per approval id: a tick meant for one prompt must never carry into the next.
  const [remember, setRemember] = useState(false);
  const approvalId = approval?.approvalId ?? null;
  useEffect(() => { setRemember(false); }, [approvalId]);

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
          {approval.riskTier !== undefined && (
            <div className={`mt-3 rounded border px-2 py-1.5 ${RISK_TONE[approval.riskTier]}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                {a.riskClass.label}
              </p>
              <p className="text-sm font-medium">{a.riskClass[approval.riskTier].name}</p>
              <p className="text-xs opacity-80">{a.riskClass[approval.riskTier].desc}</p>
            </div>
          )}
          <p className="mt-3 font-mono text-sm text-text-primary">{approval.toolName}</p>
          <p className="text-xs text-text-secondary">{approval.reason}</p>
          <pre className="mt-2 max-h-24 overflow-auto rounded bg-surface-base p-2 text-xs text-text-secondary">
            {approval.argsPreview}
          </pre>
          {approval.biometric && <p className="mt-2 text-xs text-amber-600">{a.biometricNote}</p>}
          {/* Offered only when main says a grant here would be honoured — see `rememberSkill`. Off by
              default: a pre-ticked box is a permission taken, not given. */}
          {approval.rememberSkill !== undefined && (
            <label className="mt-3 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => { setRemember(e.target.checked); }}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm text-text-primary">
                  {a.grants.remember.replace('{skill}', approval.rememberSkill)}
                </span>
                <span className="block text-xs text-text-secondary">
                  {a.grants.rememberHint.replace('{days}', String(approval.rememberDays ?? 0))}
                </span>
              </span>
            </label>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => onRespond(false)} className={BTN_GHOST}>{a.deny}</button>
            <button type="button" onClick={() => onRespond(true, remember)} className={BTN_PRIMARY}>{a.approve}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
