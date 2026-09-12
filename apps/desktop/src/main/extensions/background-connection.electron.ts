import { Logger } from '@tepegoz/libs';
import { BackgroundConnectionSupervisor, type BackgroundConnectionProvider } from '@tepegoz/extension-host';

/**
 * Main-process wiring for the shared background-connection supervisor (the "shared prerequisite"
 * `phases/extensions/README.md` owed — was bespoke `ChatMessenger.init/stop/reconcile/
 * notifyEgressChange` calls sprinkled through the desktop bootstrap; a second consumer like
 * `ext-mail` would have duplicated all four call sites instead of reusing them). Mirrors
 * `capability-supervisor.electron.ts`: an Electron-free `BackgroundConnectionSupervisor` from
 * `@tepegoz/extension-host`, wired to the real `Logger` here.
 *
 * Extensions register once at startup via {@link BackgroundConnectionService.provide}; the four
 * lifecycle call sites (`main/index.ts`'s startup + `before-quit`, the prefs-reconcile paths, and
 * `broadcastNetworkState`) call the matching method here instead of a specific extension's service
 * directly, so a newly-registered provider gets all four for free.
 */

const supervisor = new BackgroundConnectionSupervisor({
  log: (msg, meta) => {
    Logger.info(msg, meta);
  },
});

const BackgroundConnectionService = {
  /** Register an extension's background-connection provider. Call once, at startup, before the
   *  lifecycle methods below are invoked. */
  provide(provider: BackgroundConnectionProvider): void {
    supervisor.provide(provider);
  },
  init: (): Promise<void> => supervisor.init(),
  stop: (): Promise<void> => supervisor.stop(),
  reconcile: (): Promise<void> => supervisor.reconcile(),
  notifyEgressChange: (): void => supervisor.notifyEgressChange(),
};

export default BackgroundConnectionService;
