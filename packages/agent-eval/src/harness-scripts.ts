/**
 * Deterministic-tier fixtures: the scripted model sequences the `ScriptedProvider` replays for the
 * `scripted` eval tier (no cloud key). Kept in a plain (non-`.eval.ts`) sibling so the eval runner's
 * `*.eval.ts` glob does not collect it as its own spec.
 */
const act = (tool: string, args: Record<string, unknown>, rationale: string): string =>
  JSON.stringify({ action: 'act', tool, args, rationale });
const finish = (summary: string): string => JSON.stringify({ action: 'finish', summary });

/** A scripted model sequence for one scenario (deterministic tier), given the fixture's base URL. */
export type Script = (base: string) => { entryUrl: string; replies: string[] };

export const SCRIPTS: Record<string, Script> = {
  blog_behind_menu: (base) => {
    const blogUrl = `${base}blog.html`;
    return {
      entryUrl: `${base}index.html`,
      replies: [
        JSON.stringify({
          goal: 'Open the blog and read the latest post title',
          steps: [
            {
              id: 's1',
              tool: 'browser_update_location',
              args: { url: blogUrl },
              rationale: 'go to the blog',
              dependsOn: [],
            },
            {
              id: 's2',
              tool: 'browser_get_page',
              args: {},
              rationale: 'read the blog',
              dependsOn: ['s1'],
            },
          ],
        }),
        act('browser_update_location', { url: blogUrl }, 'navigate straight to the blog page'),
        act('browser_get_page', {}, 'read the blog page'),
        finish('The latest post is: Shipping the new perception pipeline'),
      ],
    };
  },
};
