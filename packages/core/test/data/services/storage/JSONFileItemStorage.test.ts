import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Item } from '../../../../src/data/services/Item.js';
import { Run } from '../../../../src/data/services/Run.js';
import { FileItemStorage } from '../../../../src/data/services/storage/FileItemStorage.js';
import { getOrNull } from '../../../../src/util/index.js';

const readJsonl = async (filename: string): Promise<Record<string, unknown>[]> => {
  const text = await readFile(filename, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
};

const createRun = (timestamp: string): Run => {
  const run = new Run({});
  run.finishedAt = timestamp;
  run.startedAt = timestamp;
  return run;
};

describe('FileItemStorage', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'item-storage-'));
  });

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it('writes live items and a run snapshot in the namespace directory', async () => {
    const storage = new FileItemStorage({ directory, format: 'jsonl' });
    const citations = [{ url: 'https://example.com' }];
    const item = new Item({ id: 'item-1' }, { name: 'Example' }, citations);
    const run = createRun('2026-11-09T12:00:01.000Z');

    await storage.add('first', run, [item]);

    const namespaceDirectory = join(directory, 'first');
    expect(await storage.list('first', {})).toMatchObject([item]);
    const items = await readJsonl(join(namespaceDirectory, 'items-latest.jsonl'));
    const storedCitations = await readJsonl(join(namespaceDirectory, 'citations-latest.jsonl'));
    const itemHash = getOrNull<string>(item, 'hash');
    expect(items).toEqual([
      { data: { name: 'Example' }, hash: itemHash, identity: { id: 'item-1' } },
    ]);
    expect(storedCitations).toEqual([{ citations, hash: itemHash, identity: { id: 'item-1' } }]);
    expect(Object.keys(items[0])).toEqual(['identity', 'hash', 'data']);
    expect(Object.keys(storedCitations[0])).toEqual(['identity', 'hash', 'citations']);
    expect((await readdir(namespaceDirectory)).sort()).toEqual([
      'archive',
      'citations-latest.jsonl',
      'items-latest.jsonl',
    ]);
    expect((await readdir(join(namespaceDirectory, 'archive'))).sort()).toEqual([
      'citations-run-2026-11-09-12:00:01.jsonl',
      'items-run-2026-11-09-12:00:01.jsonl',
    ]);
  });

  it('keeps namespaces separate and returns matching run history', async () => {
    const storage = new FileItemStorage({ directory, format: 'jsonl' });
    const first = new Item({ id: 'item-1' }, { name: 'First' });
    const second = new Item({ id: 'item-1' }, { name: 'Second' });

    await storage.add('first', createRun('2026-11-09T12:00:01.000Z'), [first]);
    await storage.add('first', createRun('2026-11-09T12:00:02.000Z'), [second]);
    await storage.add('second', createRun('2026-11-09T12:00:03.000Z'), [first]);
    await storage.remove('first', [{ id: 'item-1' }]);

    expect(await storage.list('first', {})).toEqual([]);
    expect(await storage.list('second', {})).toMatchObject([first]);
    expect(await storage.listHistorical('first', { id: 'item-1' })).toMatchObject([
      { item: first, run: { finishedAt: '2026-11-09T12:00:01.000Z' } },
      { item: second, run: { finishedAt: '2026-11-09T12:00:02.000Z' } },
    ]);
  });

  it.each(['jsonl', 'json', 'csv', 'tsv'] as const)(
    'persists items using %s format',
    async (format) => {
      const storage = new FileItemStorage({ directory, format });
      const item = new Item({ id: 'item-1' }, { name: 'Example' }, [
        { url: 'https://example.com' },
      ]);
      const run = createRun('2026-11-09T12:00:01.000Z');

      await storage.add('first', run, [item]);

      expect(await storage.list('first', {})).toMatchObject([item]);
      expect(await storage.listHistorical('first', { id: 'item-1' })).toMatchObject([
        { item, run: { finishedAt: run.finishedAt } },
      ]);
    }
  );
});
