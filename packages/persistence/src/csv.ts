/**
 * One CSV field, RFC 4180 quoted, with a spreadsheet formula-injection guard. Shared by every
 * `@tepegoz/persistence` CSV exporter (history, downloads) so the quoting rules and the injection
 * guard cannot drift apart between them.
 *
 * RFC 4180: a field is wrapped in `"` when it contains a comma, a quote, CR or LF, and inner quotes
 * are doubled. A leading `=`/`+`/`-`/`@` (plus tab and CR, which Excel/Sheets treat the same way)
 * is prefixed with a `'` so a spreadsheet renders it as text rather than evaluating it — a page
 * title, a filename or a URL is attacker-controlled.
 */
export function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}
