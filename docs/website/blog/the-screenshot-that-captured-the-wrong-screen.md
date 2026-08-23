---
route: /blog/the-screenshot-that-captured-the-wrong-screen
title: The screenshot that captured the wrong screen
description: Our browser cannot screenshot itself. The obvious workaround captured the operator's desktop twice, so we deleted it and did it properly.
nav: none
status: ready
---

# The screenshot that captured the wrong screen

**[BUILD NOTE]** First published post. The artifact it references is
[`scripts/record-agent.mjs`](../../../scripts/record-agent.mjs), committed before this went out —
editorial policy says no announcement without one.

---

## The task looked like an afternoon

The marketing site needed pictures of the browser. We have the browser. We have a test harness that
launches it — the end-to-end suite drives the built application on every push, on three platforms. Take
some screenshots.

The first capture came back with the chrome perfectly rendered — tab strip, address bar, bookmarks bar
— and a grey rectangle where the web page should have been.

## Every tab is a window you cannot see

Tepegöz gives each tab its own isolated `WebContentsView`. That is [ADR-0012](../../adr/0012-browser-tab-model.md),
and it is deliberate: a compromised page cannot reach into another tab because it is not in the same
place. It is also why one page crashing does not take the window with it.

The consequence nobody writes on the ADR: those views are composited by the compositor, **outside the
host window's own `webContents`**. So:

- Playwright's `page.screenshot()` sees the renderer. The renderer draws the chrome. The page is not in
  the renderer.
- Electron's `BrowserWindow.capturePage()` sees the same thing, for the same reason.

Both return a picture of a browser with nothing in it. The isolation that makes tabs safe is the
isolation that makes them invisible to the two obvious capture APIs.

Internal `tepegoz://` pages — settings, extensions, downloads — render in the renderer window and
capture correctly. That is why the first usable screenshots we shipped were all of internal pages.
It was not an editorial choice. It was the only thing that worked.

## The workaround, and why it is now deleted

If the page is composited by the OS, capture it from the OS. Find the window, read its rectangle, copy
those pixels off the screen. Thirty lines of PowerShell.

It matched the window by title.

The operator had a browser open with a tab named after this project. The capture grabbed **their**
window: their open tabs, their bookmarks bar, their profile avatar. Straight into a folder of files
destined for a public marketing page.

The fix looked obvious — match by process id instead of title, since we launch the app ourselves and
know its pid. That is a genuinely better identifier, and it was still wrong. `CopyFromScreen` does not
copy a window. It copies a rectangle of the screen, and whatever is in front of that rectangle is what
lands in the file. The code calls `SetForegroundWindow` first, and Windows is entitled to refuse
foreground activation — it frequently does, for exactly the anti-hijacking reasons that make it a good
rule. The second capture came back with a video that was playing on the operator's desktop.

Two captures, two different pieces of somebody's screen that had no business being in a marketing
asset. Neither was published. Both were deleted within a minute of being looked at, which is the only
part of this story that went right, and it only went right because somebody looked.

**The lesson is not "match windows more carefully."** It is that *screen* capture and *window* capture
are different operations, and an API that reads the framebuffer cannot be made into the second one by
being more careful about which rectangle you ask for. A tool whose failure mode is "silently captures
whatever the human was doing" does not belong in an automated pipeline, at any level of care.

It is gone, and the header of the file that replaced it says why, so the next person with the same
afternoon does not rediscover it the same way.

## What actually works

Electron already ships the right primitive. `desktopCapturer` enumerates capture sources and hands back
ids; a `BrowserWindow` can tell you its own `getMediaSourceId()`. Match one against the other, feed the
result to `setDisplayMediaRequestHandler`, and `getDisplayMedia` in the renderer returns a stream of
**that window**, composited views included, resolved by an identifier Electron issued about itself.

There is no rectangle and no foreground. It cannot drift onto someone's desktop, because at no point
does it ask what is on the desktop.

Two details cost time and are worth writing down:

- The app hardens its sessions. `security.ts` installs a deny-by-default permission handler on every
  web-contents as it is created, so the grant has to go on **the chrome window's own partition
  session** — `defaultSession` is not the one in play, and setting it there fails silently in the sense
  that matters: the permission prompt simply says no.
- `callback({ video: theWindow })` is not enough. The handler wants a source object from
  `desktopCapturer`, not a `BrowserWindow`. The error message for getting this wrong is `Invalid
  capture constraints`, which is accurate and tells you nothing.

The output is a WebM containing the browser chrome and the live page in the same frame — the thing that
neither earlier method could produce.

## And the part that still does not work

The reason for all of this was to record the agent completing a task, because the home page has said
since it was written that a still cannot show the difference between a chat panel bolted onto a browser
and an agent that drives tabs, and that a mockup will not be substituted.

The capture is solved. The recording is not. Handing the agent a goal through the command palette's
**Do** mode leaves the text sitting in the command filter — *"No matching command"* — and Enter
dispatches no run. Ninety seconds of video of an application not doing anything.

So there is still no recording of the agent working, and the home page still says so. What we have is a
harness that will make one the moment the dispatch path is settled, an on-device model that means
making one costs nobody an API key, and a note in the script's own header telling anyone who runs it
that its current output is a recording of the application, not of the agent.

That is a smaller result than the afternoon was supposed to produce. It is the one we got.

---

## Meta

- **Title tag:** The screenshot that captured the wrong screen — Tepegöz
- **Meta description:** Our browser cannot screenshot itself. The obvious workaround captured the
  operator's desktop twice, so we deleted it and did it properly.
