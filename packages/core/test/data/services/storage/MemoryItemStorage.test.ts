import { describe, expect, it } from 'vitest';
import { Item } from '../../../../src/data/services/Item.js';
import { Run } from '../../../../src/data/services/Run.js';
import { MemoryItemStorage } from '../../../../src/data/services/storage/MemoryItemStorage.js';

describe('MemoryItemStorage', () => {
  it('stores live and historical items by namespace', async () => {
    const storage = new MemoryItemStorage();
    const run = new Run({});
    run.finishedAt = '2026-11-09T12:00:01.000Z';
    const item = new Item({ id: 'item-1' }, { name: 'Example' });

    await storage.add('first', run, [item]);

    expect(await storage.list('first', {})).toMatchObject([item]);
    expect(await storage.listHistorical('first', { id: 'item-1' })).toMatchObject([{ item, run }]);

    await storage.remove('first', [{ id: 'item-1' }]);

    expect(await storage.list('first', {})).toEqual([]);
  });
});
