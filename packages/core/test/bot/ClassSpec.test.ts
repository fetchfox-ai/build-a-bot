import { expect, it } from 'vitest';
import { z } from 'zod';
import { ClassSpec } from '../../src/bots/ClassSpec.js';
import { FunctionSpec } from '../../src/bots/FunctionSpec.js';

it('stores its metadata and function specifications', () => {
  const functionSpecs = [
    new FunctionSpec({
      name: 'echo',
      description: 'Echo input text.',
      prompt: 'Return the supplied text.',
      inputSchema: z.object({ text: z.string() }),
      outputSchema: z.string(),
      sampleInputs: [{ text: 'hello' }],
    }),
  ];
  const spec = new ClassSpec({
    name: 'Echo',
    description: 'An echo class.',
    prompt: 'Implement the echo class.',
    functionSpecs,
  });

  expect(spec).toMatchObject({
    name: 'Echo',
    description: 'An echo class.',
    prompt: 'Implement the echo class.',
    functionSpecs,
  });
});

it('supports multiple implementations through a class name template', () => {
  const spec = new ClassSpec({
    numImplementations: 'many',
    nameTemplate: 'Extractor*',
    description: 'Extracts data from a page type.',
    prompt: 'Implement one extractor per page type.',
    functionSpecs: [],
  });

  expect(spec.name).toBeUndefined();
  expect(spec.nameTemplate).toBe('Extractor*');
  expect(spec.matchesName('ExtractorListing')).toBe(true);
  expect(spec.matchesName('Extractor')).toBe(false);
  expect(spec.matchesName('OtherListing')).toBe(false);
});

it('rejects an invalid class name template', () => {
  expect(
    () =>
      new ClassSpec({
        numImplementations: 'many',
        nameTemplate: 'Extractor',
        description: 'Extracts data.',
        prompt: 'Implement extraction.',
        functionSpecs: [],
      })
  ).toThrow('JavaScript identifier followed by *');
});
