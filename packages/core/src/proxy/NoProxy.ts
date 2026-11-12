import { type BrowserContextOptions } from 'playwright';
import { Proxy, type ProxyRequest } from './Proxy.js';

export class NoProxy extends Proxy {
  readonly type = 'http' as const;

  constructor() {
    super({ id: 'none' });
  }

  browserContextOptions(
    _cursorId: string
  ): Pick<BrowserContextOptions, 'ignoreHTTPSErrors' | 'proxy'> {
    return {};
  }

  async fetch(
    url: string,
    headers: HeadersInit = {},
    options: ProxyRequest = {}
  ): Promise<Response> {
    return fetch(url, { ...options, headers });
  }
}
