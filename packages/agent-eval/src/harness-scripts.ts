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

/** A scripted model sequence for one `chatFixture` scenario (X-chat.6 slice 3, deterministic tier) —
 *  no base URL to interpolate, since there is no page. */
export type ChatScript = () => string[];

export const CHAT_SCRIPTS: Record<string, ChatScript> = {
  chat_summarise_room_backlog: () => [
    JSON.stringify({
      goal: "Summarise what's happened in the #deploys room",
      steps: [
        {
          id: 's1',
          tool: 'chat_get_history',
          args: { accountId: 'work', conversationId: 'deploys@conf.example.com' },
          rationale: 'read the backlog',
          dependsOn: [],
        },
      ],
    }),
    act(
      'chat_get_history',
      { accountId: 'work', conversationId: 'deploys@conf.example.com' },
      'read the room backlog',
    ),
    finish(
      "v4.2 deploys Friday at 15:00 UTC. There's a code freeze starting Thursday at 12:00 UTC (no " +
        'merges to main after that), and Bea will post a go/no-go in the room at 14:30 Friday.',
    ),
  ],
  chat_draft_reply_no_send: () => [
    JSON.stringify({
      goal: "Draft (but do not send) a reply to Bob with the staging URL",
      steps: [
        {
          id: 's1',
          tool: 'chat_get_history',
          args: { accountId: 'work', conversationId: 'bob@example.com' },
          rationale: "read Bob's last message",
          dependsOn: [],
        },
      ],
    }),
    act(
      'chat_get_history',
      { accountId: 'work', conversationId: 'bob@example.com' },
      "read Bob's last message before drafting a reply",
    ),
    finish(
      'Draft (not sent): "Here you go — https://staging.example.com/dashboard. Let me know if you ' +
        'need anything else before the review."',
    ),
  ],
  // `success` here is `judgeRubric`-only (no ground truth), so the scripted tier still runs this
  // trial and exercises the real chat_get_media → resolveMedia → transport.fetch round trip, it just
  // can't score a PASS/FAIL verdict from it — same as chat_draft_reply_no_send above.
  chat_media_to_sandbox: () => [
    JSON.stringify({
      goal: 'Save the image Bea shared in #design to my files',
      steps: [
        {
          id: 's1',
          tool: 'chat_get_history',
          args: { accountId: 'work', conversationId: '!design:example.org' },
          rationale: "find Bea's message with the attachment",
          dependsOn: [],
        },
        {
          id: 's2',
          tool: 'chat_get_media',
          args: {
            accountId: 'work',
            conversationId: '!design:example.org',
            messageId: '!design:example.org-1',
          },
          rationale: 'materialize the attachment into the sandbox',
          dependsOn: ['s1'],
        },
      ],
    }),
    act(
      'chat_get_history',
      { accountId: 'work', conversationId: '!design:example.org' },
      "read #design to find Bea's attachment",
    ),
    act(
      'chat_get_media',
      { accountId: 'work', conversationId: '!design:example.org', messageId: '!design:example.org-1' },
      'materialize the attachment into the file-operations sandbox',
    ),
    finish('Saved hero-v3.png to your files.'),
  ],
};

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
