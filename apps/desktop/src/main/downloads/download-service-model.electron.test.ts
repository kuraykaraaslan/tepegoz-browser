import { describe, expect, it } from 'vitest';
import { publicRecord } from './download-service-model.electron';
import type { ActiveDownload } from './download-service-model.electron';

/**
 * `publicRecord` is the boundary between what the download service knows and what the renderer is
 * allowed to see. The renderer has no filesystem, so the projection MUST drop every host-only field —
 * the quarantine path, the final path, the route partition, the redirect chain, the live
 * `DownloadItem` — and it must attach the live speed estimate only while a transfer is actually
 * moving (it is never persisted, so a paused or finished row that reported one would be lying).
 */

function activeRecord(over: Partial<ActiveDownload> = {}): ActiveDownload {
  return {
    id: 'd1',
    url: 'https://files.example/setup.bin',
    filename: 'setup.bin',
    status: 'in_progress',
    risk: 'normal',
    trustVerdict: 'unknown',
    receivedBytes: 512,
    totalBytes: 2048,
    canResume: true,
    createdAt: 1_000,
    updatedAt: 2_000,
    provenance: { actor: 'site', sourceOrigin: 'https://files.example' },
    // Host-only fields that must never cross the boundary:
    quarantinePath: '/ud/Downloads/quarantine/d1-setup.bin',
    finalPath: '/home/kuray/Downloads/setup.bin',
    partition: 'persist:tunnel-7f3a',
    urlChain: ['https://files.example/a', 'https://files.example/setup.bin'],
    etag: '"v1"',
    lastModified: 'Wed, 02 Sep 2026 10:00:00 GMT',
    item: { fake: true } as unknown as ActiveDownload['item'],
    ...over,
  };
}

describe('publicRecord', () => {
  it('keeps the renderer-facing fields', () => {
    const out = publicRecord(activeRecord());
    expect(out).toMatchObject({
      id: 'd1',
      url: 'https://files.example/setup.bin',
      filename: 'setup.bin',
      status: 'in_progress',
      risk: 'normal',
      trustVerdict: 'unknown',
      receivedBytes: 512,
      totalBytes: 2048,
      canResume: true,
      createdAt: 1_000,
      updatedAt: 2_000,
      provenance: { actor: 'site' },
    });
  });

  it('strips every host-only field', () => {
    const out = publicRecord(activeRecord()) as unknown as Record<string, unknown>;
    for (const forbidden of [
      'quarantinePath',
      'finalPath',
      'partition',
      'urlChain',
      'etag',
      'lastModified',
      'item',
    ]) {
      expect(out, `${forbidden} must not reach the renderer`).not.toHaveProperty(forbidden);
    }
  });

  it('omits optional fields when they are absent', () => {
    const out = publicRecord(
      activeRecord({
        mimeType: undefined,
        completedAt: undefined,
        error: undefined,
        sha256: undefined,
      }),
    ) as unknown as Record<string, unknown>;
    expect(out).not.toHaveProperty('mimeType');
    expect(out).not.toHaveProperty('completedAt');
    expect(out).not.toHaveProperty('error');
    expect(out).not.toHaveProperty('sha256');
  });

  it('includes optional fields when present', () => {
    const out = publicRecord(
      activeRecord({
        mimeType: 'application/octet-stream',
        completedAt: 3_000,
        error: 'net::ERR_FAILED',
        sha256: 'a'.repeat(64),
      }),
    );
    expect(out).toMatchObject({
      mimeType: 'application/octet-stream',
      completedAt: 3_000,
      error: 'net::ERR_FAILED',
      sha256: 'a'.repeat(64),
    });
  });

  it('attaches the live rate only while the transfer is in progress', () => {
    const rate = { bytesPerSecond: 1_048_576, etaSeconds: 42 };
    const moving = publicRecord(activeRecord({ status: 'in_progress' }), rate);
    expect(moving).toMatchObject({ bytesPerSecond: 1_048_576, etaSeconds: 42 });
  });

  it('drops the rate for a paused or terminal row even when one is passed', () => {
    const rate = { bytesPerSecond: 1_048_576, etaSeconds: 42 };
    for (const status of ['paused', 'quarantined', 'completed', 'failed'] as const) {
      const out = publicRecord(activeRecord({ status }), rate) as unknown as Record<string, unknown>;
      expect(out).not.toHaveProperty('bytesPerSecond');
      expect(out).not.toHaveProperty('etaSeconds');
    }
  });

  it('omits the rate for an in-progress row when none is available', () => {
    const noRate = publicRecord(activeRecord({ status: 'in_progress' })) as unknown as Record<string, unknown>;
    expect(noRate).not.toHaveProperty('bytesPerSecond');
    const nullRate = publicRecord(
      activeRecord({ status: 'in_progress' }),
      null,
    ) as unknown as Record<string, unknown>;
    expect(nullRate).not.toHaveProperty('bytesPerSecond');
  });
});
