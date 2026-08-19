import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeAtomic, readJson, updateJson } from '../src/utils';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'healwright-cache-'));
  file = path.join(dir, 'nested', 'healed_locators.json');
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('writeAtomic', () => {
  it('writes JSON through to a nested path', async () => {
    await writeAtomic(file, { a: 1 });
    expect(await readJson(file, null)).toEqual({ a: 1 });
  });

  it('leaves no temp files behind', async () => {
    await writeAtomic(file, { a: 1 });
    const leftovers = (await fs.readdir(path.dirname(file))).filter(f => f.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('survives concurrent writers without corrupting the file', async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => writeAtomic(file, { writer: i }))
    );
    const result = await readJson<Record<string, unknown> | null>(file, null);
    expect(result).not.toBeNull();
    expect(typeof result!.writer).toBe('number');
    const leftovers = (await fs.readdir(path.dirname(file))).filter(f => f.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });
});

describe('updateJson', () => {
  it('merges into an existing file instead of replacing it', async () => {
    await writeAtomic(file, { existing: 'kept' });
    await updateJson<Record<string, unknown>>(file, cur => ({ ...cur, added: 'new' }));
    expect(await readJson(file, null)).toEqual({ existing: 'kept', added: 'new' });
  });

  it('starts from an empty object when the file does not exist', async () => {
    await updateJson<Record<string, unknown>>(file, cur => ({ ...cur, first: true }));
    expect(await readJson(file, null)).toEqual({ first: true });
  });

  it('keeps every concurrent writer entry rather than last-write-wins', async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        updateJson<Record<string, unknown>>(file, cur => ({ ...cur, [`key${i}`]: i }))
      )
    );
    const result = await readJson<Record<string, number>>(file, {});
    expect(Object.keys(result)).toHaveLength(25);
    expect(result.key0).toBe(0);
    expect(result.key24).toBe(24);
  });

  it('picks up entries another writer added after the cache was first read', async () => {
    await writeAtomic(file, { fromOtherWorker: 1 });
    // Simulate a second process appending while we hold a stale in-memory view.
    const staleView = { fromOtherWorker: 1 };
    await fs.writeFile(file, JSON.stringify({ ...staleView, addedByWorkerB: 2 }), 'utf8');
    await updateJson<Record<string, unknown>>(file, cur => ({ ...cur, addedByWorkerA: 3 }));
    expect(await readJson(file, null)).toEqual({
      fromOtherWorker: 1,
      addedByWorkerB: 2,
      addedByWorkerA: 3,
    });
  });
});
