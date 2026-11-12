import { expect, it } from 'vitest';
import { z } from 'zod';
import { DataBotTemplate, toCitationsSchema } from '../../../src/data/bots/DataBotTemplate.js';

it('groups extraction and identity functions into class specifications', () => {
  const template = new DataBotTemplate({
    sources: [],
    itemSchema: z.object({ name: z.string() }),
  });

  expect(template.extractPageTypeClassSpec).toMatchObject({
    numImplementations: 'many',
    nameTemplate: 'ExtractPageType*',
    functionSpecs: [{ name: 'extract' }],
  });
  expect(template.extractClassSpec).toMatchObject({
    name: 'Extract',
    numImplementations: 'single',
    functionSpecs: [{ name: 'extract' }],
  });
  expect(template.identityClassSpec).toMatchObject({
    name: 'Identity',
    numImplementations: 'single',
    functionSpecs: [{ name: 'identity' }],
  });
});

it('creates nested citations objects for item fields', () => {
  const schema = toCitationsSchema(
    z.object({
      name: z.string(),
      details: z.object({
        price: z.number(),
        tags: z.array(z.string()).default([]),
      }),
      variants: z.array(
        z.object({
          name: z.string(),
          stock: z.number().nullable(),
        })
      ),
    })
  );

  expect(
    schema.parse({
      name: { raw: 'Example', sourceUrl: 'https://example.test/product' },
      details: {
        price: { raw: '$10.00', sourceUrl: 'https://example.test/product' },
        tags: [
          { raw: 'New', sourceUrl: 'https://example.test/product' },
          { raw: 'Featured', sourceUrl: 'https://example.test/product' },
        ],
      },
      variants: [
        {
          name: { raw: 'Small', sourceUrl: 'https://example.test/product' },
          stock: { raw: '3', sourceUrl: 'https://example.test/product' },
        },
      ],
    })
  ).toEqual({
    name: { raw: 'Example', sourceUrl: 'https://example.test/product' },
    details: {
      price: { raw: '$10.00', sourceUrl: 'https://example.test/product' },
      tags: [
        { raw: 'New', sourceUrl: 'https://example.test/product' },
        { raw: 'Featured', sourceUrl: 'https://example.test/product' },
      ],
    },
    variants: [
      {
        name: { raw: 'Small', sourceUrl: 'https://example.test/product' },
        stock: { raw: '3', sourceUrl: 'https://example.test/product' },
      },
    ],
  });
  expect(() =>
    schema.parse({
      name: { raw: 'Example', sourceUrl: 'https://example.test/product' },
      details: {
        price: { raw: '$10.00', sourceUrl: 'https://example.test/product' },
        tags: [{ raw: 'New', sourceUrl: 'https://example.test/product' }],
      },
      variants: [{ name: { raw: 'Small', sourceUrl: 'https://example.test/product' } }],
    })
  ).toThrow();
});

it('handles recursive item schemas', () => {
  const itemSchema: z.ZodType = z.lazy(() =>
    z.object({
      children: z.array(itemSchema),
      name: z.string(),
    })
  );
  const schema = toCitationsSchema(itemSchema);

  expect(
    schema.parse({
      children: [
        {
          children: [],
          name: { raw: 'Child', sourceUrl: 'https://example.test/child' },
        },
      ],
      name: { raw: 'Root', sourceUrl: 'https://example.test/root' },
    })
  ).toEqual({
    children: [
      {
        children: [],
        name: { raw: 'Child', sourceUrl: 'https://example.test/child' },
      },
    ],
    name: { raw: 'Root', sourceUrl: 'https://example.test/root' },
  });
});
