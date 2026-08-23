# Website copy

Source copy for the public Tepegöz marketing site. One file per page. This folder holds **words, not
markup** — whoever builds the site owns the layout; this owns what it says and what it is allowed to
claim.

## Why the copy lives in the repo

Because the claims have to track the code. A marketing site that drifts from the product is the exact
failure this project put in its own README as a design commitment ("Honesty over hype"). Keeping the
copy next to the source means a pull request that changes what the product does can change what the
site says in the same review.

## Conventions

- **English is the source.** Turkish is a first-class translation, not an afterthought — but it is
  translated _from_ these files, so they stay the single source of truth.
- Every page carries frontmatter: `route`, `title`, `description` (the meta description, ≤ 155
  characters), `nav`, and `status`.
- `status: ready` — copy is final enough to publish. `status: needs-assets` — copy is done but the page
  cannot ship until screenshots, a video, or a real download exists. `status: draft-legal` — a
  non-lawyer draft that **must** be reviewed before it goes live.
- Blocks marked **`[BUILD NOTE]`** are instructions for whoever implements the page. They are not copy
  and must not be rendered.
- Claims marked **`[CLAIM]`** are load-bearing statements with a verifiable source. If the source stops
  being true, the claim comes down. Do not add a `[CLAIM]` without a link into the repo or a published
  artifact.

## The three rules this copy obeys

1. **No unearned superlatives about the agent.** All thirteen phases of the AI competence program have
   landed their code and every one is still measurement-owed, so the site describes _mechanism_ — what
   the agent may and may not do, and who decides — never benchmark superiority. When the
   head-to-head artifact exists, `compare.md` gets numbers and this rule relaxes for that page only.
2. **State the pre-release condition wherever it changes a reader's decision.** No published release, no
   code signing, no security audit. A visitor who downloads should already know this from the page that
   sent them.
3. **Feature lists are split into what works and what is planned.** A single undifferentiated list is
   the most common way product sites lie without lying.

## Pages

| File                                               | Route              | Wave        |
| -------------------------------------------------- | ------------------ | ----------- |
| [home.md](home.md)                                 | `/`                | Launch      |
| [how-it-works.md](how-it-works.md)                 | `/how-it-works`    | Launch      |
| [features.md](features.md)                         | `/features`        | Launch      |
| [security.md](security.md)                         | `/security`        | Launch      |
| [privacy.md](privacy.md)                           | `/privacy`         | Launch      |
| [download.md](download.md)                         | `/download`        | Launch      |
| [open-source.md](open-source.md)                   | `/open-source`     | Launch      |
| [story.md](story.md)                               | `/story`           | Launch      |
| [roadmap.md](roadmap.md)                           | `/roadmap`         | Launch      |
| [legal-privacy-policy.md](legal-privacy-policy.md) | `/legal/privacy`   | Launch      |
| [legal-terms.md](legal-terms.md)                   | `/legal/terms`     | Launch      |
| [legal-license.md](legal-license.md)               | `/legal/license`   | Launch      |
| [extensions.md](extensions.md)                     | `/extensions`      | Second wave |
| [network-privacy.md](network-privacy.md)           | `/network-privacy` | Second wave |
| [compare.md](compare.md)                           | `/compare`         | Second wave |
| [turkey.md](turkey.md)                             | `/turkey`          | Second wave |
| [help.md](help.md)                                 | `/help`            | Second wave |
| [blog.md](blog.md)                                 | `/blog`            | Second wave |
| [release-notes.md](release-notes.md)               | `/releases`        | Second wave |

**Deliberately not written yet:** `/pricing` (the product is bring-your-own-key and free; a pricing page
today would describe a product that does not exist), `/enterprise`, `/press`, `/status`. Each becomes
honest only when the thing behind it exists.

## Site-wide requirements

These are not pages, and they are not negotiable:

- **No third-party analytics or tracking scripts.** A privacy-first browser whose marketing site loads
  Google Analytics has refuted its own headline before the visitor reaches the fold. If measurement is
  needed, self-host something cookieless and say so on `/privacy`.
- **WCAG 2.2 AA.** The product holds itself to this standard; the site cannot hold itself to less.
- **Turkish and English**, with a real language switcher and translated URLs.
- Dark and light themes, `prefers-color-scheme` respected.
- Open Graph images per page, a `sitemap.xml`, and no layout shift on the hero.
