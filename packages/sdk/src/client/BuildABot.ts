import type { BuildOptions, Logger } from '../bots/types.js';
import { defaultHost } from '../constants.js';
import { DataBot, type DataBotBuildResponse, type DataBotOptions } from '../data/bots/DataBot.js';
import { User } from '../user/User.js';
import { APIError } from './APIError.js';
import type { UsesClient } from './UsesClient.js';
import type { BuildStreamMessage } from './connectBuildStream.js';

export type BuildABotOptions = {
  apiKey: string;
  host?: string;
  basePath?: string;
  logger?: Logger;
  connectMasterStream?: boolean;
};

type DataBotsOptions = UsesClient;

const elapsed = (event: Record<string, any>): string => {
  const start = Date.parse(String(event.startTime));
  const end = Date.parse(String(event.endTime));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '';
  const milliseconds = Math.max(0, end - start);
  return milliseconds < 1_000 ? ` (${milliseconds}ms)` : ` (${(milliseconds / 1_000).toFixed(1)}s)`;
};

const normalizeBasePath = (basePath = ''): string => {
  if (basePath === '') return '';
  if (!basePath.startsWith('/') || basePath.startsWith('//') || basePath.includes('..')) {
    throw new Error('Expected basePath to be an absolute, relative path.');
  }
  return basePath.replace(/\/+$/, '');
};

class DataBots {
  readonly client: UsesClient['client'];

  constructor(options: DataBotsOptions) {
    this.client = options.client;
  }

  async build(options: Omit<DataBotOptions, 'client'> & BuildOptions): Promise<DataBotBuildResponse> {
    return new DataBot({ ...options, client: this.client }).build({ forceRebuild: options.forceRebuild });
  }
}

export class BuildABot {
  readonly apiKey: string;
  readonly host: string;
  readonly basePath: string;
  readonly logger: Logger;
  readonly ws?: WebSocket;
  readonly data: { bots: DataBots };
  #user?: Promise<User>;

  constructor(options: BuildABotOptions) {
    this.apiKey = options.apiKey;
    this.host = options.host ?? defaultHost;
    this.basePath = normalizeBasePath(options.basePath);
    this.logger = options.logger ?? console;
    const wsUrl = new URL(`${this.basePath}/streams`, this.host);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    if (options.connectMasterStream !== false) {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ apiKey: this.apiKey }));
        this.logger.info('Build stream connected');
      });
      ws.addEventListener('message', (event) => {
        this.#logStreamMessage(event.data);
      });
    }
    this.data = { bots: new DataBots({ client: this }) };
  }

  async call<T>(method: string, route: string, params?: unknown): Promise<T> {
    if (!route.startsWith('/') || route.startsWith('//') || route.includes('..')) {
      throw new Error('Expected a path relative to the API.');
    }
    const url = new URL(`${this.basePath}${route}`, this.host);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (params !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const resp = await fetch(url, {
      method,
      headers,
      body: params === undefined ? undefined : JSON.stringify(params),
    });
    if (!resp.ok) {
      const body = (await resp.json().catch(() => null)) as { error?: unknown } | null;
      throw new APIError({
        message:
          typeof body?.error === 'string' ? body.error : `API request failed (${resp.status}).`,
        status: resp.status,
      });
    }
    return resp.json() as Promise<T>;
  }

  async user(): Promise<User> {
    this.#user ??= this.#loadUser();
    return this.#user;
  }

  async #loadUser(): Promise<User> {
    const val = await this.call<{ username: string }>('GET', '/users/me');
    return new User({ client: this, username: val.username });
  }

  #logStreamMessage(data: unknown): void {
    let message: BuildStreamMessage;
    try {
      message = JSON.parse(String(data)) as BuildStreamMessage;
    } catch {
      return;
    }

    const streamId = message.streamId ?? 'unknown';
    const prefix = `[build:${streamId}]`;
    if (message.status) {
      if (message.error?.message) this.logger.info(`${prefix} failed: ${message.error.message}`);
      return;
    }

    const event = message.event ?? {};
    const failure = event.error?.message;
    if (message.type === 'inferenceStarted') {
      this.logger.info(`${prefix} inference started`);
      return;
    }
    if (message.type === 'inferenceCompleted') {
      this.logger.info(
        `${prefix} inference${failure ? ` failed: ${failure}` : ` completed${elapsed(event)}`}`
      );
      return;
    }
    if (message.type === 'toolCallStarted') {
      const tool = event.toolName ?? event.toolDescription ?? 'unnamed tool';
      this.logger.info(`${prefix} tool ${tool} started`);
      return;
    }
    if (message.type === 'toolCallCompleted') {
      const tool = event.toolName ?? event.toolDescription ?? 'unnamed tool';
      this.logger.info(
        `${prefix} tool ${tool}${failure ? ` failed: ${failure}` : ` completed${elapsed(event)}`}`
      );
      return;
    }
    if (message.type === 'complete') this.logger.info(`${prefix} complete`);
    if (message.type === 'error') this.logger.info(`${prefix} failed: ${failure ?? 'unknown error'}`);
    if (message.type === 'finally') this.logger.info(`${prefix} ${failure ? `finished with error: ${failure}` : 'finished'}`);
  }
}
