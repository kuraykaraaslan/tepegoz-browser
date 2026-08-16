export { default as PolicyKernel, type PolicyContext, type PolicyResult } from './policy-kernel';
export { isSensitiveSite } from './sensitive-site';
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
