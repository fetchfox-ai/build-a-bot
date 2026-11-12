import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Item } from '../../../src/data/bots/Item.js';

describe('Item', () => {
  it('stores data properties', () => {
    const item = new Item({ id: 'item-1' }, { name: 'Example' });

    expect(item).toMatchObject({ fingerprint: { id: 'item-1' }, data: { name: 'Example' } });
    expect(item).toMatchObject({ id: expect.any(String) });
    expect(item.timestamp).toBeInstanceOf(Date);
    expect(Object.keys(item)).toEqual(['id', 'timestamp', 'fingerprint', 'data']);
  });

  it('uses explicitly supplied citations', () => {
    const citations = [{ url: 'https://example.com' }];
    const item = new Item({ id: 'item-1' }, {}, citations);

    expect(item).toMatchObject({ fingerprint: { id: 'item-1' }, citations });
  });

  it('types data from its schema', () => {
    const schema = z.object({ name: z.string() });
    const item = new Item<typeof schema>({ id: 'item-1' }, { name: 'Example' });

    expect(item.data.name).toBe('Example');
  });

  it('rejects duplicate citation inputs', () => {
    expect(() => new Item({}, { citations: [] }, [])).toThrow(
      'Citations cannot be provided in both data and the citations argument.'
    );
  });
});
