import { z } from 'zod';

export type FunctionSpecOptions<TInputSchema extends z.ZodType, TOutputSchema extends z.ZodType> = {
  name: string;
  description: string;
  prompt: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  sampleInputs: z.input<TInputSchema>[];
};

export class FunctionSpec<
  TInputSchema extends z.ZodType = z.ZodType,
  TOutputSchema extends z.ZodType = z.ZodType,
> {
  name: string;
  description: string;
  prompt: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  sampleInputs: z.input<TInputSchema>[];

  constructor(options: FunctionSpecOptions<TInputSchema, TOutputSchema>) {
    this.name = options.name;
    this.description = options.description;
    this.prompt = options.prompt;
    this.inputSchema = options.inputSchema;
    this.outputSchema = options.outputSchema;
    this.sampleInputs = options.sampleInputs;
  }
}
