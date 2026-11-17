import type { z } from 'zod';

export type Logger = Pick<Console, 'info'>;
export type BuildOptions = { forceRebuild?: boolean };
export type FunctionSpec = {
  name: string;
  description: string;
  prompt: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  sampleInputs: unknown[];
};
export type ClassSpec = {
  numImplementations: 'single' | 'many';
  name?: string;
  nameTemplate?: string;
  description: string;
  prompt: string;
  functionSpecs: FunctionSpec[];
};
export type BotTemplate = {
  classSpecs: ClassSpec[];
  requiredGlobals: string[];
  requiredModules: string[];
  requiredTools?: string[];
};
