import { defaultHost } from '../constants.js';
import { DataBot, type DataBotOptions } from '../data/bots/DataBot.js';
import { User } from '../user/User.js';
import { APIError } from './APIError.js';
import type { UsesClient } from './UsesClient.js';

export type BuildABotOptions = {
  apiKey: string;
  host?: string;
};

type DataBotsOptions = UsesClient;

class DataBots {
  readonly client: UsesClient['client'];

  constructor(options: DataBotsOptions) {
    this.client = options.client;
  }

  async build(options: Omit<DataBotOptions, 'client'>): Promise<DataBot> {
    const bot = new DataBot({ ...options, client: this.client });
    await bot.build();
    return bot;
  }
}

export class BuildABot {
  readonly apiKey: string;
  readonly host: string;
  readonly data: { bots: DataBots };
  #user?: Promise<User>;

  constructor(options: BuildABotOptions) {
    this.apiKey = options.apiKey;
    this.host = options.host ?? defaultHost;
    this.data = { bots: new DataBots({ client: this }) };
  }

  async call<T>(method: string, route: string, params?: unknown): Promise<T> {
    if (!route.startsWith('/') || route.startsWith('//') || route.includes('..')) {
      throw new Error('Expected a path relative to the API.');
    }
    const url = new URL(route, this.host);
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
}
