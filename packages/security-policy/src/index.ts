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
export { isSameSite, registrableDomain, registrableDomainOfHost } from './registrable-domain';
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
export {
  routeExecution,
  type ExecutionBackend,
  type ExecutionDecision,
  type ExecutionRequest,
} from './execution-router';
export { clearsCredentialVault, planSiteClear, type SiteClearContext } from './site-data';
export { mayOpenDevTools, type DevToolsVerdict } from './devtools-policy';
export {
  assertFailClosed,
  BLACKHOLE_PROXY_CONFIG,
  isValidSocksPort,
  proxyResolutionIsTunneled,
  tunnelProxyConfig,
  UnsafeProxyConfigError,
  TUNNEL_BYPASS_RULES,
  TUNNEL_WEBRTC_POLICY,
  type ProxyRejectionReason,
  type TunnelProxyConfig,
} from './egress-proxy';
export {
  killSwitchVerdicts,
  tabsBlockedByDrop,
  type ConnectionStatus,
  type KillSwitchReason,
  type KillSwitchVerdict,
  type TabEgressQuery,
} from './kill-switch';
export {
  mandateCovers,
  consumeMandate,
  type MandateCoverage,
  type MandateDenialReason,
  type MandateConsumptionRecord,
  type ConsumptionVerdict,
} from './mandate-kernel';
export {
  bundleNarrows,
  bundleChainNarrows,
  type NarrowingVerdict,
  type NarrowingViolation,
} from './policy-bundle-narrowing';
export {
  tokenCovers,
  withinRateLimit,
  type AgentEndpointDenialReason,
  type AgentEndpointRequest,
  type AgentEndpointVerdict,
} from './agent-endpoint-gate';
export {
  KAMU_DOMAINS,
  classifyKamuStep,
  isKamuDomain,
  type KamuStepRequest,
  type KamuVerdict,
} from './kamu-policy';
export { checkLocalePackParity, type LocalePackParity } from './locale-pack-parity';
export {
  evaluateSupplyChain,
  declaredWithinRequestedScope,
  declaredVsActualMismatch,
  type InstallTier,
  type SupplyChainVerdict,
} from './supply-chain-gate';
export * from './safe-browsing';
export * from './safe-browsing-canonical';
export * from './policy-reasons';
