import crypto from 'crypto';
import chalk from 'chalk';
import { Reader } from 'protobufjs/minimal.js';
import { deterministicRandom } from '../constants.js';
import { type Logger } from '../logger.js';

export const getOrNull = <Value>(input: unknown, key: string): Value | null => {
  if (typeof input !== 'object' || input === null || !(key in input)) {
    return null;
  }

  return (input as Record<string, Value | null | undefined>)[key] ?? null;
};

export type SridOptions = {
  prefix?: string;
  hex?: boolean;
};

export function srid(): string;
export function srid(len: number, options?: string | SridOptions): string;
export function srid(input: string): string;
export function srid(inputOrLen: string | number = 14, options: string | SridOptions = {}): string {
  if (typeof inputOrLen === 'string') {
    return BigInt(`0x${crypto.createHash('sha256').update(inputOrLen).digest('hex')}`)
      .toString(36)
      .slice(0, 14)
      .padStart(14, '0');
  }

  const { prefix = '', hex = false } = typeof options === 'string' ? { prefix: options } : options;
  return randomSrid(inputOrLen, prefix, hex);
}

const randomSrid = (() => {
  let deterministicSeed = 0x12345678;

  return (len = 14, prefix = '', hex = false): string => {
    const alpha = (hex ? '0123456789abcdef' : 'abcdefghijklmnopqrstuvwxyz0123456789').split('');
    let id = '';
    for (let i = 0; i < len; i++) {
      if (deterministicRandom) {
        deterministicSeed ^= deterministicSeed << 13;
        deterministicSeed ^= deterministicSeed >>> 17;
        deterministicSeed ^= deterministicSeed << 5;
        id += alpha[Math.floor(((deterministicSeed >>> 0) / 0x100000000) * alpha.length)];
      } else {
        id += alpha[crypto.randomInt(alpha.length)];
      }
    }

    // bullmq doesn't allow integer custom ID's, ensure at least one
    // alpha character
    const r = prefix + id;
    if (r.match(/^[0-9]+$/)) {
      return randomSrid(len, prefix, hex);
    } else {
      return r;
    }
  };
})();

export const hash = (obj: unknown): string => {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj || '') || '';
  return crypto.createHash('sha256').update(str).digest('hex');
};

export function norm(url: string): string;
export function norm(urls: string[]): string[];
export function norm(input: string | string[]): string | string[] {
  if (Array.isArray(input)) {
    return [...new Set(input.map((url) => norm(url)))].sort();
  }

  return new URL(input).toString();
}

export const clip = (val: unknown, max = 500): string => {
  const text = typeof val === 'string' ? val : JSON.stringify(val) || '';
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
};

const formatToolArgs = (val: unknown, ancestors: Set<object>): string => {
  if (val === null) {
    return 'null';
  }

  switch (typeof val) {
    case 'string':
      return JSON.stringify(val);
    case 'number':
    case 'boolean':
      return String(val);
    case 'bigint':
      return `${val}n`;
    case 'undefined':
    case 'symbol':
    case 'function':
      return String(val);
  }

  const obj = val as Record<string, unknown>;
  if (ancestors.has(obj)) {
    return '[Circular]';
  }

  ancestors.add(obj);
  try {
    if (Array.isArray(obj)) {
      return `[${obj.map((item) => formatToolArgs(item, ancestors)).join(', ')}]`;
    }

    return `{ ${Object.keys(obj)
      .filter((key) => key !== '_background')
      .map((key) => `${chalk.greenBright(key)}: ${formatToolArgs(obj[key], ancestors)}`)
      .join(', ')} }`;
  } catch (e) {
    return '[Uninspectable]';
  } finally {
    ancestors.delete(obj);
  }
};

export const formatToolCall = (toolName: string, args: unknown, max = 200): string =>
  `${chalk.bold.cyanBright(toolName)} ${clip(formatToolArgs(args, new Set()), max)}`;

export const errorString = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export const indentCode = (code: string | null): string =>
  (code ?? 'null')
    .split('\n')
    .map((line, i) => `    ${String(i + 1).padStart(3, ' ')}: ${line}`)
    .join('\n');

const protobufFields = (bytes: Uint8Array): number[] => {
  const reader = Reader.create(bytes);
  const fields: number[] = [];
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const field = tag >>> 3;
    if (field === 0) {
      throw new Error('Invalid protobuf field number');
    }
    fields.push(field);
    reader.skipType(tag & 7);
  }
  return fields;
};

export const parseResponseBody = (
  contentType: string | null | undefined,
  body: Uint8Array | ArrayBuffer,
  { logger }: { logger: Logger }
): string => {
  const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : body;
  const text = Buffer.from(bytes).toString('utf8');
  if (contentType !== 'application/json+protobuf') {
    return text;
  }
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    // Fall back to decoding the binary response below.
  }
  try {
    return JSON.stringify({
      $protobuf: Buffer.from(bytes).toString('base64'),
      $fields: protobufFields(bytes),
    });
  } catch (e) {
    logger.warn(`Could not parse protobuf response: ${String(e)}; saving base64 content`);
    return Buffer.from(bytes).toString('base64');
  }
};
