import type { TypoStrings } from './i18n';
import type { TypoDictionaryInfo } from './types';

export function originOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

export function dictionaryStatus(dict: TypoDictionaryInfo, x: TypoStrings): string {
  if (dict.downloading) return x.downloading;
  if (dict.installed) return x.installed;
  if (dict.status === 'error') return x.error;
  return x.available;
}
