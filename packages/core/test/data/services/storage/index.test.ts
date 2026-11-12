import { describe, expect, it } from 'vitest';
import { FileItemStorage } from '../../../../src/data/services/storage/FileItemStorage.js';
import { MemoryItemStorage } from '../../../../src/data/services/storage/MemoryItemStorage.js';
import { createStorage } from '../../../../src/data/services/storage/index.js';

describe('createStorage', () => {
  it('creates file and memory storage', () => {
    const fileStorage = createStorage({ directory: 'items', type: 'file' });
    expect(fileStorage).toBeInstanceOf(FileItemStorage);
    expect((fileStorage as FileItemStorage).format).toBe('jsonl');
    expect(createStorage({ type: 'memory' })).toBeInstanceOf(MemoryItemStorage);
  });
});
