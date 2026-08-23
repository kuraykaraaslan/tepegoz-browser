---
route: /releases
title: Releases
description: Every Tepegöz release, what changed, and what is known to be broken in it. Written for people, not for a changelog parser.
nav: footer
status: needs-assets
---

# Releases

**[BUILD NOTE]** No release exists yet, so this page ships in its empty state (below) and becomes a real
list at the first tag. Generate entries from `CHANGELOG.md`, but do not paste it — the changelog is
written for contributors and this page is written for users. Every entry links to its GitHub release for
binaries and checksums.

---

## Empty state — today

### Headline

**No releases yet.**

### Body

Tepegöz has not been tagged. Until it is, the way to run it is to build from source — three commands and
no compiler.

**Build it** → `/download` · **Follow the work** → `/blog` · **Watch the repository** → GitHub

---

## After the first tag

### Headline

**Releases.**

### Subhead

What changed, what it means for you, and what is still broken.

### Entry template

**[BUILD NOTE]** Every entry uses these five sections in this order. The last one is not optional — a
release page that never mentions defects is not being read carefully by anyone twice.

> ## v0.x.y — {{date}}
>
> **In one line.** What this release is for.
>
> **New.** Features you can now use, in user language. Not commit subjects.
>
> **Fixed.** What was broken and now is not.
>
> **Security.** Anything with a security consequence, including a fix credited to a reporter. If there
> is nothing, say "nothing this release" rather than omitting the heading.
>
> **Known issues.** What is still wrong in this build, and the workaround if there is one.
>
> **Downloads.** Windows `.exe` · macOS `.dmg` · Linux `.deb` `.rpm` `.tar.gz`, with checksums.
> **Unsigned** — see the note on `/download`.

---

## Versioning and support

### Body

Semantic versioning. Pre-1.0 means the interfaces can change between minor versions, and they will.

**Only the latest release is supported.** There are no backported fixes, no long-term-support branch,
and no update channel yet — you will need to download a new build yourself.

---

## Meta

- **Title tag:** Releases — Tepegöz
- **Meta description:** Every Tepegöz release, what changed, and what is known to be broken in it.
  Written for people, not for a changelog parser.
