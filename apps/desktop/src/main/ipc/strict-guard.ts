import { Logger } from '@tepegoz/libs';
import { setStrictMode } from '@tepegoz/tool-executor';
import PreferenceStore from '@tepegoz/preferences';

/**
 * The caller `setStrictMode` never had (S6 PR5).
 *
 * The hardened inbound guard landed in C7 and was **unreachable**: the code existed, nothing in the app
 * ever called the setter, and no test noticed — the mode simply could not be turned on. This module is
 * that caller, deliberately kept to three imports so the wiring can be tested without dragging in the
 * Electron main graph. A guard that only *exists* is not a guard.
 *
 * Called at IPC registration AND on every toggle, from one place, so the persisted preference and the
 * live process-global default cannot drift apart.
 */
export function applyStrictGuard(): void {
  const on = PreferenceStore.getAll().agentStrictGuard;
  setStrictMode(on);
  Logger.info('[s6] inbound guard posture applied', { strict: on });
}
