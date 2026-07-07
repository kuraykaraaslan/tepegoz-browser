import { AppError } from '@tepegoz/libs';
import type { AIProvider } from '@tepegoz/shared-types';
import type { CanonRequest, CanonResponse, ModelProvider } from './types';
import { GatewayMessages } from './messages';
import { TokenLedger } from './token-ledger';

/**
 * Egress inspection seam (L8 defense-in-depth). The gateway stays a pure L7 transport — it does NOT
 * depend on the security-policy package; the app INJECTS an inspector (the Egress Firewall's
 * `inspectEgress`, structurally compatible with these shapes). Kept a seam so the outbound chokepoint
 * is protected without a layer inversion, and so tests can drive it without the policy layer.
 */
export interface GatewayEgressFinding {
  kind: string;
  severity: 'block' | 'warn';
  /** Redacted, length-annotated sample — the inspector NEVER returns the raw secret. */
  sample: string;
}
export interface GatewayEgressVerdict {
  decision: 'allow' | 'warn' | 'block';
  findings: GatewayEgressFinding[];
}
/** Inspect a serialized outbound payload for exfiltration signals. Pure; no I/O. */
export type EgressInspector = (payload: string) => GatewayEgressVerdict;
/** Notified on a `warn` verdict (PII / encoded blobs) — advisory, the request still goes out. */
export type EgressWarningHandler = (findings: GatewayEgressFinding[]) => void;

/**
 * The single entry point for every model call (L7), provider-agnostic. Enforces required
 * max_tokens + timeout (internal-ai-rules: no uncapped/untimed call), inspects the outbound payload
 * through the injected Egress Firewall (block secret exfiltration before the request leaves the
 * device), and records usage to the Token Ledger. Providers are registered via the provider pattern
 * and selected per request.
 */
export class ModelGateway {
  private static readonly providers = new Map<AIProvider, ModelProvider>();
  private static egressInspector: EgressInspector | null = null;
  private static egressWarn: EgressWarningHandler | null = null;

  static reset(): void {
    ModelGateway.providers.clear();
    ModelGateway.egressInspector = null;
    ModelGateway.egressWarn = null;
  }

  static register(provider: ModelProvider): void {
    ModelGateway.providers.set(provider.id, provider);
  }

  /**
   * Install the Egress Firewall over every outbound model request. Idempotent; the app sets it per
   * run. `warn` is called on a warn-severity verdict (advisory) — the request still proceeds.
   */
  static setEgressInspector(inspector: EgressInspector | null, warn?: EgressWarningHandler | null): void {
    ModelGateway.egressInspector = inspector;
    ModelGateway.egressWarn = warn ?? null;
  }

  /**
   * Inspect the serialized outbound payload (every message's content). A block-severity finding
   * (secret token / private key) throws BEFORE the provider is called — the request never leaves the
   * device. A warn-severity finding (PII / encoded blob) is surfaced but allowed through.
   */
  private static inspectEgress(req: CanonRequest): void {
    const inspector = ModelGateway.egressInspector;
    if (inspector === null) return;
    const payload = req.messages.map((m) => m.content).join('\n');
    const verdict = inspector(payload);
    if (verdict.decision === 'block') {
      // Message carries only the redacted finding KINDS — never the payload or the raw secret.
      const kinds = [
        ...new Set(verdict.findings.filter((f) => f.severity === 'block').map((f) => f.kind)),
      ].join(', ');
      throw new AppError(GatewayMessages.egressBlocked(kinds), 403);
    }
    if (verdict.decision === 'warn') {
      ModelGateway.egressWarn?.(verdict.findings);
    }
  }

  static async complete(req: CanonRequest): Promise<CanonResponse> {
    if (!Number.isInteger(req.maxTokens) || req.maxTokens <= 0) {
      throw new AppError(GatewayMessages.MaxTokensRequired, 400);
    }
    if (!Number.isInteger(req.timeoutMs) || req.timeoutMs <= 0) {
      throw new AppError(GatewayMessages.TimeoutRequired, 400);
    }

    const provider = ModelGateway.providers.get(req.provider);
    if (provider === undefined) {
      throw new AppError(GatewayMessages.noProviderRegistered(req.provider), 503);
    }

    // Egress Firewall (before the request leaves the device): a hard secret/key leak throws here and
    // the provider is never called; a warn is surfaced and allowed.
    ModelGateway.inspectEgress(req);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, req.timeoutMs);
    try {
      const res = await provider.complete(req, controller.signal);
      TokenLedger.record(provider.id, req.model, req.capability, res.usage);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
