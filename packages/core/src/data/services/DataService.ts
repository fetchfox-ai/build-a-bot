import PQueue from 'p-queue';
import { UsesContext, type UsesContextOptions } from '../../context/UsesContext.js';
import { DataBot, type DataBotOptions } from '../bots/DataBot.js';
import { DataSource } from '../bots/DataSource.js';
import { Item } from './Item.js';
import { BotNotBuiltError } from './errors.js';
import { Run } from './Run.js';

export type DataServiceOptions = DataBotOptions & UsesContextOptions & {};

export class DataService extends UsesContext {
  name: string;
  bot: DataBot;
  sources: DataSource[];

  #pq = new PQueue({ concurrency: 1 });

  constructor(options: DataServiceOptions) {
    super(options);
    this.name = options.name;
    this.bot = new DataBot(options);
    this.sources = options.sources;
  }

  // TODO: options should include:
  // - sources: override this.bot.sources (SyncOptions)
  // - forceRebuild: pass to bot.build (BuildOptions)
  // StartOptions = SyncOptions & BuildOptions
  async start() {
    console.log('start service:', this.name);

    console.log('build service bot');
    await this.#pq.add(() => this.bot.build({}));
    await this.sync();
  }

  // TODO: options should include:
  // - sources: override this.bot.sources
  async sync() {
    const context = await this.context();
    const run = new Run({ context });
    const items: Item[] = [];

    await run.start(async () => {
      if (!this.bot.code) {
        throw new BotNotBuiltError(`Cannot sync bot that is not built for ${this.name}`);
      }

      // TODO: use overridable sources from options
      for (const source of this.sources) {
        console.log('sync source:', source);
        const out = await this.bot.extract({ urls: [source.url] });
        console.log('sync gave:', out);
        for (let i = 0; i < out.items.length; i++) {
          items.push(
            new Item(await this.bot.identity(out.items[i]), out.items[i], out.citations[i])
          );
        }
      }
    });

    console.log('items:', items);
    await context.itemStorage.add(this.name, run, items);
  }
}
