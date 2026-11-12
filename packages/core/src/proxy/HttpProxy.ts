import { type BrowserContextOptions } from 'playwright';
import { fetch as undiciFetch, ProxyAgent } from 'undici';
import { Proxy, type ProxyRequest } from './Proxy.js';

export type HttpProxyOptions = {
  id: string;
  password?: string;
  server?: string;
  username?: string;
};

export class HttpProxy extends Proxy {
  readonly type = 'http' as const;

  readonly password: string | undefined;
  readonly server: string | undefined;
  readonly username: string | undefined;

  constructor(options: HttpProxyOptions) {
    super({ id: options.id });
    this.password = options.password;
    this.server = options.server ? normalizeServer(options.id, options.server) : undefined;
    this.username = options.username;
  }

  browserContextOptions(
    _cursorId: string
  ): Pick<BrowserContextOptions, 'ignoreHTTPSErrors' | 'proxy'> {
    if (!this.server) {
      return {};
    }
    return {
      proxy: {
        server: this.server,
        ...(this.username ? { username: this.username } : {}),
        ...(this.password ? { password: this.password } : {}),
      },
    };
  }

  async fetch(
    url: string,
    headers: HeadersInit = {},
    options: ProxyRequest = {}
  ): Promise<Response> {
    if (!this.server) {
      return fetch(url, { ...options, headers });
    }
    if (!this.username || !this.password) {
      throw new Error(`Proxy tier "${this.id}" requires a username and password.`);
    }

    const proxyUrl = new URL(this.server);
    proxyUrl.username = this.username;
    proxyUrl.password = this.password;
    const dispatcher = new ProxyAgent(proxyUrl.href);
    try {
      const resp = await undiciFetch(url, {
        ...options,
        headers: Object.fromEntries(new Headers(headers)),
        dispatcher,
      });
      const body = await resp.arrayBuffer();
      const result = new Response([204, 205, 304].includes(resp.status) ? null : body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers),
      });
      Object.defineProperty(result, 'url', { value: url });
      return result;
    } finally {
      await dispatcher.close();
    }
  }
}

const normalizeServer = (id: string, val: string): string => {
  const server = new URL(val.includes('://') ? val : `http://${val}`);
  if (server.protocol !== 'http:' && server.protocol !== 'https:') {
    throw new Error(`Proxy tier "${id}" must use an HTTP proxy server.`);
  }
  if (!server.hostname || !server.port) {
    throw new Error(`Proxy tier "${id}" requires a proxy host and port.`);
  }
  return server.href;
};
