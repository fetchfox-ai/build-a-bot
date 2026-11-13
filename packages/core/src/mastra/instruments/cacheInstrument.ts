import { type Tool } from '@mastra/core/tools';
import { cb } from '../../cache/busters.js';
import { DiskCache } from '../../cache/DiskCache.js';
import { toolCacheInput, toolCacheSchema } from '../../cache/toolCacheKey.js';
import type { ILogger } from '../../logger.js';
import { hash } from '../../util/index.js';
import { isToolFailure } from '../toolError.js';
import { addMetric } from './shared.js';

type CachedToolResult = { type: 'output'; output: unknown };

export const cacheInstrument = async (
  tool: Tool,
  logger: ILogger,
  cacheScope = ''
): Promise<Tool> => {
  const execute = tool.execute;
  if (!execute) {
    return tool;
  }

  const cache = new DiskCache<CachedToolResult>({
    namespace: 'cacheInstrument',
    logger,
  });
  return {
    ...tool,
    execute: async (input, context) => {
      const key = hash({
        instrument: 'cacheInstrument',
        cacheScope,
        cacheBuster: cb.cacheInstrument,
        tool: {
          id: tool.id,
          description: tool.description,
          inputSchema: toolCacheSchema(tool.inputSchema, 'input'),
          outputSchema: toolCacheSchema(tool.outputSchema, 'output'),
          suspendSchema: toolCacheSchema(tool.suspendSchema, 'input'),
          resumeSchema: toolCacheSchema(tool.resumeSchema, 'input'),
        },
        input: toolCacheInput(input),
        context: {
          agentId: context?.agent?.agentId,
          resourceId: context?.agent?.resourceId,
          workflowId: context?.workflow?.workflowId,
          requestContext: context?.requestContext?.toJSON(),
        },
      });

      const cached = await cache.get(key);
      if (cached !== null && cached !== undefined && !isToolFailure(cached.output)) {
        logger.info(`Cache hit for ${key}, tool=${tool.id}, type=${cached.type}`);
        return addCacheMetric(cached.output, 'hit', tool, logger, context);
      }

      logger.info(`Cache miss for ${key}, tool=${tool.id}`);
      const output = await execute(input, context);
      if (!isToolFailure(output)) {
        logger.info(`Setting cache for ${key}, tool=${tool.id}`);
        await cache.set(key, { type: 'output', output });
      }
      return addCacheMetric(output, 'miss', tool, logger, context);
    },
  };
};

const addCacheMetric = (
  output: unknown,
  result: 'hit' | 'miss',
  tool: Tool,
  logger: ILogger,
  context: Parameters<typeof addMetric>[5]
): Record<string, unknown> =>
  addMetric(
    output,
    'cache',
    { result, originalMetrics: metricsFrom(output) },
    tool,
    logger,
    context
  );

const metricsFrom = (output: unknown): Record<string, unknown> => {
  if (
    typeof output !== 'object' ||
    output === null ||
    Array.isArray(output) ||
    !('instruments' in output)
  ) {
    return {};
  }

  const instruments = output.instruments;
  if (
    typeof instruments !== 'object' ||
    instruments === null ||
    Array.isArray(instruments) ||
    !('metrics' in instruments)
  ) {
    return {};
  }

  const metrics = instruments.metrics;
  return typeof metrics === 'object' && metrics !== null && !Array.isArray(metrics)
    ? { ...metrics }
    : {};
};
