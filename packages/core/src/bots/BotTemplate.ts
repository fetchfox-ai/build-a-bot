import type { ToolAction } from '@mastra/core/tools';
import { UsesContext, type UsesContextOptions } from '../context/UsesContext.js';
import { selectAvailableTools } from '../mastra/instruments/availableTools.js';
import { getOrNull } from '../util/index.js';
import { ClassSpec } from './ClassSpec.js';
import { FunctionSpec } from './FunctionSpec.js';
import { availableGlobals, availableModules, type VmContextOptions } from './VmContextOptions.js';

const defaultModules = Object.keys(availableModules);
const defaultGlobals = Object.keys(availableGlobals);
const isIdentifier = (name: string): boolean => /^[$A-Z_a-z][$\w]*$/u.test(name);

export type BotTemplateOptions = UsesContextOptions & {
  vmContext?: VmContextOptions;
  classSpecs: ClassSpec[];
};

const resolveRequirements = <T>(
  available: Record<string, T>,
  required: string[],
  type: string
): Record<string, T> =>
  Object.fromEntries(
    required.map((name) => {
      const val = getOrNull<T>(available, name);
      if (val === null) {
        throw new Error(`Bot template requires unavailable ${type}: ${name}`);
      }

      return [name, val];
    })
  );

export class BotTemplate extends UsesContext {
  classSpecs: ClassSpec[];
  requiredGlobals: string[];
  requiredModules: string[];
  requiredTools?: string[];
  globals: Record<string, unknown> = {};
  modules: Record<string, unknown> = {};
  tools: Record<string, ToolAction<any, any>> = {};

  #initPromise?: Promise<void>;

  constructor(options: BotTemplateOptions) {
    super(options);
    this.classSpecs = options.classSpecs;
    this.#validateClassSpecs();
    this.requiredGlobals = options.vmContext?.requiredGlobals ?? defaultGlobals;
    this.requiredModules = options.vmContext?.requiredModules ?? defaultModules;
    this.requiredTools = options.vmContext?.requiredTools;
  }

  get functionSpecs(): FunctionSpec[] {
    return this.classSpecs.flatMap((classSpec) => classSpec.functionSpecs);
  }

  init(): Promise<void> {
    this.#initPromise ??= this.#initOnce();
    return this.#initPromise;
  }

  async #initOnce(): Promise<void> {
    const context = await this.context();
    this.globals = resolveRequirements(availableGlobals, this.requiredGlobals, 'global');
    this.modules = resolveRequirements(availableModules, this.requiredModules, 'module');
    if (this.requiredTools) {
      this.tools = resolveRequirements(
        selectAvailableTools(context.mastra.listTools() ?? {}),
        this.requiredTools,
        'tool'
      );
    } else {
      this.tools = selectAvailableTools(context.mastra.listTools() ?? {});
      this.requiredTools = Object.keys(this.tools);
    }
  }

  #validateClassSpecs(): void {
    const classNames = this.classSpecs
      .filter((classSpec) => classSpec.numImplementations === 'single')
      .map((classSpec) => classSpec.name!);
    const duplicateClassName = classNames.find((name, index) => classNames.indexOf(name) !== index);
    if (duplicateClassName) {
      throw new Error(`Bot template contains duplicate class name: ${duplicateClassName}`);
    }
    const invalidClassName = classNames.find((name) => !isIdentifier(name));
    if (invalidClassName) {
      throw new Error(
        `Bot template class name is not a JavaScript identifier: ${invalidClassName}`
      );
    }

    const classNameTemplates = this.classSpecs
      .filter((classSpec) => classSpec.numImplementations === 'many')
      .map((classSpec) => classSpec.nameTemplate!);
    const duplicateClassNameTemplate = classNameTemplates.find(
      (nameTemplate, index) => classNameTemplates.indexOf(nameTemplate) !== index
    );
    if (duplicateClassNameTemplate) {
      throw new Error(
        `Bot template contains duplicate class name template: ${duplicateClassNameTemplate}`
      );
    }

    for (const classSpec of this.classSpecs) {
      const functionNames = classSpec.functionSpecs.map(({ name }) => name);
      const duplicateName = functionNames.find(
        (name, index) => functionNames.indexOf(name) !== index
      );
      if (duplicateName) {
        throw new Error(
          `Bot template class ${classSpec.name ?? classSpec.nameTemplate} contains duplicate function name: ${duplicateName}`
        );
      }
      const invalidName = functionNames.find((name) => !isIdentifier(name));
      if (invalidName) {
        throw new Error(
          `Bot template function name is not a JavaScript identifier: ${invalidName}`
        );
      }
    }
  }
}
