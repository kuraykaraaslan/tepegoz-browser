import type { ActionContext, ActionInterceptor, ActionInterceptorSet, ActionType } from '@tepegoz/extension-sdk';

export interface ActionInterceptorSupervisorDeps {
  /** Whether an extension is currently enabled (from prefs). */
  isEnabled: (extensionId: string) => boolean;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * In-process, synchronous analogue of {@link ExtensionCapabilitySupervisor} (ADR-0022). Simpler than
 * its agent-plane sibling: there is no persistent registry to keep in sync (no `CapabilityRegistry`
 * an agent planner enumerates), so `evaluate` checks `isEnabled` live on every call instead of
 * register/unregister + `reconcile`.
 */
export class ActionInterceptorSupervisor {
  private readonly providers: ActionInterceptorSet[] = [];

  constructor(private readonly deps: ActionInterceptorSupervisorDeps) {}

  /** Register an extension's interceptor set. Order matters only across extensions providing the
   *  SAME action type — the first enabled interceptor that blocks wins (see {@link evaluate}). */
  provide(set: ActionInterceptorSet): void {
    this.providers.push(set);
  }

  /** Ask every ENABLED interceptor registered for `actionType`, in provide-order; the first `true`
   *  wins (its `onBlocked` side effect runs, later interceptors are skipped). `false` (allow) when no
   *  enabled interceptor is registered for `actionType` at all. */
  evaluate<T extends ActionType>(actionType: T, ctx: ActionContext[T]): boolean {
    for (const provider of this.providers) {
      if (!this.deps.isEnabled(provider.extensionId)) continue;
      for (const candidate of provider.interceptors) {
        if (candidate.actionType !== actionType) continue;
        // Narrowed by the actionType equality check above — `candidate` is provably an
        // `ActionInterceptor<T>` at this point, but TS can't prove that through a generic
        // discriminant comparison, hence the one explicit cast.
        const interceptor = candidate as unknown as ActionInterceptor<T>;
        if (interceptor.shouldBlock(ctx)) {
          interceptor.onBlocked?.(ctx);
          this.deps.log?.('action blocked', { actionType, ext: provider.extensionId });
          return true;
        }
      }
    }
    return false;
  }
}
