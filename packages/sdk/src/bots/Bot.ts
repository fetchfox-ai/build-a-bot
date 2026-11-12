import type * as core from '@build-a-bot/core';
import { APIError } from '../client/APIError.js';
import type { UsesClient } from '../client/UsesClient.js';
import { serializeBotTemplate } from './serialize.js';

export type BotOptions = Omit<core.BotOptions, 'context'> & UsesClient;

type BotResponse = {
  name: string;
  status: core.Bot['status'];
  code: string;
  username: string;
};

export class Bot {
  readonly client: UsesClient['client'];
  name: core.Bot['name'];
  status: core.Bot['status'];
  template: core.Bot['template'];
  code: core.Bot['code'];
  script: core.Bot['script'];
  functions: core.Bot['functions'];

  constructor(options: BotOptions) {
    this.client = options.client;
    this.name = options.name;
    this.status = 'idle';
    this.template = options.template;
    this.code = options.code;
    this.script = undefined;
    this.functions = {};
  }

  async build(options: core.BotBuildOptions = {}): Promise<void> {
    await this.#upsert();
    const route = await this.#route();
    let current = await this.client.call<BotResponse>('POST', await this.#route('/build'), options);
    do {
      this.status = current.status;
      this.code = current.code;
      if (current.status !== 'building') {
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      current = await this.client.call<BotResponse>('GET', route);
    } while (true);
  }

  protected async callFunction<T>(name: string, input: unknown): Promise<T> {
    return this.client.call<T>('POST', await this.#route(`/${encodeURIComponent(name)}`), input);
  }

  async #upsert(): Promise<BotResponse> {
    const route = await this.#route();
    try {
      return await this.client.call<BotResponse>('GET', route);
    } catch (e) {
      if (!(e instanceof APIError) || e.status !== 404) {
        throw e;
      }
    }
    return this.client.call<BotResponse>('POST', '/bots', {
      name: this.name,
      template: serializeBotTemplate(this.template),
      code: this.code,
    });
  }

  async #route(path = ''): Promise<string> {
    const user = await this.client.user();
    return `/bots/${encodeURIComponent(user.username)}/${encodeURIComponent(this.name)}${path}`;
  }
}
