import { describe, it, expect } from 'vitest';
import { loadCatalog } from './load-catalog';
import { CATALOG_VERSION } from './catalog.model';

const AGENT = {
  id: 'com.tepegoz.agent',
  name: 'Agent',
  version: '0.1.0',
  icon: 'robot',
  surfaces: ['sidebar'],
};
const MACROS = {
  id: 'com.tepegoz.macros',
  name: 'Macros',
  version: '0.1.0',
  icon: 'wand-magic-sparkles',
  surfaces: ['sidebar', 'page'],
};

function catalog(extensions: unknown[]): unknown {
  return { version: CATALOG_VERSION, extensions };
}

describe('loadCatalog', () => {
  it('loads every valid manifest and applies schema defaults', () => {
    const { entries, errors } = loadCatalog(catalog([AGENT, MACROS]));
    expect(errors).toEqual([]);
    expect(entries.map((e) => e.id)).toEqual(['com.tepegoz.agent', 'com.tepegoz.macros']);
    // defaults from the SDK schema are applied on read
    expect(entries[0]?.actions.click).toBe('sidebar');
    expect(entries[0]?.permissions).toEqual([]);
  });

  it('skips a single malformed manifest and keeps the rest', () => {
    const bad = { ...AGENT, surfaces: [] }; // empty surfaces is invalid
    const { entries, errors } = loadCatalog(catalog([bad, MACROS]));
    expect(entries.map((e) => e.id)).toEqual(['com.tepegoz.macros']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('extensions[0]');
  });

  it('skips a duplicate id, keeping the first occurrence', () => {
    const { entries, errors } = loadCatalog(catalog([AGENT, { ...AGENT, name: 'Dup' }]));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('Agent');
    expect(errors[0]).toContain('duplicate extension id');
  });

  it('rejects a wrong-version / non-object file with no entries', () => {
    expect(loadCatalog({ version: 999, extensions: [] }).entries).toEqual([]);
    expect(loadCatalog({ version: 999, extensions: [] }).errors).toHaveLength(1);
    expect(loadCatalog(null).entries).toEqual([]);
    expect(loadCatalog('not a catalog').errors).toHaveLength(1);
  });
});
