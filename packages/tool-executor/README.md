# @tepegoz/tool-executor

Shared, pure helpers used while a tool call executes: a **content sanitizer** that strips
hidden/zero-width/bidi/homoglyph injection vectors from web-derived text before it reaches the model
(ADR-0008), and an **interactable DOM-element model** — the finalized, size-capped, label-sanitized
element list the perception layer hands to the planner for click/fill targeting. Zero dependencies,
no Electron, no DOM access itself — it operates on plain data structures produced by a browser host.

## Exports

- **`sanitizeText`** / **`sanitizeSegments`** — strip injection-prone characters from untrusted text;
  returns a `SanitizeResult` (segments + whether anything was stripped).
- **`wrapUntrustedContent`** — wraps sanitized web content with a boundary marker so the model can tell
  trusted instructions from untrusted page data.
- **`HIDDEN_PLACEHOLDER`** — the placeholder text substituted for stripped hidden content.
- **`finalizeElements`** — turns raw scraped elements (`RawInteractable[]`) into the capped,
  label-sanitized `InteractableElement[]` the model sees (enforces `MAX_INTERACTABLE_ELEMENTS` /
  `MAX_ELEMENT_LABEL`).
- **`renderElementsText`** — renders a finalized element list to the compact text block sent to the model.
- **`isInteractableRole`** / **`isEditableRole`** / **`INTERACTABLE_ROLES`** — accessibility-role
  classification used to decide which elements are actionable.
- **`sanitizeLabel`** — per-element label sanitizer (reuses the content sanitizer rules).

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build`
