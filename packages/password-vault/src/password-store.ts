import type { Db } from '@tepegoz/persistence';
import type { LoginCredential, LoginCredentialMeta } from '@tepegoz/password-core';

interface CredentialRow {
  id: string;
  url: string;
  username: string;
  title: string;
  notes: string;
  encrypted_pw: string;
  provider_id: string;
  created_at: number;
  updated_at: number;
}

function toMeta(row: CredentialRow): LoginCredentialMeta {
  return {
    id: row.id,
    url: row.url,
    username: row.username,
    title: row.title,
    notes: row.notes,
    providerId: row.provider_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toFull(row: CredentialRow): LoginCredential {
  return { ...toMeta(row), encryptedPassword: row.encrypted_pw };
}

/** SQLite CRUD for `login_credentials`. Mirrors HistoryStore conventions. */
export class PasswordStore {
  static list(db: Db, providerId = 'local'): LoginCredentialMeta[] {
    const rows = db
      .prepare('SELECT * FROM login_credentials WHERE provider_id = ? ORDER BY updated_at DESC')
      .all(providerId) as CredentialRow[];
    return rows.map(toMeta);
  }

  static findById(db: Db, id: string): LoginCredential | null {
    const row = db.prepare('SELECT * FROM login_credentials WHERE id = ?').get(id) as
      CredentialRow | undefined;
    return row ? toFull(row) : null;
  }

  static findByUrl(db: Db, normalizedOrigin: string): LoginCredential[] {
    const rows = db
      .prepare('SELECT * FROM login_credentials WHERE url = ? ORDER BY updated_at DESC')
      .all(normalizedOrigin) as CredentialRow[];
    return rows.map(toFull);
  }

  static upsert(
    db: Db,
    record: {
      id: string;
      url: string;
      username: string;
      encryptedPw: string;
      title: string;
      notes: string;
      providerId: string;
      createdAt: number;
      updatedAt: number;
    },
  ): void {
    db.prepare(
      `INSERT INTO login_credentials
         (id, url, username, title, notes, encrypted_pw, provider_id, created_at, updated_at)
       VALUES
         (@id, @url, @username, @title, @notes, @encryptedPw, @providerId, @createdAt, @updatedAt)
       ON CONFLICT(url, username) DO UPDATE SET
         title = @title,
         notes = @notes,
         encrypted_pw = @encryptedPw,
         updated_at = @updatedAt`,
    ).run(record);
  }

  static remove(db: Db, id: string): void {
    db.prepare('DELETE FROM login_credentials WHERE id = ?').run(id);
  }
}
