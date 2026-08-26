/**
 * Pull a browsable http(s) URL out of a launch command line — what the OS hands us when Tepegöz is the
 * default browser and a link was clicked (or `start https://…`/`xdg-open` was run) outside the app.
 *
 * Used from two call sites with two different argv shapes: `process.argv` on cold start (unpackaged:
 * `[electron.exe, appPath, ...args]`; packaged: `[Tepegöz.exe, ...args]`) and `commandLine` from
 * Electron's `second-instance` event, which carries only the second launch's own arguments. Rather than
 * special-case either shape, this just scans every entry and keeps the first one that IS an http(s)
 * URL — every other entry (binary paths, `--flags`, the app directory) fails that test harmlessly.
 */
export function extractLaunchUrl(argv: string[]): string | null {
  for (const arg of argv) {
    if (/^https?:\/\//i.test(arg)) return arg;
  }
  return null;
}
