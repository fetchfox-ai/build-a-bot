import { hash } from '../../util/index.js';
import { type z } from 'zod';

export class Item<TDataSchema extends z.ZodType = z.ZodType> {
  id: string;
  timestamp: Date;
  fingerprint: any;
  data: z.output<TDataSchema>;
  declare citations?: any;

  constructor(
    fingerprint: any,
    data: z.output<TDataSchema>,
    citations?: any,
    timestamp: Date = new Date()
  ) {
    const record = data as unknown as Record<string, unknown>;
    if (record.citations !== undefined && citations !== undefined) {
      throw new Error('Citations cannot be provided in both data and the citations argument.');
    }
    if (record.fingerprint !== undefined) {
      throw new Error('Fingerprint cannot be provided in data argument.');
    }
    this.id = hash(fingerprint);
    this.timestamp = timestamp;
    this.fingerprint = fingerprint;
    this.data = data;
    if (citations !== undefined) {
      this.citations = citations;
    }
  }
}
