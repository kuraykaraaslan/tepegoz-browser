import { describe, expect, it } from 'vitest';
import { skipWithoutNativeSqlite } from './native-abi';
import { migrate, openDatabase } from './index';
import { DownloadStore, type PersistedDownload } from './download-store';

function download(overrides: Partial<PersistedDownload> = {}): PersistedDownload {
  return {
    id: 'd1',
    url: 'https://example.com/file.txt',
    filename: 'file.txt',
    status: 'quarantined',
    risk: 'normal',
    trustVerdict: 'unknown',
    receivedBytes: 10,
    totalBytes: 10,
    canResume: false,
    createdAt: 1,
    updatedAt: 1,
    provenance: { actor: 'user', sourceOrigin: 'https://example.com' },
    quarantinePath: 'C:\\tmp\\q\\file.txt',
    finalPath: 'C:\\Downloads\\file.txt',
    ...overrides,
  };
}

describe.skipIf(skipWithoutNativeSqlite())('DownloadStore', () => {
  it('persists and updates download projections', () => {
    const db = openDatabase(':memory:');
    migrate(db);

    DownloadStore.upsert(db, download());
    DownloadStore.upsert(db, download({ status: 'completed', updatedAt: 2, completedAt: 2 }));

    const [row] = DownloadStore.list(db);
    expect(row?.status).toBe('completed');
    expect(row?.finalPath).toBe('C:\\Downloads\\file.txt');
    expect(row?.provenance.sourceOrigin).toBe('https://example.com');

    db.close();
  });

  it('clears terminal rows only', () => {
    const db = openDatabase(':memory:');
    migrate(db);

    DownloadStore.upsert(db, download({ id: 'active', status: 'in_progress' }));
    DownloadStore.upsert(db, download({ id: 'done', status: 'completed' }));
    DownloadStore.clearTerminal(db);

    expect(DownloadStore.list(db).map((row) => row.id)).toEqual(['active']);
    db.close();
  });
});
