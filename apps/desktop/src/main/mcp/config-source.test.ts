import { describe, it, expect } from 'vitest';
import { defineExtension } from '@tepegoz/extension-sdk';
import type { McpServerPref } from '@tepegoz/desktop-ipc';
import { mergeMcpConfigs } from './config-source';

const extWithMcp = defineExtension({
  id: 'com.tepegoz.files',
  name: 'Files',
  version: '1.0.0',
  surfaces: ['panel'],
  mcpServer: { transport: 'stdio', command: 'files-server' },
});
const extNoMcp = defineExtension({
  id: 'com.tepegoz.plain',
  name: 'Plain',
  version: '1.0.0',
  surfaces: ['panel'],
});

const prefServer: McpServerPref = {
  id: 'p1',
  label: 'Pref One',
  transport: 'stdio',
  command: 'srv',
  enabled: true,
};

describe('mergeMcpConfigs', () => {
  it('merges prefs servers and enabled-extension declarations', () => {
    const out = mergeMcpConfigs(
      { mcpServers: [prefServer], extensions: [] },
      [extWithMcp, extNoMcp],
      'en',
    );
    expect(out.map((c) => c.id).sort()).toEqual(['com.tepegoz.files', 'p1']);
    const ext = out.find((c) => c.id === 'com.tepegoz.files');
    expect(ext?.source).toBe('extension');
    expect(ext?.label).toBe('Files');
  });

  it("excludes a disabled extension's server", () => {
    const out = mergeMcpConfigs(
      { mcpServers: [], extensions: [{ id: 'com.tepegoz.files', status: 'disabled' }] },
      [extWithMcp],
      'en',
    );
    expect(out).toHaveLength(0);
  });

  it('dedups by id with prefs winning over an extension of the same id', () => {
    const out = mergeMcpConfigs(
      {
        mcpServers: [{ ...prefServer, id: 'com.tepegoz.files', label: 'From Prefs' }],
        extensions: [],
      },
      [extWithMcp],
      'en',
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('prefs');
    expect(out[0]?.label).toBe('From Prefs');
  });

  it('skips an invalid prefs config (stdio without a command)', () => {
    const out = mergeMcpConfigs(
      {
        mcpServers: [{ id: 'bad', label: 'Bad', transport: 'stdio', enabled: true }],
        extensions: [],
      },
      [],
      'en',
    );
    expect(out).toHaveLength(0);
  });
});
