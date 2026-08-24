/**
 * A safe file name for "save this page as PDF", derived from the page's own title.
 *
 * The title is **attacker-controlled** — it is whatever `<title>` the page sets — and it ends up as the
 * `defaultPath` of a native save dialog. So this is not cosmetic tidying:
 *
 *  - **Path separators and `..` are removed**, so a title cannot steer the dialog out of the folder it
 *    opened in. `basename` alone would not do: on Windows `\` is also a separator, and a bare `C:`
 *    prefix is a drive-relative path.
 *  - **Windows-reserved characters** (`< > : " | ? *`) and control characters are stripped; a name
 *    containing them cannot be created at all, so the dialog would fail on a title the user did not
 *    write.
 *  - **Windows device names** (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`) are reserved
 *    with ANY extension, so `CON.pdf` is refused by the OS. They get a prefix rather than being
 *    rejected, because refusing to save is a worse answer than saving under a slightly different name.
 *  - **Leading and trailing dots and spaces** are dropped. Windows trims trailing ones silently, so a
 *    name ending in one does not round-trip; and a LEADING dot is a hidden file on unix, which the
 *    residue of a `../../` traversal attempt should not get to decide.
 *
 * Length is capped well below the 255-byte path-segment limit, leaving room for the folder, the
 * extension and a `(1)` de-duplication suffix the OS may add.
 */

const MAX_STEM = 120;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function pdfFileName(title: string, fallback = 'page'): string {
  const stem = title
    // eslint-disable-next-line no-control-regex -- control characters are exactly what must go
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, ' ') // separators, BOTH platforms' — not just the posix one
    .replace(/[<>:"|?*]/g, '') // reserved on Windows; harmless to drop elsewhere
    .replace(/\.\.+/g, '.') // no `..` segment survives
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
    .slice(0, MAX_STEM)
    .replace(/[.\s]+$/, ''); // …and the slice can expose a new trailing dot

  const safe = stem.length > 0 ? stem : fallback;
  return `${RESERVED.test(safe) ? `_${safe}` : safe}.pdf`;
}
