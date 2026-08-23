---
channel: daily.dev (Squad — native post, not a link submission)
status: ready-to-post
---

# daily.dev Squad post

**[BUILD NOTE]** This is a **native Squad post**, so it stands alone — it is not a teaser for an
article and does not depend on `/blog` existing. The longer write-up lives at
[the build-log post](../blog/the-screenshot-that-captured-the-wrong-screen.md); link that from a
comment only once `/blog` is a live route, since that page is second wave.

**[BUILD NOTE]** Editorial policy applies: no competitor dunking, no claim without the artifact. The
artifact is `scripts/record-agent.mjs`, already public.

---

## Post title…

> Tab isolation made our own browser impossible to screenshot

**Alternates**, in descending order of how well they survive a skeptical scroll:

- The screenshot came back empty. That meant the sandbox was working.
- Our screenshot script captured the wrong desktop. Twice.
- Screen capture and window capture are not the same operation

**Rejected**, with reasons, so nobody re-proposes them:

- *"You cannot screenshot your own Electron browser"* — true of this architecture, not of Electron.
  Overclaims, and the first reply would rightly be "yes you can, I do it every day".
- *"A horrifying screenshot bug"* — the bug is mundane; the consequence was not. Selling horror sets up
  a letdown two paragraphs in.

---

## Add cover

Optional. Two that work, for opposite reasons:

- **The empty capture** — chrome drawn perfectly, grey void where the page belongs. Best hook, because
  it *is* the post. Needs regenerating; the originals were replaced.
- **A frame from the working recording** — chrome and live page in one image. Shows the payoff rather
  than the problem.

Skip it rather than reach for stock. A generic laptop photo on a post about a specific capture bug
reads as filler.

---

## Share your thoughts

We build a browser. We needed screenshots of it. There is already an end-to-end suite that launches the
real app on three platforms, so this looked like an afternoon.

The first capture came back with the chrome drawn perfectly — tab strip, address bar, bookmarks — and a
grey rectangle where the page should have been.

Every tab in our browser is an isolated `WebContentsView`. That is deliberate: a compromised page
cannot reach into another tab because it is not in the same place, and one page crashing does not take
the window with it. The part nobody mentions is that those views are composited **outside the host
window's own `webContents`**.

So Playwright's `page.screenshot()` and Electron's `BrowserWindow.capturePage()` both photograph a
browser with nothing in it. The isolation that makes tabs safe is the isolation that makes them
invisible to the two obvious capture APIs.

Fine — go one level down. Find the window, read its rect, copy those pixels off the screen. Thirty
lines of PowerShell. It matched the window by title.

The machine had another browser open with a tab named after the project. The script grabbed **that**
window: open tabs, bookmarks bar, profile avatar, into a folder headed for a public marketing page.

Matching by process id instead looked like the fix. It wasn't. `CopyFromScreen` does not copy a window
— it copies a rectangle of the screen, and whatever is in front of that rectangle is what you get. The
code calls `SetForegroundWindow` first, and Windows is entitled to refuse; it often does, for the
anti-hijacking reasons that make it a good rule. Second capture: a video that was playing on the same
desktop.

Neither shipped. Both were deleted. But the lesson is not *match windows more carefully*:

**Reading the framebuffer and capturing a window are different operations, and no amount of care turns
one into the other.** A tool whose failure mode is "silently captures whatever the human was doing"
does not belong in an automated pipeline.

What works is Electron's own `desktopCapturer`: enumerate sources, match the one whose id equals the
window's `getMediaSourceId()`, hand that source to `setDisplayMediaRequestHandler`. No rectangle, no
foreground, nothing to lose track of — it resolves through an identifier Electron issued about itself.

Two things cost real time:

- The app hardens its sessions, so the permission grant has to sit on the chrome window's **partition**
  session. `defaultSession` is not the one in play, and getting it wrong just returns "permission
  denied" with no hint as to which session refused.
- `callback({ video: theWindow })` is not enough. The handler wants a `desktopCapturer` source, not a
  `BrowserWindow`. The error is `Invalid capture constraints` — accurate and useless.

And the honest ending: the capture works, but the thing we wanted to record — the agent completing a
task — still doesn't dispatch from our harness. Ninety seconds of video of an application sitting
there. So we have a working recorder and nothing yet worth recording with it.

#electron #javascript #security #devtools #testing

---

## First comment (post it yourself, right after)

> Worth saying plainly, since the post is about our own mistake: the two bad captures never left the
> machine and were deleted within a minute. They were caught because somebody opened the PNG and looked
> at it. If your capture step is fully automated and nobody views the output, this failure mode is
> completely silent — which is the actual reason it was worth writing up.
