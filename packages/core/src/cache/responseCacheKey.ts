import { pick } from 'radash';
import { type Logger } from '../logger.js';
import { getOrNull, hash } from '../util/index.js';
import { toolCacheInput } from './toolCacheKey.js';

type ResponseCacheHashInputArgs = {
  logger: Logger;
  cacheBuster: string;
  prompt: unknown;
  tools: string[];
};

export const responseCacheHashInput = ({
  cacheBuster,
  prompt,
  tools,
  logger,
}: ResponseCacheHashInputArgs) => ({
  cacheBuster,
  prompt: serializePromptForCache(prompt, { logger }),
  tools,
});

export const serializePromptForCache = (
  prompt: unknown,
  { logger }: { logger: Logger }
): unknown[] => {
  if (!Array.isArray(prompt)) {
    throw new Error('Expected an array prompt when generating a cache key');
  }

  // console.log('normalizedPrompt: start');

  try {
    const normalizedPrompt = prompt
      .map((message) => {
        const content = getOrNull<unknown>(message, 'content');
        if (typeof content === 'string') {
          return content;
        }

        if (Array.isArray(content)) {
          const normalized = content
            .map((part) => {
              const clean = structuredClone(
                pick({ ...(part as Record<string, unknown>) }, [
                  'toolName',
                  'input',
                  'output',
                  'type',
                  'text',
                ])
              );
              if ('toolName' in clean && 'input' in clean) {
                clean.input = toolCacheInput(clean.input);
              }
              removeCacheOnlyFields(clean);
              return clean;
            })
            .sort(hashSort);

          // console.log('normalized:', JSON.stringify(normalized, null, 2));

          return normalized;
        }

        throw new Error(`Unknown message type for hashing: ${JSON.stringify(content, null, 2)}`);
      })
      .sort(hashSort);

    // console.log('normalizedPrompt:', JSON.stringify(normalizedPrompt, null, 2));

    return normalizedPrompt;
  } catch (e) {
    logger.error('normalizedPrompt: error:', e);
    return [hash(Math.random)];
  }
};

export const removeCacheOnlyFields = (val: unknown): void => {
  if (Array.isArray(val)) {
    val.forEach(removeCacheOnlyFields);
    return;
  }

  if (typeof val !== 'object' || val === null) {
    return;
  }

  const record = val as Record<string, unknown>;
  delete record.instruments;
  // Document response headers and request details describe a particular transport
  // attempt, not the content the model saw. They commonly vary when a document
  // is refreshed through another proxy or browser session.
  delete record.headers;
  delete record.request;

  Object.values(record).forEach(removeCacheOnlyFields);
};

const hashSort = (a: unknown, b: unknown): number => hash(a).localeCompare(hash(b));
