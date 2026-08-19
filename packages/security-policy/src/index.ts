export { default as PolicyKernel, type PolicyContext, type PolicyResult } from './policy-kernel';
export {
  isSensitiveSite,
  sensitiveCategory,
  SENSITIVE_CATEGORIES,
  SensitiveCategorySchema,
  type SensitiveCategory,
} from './sensitive-site';
export {
  classifyRisk,
  type RiskClassification,
  type RiskClassificationContext,
} from './risk-classifier';
export {
  isSameSite,
  registrableDomain,
  registrableDomainOfHost,
} from './registrable-domain';
export {
  default as PlanGrantStore,
  type GrantCoverage,
  type GrantCoverageQuery,
  type PlanGrant,
} from './plan-grants';
export {
  REMEMBERED_GRANT_DAYS,
  canRemember,
  coversRemembered,
  rememberedGrantExpiry,
  type RememberedCoverageQuery,
  type RememberedGrantView,
} from './remembered-grants';
export {
  resolveAutonomy,
  type AutonomyGateDecision,
  type AutonomyGateResult,
} from './autonomy-gate';
export {
  detectHandoff,
  HANDOFF_KINDS,
  type HandoffKind,
  type HandoffSignal,
} from './handoff-detector';
export {
  default as TaintTracker,
  argsAreTainted,
  findTaintedValues,
  isUntrustedProvenance,
  PROVENANCE_LEVELS,
  type Provenance,
} from './taint-tracker';
export {
  default as EgressFirewall,
  inspectEgress,
  shannonEntropy,
  EGRESS_FINDING_KINDS,
  type EgressFinding,
  type EgressFindingKind,
  type EgressSeverity,
  type EgressDecision,
  type EgressVerdict,
} from './egress-firewall';
export {
  setOsAuthGate,
  hasOsAuthGate,
  requireOsAuth,
  matchCredential,
  type OsAuthGate,
  type StoredCredentialRef,
  type CredentialMatch,
} from './credential-broker';
