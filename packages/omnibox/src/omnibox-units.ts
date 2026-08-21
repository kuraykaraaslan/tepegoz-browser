/**
 * Deterministic omnibox unit converter. Fixed ratios only: no currency, no live rates, no network.
 * Accepted forms include `12 cm to in`, `12cm in inches`, `32 f to c`, and `1,5 kg lb`.
 */
export interface UnitConversionResult {
  expression: string;
  value: number;
  formatted: string;
  fromUnit: string;
  toUnit: string;
}

type Dimension = 'length' | 'mass' | 'volume' | 'temperature' | 'speed' | 'data';

interface UnitDef {
  dimension: Dimension;
  symbol: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

const unitAliases = new Map<string, UnitDef>();
const SEPARATORS = new Set(['to', 'in', 'as', '=', '->', 'into', 'kac', 'kaç']);

function linear(
  dimension: Dimension,
  symbol: string,
  factor: number,
  aliases: readonly string[],
): void {
  const def: UnitDef = {
    dimension,
    symbol,
    toBase: (value) => value * factor,
    fromBase: (value) => value / factor,
  };
  for (const alias of aliases) unitAliases.set(normalizeUnit(alias), def);
}

function temperature(
  symbol: string,
  toCelsius: (value: number) => number,
  fromCelsius: (value: number) => number,
  aliases: readonly string[],
): void {
  const def: UnitDef = {
    dimension: 'temperature',
    symbol,
    toBase: toCelsius,
    fromBase: fromCelsius,
  };
  for (const alias of aliases) unitAliases.set(normalizeUnit(alias), def);
}

linear('length', 'mm', 0.001, [
  'mm',
  'millimeter',
  'millimeters',
  'millimetre',
  'millimetres',
  'milimetre',
]);
linear('length', 'cm', 0.01, [
  'cm',
  'centimeter',
  'centimeters',
  'centimetre',
  'centimetres',
  'santimetre',
]);
linear('length', 'm', 1, ['m', 'meter', 'meters', 'metre', 'metres', 'metre']);
linear('length', 'km', 1000, [
  'km',
  'kilometer',
  'kilometers',
  'kilometre',
  'kilometres',
  'kilometre',
]);
linear('length', 'in', 0.0254, ['in', 'inch', 'inches', 'inc', 'inç']);
linear('length', 'ft', 0.3048, ['ft', 'foot', 'feet', 'ayak']);
linear('length', 'yd', 0.9144, ['yd', 'yard', 'yards']);
linear('length', 'mi', 1609.344, ['mi', 'mile', 'miles', 'mil']);

linear('mass', 'mg', 0.000001, ['mg', 'milligram', 'milligrams', 'miligram']);
linear('mass', 'g', 0.001, ['g', 'gram', 'grams', 'gram']);
linear('mass', 'kg', 1, ['kg', 'kilogram', 'kilograms', 'kilogram']);
linear('mass', 't', 1000, ['t', 'ton', 'tons', 'tonne', 'tonnes', 'ton']);
linear('mass', 'oz', 0.028349523125, ['oz', 'ounce', 'ounces', 'ons']);
linear('mass', 'lb', 0.45359237, ['lb', 'lbs', 'pound', 'pounds']);

linear('volume', 'ml', 0.001, [
  'ml',
  'milliliter',
  'milliliters',
  'millilitre',
  'millilitres',
  'mililitre',
]);
linear('volume', 'l', 1, ['l', 'lt', 'liter', 'liters', 'litre', 'litres', 'litre']);
linear('volume', 'tsp', 0.00492892159375, ['tsp', 'teaspoon', 'teaspoons']);
linear('volume', 'tbsp', 0.01478676478125, ['tbsp', 'tablespoon', 'tablespoons']);
linear('volume', 'cup', 0.2365882365, ['cup', 'cups']);
linear('volume', 'gal', 3.785411784, ['gal', 'gallon', 'gallons']);

linear('speed', 'm/s', 1, ['m/s', 'mps', 'meter/s', 'metre/s']);
linear('speed', 'km/h', 1 / 3.6, ['km/h', 'kph', 'kmh']);
linear('speed', 'mph', 0.44704, ['mph', 'mi/h']);

linear('data', 'B', 1, ['b', 'byte', 'bytes']);
linear('data', 'KB', 1000, ['kb', 'kilobyte', 'kilobytes']);
linear('data', 'MB', 1000 ** 2, ['mb', 'megabyte', 'megabytes']);
linear('data', 'GB', 1000 ** 3, ['gb', 'gigabyte', 'gigabytes']);
linear('data', 'TB', 1000 ** 4, ['tb', 'terabyte', 'terabytes']);
linear('data', 'KiB', 1024, ['kib', 'kibibyte', 'kibibytes']);
linear('data', 'MiB', 1024 ** 2, ['mib', 'mebibyte', 'mebibytes']);
linear('data', 'GiB', 1024 ** 3, ['gib', 'gibibyte', 'gibibytes']);

temperature(
  'C',
  (value) => value,
  (value) => value,
  ['c', '°c', 'celsius', 'celcius', 'santigrat'],
);
temperature(
  'F',
  (value) => (value - 32) * (5 / 9),
  (value) => value * (9 / 5) + 32,
  ['f', '°f', 'fahrenheit'],
);
temperature(
  'K',
  (value) => value - 273.15,
  (value) => value + 273.15,
  ['k', 'kelvin'],
);

function normalizeUnit(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase('en-US')
    .replaceAll('ı', 'i')
    .replaceAll('º', '°')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,]+$/g, '');
}

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseConversion(
  input: string,
): { amount: number; from: UnitDef; to: UnitDef; fromRaw: string; toRaw: string } | null {
  const trimmed = input.trim();
  const match = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+))\s*(.+)$/.exec(trimmed);
  if (match === null) return null;
  const amount = parseAmount(match[1] ?? '');
  if (amount === null) return null;

  const parts = (match[2] ?? '').trim().split(/\s+/).filter(Boolean);
  let fromRaw = '';
  let toRaw = '';
  if (parts.length === 2) {
    [fromRaw, toRaw] = parts as [string, string];
  } else if (parts.length === 3 && SEPARATORS.has(normalizeUnit(parts[1] ?? ''))) {
    fromRaw = parts[0] ?? '';
    toRaw = parts[2] ?? '';
  } else {
    return null;
  }

  const from = unitAliases.get(normalizeUnit(fromRaw));
  const to = unitAliases.get(normalizeUnit(toRaw));
  if (from === undefined || to === undefined || from.dimension !== to.dimension) return null;
  return { amount, from, to, fromRaw, toRaw };
}

function formatNumber(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 1e10) / 1e10;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return String(normalized);
}

export function evaluateOmniboxUnitConversion(input: string): UnitConversionResult | null {
  const parsed = parseConversion(input);
  if (parsed === null) return null;
  const value = parsed.to.fromBase(parsed.from.toBase(parsed.amount));
  if (!Number.isFinite(value)) return null;
  const rounded = Number(formatNumber(value));
  return {
    expression: input.trim(),
    value: rounded,
    formatted: `${formatNumber(value)} ${parsed.to.symbol}`,
    fromUnit: parsed.from.symbol,
    toUnit: parsed.to.symbol,
  };
}
