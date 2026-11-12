import { type Tool } from '@mastra/core/tools';
import type { Logger } from '../../logger.js';
import type { AnyTool } from '../../types.js';

export * from './runtime.js';
export * from './availableTools.js';
export * from './cacheInstrument.js';
export * from './concurrency.js';

export type Instrument = (tool: Tool, logger: Logger) => Promise<Tool>;

export const addInstruments = async (
  instruments: Instrument[],
  tool: AnyTool,
  logger: Logger
): Promise<AnyTool> => {
  let instrumented = tool;
  for (const instrument of instruments) {
    instrumented = await instrument(instrumented, logger);
  }
  return instrumented;
};
