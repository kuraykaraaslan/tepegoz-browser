import { describe, expect, it, vi } from 'vitest';

/**
 * The `ipc-content` facade — it owns no handlers, it composes the four per-concern registrars. The one
 * thing worth pinning is that composition: every sub-registrar is invoked exactly once, so a domain
 * cannot silently fall out of the wiring when someone edits this file.
 */

const app = vi.hoisted(() => vi.fn());
const browsing = vi.hoisted(() => vi.fn());
const extensions = vi.hoisted(() => vi.fn());
const tools = vi.hoisted(() => vi.fn());

vi.mock('./ipc-content-app', () => ({ registerAppIpc: app }));
vi.mock('./ipc-content-browsing', () => ({ registerBrowsingIpc: browsing }));
vi.mock('./ipc-content-extensions', () => ({ registerExtensionsIpc: extensions }));
vi.mock('./ipc-content-tools', () => ({ registerToolsIpc: tools }));

const { registerContentIpc } = await import('./ipc-content');

describe('registerContentIpc', () => {
  it('invokes each per-concern registrar exactly once', () => {
    registerContentIpc();
    expect(app).toHaveBeenCalledTimes(1);
    expect(browsing).toHaveBeenCalledTimes(1);
    expect(extensions).toHaveBeenCalledTimes(1);
    expect(tools).toHaveBeenCalledTimes(1);
  });
});
