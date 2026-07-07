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
 * HITL decision on a `block` verdict (a possible secret in the outbound request). Resolve `true` to
 * SEND anyway, `false` to cancel. Injected by the app (wired to the agent's approval modal). When NO
 * handler is installed the gateway fails CLOSED (throws) — a block never silently sends.
 */
export type EgressConfirmHandler = (findings: GatewayEgressFinding[]) => Promise<boolean>;

export interface EgressHandlers {
  /** Advisory notification on a warn verdict (request still sent). */
  onWarn?: EgressWarningHandler;
  /** HITL gate on a block verdict; absent → fail closed (throw). */
  confirmBlock?: EgressConfirmHandler;
}

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
  private static egressHandlers: EgressHandlers = {};

  static reset(): void {
    ModelGateway.providers.clear();
    ModelGateway.egressInspector = null;
    ModelGateway.egressHandlers = {};
  }

  static register(provider: ModelProvider): void {
    ModelGateway.providers.set(provider.id, provider);
  }

  /**
   * Install the Egress Firewall over every outbound model request. Idempotent; the app sets it per
   * run. `confirmBlock` gates a block-severity finding through HITL (resolve true to send); when it is
   * absent the gateway fails CLOSED (throws) so a block never silently sends. `onWarn` is advisory.
   */
  static setEgressInspector(inspector: EgressInspector | null, handlers: EgressHandlers = {}): void {
    ModelGateway.egressInspector = inspector;
    ModelGateway.egressHandlers = handlers;
  }

  /** The full outbound body an adapter transmits: every message's content PLUS each tool's
   *  name/description/inputSchema (adapters send tools too — inspect them, not just the messages). */
  private static egressPayload(req: CanonRequest): string {
    const parts = req.messages.map((m) => m.content);
    for (const t of req.tools ?? []) {
      parts.push(t.name, t.description, JSON.stringify(t.inputSchema));
    }
    return parts.join('\n');
  }

  /**
   * Inspect the serialized outbound payload before the request leaves the device. A block-severity
   * finding (secret token / private key) is routed to HITL (`confirmBlock`): the user chooses to send
   * or cancel; a cancel (or no handler installed → fail closed) THROWS before the provider is called.
   * A warn-severity finding (PII / encoded blob) is surfaced (`onWarn`) but allowed through.
   */
  private static async inspectEgress(req: CanonRequest): Promise<void> {
    const inspector = ModelGateway.egressInspector;
    if (inspector === null) return;
    const verdict = inspector(ModelGateway.egressPayload(req));
    if (verdict.decision === 'block') {
      const blockFindings = verdict.findings.filter((f) => f.severity === 'block');
      // Message carries only the redacted finding KINDS — never the payload or the raw secret.
      const kinds = [...new Set(blockFindings.map((f) => f.kind))].join(', ');
      const confirm = ModelGateway.egressHandlers.confirmBlock;
      if (confirm === undefined) {
        throw new AppError(GatewayMessages.egressBlocked(kinds), 403); // fail closed
      }
      const approved = await confirm(blockFindings);
      if (!approved) {
        throw new AppError(GatewayMessages.egressDenied(kinds), 403);
      }
      return; // user approved sending despite the finding
    }
    if (verdict.decision === 'warn') {
      ModelGateway.egressHandlers.onWarn?.(verdict.findings);
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

    // Egress Firewall (before the request leaves the device): a possible secret leak is routed to HITL
    // and throws if the user cancels (or fails closed with no handler); a warn is surfaced and allowed.
    await ModelGateway.inspectEgress(req);

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
