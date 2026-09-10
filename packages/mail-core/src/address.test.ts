import { describe, it, expect } from 'vitest';
import { parseAddressList, formatAddress, formatAddressList } from './address';

describe('parseAddressList', () => {
  it('parses a bare address', () => {
    expect(parseAddressList('ada@example.org')).toEqual([{ name: '', address: 'ada@example.org' }]);
  });

  it('parses a display name + angle-addr', () => {
    expect(parseAddressList('Ada Lovelace <ada@example.org>')).toEqual([
      { name: 'Ada Lovelace', address: 'ada@example.org' },
    ]);
  });

  it('unquotes a quoted display name that contains a comma', () => {
    expect(parseAddressList('"Doe, John" <john@example.org>')).toEqual([
      { name: 'Doe, John', address: 'john@example.org' },
    ]);
  });

  it('splits a list and does not break on a comma inside quotes or angle brackets', () => {
    expect(
      parseAddressList('"Doe, John" <john@x.org>, ada@y.org, "Carol" <carol@z.org>'),
    ).toEqual([
      { name: 'Doe, John', address: 'john@x.org' },
      { name: '', address: 'ada@y.org' },
      { name: 'Carol', address: 'carol@z.org' },
    ]);
  });

  it('strips (comments) and folds whitespace', () => {
    expect(parseAddressList('ada@example.org (Ada L.)')).toEqual([
      { name: '', address: 'ada@example.org' },
    ]);
    expect(parseAddressList('Ada\r\n  Lovelace\t<ada@example.org>')).toEqual([
      { name: 'Ada Lovelace', address: 'ada@example.org' },
    ]);
  });

  it('flattens a group to its members and drops the group name', () => {
    expect(parseAddressList('Managers: alice@x.org, bob@x.org;')).toEqual([
      { name: '', address: 'alice@x.org' },
      { name: '', address: 'bob@x.org' },
    ]);
  });

  it('dedupes by address, case-insensitively', () => {
    expect(parseAddressList('a@x.org, A@X.ORG, b@x.org')).toEqual([
      { name: '', address: 'a@x.org' },
      { name: '', address: 'b@x.org' },
    ]);
  });

  it('is total on junk input', () => {
    expect(parseAddressList('')).toEqual([]);
    expect(parseAddressList('   , ; , ')).toEqual([]);
    expect(parseAddressList('<>')).toEqual([]);
    expect(parseAddressList('not an address at all')).toEqual([]);
    expect(() => parseAddressList('"' + 'x'.repeat(100_000))).not.toThrow();
  });
});

describe('formatAddress / formatAddressList', () => {
  it('omits the name when empty, quotes only when needed', () => {
    expect(formatAddress({ name: '', address: 'a@x.org' })).toBe('a@x.org');
    expect(formatAddress({ name: 'Ada', address: 'a@x.org' })).toBe('Ada <a@x.org>');
    expect(formatAddress({ name: 'Doe, John', address: 'j@x.org' })).toBe('"Doe, John" <j@x.org>');
    expect(formatAddress({ name: 'a "b" c', address: 'a@x.org' })).toBe('"a \\"b\\" c" <a@x.org>');
  });

  it('round-trips a list', () => {
    const list = parseAddressList('"Doe, John" <j@x.org>, ada@y.org');
    expect(parseAddressList(formatAddressList(list))).toEqual(list);
  });
});
