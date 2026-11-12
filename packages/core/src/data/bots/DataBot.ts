import { z } from 'zod';
import { Bot, type BotResult } from '../../bots/Bot.js';
import { type VmContextOptions } from '../../bots/VmContextOptions.js';
import { type UsesContextOptions } from '../../context/UsesContext.js';
import { Item } from './Item.js';
import { DataBotTemplate } from './DataBotTemplate.js';
import type { DataSource, DataSourceOptions } from './DataSource.js';

type ExtractSpec = DataBotTemplate['extractClassSpec']['functionSpecs'][number];
type ExtractInput = z.input<ExtractSpec['inputSchema']>;
type FingerprintSpec = DataBotTemplate['fingerprintClassSpec']['functionSpecs'][number];
type FingerprintInput = z.input<FingerprintSpec['inputSchema']>;
type FingerprintResult = BotResult<z.output<FingerprintSpec['outputSchema']>>;

export type DataBotOptions = UsesContextOptions & {
  id?: string;
  name: string;
  vmContext?: VmContextOptions;
  sources: (DataSource | DataSourceOptions)[];
  itemSchema: z.ZodType;
  fingerprintSchema?: z.ZodType;
};

export class DataBot extends Bot {
  constructor(options: DataBotOptions) {
    const template = new DataBotTemplate({
      vmContext: options.vmContext,
      sources: options.sources,
      itemSchema: options.itemSchema,
      fingerprintSchema: options.fingerprintSchema,
      context: options.context,
    });
    super({
      id: options.id,
      name: options.name,
      template,
      context: options.context,
    });
  }

  async extract(input: ExtractInput): Promise<Item[]> {
    const extractedItems = (await this.run('Extract', 'extract', input)) as z.output<
      ExtractSpec['outputSchema']
    >;
    return extractedItems.map(
      ({ timestamp, fingerprint, data, citations }) =>
        new Item(fingerprint, data, citations, new Date(timestamp))
    );
  }

  fingerprint(input: FingerprintInput): Promise<FingerprintResult> {
    return this.run('Fingerprint', 'fingerprint', input) as Promise<FingerprintResult>;
  }
}
