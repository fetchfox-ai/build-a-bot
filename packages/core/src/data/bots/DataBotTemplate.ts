import { type core, z } from 'zod';
import { BotTemplate } from '../../bots/BotTemplate.js';
import { ClassSpec } from '../../bots/ClassSpec.js';
import { FunctionSpec } from '../../bots/FunctionSpec.js';
import { type VmContextOptions } from '../../bots/VmContextOptions.js';
import { type UsesContextOptions } from '../../context/UsesContext.js';
import { DataSource, type DataSourceOptions } from './DataSource.js';

export type DataBotTemplateOptions = UsesContextOptions & {
  vmContext?: VmContextOptions;
  sources: (DataSource | DataSourceOptions)[];
  itemSchema: z.ZodType;
  fingerprintSchema?: z.ZodType;
};

export class DataBotTemplate extends BotTemplate {
  extractPageTypeClassSpec;
  extractClassSpec;
  fingerprintClassSpec;

  constructor(options: DataBotTemplateOptions) {
    const sources = options.sources.map((source) =>
      source instanceof DataSource ? source : new DataSource(source)
    );
    const itemSchema = options.itemSchema;
    const fingerprintSchema =
      options.fingerprintSchema ??
      z
        .object({})
        .passthrough()
        .describe(
          `An object that uniquely identifies this item. Pick an a attribute, or set of attributes, that will be persistent and stable across multiple pages and appearances of this item. Normalize it in a way that is resilient without being overly general`
        );

    const extractSpec = new FunctionSpec({
      name: 'extract',
      description: `Extract data from target URLs into the specified item schema: ${JSON.stringify(itemSchema)}`,
      prompt: `This function takes URLs, and it converts into the specified item schema.

<planning-guidelines>
${planningGuidelines}
</planning-guidelines>

<general-guidelines>
${generalGuidelines}
</general-guidelines>

Write a separate implementation for eaech page type you see. This includes both the various page types you see in the sample inputs, and also page types you encounter along the way.
`,
      inputSchema: z.object({
        urls: z.array(z.string()).describe('URLs to extract data from'),
        limit: z.number().optional().describe('The maximum number of items to extract'),
      }),
      outputSchema: z.array(
        z.object({
          timestamp: z.string().datetime().describe('The ISO 8601 time when this item was extracted'),
          url: z.string().url().describe('The source URL for this item'),
          fingerprint: fingerprintSchema,
          data: itemSchema,
          citations: toCitationsSchema(itemSchema).describe(
            'Give the raw, unprocessed source data for each field, and the URL describing where you found it.'
          ),
        })
      ),
      sampleInputs: sources.map((source) => ({ urls: [source.url] })),
    });

    const fingerprintSpec = new FunctionSpec({
      name: 'fingerprint',
      description: `Take items in the specified item schema: ${JSON.stringify(itemSchema)}, and convert them into the fingerprint schema: ${JSON.stringify(fingerprintSchema)}`,
      prompt: `This function takes an item, and converts it into a fingerprint object. The item was original derived from a web URL. The goal of the fingerprint object is to identify the item in a unique but stable fashion across multiple extractions from the original URL. Thus, it should normalize and stabilize fields as appropriate, using judgement on what is a good value to put into the fingerprint object. The fingerprint object will later be hashed to generate the unique identifier string.`,
      inputSchema: itemSchema,
      outputSchema: fingerprintSchema,
      sampleInputs: [],
    });

    const extractPageTypeClassSpec = new ClassSpec({
      numImplementations: 'many',
      nameTemplate: 'ExtractPageType*',
      description: 'Extracts items and citations from URLs for a single page type.',
      prompt:
        'Implement one extractor class for each page type. Each handler should only extract its own page type; the Extract router will select and call it.',
      functionSpecs: [extractSpec],
    });

    const extractClassSpec = new ClassSpec({
      numImplementations: 'single',
      name: 'Extract',
      description:
        'Extracts items and citations from URLs by routing to the proper ExtractPageType* class',
      prompt:
        'Implement a thin router. Inspect each URL or page shape, instantiate the appropriate ExtractPageType* handler, call its extract method, and combine handler results in the same order as the requested URLs. Do not duplicate page-specific extraction logic in this class.',
      functionSpecs: [extractSpec],
    });

    const fingerprintClassSpec = new ClassSpec({
      name: 'Fingerprint',
      numImplementations: 'single',
      description: 'Builds stable fingerprint objects for extracted items.',
      prompt: 'Implement fingerprint generation for extracted items.',
      functionSpecs: [fingerprintSpec],
    });

    super({
      ...options,
      classSpecs: [extractPageTypeClassSpec, extractClassSpec, fingerprintClassSpec],
    });
    this.extractPageTypeClassSpec = extractPageTypeClassSpec;
    this.extractClassSpec = extractClassSpec;
    this.fingerprintClassSpec = fingerprintClassSpec;
  }
}

const citationsSchema = z.object({
  raw: z
    .string()
    .describe(
      'The raw, unprocessed value, exactly as you originally saw it on the page. Include outer HTML.'
    ),
  formatted: z
    .unknown()
    .optional()
    .describe(
      'The formatted value, exactly as you are returning it in the item. It may be the same as the raw value.'
    ),
  sourceUrl: z.string().describe('The URL where you saw this value'),
});

export const toCitationsSchema = (itemSchema: core.$ZodType): z.ZodType => {
  if (itemSchema instanceof z.ZodObject) {
    return z.object(
      Object.fromEntries(
        Object.entries(itemSchema.shape).map(([name, schema]) => [name, toCitationsSchema(schema)])
      )
    );
  }

  if (itemSchema instanceof z.ZodArray) {
    return z.array(toCitationsSchema(itemSchema.element));
  }

  if (itemSchema instanceof z.ZodLazy) {
    return z.lazy(() => toCitationsSchema(itemSchema.unwrap()));
  }

  if (itemSchema instanceof z.ZodOptional) {
    return toCitationsSchema(itemSchema.unwrap()).optional();
  }

  if (itemSchema instanceof z.ZodNullable) {
    return toCitationsSchema(itemSchema.unwrap()).nullable();
  }

  if (itemSchema instanceof z.ZodDefault || itemSchema instanceof z.ZodPrefault) {
    return toCitationsSchema(itemSchema.unwrap()).optional();
  }

  if (itemSchema instanceof z.ZodCatch) {
    return toCitationsSchema(itemSchema.unwrap()).optional();
  }

  if (itemSchema instanceof z.ZodReadonly || itemSchema instanceof z.ZodNonOptional) {
    return toCitationsSchema(itemSchema.unwrap());
  }

  return citationsSchema;
};

const guidelineDoNotInvent =
  'Do not invent or guess at CSS selectors, element IDs, etc. Base your selectors and locators only on what you have actually seen.';

const guidelinePlaywrightStrictMode =
  'Browser click locators use Playwright strict mode: make each selector match exactly one inspected element whenever possible. Use an index only to disambiguate inspected matches whose order is stable.';

const guidelineTestSnippets =
  'As appropriate, test your assumptions by running small JavaScript snippets using the available tool for that.';

const planningGuidelines = `# Planning Guidelines

# General report goal

The overal goal of the planning report for this function is to evaluate the target page(s), and find the best and most reliable way to extract data from it.

You'll want to inspect the HTML and DOM structure on the page, try out different access methods, and test your guesses and assumptions. Depending on the list of URLs, you may need to explore the page, dig into nested pages, and figure out the site layout. You may use web search for research purposes, but the actual function should not do that. You may guess at sitemap URLs, or at the URL structure in general, but validate and confirm these guesses.

Give a high quality report that can be basis for writing actual JavaScript extraction code.

# Format considerations

Decide what format you want to fetch for each URL. Use slim HTML for efficient inspection and full HTML only when necessary for structured data extraction.

Put this in a section titled "Format report"

# Runtime considerations

Compare viable approaches when that comparison can change the implementation. Balance runtime, accessibility, and reliability.

Put material findings in a section titled "Runtime report".

# Cost considerations

Compare costs only when viable approaches differ materially in cost.

Put material findings in a section titled "Cost report".

# Proxy considerations

If proxies are available and needed, evaluate access and use the approprite proxy with the right cost and speed tradeoff.

Put material findings in a section titled "Proxy report".

# Page types

Give a catalog of different page types you want to handle, describe them, give their identifying char
acteristics (URL patterns, page artifacts, etc.). Describe the dependency graph between the pages. For example, a e-commece site might have three page types: a listing page, a detail page, and a search page. Both the listing page and search page lead into the detail page. The detail page must be visited to get all the necessary info, so the dependency graph is {listing page, search page} -> {detail page}

Put material findings in a section titled "Page types report".

# Specifics and evidence

Include specifics in your report, including:
- Sample URLs
- Sample HTML snippets from those URLs
- Relevant selectors for all fields in item schema.
- Any other specifics that will be helpful for the coding agent

Give enough HTML snippets to write the proper selectors.

# Snippets

If tools are available, test your assumptions using snippets. You may include small code snippets that worked in the report output as appropriate.

# Item schema

The supplied item schema is authoritative. Research the page structure needed to extract it exactly; do not add fields, wrappers, or metadata.

# Additional guidelines

- The eventual script will be run in a node.js VM context, with specific modules made available, along with the tools you have
- Do not suggest tools that were not available to you. The execution environment will have the exact same tools.
- The fetch tools already handle robots.txt rules. You can call them at any rate limit, and robots.txt handling is applied upstream.
- ${guidelineDoNotInvent}
- ${guidelinePlaywrightStrictMode}
- ${guidelineTestSnippets}

# Report summary

- At the end of your report, include a brief summary of your findings. This is also where you should call out errors or problems that may prevent the task from being feasible.
- If multiple approaches are possible, describe them, and give your recommendation. For example, you may have one approach based on direct page loads, and another based on direct requests to the backend API.
`;

const generalGuidelines = `# General Guidelines

- When code will operate on multiple pages, inspect at least two examples to confirm reusable selectors.
- If necessary, navigate around the site to find the right target page(s) for extraction.
  - The goal is to make reusable scripts based on the user input. If a specific URL fits a general pattern, describe how it can be parameterized. For example, https://example.com/tvs/sony-z-100 could become https://example.com/:category/:id.
- Do not attempt to spoof User Agents, etc. That will be handled elsewhere.
- Write structured code, and avoid hard coding specific data or content.
- The fetch tools already handle robots.txt rules. You can call them at any rate limit, and robots.txt handling is applied upstream
- Do not parse more than 10,000 pages or generate more than 10,000 items. Enforce this by stopping early and/or processing only a deterministic subset of the input.
- Generally, URLs should be handled concurrently
- ${guidelineDoNotInvent}
- ${guidelinePlaywrightStrictMode}
- ${guidelineTestSnippets}
`;
