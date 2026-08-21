import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function translatePageScript(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, 'translate-page-injector.electron.ts'), 'utf8');
  const match = /export const TRANSLATE_PAGE_SCRIPT = `([\s\S]*?)`;\r?\n\r?\nconst listeners/.exec(
    source,
  );
  if (match?.[1] === undefined) throw new Error('TRANSLATE_PAGE_SCRIPT not found');
  return match[1].replaceAll('${MAX_PAGE_ITEMS}', '260').replaceAll('${MAX_ITEM_CHARS}', '1600');
}

describe('translate page injector', () => {
  it('ships a syntactically valid injection script', () => {
    expect(() => new vm.Script(translatePageScript())).not.toThrow();
  });

  it('keeps restore and receive entry points available', () => {
    const script = translatePageScript();
    expect(script).toContain('__tepegozTranslateReceive');
    expect(script).toContain('__tepegozTranslateRestore');
  });
});
