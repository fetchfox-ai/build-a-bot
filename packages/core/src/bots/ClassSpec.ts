import { FunctionSpec } from './FunctionSpec.js';

type BaseClassSpecOptions<TFunctionSpecs extends FunctionSpec[]> = {
  description: string;
  prompt: string;
  functionSpecs: TFunctionSpecs;
};

export type SingleClassSpecOptions<TFunctionSpecs extends FunctionSpec[] = FunctionSpec[]> =
  BaseClassSpecOptions<TFunctionSpecs> & {
    numImplementations?: 'single';
    name: string;
    nameTemplate?: never;
  };

export type ManyClassSpecOptions<TFunctionSpecs extends FunctionSpec[] = FunctionSpec[]> =
  BaseClassSpecOptions<TFunctionSpecs> & {
    numImplementations: 'many';
    name?: never;
    nameTemplate: string;
  };

export type ClassSpecOptions<TFunctionSpecs extends FunctionSpec[] = FunctionSpec[]> =
  SingleClassSpecOptions<TFunctionSpecs> | ManyClassSpecOptions<TFunctionSpecs>;

export class ClassSpec<TFunctionSpecs extends FunctionSpec[] = FunctionSpec[]> {
  name?: string;
  nameTemplate?: string;
  numImplementations: 'single' | 'many';
  description: string;
  prompt: string;
  functionSpecs: TFunctionSpecs;

  constructor(options: ClassSpecOptions<TFunctionSpecs>) {
    if (options.numImplementations === 'many') {
      this.numImplementations = 'many';
      if (!/^[A-Z_a-z][$\w]*\*$/u.test(options.nameTemplate)) {
        throw new Error(
          `Class spec name template must be a JavaScript identifier followed by *: ${options.nameTemplate}`
        );
      }
      this.nameTemplate = options.nameTemplate;
    } else {
      this.numImplementations = 'single';
      this.name = options.name;
    }
    this.description = options.description;
    this.prompt = options.prompt;
    this.functionSpecs = options.functionSpecs;
  }

  matchesName(name: string): boolean {
    if (this.numImplementations === 'single') {
      return this.name === name;
    }

    const prefix = this.nameTemplate!.slice(0, -1);
    return new RegExp(`^${prefix}[$\\w]+$`, 'u').test(name);
  }
}
