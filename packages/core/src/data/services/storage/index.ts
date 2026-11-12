import { type IItemStorage } from './IItemStorage.js';
import { FileItemStorage, type FileFormat } from './FileItemStorage.js';
import { MemoryItemStorage } from './MemoryItemStorage.js';

export type StorageOptions =
  { type: 'file'; directory: string; format?: FileFormat } | { type: 'memory' };

export const createStorage = (options: StorageOptions): IItemStorage => {
  if (options.type === 'file') {
    return new FileItemStorage({ directory: options.directory, format: options.format });
  }
  return new MemoryItemStorage();
};
