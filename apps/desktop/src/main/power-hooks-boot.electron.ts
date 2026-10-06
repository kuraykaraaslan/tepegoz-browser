import { powerMonitor } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  emitSystemPause,
  emitSystemResume,
  onSystemPause,
  onSystemResume,
} from './power-lifecycle';
import { pauseAllRunsForSleep, resumeAllRunsAfterSleep } from './agent/agent-run-lock.electron';
import PreferenceStore from '@tepegoz/preferences';

/**
 * Sleep / resume wiring, split out of the app entry: subscribes the interactive Agent run-control
 * fan-out to the system power seam and feeds the seam from Electron's `powerMonitor`.
 */
export function registerPowerHooks(): void {
  // Sleep/resume hooks. Phase 1b: the Recovery Coordinator resumes durable tasks from their last
  // checkpoint on 'resume' (Opera Neon's "task drops on sleep" lesson).
  // System power lifecycle. The pause/resume seam fires (gated on `pauseTasksOnSleep`) on sleep /
  // power-save transitions; the interactive Agent run-control fan-out subscribes here so an active
  // run is held at its next gate while the machine sleeps and released on wake — without disturbing
  // a pause the user set by hand (that is a separate hold flag).
  onSystemPause(pauseAllRunsForSleep);
  onSystemResume(resumeAllRunsAfterSleep);
  powerMonitor.on('suspend', () => {
    Logger.info('System suspending');
    if (PreferenceStore.getAll().pauseTasksOnSleep) emitSystemPause();
  });
  powerMonitor.on('resume', () => {
    Logger.info('System resumed');
    if (PreferenceStore.getAll().pauseTasksOnSleep) emitSystemResume();
  });
  powerMonitor.on('on-battery', () => {
    Logger.info('On battery power (power-save proxy)');
    if (PreferenceStore.getAll().pauseTasksOnSleep) emitSystemPause();
  });
  powerMonitor.on('on-ac', () => {
    Logger.info('On AC power');
    if (PreferenceStore.getAll().pauseTasksOnSleep) emitSystemResume();
  });
}
