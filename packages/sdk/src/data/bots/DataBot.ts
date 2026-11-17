import { z } from 'zod';
import type { UsesClient } from '../../client/UsesClient.js';
import type { BuildOptions } from '../../bots/types.js';

export type DataBotOptions = UsesClient & {
  name: string;
  sources: ({ url: string } | string)[];
  itemSchema: z.ZodType;
  fingerprintSchema?: z.ZodType;
};

export type DataBotBuildResponse = {
  id: number;
  name: string;
  username: string;
  status: 'idle' | 'building';
  code: string;
  stream: { id: string; url: string } | null;
};

export class DataBot {
  readonly client: UsesClient['client'];
  readonly name: string;
  readonly sources: DataBotOptions['sources'];
  readonly itemSchema: z.ZodType;
  readonly fingerprintSchema?: z.ZodType;
  status: DataBotBuildResponse['status'] = 'idle';
  code?: string;

  constructor(options: DataBotOptions) {
    this.client = options.client;
    this.name = options.name;
    this.sources = options.sources;
    this.itemSchema = options.itemSchema;
    this.fingerprintSchema = options.fingerprintSchema;
  }

  async build(options: BuildOptions = {}): Promise<DataBotBuildResponse> {
    const body = {
      name: this.name,
      sources: this.sources.map((source) => typeof source === 'string' ? { url: source } : { url: source.url }),
      itemSchema: z.toJSONSchema(this.itemSchema),
      fingerprintSchema: this.fingerprintSchema && z.toJSONSchema(this.fingerprintSchema),
      forceRebuild: options.forceRebuild,
    };
    const current = await this.client.call<DataBotBuildResponse>('POST', '/bots/data/build', body);
    this.status = current.status;
    this.code = current.code;
    return current;
  }

  async extract(input: { urls: string[]; limit?: number }): Promise<unknown[]> {
    return this.callFunction('extract', input);
  }

  async fingerprint(input: unknown): Promise<unknown> {
    return this.callFunction('fingerprint', input);
  }

  private async callFunction<T>(name: string, input: unknown): Promise<T> {
    const user = await this.client.user();
    return this.client.call<T>(
      'POST',
      `/bots/${encodeURIComponent(user.username)}/${encodeURIComponent(this.name)}/${name}`,
      input
    );
  }
}
