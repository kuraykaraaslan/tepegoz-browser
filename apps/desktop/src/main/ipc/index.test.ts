import { describe, expect, it, vi } from 'vitest';

/**
 * The top-level IPC facade — it owns no handlers, it composes the 13 per-domain registrars. The one
 * thing worth pinning is that composition: every registrar is invoked exactly once, so a domain
 * cannot silently drop out of the wiring when someone edits this file.
 */

const reg = vi.hoisted(() =>
  Object.fromEntries(
    [
      'agent',
      'tabsWindows',
      'find',
      'process',
      'tabDrag',
      'content',
      'downloads',
      'uploads',
      'tasks',
      'siteData',
      'pageInfo',
      'network',
      'trust',
    ].map((k) => [k, vi.fn()]),
  ),
);

vi.mock('./ipc-agent', () => ({ registerAgentIpc: reg.agent, abortActiveAgentRuns: vi.fn() }));
vi.mock('./ipc-tabs-windows', () => ({ registerTabsWindowsIpc: reg.tabsWindows }));
vi.mock('./ipc-find', () => ({ registerFindIpc: reg.find }));
vi.mock('./ipc-process', () => ({ registerProcessIpc: reg.process }));
vi.mock('../tab-drag-coordinator', () => ({ registerTabDragIpc: reg.tabDrag }));
vi.mock('./ipc-content', () => ({ registerContentIpc: reg.content }));
vi.mock('./ipc-downloads', () => ({ registerDownloadsIpc: reg.downloads }));
vi.mock('./ipc-uploads', () => ({ registerUploadsIpc: reg.uploads }));
vi.mock('./ipc-tasks', () => ({ registerTasksIpc: reg.tasks }));
vi.mock('./ipc-site-data', () => ({ registerSiteDataIpc: reg.siteData }));
vi.mock('./ipc-page-info', () => ({ registerPageInfoIpc: reg.pageInfo }));
vi.mock('./ipc-network', () => ({ registerNetworkIpc: reg.network }));
vi.mock('./ipc-trust', () => ({ registerTrustIpc: reg.trust }));

const { registerIpc } = await import('./index');

describe('registerIpc', () => {
  it('invokes every per-domain registrar exactly once', () => {
    registerIpc();
    for (const [name, fn] of Object.entries(reg)) {
      expect(fn, name).toHaveBeenCalledTimes(1);
    }
  });
});
