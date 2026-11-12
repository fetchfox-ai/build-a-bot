import * as cheerio from 'cheerio';
import * as nodeHtmlParser from 'node-html-parser';
import * as playwright from 'playwright';
import * as zod from 'zod';
import { z } from 'zod';

export const availableModules = {
  cheerio,
  'node-html-parser': nodeHtmlParser,
  playwright,
  zod,
};

export const availableGlobals = {
  URL,
  URLSearchParams,
  AbortController,
  AbortSignal,
  TextEncoder,
  TextDecoder,

  structuredClone,
  queueMicrotask,
  performance,
  atob,
  btoa,
  Buffer,
  DOMException,

  setTimeout,
  clearTimeout,
  console,
};

export type VmContextOptions = {
  requiredGlobals?: string[];
  requiredModules?: string[];
  requiredTools?: string[];
};

export const vmContextJsonSchema = z.object({
  requiredGlobals: z.array(z.string()).optional(),
  requiredModules: z.array(z.string()).optional(),
  requiredTools: z.array(z.string()).optional(),
});
export type VmContextJson = z.output<typeof vmContextJsonSchema>;
