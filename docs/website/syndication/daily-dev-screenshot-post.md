---
channel: daily.dev
links_to: /blog/the-screenshot-that-captured-the-wrong-screen
status: ready-to-post
---

# daily.dev — syndication copy

**[BUILD NOTE]** This links to the blog post, and `/blog` is a **second-wave** page that is not on the
live site yet. Do not submit this until that route exists and returns 200 — a feed post whose link
404s is worse than no post. Everything below is ready the day it does.

**[BUILD NOTE]** Editorial policy applies here too: no competitor dunking, and no claim without the
artifact. The artifact is `scripts/record-agent.mjs`, already public.

---

## Title

The interesting thing here is not that we made a mistake — every feed is full of those. It is that a
**security decision** made a routine task impossible, and the obvious workaround was a data leak. Lead
with the counterintuitive half; the incident is the payoff inside.

> **Tab isolation made our own browser impossible to screenshot**

**Alternates**, in descending order of how well they survive a skeptical scroll:

- The screenshot came back empty. That meant the sandbox was working.
- Our screenshot script captured the wrong desktop. Twice.
- Screen capture and window capture are not the same operation

**Rejected**, and why — worth keeping so nobody re-proposes them:

- *"You cannot screenshot your own Electron browser"* — true of our architecture, not of Electron.
  Overclaims, and the first reply would correctly be "yes you can, I do it every day".
- *"A horrifying screenshot bug"* — the bug is mundane. The consequence was not. Selling it as horror
  invites a letdown two paragraphs in.

---

## Body

We needed product screenshots of the browser we build. It has an end-to-end suite that launches the
real app on three platforms, so this looked like an afternoon.

The first capture came back with the chrome drawn perfectly and a grey rectangle where the page should
have been.

Every tab in our browser is an isolated `WebContentsView`. That is deliberate — a compromised page
cannot reach into another tab because it is not in the same place. The part nobody mentions: those
views are composited **outside the host window's own `webContents`**. So Playwright's
`page.screenshot()` and Electron's `BrowserWindow.capturePage()` both photograph a browser with
nothing in it. The isolation that makes tabs safe makes them invisible to the two obvious capture APIs.

So we went one level down: find the window, read its rect, copy those pixels off the screen. Thirty
lines of PowerShell. It matched the window by title.

The machine had another browser open, with a tab named after the project. The script grabbed **that**
window — open tabs, bookmarks, profile avatar — into a folder headed for a public marketing page.

Matching by process id instead looked like the fix. It wasn't. `CopyFromScreen` does not copy a window;
it copies a rectangle of the screen, and whatever is in front of that rectangle is what you get. The
code calls `SetForegroundWindow` first, and Windows is entitled to refuse — it often does, for the
anti-hijacking reasons that make it a good rule. Second capture: a video playing on the same desktop.

Neither shipped. Both were deleted. But the lesson is not "match windows more carefully" — it is that
reading the framebuffer and capturing a window are different operations, and no amount of care turns
one into the other. A tool whose failure mode is *silently captures whatever the human was doing* does
not belong in an automated pipeline.

The version that works uses Electron's own `desktopCapturer`, matching the window's
`getMediaSourceId()` and handing that source to `setDisplayMediaRequestHandler`. No rectangle, no
foreground, nothing to lose track of. Two hours of the afternoon went to discovering that the
permission grant has to sit on the chrome window's **partition** session, not `defaultSession`.

Full write-up, including the part that still does not work:

---

## Tags

`electron` · `security` · `devtools` · `javascript` · `testing`

---

## First comment (post it yourself, right after submitting)

> Worth saying plainly since the post is about our own mistake: the two bad captures never left the
> machine and were deleted within a minute. They were caught because somebody opened the PNG and looked
> at it. If your capture step is fully automated and nobody ever views the output, this failure mode is
> silent — that is the actual reason it is worth a post.
