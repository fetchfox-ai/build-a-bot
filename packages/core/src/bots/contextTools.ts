import type { GlobalContext } from '../context/index.js';
import { toolError } from '../mastra/toolError.js';

export type ContextTool = (input: unknown) => Promise<unknown>;

export type ContextTools = Record<string, ContextTool>;

type ExecutableTool = {
  execute: (input: unknown) => Promise<unknown>;
};

const isExecutableTool = (tool: unknown): tool is ExecutableTool =>
  typeof tool === 'object' &&
  tool !== null &&
  'execute' in tool &&
  typeof tool.execute === 'function';

/** Exposes Mastra tools to compiled bot code as plain async functions. */
export const toContextTools = (
  tools: Record<string, unknown>,
  context: GlobalContext
): ContextTools =>
  Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      if (!isExecutableTool(tool)) {
        throw new TypeError(
          `Tool "${name}" cannot be called directly because it has no execute function.`
        );
      }

      const fn = async (input: unknown) => {
        context.logger.info(`Calling ${name} on ${JSON.stringify(input)}`);
        const output = await tool.execute(input);
        const error = toolError(output);
        if (error) {
          throw error;
        }
        return output;
      };

      return [name, fn];
    })
  );
