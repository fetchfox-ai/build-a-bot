import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createGlobalContext, GlobalContext, mergeContext } from '../../src/context/index.js';
import { Logger } from '../../src/logger.js';
import { BrowserSession } from '../../src/mastra/tools/browserTools/BrowserSession.js';
import { CdpProxy, NoProxy, ProxyRegistry } from '../../src/proxy/index.js';
import { FileItemStorage } from '../../src/data/services/storage/FileItemStorage.js';
import { MemoryItemStorage } from '../../src/data/services/storage/MemoryItemStorage.js';

describe('ProxyRegistry', () => {
  it('lists and retrieves registered proxies', () => {
    const direct = new NoProxy();
    const cdp = new CdpProxy({
      id: 'browser',
      cdpUrl: 'wss://browser.example.test',
    });
    const registry = new ProxyRegistry({
      proxies: [direct, cdp],
    });

    expect(registry.list()).toEqual([direct, cdp]);
    expect(registry.get('browser')).toBe(cdp);
    expect(registry.require('none')).toBe(direct);
  });

  it('rejects duplicate and unknown proxy IDs', () => {
    const registry = new ProxyRegistry({
      proxies: [new NoProxy()],
    });

    expect(() => registry.add(new NoProxy())).toThrow('Proxy "none" is already registered.');
    expect(() => registry.require('missing')).toThrow('Unknown proxy: missing');
    expect(() => registry.remove('missing')).toThrow('Unknown proxy: missing');
  });

  it('removes and returns a registered proxy', () => {
    const direct = new NoProxy();
    const registry = new ProxyRegistry({
      proxies: [direct],
    });

    expect(registry.remove('none')).toBe(direct);
    expect(registry.list()).toEqual([]);
  });
});

describe('GlobalContext proxy registry', () => {
  const dependencies = {
    documentLibrary: {} as GlobalContext['documentLibrary'],
    mastra: {} as GlobalContext['mastra'],
    rootDirectory: 'build-a-bot',
  };

  it('uses a registry with the direct proxy by default', async () => {
    const context = await createGlobalContext({ logger: new Logger(), ...dependencies });
    const other = await createGlobalContext({ logger: new Logger(), ...dependencies });

    expect(context.proxyRegistry.require('none')).toBeInstanceOf(NoProxy);
    expect(other.proxyRegistry).not.toBe(context.proxyRegistry);
    expect(context.itemStorage).toBeInstanceOf(MemoryItemStorage);
  });

  it('preserves the registry and rejects replacing it without rebuilding tools', () => {
    const proxyRegistry = new ProxyRegistry({
      proxies: [new NoProxy()],
    });
    const context = new GlobalContext({
      emitter: new EventEmitter(),
      logger: new Logger(),
      brightDataApiKey: null,
      openRouterApiKey: null,
      browserSession: new BrowserSession({
        proxyRegistry,
        logger: new Logger(),
      }),
      itemStorage: new FileItemStorage({ directory: 'build-a-bot/items', format: 'jsonl' }),
      ...dependencies,
      proxyRegistry,
    });
    const registry = new ProxyRegistry({
      proxies: [new NoProxy()],
    });

    expect(mergeContext(context).proxyRegistry).toBe(context.proxyRegistry);
    expect(() => mergeContext(context, { proxyRegistry: registry })).toThrow('createGlobalContext');
  });

  it('uses an injected registry when creating a context', async () => {
    const registry = new ProxyRegistry({
      proxies: [new NoProxy()],
    });
    const context = await createGlobalContext({
      logger: new Logger(),
      ...dependencies,
      proxyRegistry: registry,
    });

    expect(context.proxyRegistry).toBe(registry);
  });

  it('creates item storage from storage options', async () => {
    const context = await createGlobalContext({
      logger: new Logger(),
      ...dependencies,
      itemStorage: { directory: 'build-a-bot/custom-items', format: 'jsonl', type: 'file' },
    });

    expect(context.itemStorage).toBeInstanceOf(FileItemStorage);
    expect((context.itemStorage as FileItemStorage).directory).toBe('build-a-bot/custom-items');
  });
});
