import { describe, expect, it } from 'vitest';
import { serializeDownloadsCsv } from './downloads-export';
import type { DownloadExportRow } from './download-store';

const row = (over: Partial<DownloadExportRow> = {}): DownloadExportRow => ({
  filename: 'report.pdf',
  url: 'https://example.com/report.pdf',
  sourceOrigin: 'https://example.com',
  totalBytes: 2048,
  status: 'completed',
  risk: 'normal',
  createdAt: Date.parse('2026-09-08T10:00:00.000Z'),
  completedAt: Date.parse('2026-09-08T10:01:00.000Z'),
  ...over,
});

describe('serializeDownloadsCsv', () => {
  it('writes the header even when there are no rows', () => {
    expect(serializeDownloadsCsv([])).toBe(
      'filename,url,source_origin,total_bytes,status,risk,created_at,completed_at\r\n',
    );
  });

  it('writes one CRLF-terminated line per row with ISO timestamps', () => {
    const out = serializeDownloadsCsv([row()]);
    expect(out).toBe(
      'filename,url,source_origin,total_bytes,status,risk,created_at,completed_at\r\n' +
        'report.pdf,https://example.com/report.pdf,https://example.com,2048,completed,normal,' +
        '2026-09-08T10:00:00.000Z,2026-09-08T10:01:00.000Z\r\n',
    );
  });

  it('leaves total_bytes and completed_at blank when unknown, rather than "null"/"Invalid Date"', () => {
    const out = serializeDownloadsCsv([
      row({ totalBytes: null, completedAt: null, status: 'in_progress' }),
    ]);
    expect(out.split('\r\n')[1]).toBe(
      'report.pdf,https://example.com/report.pdf,https://example.com,,in_progress,normal,' +
        '2026-09-08T10:00:00.000Z,',
    );
  });

  it('RFC-4180 quotes a field with a comma, a quote, or a newline; doubles inner quotes', () => {
    const out = serializeDownloadsCsv([
      row({ filename: 'a, b "c"\nd.bin', url: 'https://x/?a=1,2' }),
    ]);
    expect(out.split('\r\n')[1]).toBe(
      '"a, b ""c""\nd.bin","https://x/?a=1,2",https://example.com,2048,completed,normal,' +
        '2026-09-08T10:00:00.000Z,2026-09-08T10:01:00.000Z',
    );
  });

  it('neutralizes a spreadsheet formula-injection filename (leading = + - @)', () => {
    const out = serializeDownloadsCsv([row({ filename: '=cmd|"/c calc"!A1' })]);
    // prefixed with a quote so Excel/Sheets treat it as text, then CSV-quoted for the inner quotes
    expect(out.split('\r\n')[1]).toContain("\"'=cmd|");
  });

  it('leaves created_at blank for a non-finite timestamp', () => {
    const out = serializeDownloadsCsv([row({ createdAt: Number.NaN })]);
    expect(out.split('\r\n')[1]).toBe(
      'report.pdf,https://example.com/report.pdf,https://example.com,2048,completed,normal,,' +
        '2026-09-08T10:01:00.000Z',
    );
  });
});
