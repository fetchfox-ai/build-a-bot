import { isDeepStrictEqual } from 'node:util';
import { getOrNull } from '../../../util/index.js';
import { Item } from '../../bots/Item.js';
import { Run } from '../Run.js';
import { type HistoricalItem, type IItemStorage } from './IItemStorage.js';

export class MemoryItemStorage implements IItemStorage {
  readonly #items = new Map<string, Item[]>();
  readonly #history = new Map<string, HistoricalItem[]>();

  async add(namespace: string, run: Run, items: Item[]): Promise<void> {
    const current = this.#items.get(namespace) ?? [];
    current.push(...items);
    this.#items.set(namespace, current);
    const history = this.#history.get(namespace) ?? [];
    history.push(...items.map((item) => ({ item, run })));
    this.#history.set(namespace, history);
  }
  async remove(namespace: string, fingerprints: any[]): Promise<void> {
    const items = this.#items.get(namespace) ?? [];
    this.#items.set(
      namespace,
      items.filter(
        (item) =>
          !fingerprints.some((fingerprint) => isDeepStrictEqual(getOrNull(item, 'fingerprint'), fingerprint))
      )
    );
  }
  async list(
    namespace: string,
    { offset = 0, limit }: { offset?: number; limit?: number }
  ): Promise<Item[]> {
    const items = this.#items.get(namespace) ?? [];
    return limit === undefined ? items.slice(offset) : items.slice(offset, offset + limit);
  }
  async listHistorical(namespace: string, fingerprint: any): Promise<HistoricalItem[]> {
    return (this.#history.get(namespace) ?? []).filter(({ item }) =>
      isDeepStrictEqual(getOrNull(item, 'fingerprint'), fingerprint)
    );
  }
}
