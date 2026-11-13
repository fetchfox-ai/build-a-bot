import { Mastra } from '@mastra/core/mastra';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Bot, BotTemplate, ClassSpec, FunctionSpec } from '../../src/bots/index.js';
import { createGlobalContext, type GlobalContext } from '../../src/context/index.js';
import { DocumentLibrary } from '../../src/documents/index.js';
import { Logger } from '../../src/logger.js';

let context: GlobalContext;
let template: BotTemplate;
const code = `
  export class Echo {
    async echo({ text }) {
      return text;
    }
  }

  export class Uppercase {
    async echo({ text }) {
      return text.toUpperCase();
    }
  }
`;

beforeEach(async () => {
  const logger = new Logger();
  context = await createGlobalContext({
    logger,
    documentLibrary: new DocumentLibrary({ logger }),
    mastra: new Mastra({}),
  });
  template = new BotTemplate({
    context,
    vmContext: { requiredGlobals: [], requiredModules: [], requiredTools: [] },
    classSpecs: [
      new ClassSpec({
        name: 'Echo',
        description: 'Echo text.',
        prompt: 'Implement the echo function.',
        functionSpecs: [
          new FunctionSpec({
            name: 'echo',
            description: 'Echo text',
            prompt: 'Return the input text.',
            inputSchema: z.object({ text: z.string() }),
            outputSchema: z.string(),
            sampleInputs: [{ text: 'hello' }],
          }),
        ],
      }),
      new ClassSpec({
        name: 'Uppercase',
        description: 'Uppercases text.',
        prompt: 'Implement the uppercase echo function.',
        functionSpecs: [
          new FunctionSpec({
            name: 'echo',
            description: 'Uppercase text',
            prompt: 'Return the uppercase input text.',
            inputSchema: z.object({ text: z.string() }),
            outputSchema: z.string(),
            sampleInputs: [{ text: 'hello' }],
          }),
        ],
      }),
    ],
  });
});

afterEach(async () => {
  await context?.close();
  vi.restoreAllMocks();
});

it('waits for constructor code to compile across concurrent init calls', async () => {
  const bot = new Bot({ name: 'echo', template, code, context });

  await Promise.all([bot.init(), bot.init()]);

  expect(bot.code).toBe(code);
  await expect(bot.run('Echo', 'echo', { text: 'hello' })).resolves.toBe('hello');
});

it('initializes without code and accepts code later', async () => {
  const bot = new Bot({ name: 'echo', template, context });

  await bot.init();
  expect(bot.code).toBeUndefined();
  await bot.setCode(code);

  await expect(bot.run('Echo', 'echo', { text: 'hello' })).resolves.toBe('hello');
});

it('scopes methods and tools to their classes', async () => {
  const bot = new Bot({ name: 'echo', template, code, context });

  await bot.init();

  await expect(bot.run('Uppercase', 'echo', { text: 'hello' })).resolves.toBe('HELLO');
  expect(bot.createTools('bot')).toHaveProperty('bot_run_Echo_echo');
  expect(bot.createTools('bot')).toHaveProperty('bot_run_Uppercase_echo');
});

it('discovers every implementation that matches a class name template', async () => {
  const manyTemplate = new BotTemplate({
    context,
    vmContext: { requiredGlobals: [], requiredModules: [], requiredTools: [] },
    classSpecs: [
      new ClassSpec({
        numImplementations: 'many',
        nameTemplate: 'Extractor*',
        description: 'Extracts data from a page type.',
        prompt: 'Implement each page type.',
        functionSpecs: [
          new FunctionSpec({
            name: 'extract',
            description: 'Extract a page.',
            prompt: 'Return the page type.',
            inputSchema: z.object({}),
            outputSchema: z.string(),
            sampleInputs: [{}],
          }),
        ],
      }),
    ],
  });
  const bot = new Bot({
    name: 'extract',
    template: manyTemplate,
    context,
    code: `
      export class ExtractorListing {
        async extract() {
          return 'listing';
        }
      }
      export class ExtractorDetail {
        async extract() {
          return 'detail';
        }
      }
    `,
  });

  await bot.init();

  await expect(bot.run('ExtractorListing', 'extract', {})).resolves.toBe('listing');
  await expect(bot.run('ExtractorDetail', 'extract', {})).resolves.toBe('detail');
  expect(bot.createTools('bot')).toHaveProperty('bot_run_ExtractorListing_extract');
  expect(bot.createTools('bot')).toHaveProperty('bot_run_ExtractorDetail_extract');
});

it('allows a single entrypoint class to delegate to page-type implementations', async () => {
  const routerTemplate = new BotTemplate({
    context,
    vmContext: { requiredGlobals: [], requiredModules: [], requiredTools: [] },
    classSpecs: [
      new ClassSpec({
        numImplementations: 'many',
        nameTemplate: 'ExtractPageType*',
        description: 'Extracts a page type.',
        prompt: 'Implement page-type extraction.',
        functionSpecs: [
          new FunctionSpec({
            name: 'extract',
            description: 'Extract a page.',
            prompt: 'Return the page type.',
            inputSchema: z.object({ pageType: z.enum(['listing', 'detail']) }),
            outputSchema: z.string(),
            sampleInputs: [{ pageType: 'listing' }],
          }),
        ],
      }),
      new ClassSpec({
        name: 'Extract',
        description: 'Routes extraction.',
        prompt: 'Route to a page-type extractor.',
        functionSpecs: [
          new FunctionSpec({
            name: 'extract',
            description: 'Extract a page.',
            prompt: 'Route extraction.',
            inputSchema: z.object({ pageType: z.enum(['listing', 'detail']) }),
            outputSchema: z.string(),
            sampleInputs: [{ pageType: 'listing' }],
          }),
        ],
      }),
    ],
  });
  const bot = new Bot({
    name: 'router',
    template: routerTemplate,
    context,
    code: `
      export class ExtractPageTypeListing {
        async extract() {
          return 'listing';
        }
      }
      export class ExtractPageTypeDetail {
        async extract() {
          return 'detail';
        }
      }
      export class Extract {
        async extract({ pageType }) {
          if (pageType === 'listing') {
            return new ExtractPageTypeListing().extract();
          }
          return new ExtractPageTypeDetail().extract();
        }
      }
    `,
  });

  await bot.init();

  await expect(bot.run('Extract', 'extract', { pageType: 'detail' })).resolves.toBe('detail');
});

it('reports constructor compilation failures even when init is delayed', async () => {
  const bot = new Bot({ name: 'echo', template, code: 'export const echo = ;', context });

  await new Promise<void>((resolve) => setImmediate(resolve));

  await expect(bot.init()).rejects.toThrow('Unexpected token');
  await bot.setCode(code);
  await expect(bot.init()).rejects.toThrow('Unexpected token');
  await expect(bot.build()).rejects.toThrow('Unexpected token');
});

it('validates explicitly supplied empty code', async () => {
  const bot = new Bot({ name: 'echo', template, code: '', context });

  await expect(bot.init()).rejects.toThrow('Bot script must export a Echo class');
});

it.each(['Bot_123-test', 'bot_123-test', 'A', 'z'])('accepts bot name %j', (name) => {
  expect(new Bot({ name, template, context }).name).toBe(name);
});

it.each([
  '',
  ' ',
  '123',
  '1bot',
  '1e3',
  '0x10',
  '_',
  '_bot',
  '-',
  '-bot',
  'my bot',
  '../escape',
  'a/b',
  'a\\b',
  'bot.js',
  'café',
  'bot\n',
])('rejects invalid bot name %j', (name) => {
  expect(() => new Bot({ name, template, context })).toThrow('Bot name must start with a letter');
});

it('rejects a changed invalid name before build accesses files', async () => {
  const bot = new Bot({ name: 'echo', template, code, context });
  await bot.init();
  bot.name = '../escape';

  await expect(bot.build()).rejects.toThrow('Bot name must start with a letter');
});

it('forwards only progress from its own workflow trace and reports lifecycle callbacks', async () => {
  const onBuildProgress = vi.fn();
  const onBuildComplete = vi.fn();
  const onBuildFinally = vi.fn();
  const start = vi.fn(async ({ tracingOptions }: { tracingOptions: { traceId: string } }) => {
    expect(tracingOptions.traceId).toMatch(/^[a-f0-9]{32}$/);
    for (const traceId of ['another-build', tracingOptions.traceId]) {
      for (const type of ['model_inference', 'tool_call']) {
        for (const phase of ['span_started', 'span_updated', 'span_ended']) {
          context.emit('trace', {
            type: phase,
            exportedSpan: { traceId, type, input: { traceId }, output: 'result', entityName: 'tool' },
          });
        }
      }
    }
    return { status: 'success', result: { code } };
  });
  vi.spyOn(context.mastra, 'getWorkflowById').mockReturnValue({
    createRun: async () => ({ start }),
  } as never);
  const bot = new Bot({ name: 'echo', template, context });
  await bot.build({ forceRebuild: true, onBuildProgress, onBuildComplete, onBuildFinally });
  expect(onBuildProgress.mock.calls.map(([event]) => event.type)).toEqual([
    'inferenceStarted',
    'inferenceCompleted',
    'toolCallStarted',
    'toolCallCompleted',
  ]);
  expect(
    onBuildProgress.mock.calls.every(([event]) => event.input.traceId !== 'another-build')
  ).toBe(true);
  expect(onBuildComplete).toHaveBeenCalledOnce();
  expect(onBuildFinally).toHaveBeenCalledWith(undefined);
  expect(context.emitter.listenerCount('trace')).toBe(0);
});

it('passes the workflow error to both error and finally callbacks and removes the trace listener', async () => {
  const e = new Error('Workflow failed');
  const start = vi.fn().mockRejectedValue(e);
  vi.spyOn(context.mastra, 'getWorkflowById').mockReturnValue({
    createRun: async () => ({ start }),
  } as never);
  const bot = new Bot({ name: 'echo', template, context });
  const onBuildError = vi.fn();
  const onBuildFinally = vi.fn();
  await expect(bot.build({ forceRebuild: true, onBuildError, onBuildFinally })).rejects.toBe(e);
  expect(onBuildError).toHaveBeenCalledWith(e);
  expect(onBuildFinally).toHaveBeenCalledWith(e);
  expect(context.emitter.listenerCount('trace')).toBe(0);
});
