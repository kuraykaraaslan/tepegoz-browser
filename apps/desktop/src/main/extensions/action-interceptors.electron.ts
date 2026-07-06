import { Logger } from '@tepegoz/libs';
import { ActionInterceptorSupervisor } from '@tepegoz/extension-host';
import type { ActionContext, ActionInterceptorSet, ActionType } from '@tepegoz/extension-sdk';
import { isExtensionEnabled } from '@tepegoz/desktop-ipc';
import PreferenceStore from '@tepegoz/preferences';

/**
 * Main-process wiring for the synchronous action-interception plane (ADR-0022). Mirrors
 * `extensions/capability-supervisor.electron.ts`: it wires the prefs-backed enabled check into the
 * Electron-free `ActionInterceptorSupervisor`, so `TabManager`'s mechanical action points (popup
 * open, tab create/close, navigation) can ask "should this be blocked?" without knowing which
 * extension (if any) answers, or whether it's even installed/enabled.
 *
 * Extensions contribute their interceptor set via {@link ActionInterceptorService.provide} at
 * startup (see `index.ts`); `TabManager` calls {@link ActionInterceptorService.shouldBlock} at each
 * action point.
 */

const supervisor = new ActionInterceptorSupervisor({
  isEnabled: (extId) => isExtensionEnabled(PreferenceStore.getAll().extensions, extId),
  log: (msg, meta) => {
    Logger.info(msg, meta);
  },
});

const ActionInterceptorService = {
  /** Register an extension's action interceptors. Call BEFORE any action can fire (startup). */
  provide(set: ActionInterceptorSet): void {
    supervisor.provide(set);
  },

  /** True if an enabled extension's interceptor wants `actionType` blocked (see {@link
   *  ActionInterceptorSupervisor.evaluate}); false (allow) when none is registered/enabled. */
  shouldBlock<T extends ActionType>(actionType: T, ctx: ActionContext[T]): boolean {
    return supervisor.evaluate(actionType, ctx);
  },
};

export default ActionInterceptorService;
