import { expect, type ElectronApplication, type Page } from '@playwright/test';

/**
 * The browser CHROME page — the one with the address bar — and not merely the first page Playwright sees.
 *
 * A restored tab is a `WebContentsView` that Playwright also reports as a page, and on a launch that
 * restores one it can win `firstWindow()`. A spec that then looks for the address bar or a toast in that
 * page is searching the restored site's DOM, where neither can ever be (measured: body text "ok"), and
 * fails intermittently — the more tabs a relaunch restores, the likelier. Use this wherever a spec
 * relaunches onto a profile that had a page open.
 */
export async function chromePage(app: ElectronApplication): Promise<Page> {
  await app.firstWindow(); // at least one page exists
  let found: Page | undefined;
  await expect
    .poll(
      async () => {
        for (const p of app.windows()) {
          if (
            (await p
              .getByRole('combobox')
              .count()
              .catch(() => 0)) > 0
          ) {
            found = p;
            return true;
          }
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return found!;
}
