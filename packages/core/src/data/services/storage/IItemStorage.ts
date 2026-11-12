import { Item } from '../../bots/Item.js';
import { Run } from '../Run.js';

export type HistoricalItem = {
  item: Item;
  run: Run;
};

export interface IItemStorage {
  add(namespace: string, run: Run, items: Item[]): Promise<void>;
  remove(namespace: string, fingerprints: any[]): Promise<void>;
  list(namespace: string, options: { offset?: number; limit?: number }): Promise<Item[]>;
  listHistorical(namespace: string, fingerprint: any): Promise<HistoricalItem[]>;
}
