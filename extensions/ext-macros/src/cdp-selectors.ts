import type { Selector } from '@tepegoz/shared-types';

/**
 * Pure selector→CDP-query translation + the named-key table for the Macros extension's deterministic
 * selector engine. Electron-free (works on plain `Selector` data), so it lives in the extension
 * package and is unit tested directly; the main process (`macro-cdp.electron.ts`) drives the actual
 * `webContents.debugger` with these outputs.
 */

/** XML-escape a text value for embedding in an XPath string literal (concat form avoids quote issues). */
export function xpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return `concat("${value.split('"').join('", \'"\', "')}")`;
}

/** Translate one selector candidate into a CDP query (CSS via querySelector, everything else XPath). */
export function toQuery(sel: Selector): { method: 'css' | 'xpath'; query: string } {
  switch (sel.kind) {
    case 'css':
      return { method: 'css', query: sel.value };
    case 'xpath':
      return { method: 'xpath', query: sel.value };
    case 'text': {
      const lit = xpathLiteral(sel.value);
      // Wildcard/regex degrade to a substring match (XPath 1.0 has no regex); exact → normalized eq.
      const cond =
        sel.wildcard === true || sel.regex === true
          ? `contains(normalize-space(.), ${lit})`
          : `normalize-space(.)=${lit}`;
      return { method: 'xpath', query: `//*[${cond}]` };
    }
    case 'attr': {
      const name = sel.attr ?? 'id';
      const lit = xpathLiteral(sel.value);
      const cond = sel.wildcard === true ? `contains(@${name}, ${lit})` : `@${name}=${lit}`;
      return { method: 'xpath', query: `//*[${cond}]` };
    }
  }
}

/** One named key's CDP key-event fields. */
export interface KeySpec {
  key: string;
  code: string;
  keyCode: number;
  text?: string;
}

/** Named keys the macro runtime can press → CDP key-event fields (mirrors the agent driver's map). */
export const KEY_MAP: Record<string, KeySpec> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
};
