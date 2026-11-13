import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { DocumentLibrary, DiskLibraryBackend } from '../../src/documents/index.js';
import { Logger } from '../../src/logger.js';
import { BrowserToolCache } from '../../src/mastra/tools/browserTools/BrowserToolCache.js';
import { createTools } from '../../src/mastra/tools/fetchTools/tools.js';
import { NoProxy, ProxyRegistry } from '../../src/proxy/index.js';
import { MemoryCache } from '../lib/MemoryCache.js';

it('isolates fetch references between stores while retaining persistent-store cache hits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'document-scope-'));
  try {
    const proxy = new NoProxy();
    const fetch = vi
      .spyOn(proxy, 'fetch')
      .mockImplementation(
        async () => new Response('<p>Data</p>', { headers: { 'content-type': 'text/html' } })
      );
    const a = new DocumentLibrary({
      backend: new DiskLibraryBackend({ namespace: 'a', logger: new Logger(), rootDir: root }),
      logger: new Logger(),
    });
    const b = new DocumentLibrary({
      backend: new DiskLibraryBackend({ namespace: 'b', logger: new Logger(), rootDir: root }),
      logger: new Logger(),
    });
    const again = new DocumentLibrary({
      backend: new DiskLibraryBackend({ namespace: 'a', logger: new Logger(), rootDir: root }),
      logger: new Logger(),
    });
    for (const library of [a, b, again]) {
      const tools = await createTools({
        logger: new Logger(),
        documentLibrary: library,
        proxyRegistry: new ProxyRegistry({
          proxies: [proxy],
        }),
      });
      const out = (await tools.fetchTool.execute!(
        { url: 'https://example.test/scope', proxy: 'none' },
        {} as never
      )) as { documentId: string };
      expect(library.get({ documentId: out.documentId })?.content).toBe('<p>Data</p>');
    }
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      new DocumentLibrary({
        logger: new Logger(),
      }).cacheScope
    ).not.toBe(
      new DocumentLibrary({
        logger: new Logger(),
      }).cacheScope
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('isolates browser sequence entries between document stores', async () => {
  const backend = new MemoryCache();
  const a = new BrowserToolCache({
    cache: backend,
    cacheScope: 'a',
    logger: new Logger(),
  });
  const b = new BrowserToolCache({
    cache: backend,
    cacheScope: 'b',
    logger: new Logger(),
  });
  await a.recordToolCall('first', 'content', {}, { documentId: 'a-only' });
  expect((await a.checkToolCall('again', 'content', {})).hit).toBe(true);
  expect((await b.checkToolCall('first', 'content', {})).hit).toBe(false);
});
