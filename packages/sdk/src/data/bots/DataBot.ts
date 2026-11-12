import * as core from '@build-a-bot/core';
import type { UsesClient } from '../../client/UsesClient.js';
import { Bot } from '../../bots/Bot.js';

export type DataBotOptions = Omit<core.DataBotOptions, 'context'> & UsesClient;

export class DataBot extends Bot {
  constructor(options: DataBotOptions) {
    const { client, ...dataOptions } = options;
    const bot = new core.DataBot(dataOptions);
    super({ client, name: bot.name, template: bot.template });
  }

  extract(input: Parameters<core.DataBot['extract']>[0]): ReturnType<core.DataBot['extract']> {
    return this.callFunction('extract', input);
  }

  identity(input: Parameters<core.DataBot['identity']>[0]): ReturnType<core.DataBot['identity']> {
    return this.callFunction('identity', input);
  }
}
