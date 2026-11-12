import { z } from 'zod';
import { Bot, type BotResult } from '../../bots/Bot.js';
import { type VmContextOptions } from '../../bots/VmContextOptions.js';
import { type UsesContextOptions } from '../../context/UsesContext.js';
import { DataBotTemplate } from './DataBotTemplate.js';
import { DataSource } from './DataSource.js';

type ExtractSpec = DataBotTemplate['extractClassSpec']['functionSpecs'][number];
type ExtractInput = z.input<ExtractSpec['inputSchema']>;
type ExtractResult = BotResult<z.output<ExtractSpec['outputSchema']>>;

type IdentitySpec = DataBotTemplate['identityClassSpec']['functionSpecs'][number];
type IdentityInput = z.input<IdentitySpec['inputSchema']>;
type IdentityResult = BotResult<z.output<IdentitySpec['outputSchema']>>;

export type DataBotOptions = UsesContextOptions & {
  id?: string;
  name: string;
  vmContext?: VmContextOptions;
  sources: DataSource[];
  itemSchema: z.ZodType;
  identitySchema?: z.ZodType;
};

export class DataBot extends Bot {
  constructor(options: DataBotOptions) {
    const template = new DataBotTemplate({
      vmContext: options.vmContext,
      sources: options.sources,
      itemSchema: options.itemSchema,
      identitySchema: options.identitySchema,
      context: options.context,
    });
    super({
      id: options.id,
      name: options.name,
      template,
      context: options.context,
    });
  }

  extract(input: ExtractInput): Promise<ExtractResult> {
    return this.run('Extract', 'extract', input) as Promise<ExtractResult>;
  }

  identity(input: IdentityInput): Promise<IdentityResult> {
    return this.run('Identity', 'identity', input) as Promise<IdentityResult>;
  }
}
