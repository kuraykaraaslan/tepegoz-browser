import { describe, expect, it } from 'vitest';
import { pdfFileName } from './pdf-filename';

/**
 * The page title is attacker-controlled and becomes the `defaultPath` of a native save dialog, so
 * these are security assertions, not tidying. Each case is something a page can actually set.
 */
describe('pdfFileName', () => {
  it('keeps an ordinary title readable', () => {
    expect(pdfFileName('Quarterly report — 2026')).toBe('Quarterly report — 2026.pdf');
  });

  it('keeps Turkish letters, which a sanitizer that whitelists ASCII would destroy', () => {
    expect(pdfFileName('Ağrı Dağı — ışık ölçümü')).toBe('Ağrı Dağı — ışık ölçümü.pdf');
  });

  /**
   * Asserted as PROPERTIES, not as one exact string: what matters is that no separator and no `..`
   * survives, and the precise spacing left behind by the substitutions is incidental. A test pinned to
   * the exact residue would fail on a harmless reordering while saying nothing about the property.
   *
   * `String.raw` for the Windows paths, and it is load-bearing: written as an ordinary literal, the
   * `\r` in `\report` is a CARRIAGE RETURN rather than two characters — which is how an earlier draft
   * of this test fed a control character in and then blamed the sanitizer for eating an `r`.
   */
  it.each([
    ['../../etc/passwd', ['etc', 'passwd']],
    [String.raw`..\..\Windows\System32\config`, ['Windows', 'System32', 'config']],
    ['/absolute/path', ['absolute', 'path']],
    [String.raw`C:\Users\kuray\report`, ['Users', 'report']],
  ])('strips path separators from %s so a title cannot steer the dialog', (title, parts) => {
    const name = pdfFileName(title);
    expect(name).not.toMatch(/[\\/]/);
    expect(name).not.toContain('..');
    expect(name.startsWith('.')).toBe(false); // a leading dot is a HIDDEN file on unix
    for (const part of parts) expect(name).toContain(part);
  });

  it('drops Windows-reserved characters, which cannot appear in a file name at all', () => {
    expect(pdfFileName('a<b>c:d"e|f?g*h')).toBe('abcdefgh.pdf');
  });

  it('drops control characters', () => {
    expect(pdfFileName('re\u0000port\u001fname')).toBe('reportname.pdf');
  });

  it('prefixes a Windows device name, which the OS refuses even with an extension', () => {
    expect(pdfFileName('CON')).toBe('_CON.pdf');
    expect(pdfFileName('lpt9')).toBe('_lpt9.pdf');
    // …and only when the WHOLE name is one. "console" is a perfectly good file name.
    expect(pdfFileName('console')).toBe('console.pdf');
  });

  it('drops trailing dots and spaces, which Windows trims silently', () => {
    expect(pdfFileName('report...')).toBe('report.pdf');
    expect(pdfFileName('report   ')).toBe('report.pdf');
  });

  it('falls back rather than producing a name that is only an extension', () => {
    expect(pdfFileName('')).toBe('page.pdf');
    expect(pdfFileName('///')).toBe('page.pdf');
    expect(pdfFileName('   ')).toBe('page.pdf');
  });

  it('caps the length, and does not leave a trailing dot where it cut', () => {
    const name = pdfFileName(`${'a'.repeat(119)}.tail`);
    expect(name.length).toBeLessThanOrEqual(125);
    expect(name.endsWith('..pdf')).toBe(false);
  });
});
