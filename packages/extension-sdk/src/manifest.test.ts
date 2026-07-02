import { describe, it, expect } from 'vitest';
import { defineExtension, validateManifest } from './manifest';

const VALID = {
  id: 'com.tepegoz.agent',
  name: 'Agent',
  version: '0.1.0',
  surfaces: ['panel'],
} as const;

describe('extension manifest schema', () => {
  it('accepts a minimal valid manifest and applies defaults', () => {
    const m = defineExtension(VALID);
    expect(m.id).toBe('com.tepegoz.agent');
    expect(m.description).toBe(''); // default
    expect(m.permissions).toEqual([]); // default
    expect(m.labels).toEqual({}); // default
    expect(m.actions.click).toBe('panel'); // defaults to the first surface
    expect(m.actions.doubleClick).toBeUndefined();
  });

  it('keeps provided description + permissions + labels', () => {
    const m = defineExtension({
      ...VALID,
      description: 'Does things',
      permissions: ['tabs'],
      labels: { tr: { name: 'Ajan' } },
    });
    expect(m.description).toBe('Does things');
    expect(m.permissions).toEqual(['tabs']);
    expect(m.labels.tr?.name).toBe('Ajan');
  });

  it('binds click + doubleClick actions to declared surfaces', () => {
    const m = defineExtension({
      ...VALID,
      surfaces: ['popup', 'page'],
      actions: { click: 'popup', doubleClick: 'page' },
    });
    expect(m.actions.click).toBe('popup');
    expect(m.actions.doubleClick).toBe('page');
  });

  it('accepts the sidebar surface', () => {
    const m = defineExtension({
      ...VALID,
      surfaces: ['panel', 'sidebar'],
      actions: { click: 'panel', doubleClick: 'sidebar' },
    });
    expect(m.surfaces).toContain('sidebar');
    expect(m.actions.doubleClick).toBe('sidebar');
  });

  it('rejects a non-reverse-DNS id (kebab / single segment)', () => {
    expect(validateManifest({ ...VALID, id: 'agent' }).success).toBe(false);
    expect(validateManifest({ ...VALID, id: 'Com.Tepegoz.Agent' }).success).toBe(false);
  });

  it('rejects a non-semver version', () => {
    expect(validateManifest({ ...VALID, version: '1.0' }).success).toBe(false);
  });

  it('rejects an empty surfaces list', () => {
    expect(validateManifest({ ...VALID, surfaces: [] }).success).toBe(false);
  });

  it('rejects an unknown surface kind', () => {
    expect(validateManifest({ ...VALID, surfaces: ['iframe'] }).success).toBe(false);
  });

  it('rejects an action bound to an unimplemented surface', () => {
    expect(
      validateManifest({ ...VALID, surfaces: ['panel'], actions: { click: 'page' } }).success,
    ).toBe(false);
  });

  it('accepts only the closed permission set (no free-form strings)', () => {
    expect(
      validateManifest({ ...VALID, permissions: ['tabs', 'read-page', 'navigate', 'network'] })
        .success,
    ).toBe(true);
    expect(validateManifest({ ...VALID, permissions: ['filesystem'] }).success).toBe(false);
    expect(validateManifest({ ...VALID, permissions: ['Tabs'] }).success).toBe(false);
  });

  it('defineExtension throws on an invalid manifest', () => {
    expect(() => defineExtension({ id: 'x' })).toThrow();
  });

  describe('mcpServer declaration', () => {
    it('is optional and accepts a valid stdio server', () => {
      expect(validateManifest(VALID).success).toBe(true); // absent is fine
      const m = defineExtension({
        ...VALID,
        mcpServer: { transport: 'stdio', command: 'my-server', args: ['--flag'] },
      });
      expect(m.mcpServer?.command).toBe('my-server');
      expect(m.mcpServer?.args).toEqual(['--flag']);
    });

    it('requires a command for stdio and a url for http_sse', () => {
      expect(validateManifest({ ...VALID, mcpServer: { transport: 'stdio' } }).success).toBe(false);
      expect(validateManifest({ ...VALID, mcpServer: { transport: 'http_sse' } }).success).toBe(
        false,
      );
      expect(
        validateManifest({
          ...VALID,
          mcpServer: { transport: 'http_sse', url: 'https://x.test/mcp' },
        }).success,
      ).toBe(true);
    });
  });
});
