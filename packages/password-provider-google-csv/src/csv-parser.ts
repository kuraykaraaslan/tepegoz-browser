export interface CsvRow {
  name: string;
  url: string;
  username: string;
  password: string;
  note: string;
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function escape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Parse a Google Password Manager CSV export string into rows. Header row is skipped. */
export function parseGoogleCsv(csv: string): CsvRow[] {
  const lines = csv
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0]!.toLowerCase();
  const hasHeader =
    header.includes('name') || header.includes('url') || header.includes('username');
  const rows = hasHeader ? lines.slice(1) : lines;

  return rows
    .map((line) => {
      const cols = parseLine(line);
      return {
        name: cols[0] ?? '',
        url: cols[1] ?? '',
        username: cols[2] ?? '',
        password: cols[3] ?? '',
        note: cols[4] ?? '',
      };
    })
    .filter((r) => r.url.length > 0 && r.username.length > 0 && r.password.length > 0);
}

/** Serialize rows back to Google CSV format (with header). */
export function serializeGoogleCsv(rows: CsvRow[]): string {
  const header = 'name,url,username,password,note';
  const lines = rows.map((r) =>
    [escape(r.name), escape(r.url), escape(r.username), escape(r.password), escape(r.note)].join(
      ',',
    ),
  );
  return [header, ...lines].join('\n');
}
