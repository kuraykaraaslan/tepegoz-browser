/**
 * Non-independent Turkic regions/peoples offered in the Region picker in addition to ISO countries.
 * These are NOT ISO 3166 regions, so each carries a `baseIso` used purely for date/number formatting
 * (a valid BCP-47 region subtag), while its own flag + 3-letter `code` provide the identity.
 *
 * Flags are bundled SVGs under `../assets/flags/<code>.svg`; sources/licenses are listed in
 * `../assets/flags/CREDITS.md`. Xinjiang (XIN) has no distinct official flag, so it reuses the ISO
 * China flag via `iso2`.
 */

// Eagerly resolve every bundled flag to its asset URL, keyed by the lower-cased file stem (= code).
const flagUrls: Record<string, string> = import.meta.glob('../assets/flags/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

function flagFor(code: string): string | undefined {
  const stem = `/${code.toLowerCase()}.svg`;
  for (const [path, url] of Object.entries(flagUrls)) {
    if (path.endsWith(stem)) return url;
  }
  return undefined;
}

type TurkicRegion = {
  /** Stored `region` value + right-edge label (3-letter, distinct from ISO alpha-2). */
  code: string;
  tr: string;
  en: string;
  /** ISO 3166-1 alpha-2 used for Intl date/number formatting only. */
  baseIso: string;
  /** Set only when the region reuses an ISO country flag instead of a bundled SVG. */
  iso2?: string;
};

/** Order is irrelevant — the picker sorts by localized label. */
export const TURKIC_REGIONS: readonly TurkicRegion[] = [
  {
    code: 'TRN',
    tr: 'Kuzey Kıbrıs Türk Cumhuriyeti (KKTC)',
    en: 'Turkish Republic of Northern Cyprus',
    baseIso: 'TR',
  },
  { code: 'TAT', tr: 'Tataristan', en: 'Tatarstan', baseIso: 'RU' },
  { code: 'BAK', tr: 'Başkurdistan', en: 'Bashkortostan', baseIso: 'RU' },
  { code: 'CHU', tr: 'Çuvaşistan', en: 'Chuvashia', baseIso: 'RU' },
  { code: 'SAK', tr: 'Saha (Yakutistan)', en: 'Sakha (Yakutia)', baseIso: 'RU' },
  { code: 'TYV', tr: 'Tuva', en: 'Tuva', baseIso: 'RU' },
  { code: 'ALT', tr: 'Altay Cumhuriyeti', en: 'Altai Republic', baseIso: 'RU' },
  { code: 'KHK', tr: 'Hakasya', en: 'Khakassia', baseIso: 'RU' },
  { code: 'KCH', tr: 'Karaçay-Çerkesya', en: 'Karachay-Cherkessia', baseIso: 'RU' },
  { code: 'KBA', tr: 'Kabardino-Balkarya', en: 'Kabardino-Balkaria', baseIso: 'RU' },
  { code: 'KKP', tr: 'Karakalpakistan', en: 'Karakalpakstan', baseIso: 'UZ' },
  { code: 'GAG', tr: 'Gagauzya', en: 'Gagauzia', baseIso: 'MD' },
  { code: 'CRM', tr: 'Kırım', en: 'Crimea', baseIso: 'UA' },
  { code: 'CRT', tr: 'Kırım Tatarları', en: 'Crimean Tatars', baseIso: 'UA' },
  { code: 'ETU', tr: 'Doğu Türkistan', en: 'East Turkestan', baseIso: 'CN' },
  { code: 'SAZ', tr: 'Güney Azerbaycan', en: 'South Azerbaijan', baseIso: 'IR' },
  { code: 'ITM', tr: 'Türkmeneli', en: 'Turkmeneli', baseIso: 'IQ' },
  { code: 'STM', tr: 'Bayırbucak', en: 'Bayırbucak', baseIso: 'SY' },
  { code: 'STA', tr: 'Suriye Türkmen Meclisi', en: 'Syrian Turkmen Assembly', baseIso: 'SY' },
  { code: 'AHM', tr: 'Ahıska', en: 'Meskheti', baseIso: 'GE' },
  { code: 'WTH', tr: 'Batı Trakya', en: 'Western Thrace', baseIso: 'GR' },
  { code: 'TKS', tr: 'Türkmen Sahra', en: 'Turkmen Sahra', baseIso: 'IR' },
  { code: 'KHO', tr: 'Horasan', en: 'Khorasan', baseIso: 'IR' },
  { code: 'AFT', tr: 'Güney Türkistan', en: 'South Turkestan', baseIso: 'AF' },
];

/** Map of custom region code → ISO alpha-2 used for date/number formatting. */
export const TURKIC_REGION_BASE_ISO: Record<string, string> = Object.fromEntries(
  TURKIC_REGIONS.map((r) => [r.code, r.baseIso]),
);

/** Bundled flag URL for a custom region code (undefined until its SVG is present). */
export function turkicFlagFor(code: string): string | undefined {
  return flagFor(code);
}
