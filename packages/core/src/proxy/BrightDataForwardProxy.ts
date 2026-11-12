import { type BrowserContextOptions } from 'playwright';
import { HttpProxy } from './HttpProxy.js';

export type BrightDataForwardProxyOptions = {
  id: string;
  customer: string;
  ignoreHTTPSErrors?: boolean;
  password: string;
  server: string;
  zone: string;
};

export class BrightDataForwardProxy extends HttpProxy {
  readonly customer: string;
  readonly ignoreHTTPSErrors: boolean;
  readonly zone: string;

  constructor(options: BrightDataForwardProxyOptions) {
    super({
      id: options.id,
      server: options.server,
      username: `brd-customer-${options.customer}-zone-${options.zone}`,
      password: options.password,
    });
    this.customer = options.customer;
    this.ignoreHTTPSErrors = options.ignoreHTTPSErrors ?? false;
    this.zone = options.zone;
  }

  override browserContextOptions(
    cursorId: string
  ): Pick<BrowserContextOptions, 'ignoreHTTPSErrors' | 'proxy'> {
    const options = super.browserContextOptions(cursorId);
    if (!options.proxy?.username) {
      throw new Error(`Proxy tier "${this.id}" requires browser proxy credentials.`);
    }
    return {
      ...options,
      ignoreHTTPSErrors: this.ignoreHTTPSErrors,
      proxy: {
        ...options.proxy,
        username: `${options.proxy.username}-session-${cursorId}`,
      },
    };
  }
}
