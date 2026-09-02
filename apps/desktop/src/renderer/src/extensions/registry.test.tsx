// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ExtensionManifestWire } from '@tepegoz/desktop-ipc';
import type { ExtensionSurfaceKind } from '@tepegoz/extension-sdk';
import { iconNodeFor } from './icon-registry';
import { buildExtensionRegistry, extensionDefById } from './registry';

/**
 * The renderer-side extension registry: it pairs the IPC-delivered catalog (identity) with the lazy
 * surface loaders and a data-driven icon. What matters here is that a declared surface with NO
 * registered loader is dropped rather than rendered as `undefined`, that an unknown extension id still
 * produces a usable (icon-only) entry, and that the icon slug lookup falls back instead of throwing.
 */

afterEach(cleanup);

function wire(
  id: string,
  surfaces: ExtensionSurfaceKind[],
  icon = 'robot',
): ExtensionManifestWire {
  return {
    id,
    name: 'Test',
    version: '1.0.0',
    description: '',
    icon,
    surfaces,
    actions: { click: surfaces[0], doubleClick: undefined },
    labels: {},
    permissions: [],
  };
}

describe('buildExtensionRegistry', () => {
  it('keeps one entry per manifest, preserving id and manifest identity', () => {
    const manifest = wire('com.tepegoz.agent', ['sidebar', 'page']);
    const def = buildExtensionRegistry([manifest])[0]!;
    expect(def.id).toBe('com.tepegoz.agent');
    expect(def.manifest).toBe(manifest);
    expect(def.icon).not.toBeNull();
  });

  it('binds a lazy component only for surfaces that have a registered loader', () => {
    // The agent extension registers `sidebar` and `page` loaders but not `popup`.
    const def = buildExtensionRegistry([
      wire('com.tepegoz.agent', ['sidebar', 'page', 'popup']),
    ])[0]!;
    expect('sidebar' in def.surfaces).toBe(true);
    expect('page' in def.surfaces).toBe(true);
    expect('popup' in def.surfaces).toBe(false);
  });

  it('still yields an icon-only entry for an id with no loaders at all', () => {
    const def = buildExtensionRegistry([wire('com.example.unknown', ['page'])])[0]!;
    expect(def.surfaces).toEqual({});
    expect(def.icon).not.toBeNull();
  });
});

describe('extensionDefById', () => {
  const registry = buildExtensionRegistry([
    wire('com.tepegoz.agent', ['sidebar']),
    wire('com.tepegoz.adblock', ['popup'], 'ban'),
  ]);

  it('returns the matching entry', () => {
    expect(extensionDefById(registry, 'com.tepegoz.adblock')?.id).toBe('com.tepegoz.adblock');
  });

  it('returns undefined when nothing matches', () => {
    expect(extensionDefById(registry, 'com.tepegoz.nope')).toBeUndefined();
  });
});

describe('iconNodeFor', () => {
  it('renders the mapped FontAwesome icon for a known slug', () => {
    const { container } = render(<span>{iconNodeFor('language')}</span>);
    expect(container.querySelector('svg[data-icon="language"]')).not.toBeNull();
  });

  it('falls back to the puzzle-piece icon for an unknown slug', () => {
    const { container } = render(<span>{iconNodeFor('not-a-real-slug')}</span>);
    expect(container.querySelector('svg[data-icon="puzzle-piece"]')).not.toBeNull();
  });
});
