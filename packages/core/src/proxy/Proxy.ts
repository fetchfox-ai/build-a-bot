import { type Browser, type BrowserContextOptions } from 'playwright';

export type ProxyType = 'cdp' | 'http';

export type ProxyOptions = { id: string };

export abstract class Proxy {
  readonly id: string;

  abstract readonly type: ProxyType;

  constructor(options: ProxyOptions) {
    this.id = options.id;
  }
}

export type ProxyRequest = { method?: string; body?: string; signal?: AbortSignal | null };

export type HttpCapableProxy = Proxy & {
  readonly type: 'http';
  fetch(url: string, headers?: HeadersInit, options?: ProxyRequest): Promise<Response>;
};

export const isHttpProxy = (proxy: Proxy): proxy is HttpCapableProxy => proxy.type == 'http';

export type LocalBrowserCapableProxy = Proxy & {
  browserContextOptions(
    cursorId: string
  ): Pick<BrowserContextOptions, 'ignoreHTTPSErrors' | 'proxy'>;
};

export const isLocalBrowserProxy = (proxy: Proxy): proxy is LocalBrowserCapableProxy =>
  'browserContextOptions' in proxy && typeof proxy.browserContextOptions == 'function';

export type CdpCapableProxy = Proxy & {
  readonly type: 'cdp';
  launchBrowser(): Promise<Browser>;
};

export const isCdpProxy = (proxy: Proxy): proxy is CdpCapableProxy => proxy.type == 'cdp';

export type BrowserCapableProxy = CdpCapableProxy | LocalBrowserCapableProxy;

export const isBrowserProxy = (proxy: Proxy): proxy is BrowserCapableProxy =>
  isCdpProxy(proxy) || isLocalBrowserProxy(proxy);
