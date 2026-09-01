import { describe, it, expect } from 'vitest';
import { openDatabase, type Db } from './db';
import { LIKE_ESCAPE, escapeLikeLiteral, likeContains } from './sql-like';

describe('escapeLikeLiteral', () => {
  it('escapes %, _ and the escape character, leaves everything else alone', () => {
    expect(escapeLikeLiteral('plain text')).toBe('plain text');
    expect(escapeLikeLiteral('50%')).toBe('50\\%');
    expect(escapeLikeLiteral('a_b')).toBe('a\\_b');
    expect(escapeLikeLiteral('c:\\dir')).toBe('c:\\\\dir');
    expect(escapeLikeLiteral('%_\\')).toBe('\\%\\_\\\\');
  });
});

describe('likeContains against a real LIKE ? ESCAPE clause', () => {
  let db: Db;
  const rows = ['Alpha', 'Off 50% today', 'path a_b', 'back\\slash'];

  const run = (query: string): string[] => {
    db = openDatabase(':memory:');
    db.exec('CREATE TABLE t (v TEXT NOT NULL)');
    const ins = db.prepare('INSERT INTO t (v) VALUES (?)');
    for (const r of rows) ins.run(r);
    return (
      db
        .prepare(`SELECT v FROM t WHERE v LIKE ? ESCAPE '${LIKE_ESCAPE}'`)
        .all(likeContains(query)) as { v: string }[]
    ).map((x) => x.v);
  };

  it('matches a plain substring', () => {
    expect(run('Alph')).toEqual(['Alpha']);
  });

  it('a bare "%" matches only the row that literally contains one', () => {
    expect(run('%')).toEqual(['Off 50% today']);
  });

  it('a bare "_" matches only the row that literally contains one', () => {
    expect(run('_')).toEqual(['path a_b']);
  });

  it('a literal backslash matches only the backslash row', () => {
    expect(run('\\')).toEqual(['back\\slash']);
  });

  it('a run with an embedded wildcard is matched literally', () => {
    expect(run('50%')).toEqual(['Off 50% today']);
  });
});
