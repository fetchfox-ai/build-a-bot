import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { type DocumentRequest } from '../../../documents/index.js';
import { type Logger } from '../../../logger.js';
import {
  isBrowserProxy,
  isCdpProxy,
  isLocalBrowserProxy,
  type BrowserCapableProxy,
  type ProxyRegistry,
} from '../../../proxy/index.js';
import { srid } from '../../../util/index.js';

export type Cursor = {
  page: Page;
  proxy: string;
  lastResponse?: Response;
  lastRequest?: DocumentRequest;
};

type CursorRecord = {
  spec: BrowserCapableProxy;
  browser?: Browser;
  context?: BrowserContext;
  cursor?: Promise<Cursor>;
};

export type BrowserSessionOptions = {
  proxyRegistry: ProxyRegistry;
  logger: Logger;
};

export class BrowserSession {
  private readonly cursors = new Map<string, CursorRecord>();
  private browser?: Promise<Browser>;

  readonly proxyRegistry: ProxyRegistry;
  readonly logger: Logger;

  constructor(options: BrowserSessionOptions) {
    this.proxyRegistry = options.proxyRegistry;
    this.logger = options.logger;
  }

  async createCursor(cursorId: string | null, proxy = 'none'): Promise<{ cursorId: string }> {
    const spec = this.proxyRegistry.require(proxy);
    if (!isBrowserProxy(spec)) {
      throw new Error(`Proxy "${proxy}" does not support browser connections.`);
    }
    cursorId ||= srid();
    if (this.cursors.has(cursorId)) {
      await this.resetCursor(cursorId);
    }
    this.cursors.set(cursorId, { spec });
    return { cursorId };
  }

  proxyId(cursorId: string): string {
    return this.requireCursor(cursorId).spec.id;
  }

  private requireCursor(cursorId: string): CursorRecord {
    const record = this.cursors.get(cursorId);
    if (!record) {
      throw new Error(`Unknown cursor ID: ${cursorId}`);
    }
    return record;
  }

  async getCursor(cursorId: string): Promise<Cursor> {
    const record = this.requireCursor(cursorId);
    record.cursor ??= this.openCursor(cursorId, record).catch((e) => {
      record.cursor = undefined;
      throw e;
    });
    return record.cursor;
  }

  private async localBrowser(): Promise<Browser> {
    this.browser ??= chromium.launch({ headless: true }).catch((e) => {
      this.browser = undefined;
      throw e;
    });
    return this.browser;
  }

  private async openCursor(cursorId: string, record: CursorRecord): Promise<Cursor> {
    if (isCdpProxy(record.spec)) {
      // Bright Data browser connections are separate sessions, one per cursor.
      record.browser = await record.spec.launchBrowser();
    } else {
      record.browser = await this.localBrowser();
    }
    try {
      if (isLocalBrowserProxy(record.spec)) {
        record.context = await record.browser.newContext(
          record.spec.browserContextOptions(cursorId)
        );
        return { page: await record.context.newPage(), proxy: record.spec.id };
      }
      return { page: await record.browser.newPage(), proxy: record.spec.id };
    } catch (e) {
      if (record.context) {
        await record.context.close();
        record.context = undefined;
      } else if (isCdpProxy(record.spec)) {
        await record.browser.close();
      }
      record.browser = undefined;
      throw e;
    }
  }

  async resetCursor(cursorId: string): Promise<void> {
    const record = this.requireCursor(cursorId);
    const cursor = await record.cursor?.catch(() => undefined);
    try {
      if (record.context) {
        await record.context.close();
      } else {
        await cursor?.page.close();
      }
    } finally {
      if (isCdpProxy(record.spec)) {
        await record.browser?.close();
      }
      record.browser = undefined;
      record.context = undefined;
      record.cursor = undefined;
    }
  }

  async closeCursor(cursorId: string): Promise<void> {
    await this.resetCursor(cursorId);
    this.cursors.delete(cursorId);
    if (!this.cursors.size) {
      const browser = await this.browser;
      this.browser = undefined;
      await browser?.close();
    }
  }

  async close(): Promise<void> {
    try {
      const results = await Promise.allSettled(
        [...this.cursors.keys()].map((cursorId) => this.resetCursor(cursorId))
      );
      const errors = results.filter((result) => result.status === 'rejected');
      if (errors.length) {
        throw new AggregateError(errors.map((result) => result.reason));
      }
    } finally {
      this.cursors.clear();
      const browser = await this.browser?.catch(() => undefined);
      this.browser = undefined;
      await browser?.close();
    }
  }
}
