import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Bot } from '../../src/bots/Bot.js';
import { BotTemplate, ClassSpec, FunctionSpec } from '../../src/bots/index.js';
import { createLogger } from '../../src/logger.js';
import { healStep, planWorkflow } from '../../src/mastra/workflows/index.js';

const createBotTemplate = (context: unknown) =>
  new BotTemplate({
    context: context as never,
    vmContext: { requiredGlobals: [], requiredModules: [], requiredTools: [] },
    classSpecs: [
      new ClassSpec({
        name: 'Extractor',
        description: 'Extracts items.',
        prompt: 'Implement item extraction.',
        functionSpecs: [
          new FunctionSpec({
            name: 'extract',
            description: 'Extract items',
            prompt: 'Extract items from a URL.',
            inputSchema: z.object({ url: z.string() }),
            outputSchema: z.object({ results: z.array(z.object({ id: z.string() })) }),
            sampleInputs: [{ url: 'https://example.test' }],
          }),
        ],
      }),
    ],
  });

const originalCode = `
  export class Extractor {
    async extract({ url }) {
      return { results: [{ id: url }] };
    }
  }
`;

const changedCode = `
  export class Extractor {
    async extract({ url }) {
      return { results: [{ id: url + '-changed' }] };
    }
  }
`;

const executeHealStep = async (outputs: unknown[]) => {
  const generate = vi.fn();
  for (const output of outputs) {
    generate.mockResolvedValueOnce({ object: output });
  }
  const context = {
    logger: createLogger(),
    close: async () => {},
    mastra: { listTools: () => ({}) },
  };
  const result = await (healStep.execute as any)({
    inputData: { botTemplate: createBotTemplate(context), code: originalCode },
    mastra: { getAgentById: () => ({ generate }) },
    requestContext: { get: () => context },
  });
  return { generate, result };
};

afterEach(() => {
  vi.restoreAllMocks();
});

it('runs planStep with a BotTemplate', async () => {
  const botTemplate = new BotTemplate({
    vmContext: {},
    classSpecs: [
      new ClassSpec({
        name: 'Math',
        description: 'Performs arithmetic.',
        prompt: 'Implement arithmetic functions.',
        functionSpecs: [
          new FunctionSpec({
            name: 'addNumbers',
            description: 'Add numbers',
            prompt:
              'Generate a function that adds two numbers, and validate the output before returning it',
            inputSchema: z.object({
              a: z.number(),
              b: z.number(),
            }),
            outputSchema: z.object({ result: z.number() }),
            sampleInputs: [{ a: 2, b: 3 }],
          }),
          new FunctionSpec({
            name: 'multiplyNumbers',
            description: 'Multiply numbers',
            prompt:
              'Generate a function that multiplies two numbers, and validate the output before returning it',
            inputSchema: z.object({
              a: z.number(),
              b: z.number(),
            }),
            outputSchema: z.object({ result: z.number() }),
            sampleInputs: [{ a: 4, b: 5 }],
          }),
        ],
      }),
    ],
  });

  const planningAgent = new Agent({
    id: 'planning-agent',
    name: 'Planning Agent',
    instructions: 'You are a planning agent.',
    model: 'openai/gpt-5.6-luna',
  });
  const generate = vi
    .spyOn(planningAgent, 'generate')
    .mockResolvedValue({ text: 'Plan report' } as never);

  const mastra = new Mastra({
    agents: { planningAgent },
    workflows: { workflow: planWorkflow },
    logger: false,
  });
  const run = await mastra.getWorkflowById('plan-workflow').createRun();
  const result = await run.start({ inputData: { botTemplate } });

  expect(result.status).toBe('success');
  expect(generate).toHaveBeenCalledOnce();
  expect(generate).toHaveBeenCalledWith(
    expect.stringContaining('<class-specs>'),
    expect.objectContaining({ maxSteps: 30 })
  );
  expect(generate).toHaveBeenCalledWith(
    expect.stringContaining('<name>Math</name>'),
    expect.objectContaining({ maxSteps: 30 })
  );
  expect(generate).toHaveBeenCalledWith(
    expect.stringContaining('<name>addNumbers</name>'),
    expect.objectContaining({ maxSteps: 30 })
  );
});

it('retries a blank plan with its previous conversation and no tools', async () => {
  const botTemplate = createBotTemplate({});
  const previousMessages = [{ role: 'assistant', content: 'Research result.' }];
  const planningAgent = new Agent({
    id: 'planning-agent',
    name: 'Planning Agent',
    instructions: 'You are a planning agent.',
    model: 'openai/gpt-5.6-luna',
  });
  const generate = vi
    .spyOn(planningAgent, 'generate')
    .mockResolvedValueOnce({
      text: '',
      steps: [{ response: { messages: previousMessages } }],
    } as never)
    .mockResolvedValueOnce({ text: 'Plan report' } as never);

  const mastra = new Mastra({
    agents: { planningAgent },
    workflows: { workflow: planWorkflow },
    logger: false,
  });
  const run = await mastra.getWorkflowById('plan-workflow').createRun();
  const result = await run.start({ inputData: { botTemplate } });

  expect(result.status).toBe('success');
  expect(generate).toHaveBeenCalledTimes(2);
  expect(generate).toHaveBeenLastCalledWith(
    'Based on the research above, return the final implementation plan now.',
    {
      context: [
        { role: 'user', content: expect.stringContaining('<class-specs>') },
        ...previousMessages,
      ],
      maxSteps: 1,
      toolChoice: 'none',
    }
  );
});

it('heals until the evaluator reports that code needs no further changes', async () => {
  const setCode = vi.spyOn(Bot.prototype, 'setCode').mockResolvedValue();
  const { generate, result } = await executeHealStep([
    { code: changedCode, confidence: 80, noChanges: false, rating: 70, report: 'Improve it.' },
    { code: null, confidence: null, noChanges: true, rating: 95, report: 'Looks good.' },
  ]);

  expect(generate).toHaveBeenCalledTimes(2);
  expect(setCode).toHaveBeenCalledWith(changedCode);
  expect(result).toMatchObject({ code: changedCode });
});

it('uses the third changed result when healing does not converge', async () => {
  vi.spyOn(Bot.prototype, 'setCode').mockResolvedValue();
  const finalCode = `
    export class Extractor {
      async extract({ url }) {
        return { results: [{ id: url + '-final' }] };
      }
    }
  `;
  const { generate, result } = await executeHealStep([
    { code: changedCode, confidence: 80, noChanges: false, rating: 70, report: 'Improve it.' },
    { code: originalCode, confidence: 75, noChanges: false, rating: 72, report: 'Try again.' },
    { code: finalCode, confidence: 70, noChanges: false, rating: 74, report: 'Try once more.' },
  ]);

  expect(generate).toHaveBeenCalledTimes(3);
  expect(result).toMatchObject({ code: finalCode });
});

it('provides invalid candidate code and its error to the next iteration', async () => {
  const invalidCode = 'this is not valid JavaScript';
  const setCode = vi.spyOn(Bot.prototype, 'setCode').mockImplementation(async (code) => {
    if (code === invalidCode) {
      throw new Error('Unexpected identifier');
    }
  });
  const { generate, result } = await executeHealStep([
    { code: invalidCode, confidence: 60, noChanges: false, rating: 50, report: 'Fix it.' },
    { code: changedCode, confidence: 90, noChanges: false, rating: 85, report: 'Fixed it.' },
    { code: null, confidence: null, noChanges: true, rating: 95, report: 'Looks good.' },
  ]);

  expect(generate).toHaveBeenCalledTimes(3);
  expect(setCode).toHaveBeenCalledWith(invalidCode);
  expect(setCode).toHaveBeenCalledWith(changedCode);
  expect(generate.mock.calls[1]![0]).toContain(
    'The previous candidate code could not be compiled.'
  );
  expect(generate.mock.calls[1]![0]).toContain('Unexpected identifier');
  expect(generate.mock.calls[1]![0]).toContain(invalidCode);
  expect(result).toMatchObject({ code: changedCode });
});

it('keeps the last valid code when the final candidate is invalid', async () => {
  const invalidCode = 'this is not valid JavaScript';
  vi.spyOn(Bot.prototype, 'setCode').mockImplementation(async (code) => {
    if (code === invalidCode) {
      throw new Error('Unexpected identifier');
    }
  });
  const { result } = await executeHealStep([
    { code: changedCode, confidence: 80, noChanges: false, rating: 70, report: 'Improve it.' },
    { code: originalCode, confidence: 75, noChanges: false, rating: 72, report: 'Try again.' },
    { code: invalidCode, confidence: 60, noChanges: false, rating: 50, report: 'Broken.' },
  ]);

  expect(result).toMatchObject({ code: originalCode });
});
