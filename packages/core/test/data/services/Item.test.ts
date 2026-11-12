import { describe, expect, it } from 'vitest';
import { Item } from '../../../src/data/services/Item.js';

describe('Item', () => {
  it('copies data properties', () => {
    const item = new Item({ id: 'item-1' }, { name: 'Example' });

    expect(item).toMatchObject({ identity: { id: 'item-1' }, name: 'Example' });
  });

  it('uses explicitly supplied citations', () => {
    const citations = [{ url: 'https://example.com' }];
    const item = new Item({ id: 'item-1' }, {}, citations);

    expect(item).toMatchObject({ identity: { id: 'item-1' }, citations });
  });

  it('rejects duplicate citation inputs', () => {
    expect(() => new Item({}, { citations: [] }, [])).toThrow(
      'Citations cannot be provided in both data and the citations argument.'
    );
  });
});
