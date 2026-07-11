export const TYPO_CSS = `
.tepegoz-typo-mirror {
  position: fixed;
  z-index: 2147483646;
  pointer-events: none;
  background: transparent !important;
  color: transparent !important;
  caret-color: transparent !important;
  overflow: hidden !important;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-wrap: break-word;
}
.tepegoz-typo-mirror-input {
  white-space: pre;
}
.tepegoz-typo-word {
  color: transparent !important;
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-color: var(--tepegoz-typo-underline, #06AEC4);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 2px;
}
.tepegoz-typo-line {
  position: fixed;
  z-index: 2147483646;
  height: 3px;
  pointer-events: none;
  background-image: radial-gradient(circle at 2px 2px, var(--tepegoz-typo-underline, #06AEC4) 1.2px, transparent 1.4px);
  background-size: 6px 3px;
  background-repeat: repeat-x;
}
.tepegoz-typo-popover {
  position: fixed;
  z-index: 2147483647;
  max-width: min(360px, calc(100vw - 24px));
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 8px;
  background: Canvas;
  color: CanvasText;
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.24);
  padding: 8px;
  font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.tepegoz-typo-popover strong { font-weight: 650; }
.tepegoz-typo-popover button {
  margin: 6px 4px 0 0;
  border: 1px solid rgba(148, 163, 184, 0.55);
  border-radius: 6px;
  background: ButtonFace;
  color: ButtonText;
  padding: 3px 6px;
  font: inherit;
}
`;
