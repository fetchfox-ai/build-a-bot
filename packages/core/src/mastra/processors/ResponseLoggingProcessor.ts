import {
  ResponseCache,
  type ProcessLLMRequestArgs,
  type ProcessLLMResponseArgs,
  type ProcessLLMRequestResult,
  type Processor,
  type ResponseCacheOptions,
} from '@mastra/core/processors';
import chalk from 'chalk';
import { type Logger } from '../../logger.js';
import { formatToolCall } from '../../util/index.js';

export type ResponseLoggingProcessorOptions = { logger: Logger };

export class ResponseLoggingProcessor implements Processor<'response-logging'> {
  readonly id = 'response-logging';
  readonly name = 'Response Logging';
  readonly logger: Logger;

  constructor(options: ResponseLoggingProcessorOptions) {
    this.logger = options.logger;
  }

  processLLMResponse(args: ProcessLLMResponseArgs) {
    this.logResponse(args);
  }

  logResponse({
    stepNumber,
    model,
    chunks,
    fromCache,
  }: Pick<
    ProcessLLMResponseArgs,
    'stepNumber' | 'model' | 'rawResponse' | 'chunks' | 'fromCache'
  >) {
    this.logger.info(`${chalk.bold.yellowBright('[step ' + stepNumber + ']')}`);

    if (fromCache) {
      this.logger.info(`${chalk.bold('[cache hit]')} step=${stepNumber} model=${model.modelId}`);
    } else {
      this.logger.info(
        `${chalk.bold.yellowBright('[cache miss]')} step=${stepNumber} model=${model.modelId}`
      );
    }

    const toolCalls = chunks
      .filter((chunk) => chunk.type === 'tool-call')
      .map((chunk) => chunk.payload);

    for (const toolCall of toolCalls) {
      const { toolName, args } = toolCall as { toolName: string; args: Record<string, unknown> };
      this.logger.info(formatToolCall(toolName, args));
    }
  }

  private textFromPayload(payload: unknown): string | undefined {
    if (typeof payload !== 'object' || payload === null || !('text' in payload)) {
      return undefined;
    }

    return typeof payload.text === 'string' ? payload.text : undefined;
  }
}

export type LoggingResponseCacheOptions = ResponseCacheOptions & {
  responseLogger: ResponseLoggingProcessor;
};

export class LoggingResponseCache extends ResponseCache {
  private readonly responseLogger: ResponseLoggingProcessor;

  constructor(options: LoggingResponseCacheOptions) {
    const { responseLogger, ...cacheOptions } = options;
    super(cacheOptions);
    this.responseLogger = responseLogger;
  }

  async processLLMRequest(args: ProcessLLMRequestArgs): Promise<ProcessLLMRequestResult> {
    const result = await super.processLLMRequest(args);

    if (result?.response) {
      this.responseLogger.logResponse({
        stepNumber: args.stepNumber,
        model: args.model,
        chunks: result.response.chunks,
        rawResponse: result.response.rawResponse,
        fromCache: true,
      });
    }

    return result;
  }
}
