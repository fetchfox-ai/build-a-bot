import { EventEmitter } from 'node:events';
import { type Mastra } from '@mastra/core';
import type { TracingEvent } from '@mastra/core/observability';
import { DocumentLibrary, DiskLibraryBackend } from '../documents/index.js';
import { type Logger, createLogger } from '../logger.js';
import { defaultMastra } from '../mastra/create.js';
import { BrowserSession } from '../mastra/tools/browserTools/BrowserSession.js';
import { closeTools } from '../mastra/tools/index.js';
import { NoProxy, ProxyRegistry } from '../proxy/index.js';
import { createBrightdataProxies } from '../proxy/provision.js';
import { type IItemStorage } from '../data/services/storage/IItemStorage.js';
import { createStorage, type StorageOptions } from '../data/services/storage/index.js';
import { UsesContext } from './UsesContext.js';

export type GlobalOptions = {
  brightDataApiKey?: string | null;
  openRouterApiKey?: string | null;
  browserSession?: BrowserSession;
  documentLibrary?: DocumentLibrary;
  itemStorage?: StorageOptions;
  mastra?: Mastra;
  proxyRegistry?: ProxyRegistry;
  rootDirectory?: string;
  emitter?: EventEmitter;
  logger?: Logger;
};

const defaultRootDirectory = 'build-a-bot';

const createDefaultProxyRegistry = (): ProxyRegistry =>
  new ProxyRegistry({
    proxies: [new NoProxy()],
  });

const createProxyRegistry = async ({
  brightDataApiKey,
  proxyRegistry,
  logger,
}: any): Promise<ProxyRegistry> => {
  if (!brightDataApiKey) {
    return proxyRegistry ?? createDefaultProxyRegistry();
  }
  const brightDataRegistry = await createBrightdataProxies(undefined, undefined, {
    apiKey: brightDataApiKey,
    logger,
  });
  const registry = proxyRegistry ?? new ProxyRegistry();
  for (const proxy of brightDataRegistry.list()) {
    if (!registry.get(proxy.id)) {
      registry.add(proxy);
    }
  }
  if (!registry.get('none')) {
    registry.add(new NoProxy());
  }
  return registry;
};

export type GlobalContextOptions = Omit<Required<GlobalOptions>, 'itemStorage'> & {
  itemStorage: IItemStorage;
  closeFn?: (context: GlobalContext) => Promise<void>;
};

export class GlobalContext {
  readonly brightDataApiKey: string | null;
  readonly openRouterApiKey: string | null;
  readonly browserSession: BrowserSession;
  readonly documentLibrary: DocumentLibrary;
  readonly itemStorage: IItemStorage;
  readonly mastra: Mastra;
  readonly proxyRegistry: ProxyRegistry;
  readonly rootDirectory: string;
  readonly emitter: EventEmitter;
  readonly logger: Logger;
  private readonly closeFn: (context: GlobalContext) => Promise<void>;
  private closePromise?: Promise<void>;

  constructor(options: GlobalContextOptions) {
    const {
      brightDataApiKey,
      openRouterApiKey,
      browserSession,
      documentLibrary,
      itemStorage,
      mastra,
      proxyRegistry,
      rootDirectory,
      emitter,
      logger,
      closeFn = closeTools,
    } = options;
    this.brightDataApiKey = brightDataApiKey;
    this.openRouterApiKey = openRouterApiKey;
    this.browserSession = browserSession;
    this.documentLibrary = documentLibrary;
    this.itemStorage = itemStorage;
    this.mastra = mastra;
    this.proxyRegistry = proxyRegistry;
    this.rootDirectory = rootDirectory;
    this.emitter = emitter;
    this.logger = logger;
    this.closeFn = closeFn;
  }

  close(): Promise<void> {
    this.closePromise ??= Promise.resolve().then(() => this.closeFn(this));
    return this.closePromise;
  }

  on(type: string, listener: any) {
    this.emitter.on(type, listener);
  }

  off(type: string, listener: any) {
    this.emitter.off(type, listener);
  }

  emit(type: string, ...args: any) {
    this.emitter.emit(type, ...args);
  }
}

export const mergeContext = (
  context: GlobalContext,
  options?: Partial<GlobalOptions>
): GlobalContext => {
  let itemStorage = context.itemStorage;
  if (options?.itemStorage !== undefined) {
    itemStorage = createStorage(options.itemStorage);
  }
  // A synchronous merge cannot rebuild the tools captured by an existing Mastra.
  if (
    (options?.browserSession && options.browserSession !== context.browserSession) ||
    (options?.documentLibrary && options.documentLibrary !== context.documentLibrary) ||
    (options?.itemStorage && itemStorage !== context.itemStorage) ||
    (options?.mastra && options.mastra !== context.mastra) ||
    (options?.brightDataApiKey !== undefined &&
      options.brightDataApiKey !== context.brightDataApiKey) ||
    (options?.openRouterApiKey !== undefined &&
      options.openRouterApiKey !== context.openRouterApiKey) ||
    (options?.proxyRegistry && options.proxyRegistry !== context.proxyRegistry)
  ) {
    throw new Error('Use createGlobalContext to replace browser or Mastra dependencies');
  }
  return new GlobalContext({
    brightDataApiKey: context.brightDataApiKey,
    openRouterApiKey: context.openRouterApiKey,
    browserSession: context.browserSession,
    documentLibrary: options?.documentLibrary ?? context.documentLibrary,
    itemStorage,
    mastra: options?.mastra ?? context.mastra,
    proxyRegistry: options?.proxyRegistry ?? context.proxyRegistry,
    rootDirectory: options?.rootDirectory ?? context.rootDirectory,
    emitter: options?.emitter ?? context.emitter,
    logger: options?.logger ?? context.logger,
    // Merged views borrow resources; only their owning context closes them.
    closeFn: async () => {},
  });
};

export const createGlobalContext = async (options: GlobalOptions): Promise<GlobalContext> => {
  const brightDataApiKey = options.brightDataApiKey ?? null;
  const openRouterApiKey = options.openRouterApiKey ?? null;
  const logger = options.logger ?? createLogger();
  const rootDirectory = options.rootDirectory || defaultRootDirectory;
  let itemStorage: IItemStorage;
  if (options.itemStorage === undefined) {
    itemStorage = createStorage({ type: 'memory' });
  } else {
    itemStorage = createStorage(options.itemStorage);
  }
  const documentLibrary =
    options.documentLibrary ??
    new DocumentLibrary({
      backend: new DiskLibraryBackend({
        namespace: 'documentLibrary',
        rootDir: '.build-a-bot/document-library',
        logger,
      }),
      logger,
    });
  const proxyRegistry = await createProxyRegistry({ ...options, logger, brightDataApiKey });
  const browserSession =
    options.browserSession ??
    new BrowserSession({
      proxyRegistry,
      logger,
    });
  if (browserSession.proxyRegistry !== proxyRegistry) {
    throw new Error('Browser session must use the context proxy registry');
  }
  let mastra = options.mastra;
  // An injected Mastra is borrowed. The session supplied to this context is owned.
  let closeFn: (context: GlobalContext) => Promise<void> = closeTools;
  const emitter = new EventEmitter();

  if (!mastra) {
    const eventHandler = (event: TracingEvent) => {
      // console.log('Got TracingEvent:', event);
      emitter.emit('trace', event);
    };
    const result = await defaultMastra({
      browserSession,
      documentLibrary,
      openRouterApiKey,
      proxyRegistry,
      eventHandler,
      logger,
    });
    mastra = result.mastra;
    closeFn = result.cleanup;
  }

  const context = new GlobalContext({
    brightDataApiKey,
    openRouterApiKey,
    browserSession,
    documentLibrary,
    itemStorage,
    mastra,
    proxyRegistry,
    rootDirectory,
    emitter,
    logger,
    closeFn: async (context) => {
      process.off('beforeExit', beforeExit);
      await closeFn(context);
    },
  });
  if (context.itemStorage instanceof UsesContext) {
    context.itemStorage.bindContext(context);
  }
  const beforeExit = () => {
    void context.close().catch((e) => {
      logger.error('Failed to clean up global context on process exit:', e);
    });
  };
  process.once('beforeExit', beforeExit);
  return context;
};

export { UsesContext, type UsesContextOptions } from './UsesContext.js';
