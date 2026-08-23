# Third-party notices

Tepegöz is licensed under the **GNU Affero General Public License v3.0** ([`LICENSE`](LICENSE)). This
file records the third-party material that Tepegöz **redistributes** — code copied or adapted into this
repository, and binary assets committed to it — together with the licenses that material arrives under.

Two categories are deliberately kept apart, because they carry different obligations:

- **Redistributed here** (sections 1–2). The material is in this repository. Its license travels with
  this repository and its terms are reproduced or referenced below.
- **Not redistributed** (sections 3–4). Dependencies resolved by `pnpm install`, and data the app
  downloads at runtime. Their licenses bind whoever installs or downloads them; nothing of theirs is
  committed here.

All licenses listed are one-way compatible into AGPL-3.0. If you add a dependency or vendor a file
under a license that is **not** (notably: any copyleft license other than GPL/AGPL-family, or a
source-available license with field-of-use restrictions), it does not belong in this repository — see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## 1. Adapted source code

### `buildDomTree` page-perception technique — browser-use + nanobrowser

**Where:** [`apps/desktop/src/main/agent/build-dom-tree-script.ts`](apps/desktop/src/main/agent/build-dom-tree-script.ts)

The in-page perception script that walks a live DOM and returns the indexable interactive elements is a
**port of the `buildDomTree` technique** originated in [browser-use](https://github.com/browser-use/browser-use)
and [nanobrowser](https://github.com/nanobrowser/nanobrowser).

**Changes made in Tepegöz** (stated as Apache-2.0 §4(b) requires): the traversal was rewritten for this
codebase's stack and injected into an **isolated world** rather than the page's main world; interactivity
was split into STRONG/WEAK tiers to stop an inherited `cursor` from indexing every glyph of a control;
open shadow roots and same-origin iframes were folded into one index space; and the returned payload is
validated with zod at the process boundary. It shares the upstream approach, not its code layout.

**Upstream licenses:**

- browser-use — MIT License, Copyright (c) 2024 Gregor Zunic.
  Full text: https://github.com/browser-use/browser-use/blob/main/LICENSE
- nanobrowser — Apache License 2.0.
  Full text: https://github.com/nanobrowser/nanobrowser/blob/master/LICENSE

> MIT License (browser-use), reproduced in full as its terms require:
>
> Copyright (c) 2024 Gregor Zunic
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
> and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
> subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial
> portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
> LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
> NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
> WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
> SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Apache-2.0 (nanobrowser) is not reproduced inline; its full text is at
https://www.apache.org/licenses/LICENSE-2.0 and at the upstream URL above.

### KUIreact component atoms — kui-react

**Where:** [`packages/ui/src/modules/`](packages/ui/src/modules/) and
[`packages/ui/src/libs/`](packages/ui/src/libs/) (8 files), plus the token subset in
`packages/ui/styles/tokens.css`

`@tepegoz/ui` is built on component atoms **forked** from
[`@kuraykaraaslan/kui-react`](https://github.com/kuraykaraaslan/kui-react) v1.0.1 rather than installed
as a dependency, so the source is controlled here and drift is tracked. The per-file inventory, the
transforms applied, and the local patches are recorded in
[`packages/ui/_FORK.md`](packages/ui/_FORK.md) — kept precisely so a future diff against upstream stays
explainable.

**License:** Zero-Clause BSD (0BSD), Copyright (c) 2026 Kuray Karaaslan —
https://github.com/kuraykaraaslan/kui-react/blob/main/LICENSE

> 0BSD is a public-domain-equivalent license: it requires no attribution and no notice retention. This
> entry exists anyway, because knowing which code came from where is worth more than the minimum the
> license demands.

---

## 2. Vendored binary assets

### kui-player — embedded video player bundle

**Where:** [`apps/desktop/src/main/extensions/video-player-embed-bundle.electron.ts`](apps/desktop/src/main/extensions/video-player-embed-bundle.electron.ts)
(generated; ~340 KB self-contained IIFE)

The Unified Player extension skins page videos with a pre-built bundle of
[`@kuraykaraaslan/kui-player`](https://github.com/kuraykaraaslan/kui-player), committed as a generated
TypeScript string so the build needs no network. Regenerate with
[`apps/desktop/scripts/generate-video-player-bundle.ts`](apps/desktop/scripts/generate-video-player-bundle.ts).

**License:** Apache License 2.0 — https://github.com/kuraykaraaslan/kui-player/blob/main/LICENSE

> Authored by the same author as Tepegöz, but licensed separately and vendored as a third party. The
> Apache-2.0 terms apply to the bundle regardless of shared authorship.

### Baloo 2 — brand wordmark typeface

**Where:** [`apps/desktop/src/renderer/public/fonts/Baloo2-800-latin.woff2`](apps/desktop/src/renderer/public/fonts/Baloo2-800-latin.woff2)
and [`packages/ui/styles/fonts/Baloo2-800-latin.woff2`](packages/ui/styles/fonts/Baloo2-800-latin.woff2)
(latin subset, weight 800)

**License:** SIL Open Font License 1.1 — Copyright 2019 The Baloo 2 Project Authors
(https://github.com/EkType/Baloo2), designed by Ek Type.
Full text: https://openfontlicense.org/open-font-license-official-text/

> The OFL permits bundling and redistribution with software. The font is **not** sold on its own and
> retains its reserved name.

---

## 3. Runtime and build dependencies (not redistributed)

Resolved by `pnpm install` from the public npm registry; none are vendored into this repository. The
authoritative list is [`pnpm-lock.yaml`](pnpm-lock.yaml). The notable ones:

| Package                          | License      | Role                                             |
| -------------------------------- | ------------ | ------------------------------------------------ |
| `electron`                       | MIT          | Application shell (bundles Chromium and Node.js) |
| `react`, `react-dom`             | MIT          | Renderer UI                                      |
| `zod`                            | MIT          | Schema validation at every trust boundary        |
| `axios`                          | MIT          | The single outbound HTTP seam (`@tepegoz/http`)  |
| `@anthropic-ai/sdk`              | MIT          | Anthropic transport                              |
| `@modelcontextprotocol/sdk`      | MIT          | MCP client                                       |
| `@ghostery/adblocker-electron`   | **MPL-2.0**  | Ad/tracker blocking engine                       |
| `@resvg/resvg-js`                | **MPL-2.0**  | SVG rasterization                                |
| `node-llama-cpp`                 | MIT          | On-device inference (N-API, ABI-independent)     |
| `highlight.js`                   | BSD-3-Clause | Syntax highlighting                              |
| `nspell`                         | MIT          | Spell-check engine for the Typo extension        |
| `@dnd-kit/*`                     | MIT          | Drag-and-drop in bookmarks and settings          |
| `@fortawesome/*` (free)          | MIT (code)   | Icon components; the icon artwork is CC BY 4.0   |
| `tailwindcss`, `vite`, `esbuild` | MIT          | Build toolchain                                  |
| `typescript`                     | Apache-2.0   | Compiler                                         |

**Electron** carries Chromium, which brings its own large body of licenses (BSD-3-Clause and many
others). A packaged Tepegöz build ships Electron's own `LICENSES.chromium.html` inside the application
directory; that file — not this one — is the notice for Chromium's contents.

The two **MPL-2.0** entries are per-file copyleft: using them as unmodified dependencies imposes no
obligation on Tepegöz's own source. If you ever patch a file inside one of them, that patched file must
stay MPL-2.0 and its source must be made available.

## 4. Data downloaded at runtime (not redistributed)

- **Hunspell spelling dictionaries** for the Typo extension are fetched on demand from the npm registry,
  pinned by version and verified by SHA-256. The catalog at
  [`apps/desktop/resources/typo-dictionaries.catalog.json`](apps/desktop/resources/typo-dictionaries.catalog.json)
  records each dictionary's own license alongside its hashes. Nothing is bundled; the user's machine
  downloads them, and the license of each dictionary applies to that copy.
- **Local model weights** (GGUF) for on-device inference are user-supplied or user-downloaded. Weights
  carry their own licenses, which Tepegöz neither grants nor restricts, and none ship with the app.
- **Ad/tracker filter lists** are fetched by the adblocker engine at runtime. No filter list is committed
  to this repository.

---

## Reporting an error in this file

If something here is wrong, missing, or under-attributed — especially if it concerns **your** work —
open an issue or write to <kuraykaraaslan@gmail.com>. Attribution mistakes are treated as defects and
fixed promptly, not argued about.
