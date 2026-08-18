import { AppError } from '@tepegoz/libs';
import { CanonMessageContentSchema, type AIProvider } from '@tepegoz/shared-types';
import type { CanonRequest, CanonResponse, ModelDeltaSink, ModelProvider } from './types';
import { egressTextOf } from './content';
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
  /**
   * Active per-run model pin (Agent panel Model dropdown). When set, EVERY request this run makes —
   * plan, exec, and cheap classify alike — is routed to this provider+model instead of the router's
   * per-tier choice. Read live on each {@link complete} call, so changing it mid-run takes effect on the
   * very next request. The app sets it at run start, updates it when the user switches model, and CLEARS
   * it when the run ends (it's a process-global singleton shared with other model callers).
   */
  private static modelOverride: { provider: AIProvider; model: string } | null = null;

  static reset(): void {
    ModelGateway.providers.clear();
    ModelGateway.egressInspector = null;
    ModelGateway.egressHandlers = {};
    ModelGateway.modelOverride = null;
  }

  static register(provider: ModelProvider): void {
    ModelGateway.providers.set(provider.id, provider);
  }

  /**
   * Whether the adapter registered for `provider` maps tools onto the vendor's native tool-calling API.
   * False for an unregistered provider — an absent adapter cannot support anything, and the caller's
   * next step on false (the JSON-in-text path) is the safe one either way.
   *
   * Read through the same per-run model pin `complete` applies, so a run pinned to a JSON-only model
   * cannot be told it is on the native path.
   */
  static supportsNativeTools(provider: AIProvider): boolean {
    const pin = ModelGateway.modelOverride;
    const effective = pin !== null && ModelGateway.providers.has(pin.provider) ? pin.provider : provider;
    return ModelGateway.providers.get(effective)?.supportsNativeTools === true;
  }

  /** True when an adapter for `provider` is registered for the current run — the app checks this before
   *  pushing a live override so it never pins a model whose provider isn't wired up (would 503). */
  static isProviderRegistered(provider: AIProvider): boolean {
    return ModelGateway.providers.has(provider);
  }

  /**
   * Pin (or clear, with `null`) the model for every subsequent request. Applied self-healingly in
   * {@link complete}: if the pinned provider has no registered adapter the pin is ignored and the
   * request falls back to its router-chosen model, so a stale/cross-provider pin never fails a call.
   */
  static setModelOverride(override: { provider: AIProvider; model: string } | null): void {
    ModelGateway.modelOverride = override;
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

  /**
   * Run the adapter, streaming when both the caller asked for it and the adapter can. An adapter with no
   * streaming path still gets its settled text to the sink — as ONE delta, after the fact. That is the
   * honest shape of "this provider cannot stream": the UI sees the output no earlier than it exists.
   */
  private static async callProvider(
    provider: ModelProvider,
    req: CanonRequest,
    signal: AbortSignal,
    onDelta?: ModelDeltaSink,
  ): Promise<CanonResponse> {
    if (onDelta === undefined) return provider.complete(req, signal);
    if (provider.completeStream !== undefined) {
      return provider.completeStream(req, signal, onDelta);
    }
    const res = await provider.complete(req, signal);
    if (res.text.length > 0) onDelta(res.text);
    return res;
  }

  /**
   * Validate the widened message content at the trust boundary. `content` is now a union, and blocks
   * arrive from callers that assemble them from tool results and captured images — untrusted shapes by
   * the same argument that makes every other boundary here `safeParse`d.
   *
   * A plain string takes a `typeof` fast path: a string has no shape left to check, and the messages
   * flowing through this loop carry whole page dumps every step, so re-walking them through zod would
   * cost real time to prove something already known.
   */
  private static validateContent(req: CanonRequest): void {
    for (const m of req.messages) {
      if (typeof m.content === 'string') continue;
      const parsed = CanonMessageContentSchema.safeParse(m.content);
      if (!parsed.success) {
        throw new AppError(GatewayMessages.invalidContent(m.role, parsed.error.issues[0]?.message ?? ''), 400);
      }
    }
  }

  /** The full outbound body an adapter transmits: every message's content PLUS each tool's
   *  name/description/inputSchema (adapters send tools too — inspect them, not just the messages).
   *  Block content contributes its text, tool arguments and tool results — see {@link egressTextOf}
   *  for why raw image bytes are the one thing deliberately left out. */
  private static egressPayload(req: CanonRequest): string {
    const parts = req.messages.map((m) => egressTextOf(m.content));
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

  /**
   * Stream a model call: identical guards, identical settled result as {@link complete}, plus output
   * fragments delivered to `onDelta` as they arrive.
   *
   * The invariant this exists to preserve (ADR-0025): a delta may reach the RENDERER; only the settled,
   * validated response reaches the Journal or the decision path. Nothing in this method feeds a delta
   * anywhere but the caller's sink.
   */
  static generateStream(req: CanonRequest, onDelta: ModelDeltaSink): Promise<CanonResponse> {
    return ModelGateway.dispatch(req, onDelta);
  }

  static complete(req: CanonRequest): Promise<CanonResponse> {
    return ModelGateway.dispatch(req);
  }

  private static async dispatch(req: CanonRequest, onDelta?: ModelDeltaSink): Promise<CanonResponse> {
    if (!Number.isInteger(req.maxTokens) || req.maxTokens <= 0) {
      throw new AppError(GatewayMessages.MaxTokensRequired, 400);
    }
    if (!Number.isInteger(req.timeoutMs) || req.timeoutMs <= 0) {
      throw new AppError(GatewayMessages.TimeoutRequired, 400);
    }
    ModelGateway.validateContent(req);

    // Apply the per-run model pin (Agent panel), but ONLY when its provider has a registered adapter —
    // a stale/cross-provider pin self-heals to the router's original provider+model rather than 503-ing.
    const pin = ModelGateway.modelOverride;
    const effectiveReq: CanonRequest =
      pin !== null && ModelGateway.providers.has(pin.provider)
        ? { ...req, provider: pin.provider, model: pin.model }
        : req;

    const provider = ModelGateway.providers.get(effectiveReq.provider);
    if (provider === undefined) {
      throw new AppError(GatewayMessages.noProviderRegistered(effectiveReq.provider), 503);
    }

    // Egress Firewall (before the request leaves the device): a possible secret leak is routed to HITL
    // and throws if the user cancels (or fails closed with no handler); a warn is surfaced and allowed.
    // Inspects payload content only (model-agnostic), so the pin above does not change the verdict.
    await ModelGateway.inspectEgress(effectiveReq);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, req.timeoutMs);
    try {
      const res = await ModelGateway.callProvider(provider, effectiveReq, controller.signal, onDelta);
      TokenLedger.record(provider.id, effectiveReq.model, effectiveReq.capability, res.usage);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}
