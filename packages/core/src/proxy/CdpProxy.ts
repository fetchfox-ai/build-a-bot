import { chromium, type Browser } from 'playwright';
import { Proxy } from './Proxy.js';

export type CdpProxyOptions = {
  id: string;
  cdpUrl: string;
};

export class CdpProxy extends Proxy {
  readonly type = 'cdp' as const;

  readonly cdpUrl: string;

  constructor(options: CdpProxyOptions) {
    super({ id: options.id });
    this.cdpUrl = options.cdpUrl;
  }

  async launchBrowser(): Promise<Browser> {
    return chromium.connectOverCDP(this.cdpUrl);
  }
}
