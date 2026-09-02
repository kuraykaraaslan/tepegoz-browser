import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app as defaultApp, crashReporter, type App } from 'electron';
import { Logger } from '@tepegoz/libs';

/**
 * Startup wiring of the native crash reporter (ADR-0038's "boring-but-mandatory" distribution infra).
 *
 * Three properties, all deliberate:
 *
 *  - **Opt-in, and it fails closed.** The default is OFF and the fallback on a missing or corrupt
 *    `preferences.json` is also OFF. A crash reporter is a privacy surface — a half-written settings
 *    file must never be able to switch it on — so it turns on only for the exact literal
 *    `crashReportingEnabled === true`, the same shape `chromium-flags-boot.ts` /
 *    `hardware-acceleration-boot.ts` use for their own before-`whenReady` reads.
 *  - **Nothing leaves the machine.** `uploadToServer: false` and an empty `submitURL`: minidumps are
 *    written to `<userData>/Crashes` and stay there. There is no crash-collection server, and adding
 *    one is a separate decision with its own consent story.
 *  - **No metadata is attached.** A minidump is a binary stack/heap snapshot; the redaction obligation
 *    (`internal-ai-rules`: no PII in reports) is on the `extra`/`globalExtra` key/value pairs, and we
 *    set none. If per-report annotations are ever wanted they go through `Logger.redact` first.
 *
 * Must run before `app.whenReady()` (the dump directory has to be set before `crashReporter.start`)
 * and after the userData path is pinned.
 */

/** Whether the persisted preference opts in. Pure, so a test does not need Electron or a real file. */
export function crashReportingEnabledFromPrefs(userDataDir: string): boolean {
  try {
    const text = readFileSync(join(userDataDir, 'preferences.json'), 'utf8');
    const doc = JSON.parse(text) as { crashReportingEnabled?: unknown };
    return doc.crashReportingEnabled === true;
  } catch {
    return false;
  }
}

export function applyCrashReporterPreference(app: App = defaultApp): void {
  if (!crashReportingEnabledFromPrefs(app.getPath('userData'))) return;
  try {
    app.setPath('crashDumps', join(app.getPath('userData'), 'Crashes'));
  } catch (err) {
    Logger.warn('Could not set the crash-dump directory', { err: String(err) });
  }
  crashReporter.start({
    submitURL: '',
    uploadToServer: false,
    compress: true,
  });
  Logger.info('Crash reporter enabled (local minidumps only, no upload)');
}
