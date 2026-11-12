import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DocumentLibrary } from '../../src/documents/index.js';
import { createLogger } from '../../src/logger.js';
import { asJSONSchema } from '../../src/mastra/instruments/shared.js';
import { BrowserSession } from '../../src/mastra/tools/browserTools/BrowserSession.js';
import { BrowserToolCache } from '../../src/mastra/tools/browserTools/BrowserToolCache.js';
import { createTools as createBrowserTools } from '../../src/mastra/tools/browserTools/tools.js';
import { CdpProxy, HttpProxy, NoProxy, ProxyRegistry } from '../../src/proxy/index.js';
import { MemoryCache } from '../lib/MemoryCache.js';
import { startMockDynamicJsonSite } from '../lib/mockDynamicJsonSite.js';
import { startMockEcommerceSite } from '../lib/mockEcommerceSite.js';
import { startMockForwardProxy } from '../lib/mockForwardProxy.js';

describe('browser tools with browser-capable proxies', () => {
  const sessions: BrowserSession[] = [];
  const createTools = async (
    options: Omit<Parameters<typeof createBrowserTools>[0], 'browserSession' | 'logger'>
  ) => {
    const logger = createLogger();
    const browserSession = new BrowserSession({
      proxyRegistry: options.proxyRegistry,
      logger,
    });
    sessions.push(browserSession);
    return createBrowserTools({ ...options, browserSession, logger });
  };
  const closeSessions = async () => {
    await Promise.all(sessions.splice(0).map((session) => session.close()));
  };
  let profile: string;
  let browser: BrowserContext;
  let cdpUrl: string;
  let site: Awaited<ReturnType<typeof startMockEcommerceSite>>;
  let forwardProxy: Awaited<ReturnType<typeof startMockForwardProxy>>;
  let documentLibrary: DocumentLibrary;
  let proxyRegistry: ProxyRegistry;

  beforeAll(async () => {
    profile = await mkdtemp(join(tmpdir(), 'fetchfox-cdp-'));
    browser = await chromium.launchPersistentContext(profile, {
      headless: true,
      args: ['--remote-debugging-port=0'],
    });
    const [port] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
    cdpUrl = `http://127.0.0.1:${port}`;
    site = await startMockEcommerceSite();
    forwardProxy = await startMockForwardProxy('browser-user', 'browser-pass');
  });

  beforeEach(() => {
    documentLibrary = new DocumentLibrary({
      logger: createLogger(),
    });
    proxyRegistry = new ProxyRegistry({
      proxies: [
        new NoProxy(),
        new CdpProxy({
          id: 'remote',
          cdpUrl,
        }),
        new CdpProxy({
          id: 'remote-alias',
          cdpUrl,
        }),
        new HttpProxy({
          id: 'http',
          server: forwardProxy.server,
          username: 'browser-user',
          password: 'browser-pass',
        }),
      ],
    });
    site.resetRequests();
    forwardProxy.resetRequests();
  });

  afterEach(closeSessions);

  afterAll(async () => {
    await browser?.close();
    if (site) {
      await site.close();
    }
    if (forwardProxy) {
      await forwardProxy.close();
    }
    if (profile) {
      await rm(profile, { recursive: true, force: true });
    }
  });

  const execute = async (
    tools: Awaited<ReturnType<typeof createTools>>,
    name: string,
    input: Record<string, unknown>,
    context: Record<string, unknown> = {}
  ): Promise<any> => tools[`browserTools_${name}Tool`].execute!(input, context as any);

  it('lists all browser-capable proxies, excluding fetch-only proxy registries', async () => {
    const tools = await createTools({ documentLibrary, proxyRegistry });
    const schema = asJSONSchema(tools.browserTools_newPageTool.inputSchema!, 'input') as any;
    expect(schema.properties.proxy.enum).toEqual(['none', 'remote', 'remote-alias', 'http']);
    expect(schema.properties.proxy.default).toBe('none');
    expect(await createTools({ documentLibrary, proxyRegistry: new ProxyRegistry() })).toEqual({});
    const httpTools = await createTools({
      documentLibrary,
      proxyRegistry: new ProxyRegistry({
        proxies: [proxyRegistry.require('http')],
      }),
    });
    expect(httpTools.browserTools_newPageTool).toBeDefined();
    const session = new BrowserSession({
      proxyRegistry,
      logger: createLogger(),
    });
    await expect(session.createCursor(null, 'http')).resolves.toEqual({
      cursorId: expect.any(String),
    });
    await session.close();
    await expect(session.createCursor(null, 'missing')).rejects.toThrow('Unknown proxy');
  });

  it('routes browser traffic through an authenticated HTTP proxy', async () => {
    const tools = await createTools({
      documentLibrary,
      proxyRegistry,
      cache: new BrowserToolCache({
        cache: new MemoryCache(),
        logger: createLogger(),
      }),
    });
    const cursor = await execute(tools, 'newPage', { proxy: 'http' });
    await execute(tools, 'goto', { cursorId: cursor.cursorId, url: `${site.baseUrl}/` });
    expect(forwardProxy.requestCount('/')).toBe(1);
    const content = await execute(tools, 'content', { cursorId: cursor.cursorId });
    expect(documentLibrary.get({ documentId: content.documentId })).toMatchObject({
      request: { proxy: 'http', mode: 'browser' },
      content: expect.stringContaining('Fox Shop'),
    });
  });

  it('connects through CDP, isolates cache choices, and replays on the selected proxy', async () => {
    const tools = await createTools({
      documentLibrary,
      proxyRegistry,
      cache: new BrowserToolCache({
        cache: new MemoryCache(),
        logger: createLogger(),
      }),
    });
    const url = `${site.baseUrl}/`;
    const local = await execute(tools, 'newPage', { proxy: 'none' });
    await execute(tools, 'goto', { cursorId: local.cursorId, url });
    const remote = await execute(tools, 'newPage', { proxy: 'remote' });
    await execute(tools, 'goto', { cursorId: remote.cursorId, url });
    expect(site.requestCount('/')).toBe(2);

    const cached = await execute(tools, 'newPage', { proxy: 'remote' });
    await execute(tools, 'goto', { cursorId: cached.cursorId, url });
    expect(site.requestCount('/')).toBe(2);
    await execute(tools, 'click', { cursorId: cached.cursorId, selector: '#add-to-cart' });
    expect(site.requestCount('/')).toBe(3);
    const content = await execute(tools, 'content', { cursorId: cached.cursorId });
    expect(documentLibrary.get({ documentId: content.documentId })).toMatchObject({
      request: { proxy: 'remote', mode: 'browser' },
      content: expect.stringContaining('data-cart-updated="true"'),
    });
    const alias = await execute(tools, 'newPage', { proxy: 'remote-alias' });
    await execute(tools, 'goto', { cursorId: alias.cursorId, url });
    expect(site.requestCount('/')).toBe(4);
  });

  it('keeps matching cursor IDs in separate tool sets isolated', async () => {
    const remoteTools = await createTools({
      documentLibrary,
      proxyRegistry: new ProxyRegistry({
        proxies: [
          new CdpProxy({
            id: 'remote',
            cdpUrl,
          }),
        ],
      }),
      cache: new BrowserToolCache({
        cache: new MemoryCache(),
        logger: createLogger(),
      }),
    });
    const localLibrary = new DocumentLibrary({
      logger: createLogger(),
    });
    const localTools = await createTools({
      documentLibrary: localLibrary,
      proxyRegistry: new ProxyRegistry({
        proxies: [new NoProxy()],
      }),
      cache: new BrowserToolCache({
        cache: new MemoryCache(),
        logger: createLogger(),
      }),
    });
    const schema = asJSONSchema(remoteTools.browserTools_newPageTool.inputSchema!, 'input') as any;
    expect(schema.properties.proxy.enum).toEqual(['remote']);
    expect(schema.required).toContain('proxy');
    const context = { toolCallId: 'same-call-id' };
    const remote = await execute(remoteTools, 'newPage', { proxy: 'remote' }, context);
    const local = await execute(localTools, 'newPage', { proxy: 'none' }, context);
    expect(remote.cursorId).toBe(local.cursorId);
    await execute(remoteTools, 'goto', {
      cursorId: remote.cursorId,
      url: `${site.baseUrl}/products/footwear-1`,
    });
    await execute(localTools, 'goto', {
      cursorId: local.cursorId,
      url: `${site.baseUrl}/categories/electronics`,
    });
    const remoteContent = await execute(remoteTools, 'content', { cursorId: remote.cursorId });
    const localContent = await execute(localTools, 'content', { cursorId: local.cursorId });
    expect(documentLibrary.get({ documentId: remoteContent.documentId })).toMatchObject({
      request: { proxy: 'remote' },
      content: expect.stringContaining('Red Sneakers'),
    });
    expect(localLibrary.get({ documentId: localContent.documentId })).toMatchObject({
      request: { proxy: 'none' },
      content: expect.stringContaining('Electronics'),
    });
  });

  it('records the selected CDP proxy on captured JSON requests', async () => {
    const dynamicSite = await startMockDynamicJsonSite();
    try {
      const tools = await createTools({
        documentLibrary,
        proxyRegistry,
        cache: new BrowserToolCache({
          cache: new MemoryCache(),
          logger: createLogger(),
        }),
      });
      const cursor = await execute(tools, 'newPage', { proxy: 'remote' });
      await execute(tools, 'goto', { cursorId: cursor.cursorId, url: `${dynamicSite.baseUrl}/` });
      await execute(tools, 'waitForSelector', {
        cursorId: cursor.cursorId,
        selector: '[data-product-id="json-widget"]',
      });
      const [document] = documentLibrary.list({
        origin: 'dynamic',
        urlPrefix: `${dynamicSite.baseUrl}/api/catalog`,
      });
      expect(documentLibrary.get({ documentId: document.id })).toMatchObject({
        request: { proxy: 'remote', mode: 'browser' },
        content: expect.stringContaining('JSON Widget'),
      });
    } finally {
      await closeSessions();
      await dynamicSite.close();
    }
  });
});
