import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteStore } from './sqlite.js';

const tmpFile = (name) => join(mkdtempSync(join(tmpdir(), 'tc-sqlite-')), name);

describe('createSqliteStore', () => {
  it('puts/gets/has/size and survives reopen (durability)', () => {
    const path = tmpFile('store.db');
    const s = createSqliteStore(path); // default clock
    expect(s.get('h')).toBeNull();
    expect(s.has('h')).toBe(false);
    s.put('h', { manifest: 1 });
    expect(s.get('h')).toEqual({ manifest: 1 });
    expect(s.has('h')).toBe(true);
    expect(s.size()).toBe(1);
    s.close();

    const reopened = createSqliteStore(path); // simulates a restart
    expect(reopened.get('h')).toEqual({ manifest: 1 });
    expect(reopened.size()).toBe(1);
    reopened.close();
  });

  it('prunes records older than the retention window', () => {
    let t = 1000;
    const s = createSqliteStore(tmpFile('prune.db'), { now: () => t });
    s.put('old', { a: 1 }); // created_at = 1000
    t = 100000; // advance time
    s.put('new', { b: 2 }); // created_at = 100000
    const removed = s.prune(5000); // drop anything older than t-5000 = 95000
    expect(removed).toBe(1);
    expect(s.has('old')).toBe(false);
    expect(s.has('new')).toBe(true);
    s.close();
  });
});
