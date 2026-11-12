import { z } from 'zod';
import type { BotTemplate } from '@build-a-bot/core';

export const serializeBotTemplate = (template: BotTemplate): object => ({
  classSpecs: template.classSpecs.map((classSpec) => {
    const val = {
      description: classSpec.description,
      prompt: classSpec.prompt,
      functionSpecs: classSpec.functionSpecs.map((spec) => ({
        name: spec.name,
        description: spec.description,
        prompt: spec.prompt,
        inputSchema: z.toJSONSchema(spec.inputSchema, { io: 'input' }),
        outputSchema: z.toJSONSchema(spec.outputSchema),
        sampleInputs: spec.sampleInputs,
      })),
    };
    if (classSpec.numImplementations === 'many') {
      return { ...val, numImplementations: 'many', nameTemplate: classSpec.nameTemplate };
    }
    return { ...val, numImplementations: 'single', name: classSpec.name };
  }),
  vmContext: {
    requiredGlobals: template.requiredGlobals,
    requiredModules: template.requiredModules,
    requiredTools: template.requiredTools,
  },
});
