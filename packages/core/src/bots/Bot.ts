import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { formatWithOptions } from 'node:util';
import * as vm from 'node:vm';
import { TracingEventType, type TracingEvent } from '@mastra/core/observability';
import { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import chalk from 'chalk';
import PQueue from 'p-queue';
import { z } from 'zod';
import type { GlobalContext } from '../context/index.js';
import { UsesContext, type UsesContextOptions } from '../context/UsesContext.js';
import type { ILogger } from '../logger.js';
import type { AnyTool } from '../types.js';
import { getOrNull, srid, toError } from '../util/index.js';
import { BotTemplate } from './BotTemplate.js';
import { ClassSpec } from './ClassSpec.js';
import { toContextTools } from './contextTools.js';
import type { FunctionSpec } from './FunctionSpec.js';

export type BotResult<TOutput = z.output<FunctionSpec['outputSchema']>> = TOutput;

export type BotFunction<
  TInput = z.input<FunctionSpec['inputSchema']>,
  TOutput = z.output<FunctionSpec['outputSchema']>,
> = (input: TInput) => Promise<BotResult<TOutput>>;

export type BotFunctions = Record<string, Record<string, BotFunction>>;

type BuildEventError = {
  message: string;
  name?: string;
};

export type BuildEvent = ToolBuildEvent | InferenceBuildEvent;

type BaseBuildEvent<T extends string> = {
  type: T;
  input: any;
  output: any;
  error?: BuildEventError;
  startTime?: Date;
  endTime?: Date;
};

export type ToolBuildEvent = BaseBuildEvent<'toolCallStarted' | 'toolCallCompleted'> & {
  toolName?: string;
  toolDescription?: string;
};

export type InferenceBuildEvent = BaseBuildEvent<'inferenceStarted' | 'inferenceCompleted'>;

export type BotBuildOptions = {
  forceRebuild?: boolean;
  onBuildProgress?: (event: BuildEvent) => void | Promise<void>;
  onBuildComplete?: () => void | Promise<void>;
  onBuildFinally?: (error?: Error) => void | Promise<void>;
  onBuildError?: (error: Error) => void | Promise<void>;
};

type CompiledBot = {
  script: vm.Script;
  functions: BotFunctions;
};

const createConsole = (
  name: string,
  logger: ILogger
): Pick<Console, 'debug' | 'error' | 'info' | 'log' | 'warn'> => {
  const write = (level: 'debug' | 'error' | 'info' | 'warn', ...vals: unknown[]): void => {
    logger[level](
      `${chalk.bold.green('[bot:' + name + ']')} ${formatWithOptions({ colors: false }, ...vals)}`
    );
  };

  return {
    debug: (...vals) => write('debug', ...vals),
    error: (...vals) => write('error', ...vals),
    info: (...vals) => write('info', ...vals),
    log: (...vals) => write('info', ...vals),
    warn: (...vals) => write('warn', ...vals),
  };
};

const normalizeCode = (code: string): string =>
  code
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .replace(/\bexport\s+(?=(?:const|let|var|async\s+function|function|class)\b)/g, '');

const exportedClassNames = (code: string): string[] => [
  ...new Set(
    [...code.matchAll(/\bexport\s+class\s+([$A-Z_a-z][$\w]*)/gu)].map((match) => match[1])
  ),
];

export type BotOptions = UsesContextOptions & {
  id?: string;
  name: string;
  template: BotTemplate;
  code?: string;
};

export const botNamePattern = /^[A-Za-z][A-Za-z0-9_-]*$/;

const validateName = (name: string): void => {
  if (typeof name !== 'string' || !botNamePattern.test(name)) {
    throw new Error(
      'Bot name must start with a letter and contain only letters, numbers, underscores, and hyphens'
    );
  }
};

export class Bot extends UsesContext {
  name: string;
  status: string;
  template: BotTemplate;
  code?: string;
  script?: vm.Script;
  functions: BotFunctions = {};

  #initPromise?: Promise<void>;
  #pq = new PQueue({ concurrency: 50, intervalCap: 20, interval: 1_000, strict: true });

  constructor(options: BotOptions) {
    super(options);
    validateName(options.name);
    this.name = options.name;
    this.status = 'idle';
    this.template = options.template;
    this.template.receiveContext(this);

    if (options.code !== undefined) {
      this.#initPromise = this.setCode(options.code);
      // Keep failures available to init() without an unhandled rejection before it is called.
      void this.#initPromise.catch(() => {});
    }
  }

  async init(): Promise<void> {
    await this.template.init();
    await this.#initPromise;
  }

  async build(options: BotBuildOptions = {}): Promise<void> {
    await this.init();

    this.status = 'building';

    try {
      let code = this.code || '';

      if (!options?.forceRebuild) {
        const path = await this.#codePath();
        try {
          code = await readFile(path, 'utf8');
        } catch (e) {
          if (getOrNull<string>(e, 'code') !== 'ENOENT') {
            throw e;
          }
        }
      }

      if (!code || options?.forceRebuild) {
        const context = await this.context();
        const requestContext = new RequestContext<{ globalContext: GlobalContext }>();
        requestContext.set('globalContext', context);

        const traceId = srid(32, { hex: true });
        const handler = (event: TracingEvent) => {
          if (
            !options.onBuildProgress ||
            event.exportedSpan.traceId !== traceId ||
            event.type === TracingEventType.SPAN_UPDATED
          ) {
            return;
          }

          const spanType = event.exportedSpan?.type || '';
          let type: BuildEvent['type'] | null;
          switch (spanType) {
            case 'model_inference':
              type =
                event.type === TracingEventType.SPAN_STARTED
                  ? 'inferenceStarted'
                  : 'inferenceCompleted';
              break;
            case 'tool_call':
              type =
                event.type === TracingEventType.SPAN_STARTED
                  ? 'toolCallStarted'
                  : 'toolCallCompleted';
              break;
            default:
              type = null;
          }
          if (!type) {
            context.logger.debug(`Unhandled span type for build event: ${spanType}`);
            return;
          }

          const base = {
            type,
            input: event.exportedSpan?.input,
            output: event.exportedSpan?.output,
            startTime: event.exportedSpan?.startTime,
            endTime: event.exportedSpan?.endTime,
            error: event.exportedSpan?.errorInfo
              ? {
                  name: event.exportedSpan.errorInfo.name,
                  message: event.exportedSpan.errorInfo.message,
                }
              : undefined,
          };

          if (spanType === 'tool_call') {
            options.onBuildProgress({
              ...base,
              toolName: event.exportedSpan?.entityName,
              toolDescription: (event.exportedSpan?.attributes as any)?.toolDescription,
            });
          } else {
            options.onBuildProgress(base);
          }
        };

        context.on('trace', handler);
        let resp;
        let error: Error | undefined;
        try {
          const run = await context.mastra.getWorkflowById('build-workflow').createRun();
          resp = await run.start({
            inputData: {
              botTemplate: this.template,
            },
            requestContext,
            tracingOptions: { traceId },
          });
          if (resp.status !== 'success') {
            const e = new Error(`Bot build workflow failed with status: ${resp.status}`);
            this.#generateErrorFunctions(e);
            throw e;
          }

          if (options.onBuildComplete) {
            options.onBuildComplete();
          }
        } catch (e) {
          error = toError(e);
          if (options.onBuildError) {
            options.onBuildError(error);
          }
          throw e;
        } finally {
          context.off('trace', handler);
          if (options.onBuildFinally) {
            options.onBuildFinally(error);
          }
        }
        code = resp.result.code;
      }

      await this.setCode(code);
    } finally {
      this.status = 'idle';
    }
  }

  async setCode(code: string): Promise<void> {
    this.code = code;
    await this.#save();

    this.script = undefined;
    this.functions = {};

    try {
      const compiled = await this.#compile(code);
      this.script = compiled.script;
      this.functions = compiled.functions;
    } catch (e) {
      const error = toError(e);
      this.#generateErrorFunctions(error);
      throw error;
    }
  }

  async #codePath(): Promise<string> {
    validateName(this.name);
    const context = await this.context();
    return join(context.rootDirectory, 'scripts', this.name, 'main.js');
  }

  async #save(): Promise<void> {
    if (this.code === undefined) {
      throw new Error(`Cannot save ${this.name} without code`);
    }

    const context = await this.context();
    const path = await this.#codePath();
    context.logger.debug(`Saving ${this.name} to ${path}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, this.code, 'utf8');
    context.logger.info(`Saved ${this.name} to ${path}`);
  }

  async #compile(code: string): Promise<CompiledBot> {
    await this.template.init();
    const context = await this.context();

    const classNames = exportedClassNames(code);
    const source = `
      (async () => {
        'use strict';
        ${normalizeCode(code)}
        return {
          ${classNames
            .map(
              (name) =>
                `${JSON.stringify(name)}: typeof ${name} === 'undefined' ? undefined : ${name}`
            )
            .join(',\n')}
        };
      })()
    `;
    const script = new vm.Script(source, { filename: 'bot.js' });

    const exports = await script.runInContext(this.#createVmContext([], context), {
      timeout: 1_000,
    });
    const classEntries = this.#classEntries(classNames);
    for (const { className, classSpec } of classEntries) {
      const classConstructor = this.#classFromExports(exports, className);
      for (const functionSpec of classSpec.functionSpecs) {
        if (typeof classConstructor.prototype[functionSpec.name] !== 'function') {
          throw new Error(`Bot class ${className} must implement a ${functionSpec.name} method`);
        }
      }
    }

    const functions = Object.fromEntries(
      classEntries.map(({ className, classSpec }) => [
        className,
        Object.fromEntries(
          classSpec.functionSpecs.map((functionSpec) => [
            functionSpec.name,
            async (input: unknown): Promise<BotResult> => {
              const logs: string[] = [];
              try {
                const parsedInput = await functionSpec.inputSchema.parseAsync(input);
                const vmContext = this.#createVmContext(logs, context);
                const exports = await script.runInContext(vmContext, { timeout: 1_000 });
                const classConstructor = this.#classFromExports(exports, className);
                const instance = new classConstructor();
                const fn = instance[functionSpec.name];
                if (typeof fn !== 'function') {
                  throw new Error(
                    `Bot class ${className} must implement a ${functionSpec.name} method`
                  );
                }

                const result = await functionSpec.outputSchema.parseAsync(
                  await fn.call(instance, parsedInput)
                );
                return { result, logs, error: undefined };
              } catch (e) {
                return { result: undefined, logs, error: toError(e) };
              }
            },
          ])
        ),
      ])
    ) as BotFunctions;

    return { script, functions };
  }

  async run(className: string, functionName: string, input: unknown): Promise<BotResult> {
    const classFunctions = this.functions[className];
    if (!classFunctions) {
      throw new Error(`Bot class is unavailable: ${className}`);
    }
    const fn = classFunctions[functionName];
    if (!fn) {
      throw new Error(`Bot function is unavailable: ${className}.${functionName}`);
    }
    const out: any = await fn(input);
    if (out.error) {
      throw out.error;
    } else {
      return out.result;
    }
  }

  private async runImplementations(
    classSpec: ClassSpec,
    functionName: string,
    input: unknown
  ): Promise<BotResult[]> {
    const classNames = Object.keys(this.functions).filter((className) =>
      classSpec.matchesName(className)
    );
    if (classNames.length === 0) {
      throw new Error(
        `Bot class specification ${classSpec.name ?? classSpec.nameTemplate} has no implementations`
      );
    }
    return Promise.all(classNames.map((className) => this.run(className, functionName, input)));
  }

  createTools(prefix: string): Record<string, AnyTool> {
    const viewSource = createTool({
      id: `${prefix}_viewSource`,
      description: 'View the generated source code for this bot.',
      inputSchema: z.object({}),
      outputSchema: z.object({ code: z.string().nullable() }),
      execute: async () => ({ code: this.code ?? null }),
    });
    const functionTools = Object.fromEntries(
      this.#toolClassEntries().flatMap(({ className, classSpec }) =>
        classSpec.functionSpecs.map((functionSpec) => {
          const id = `${prefix}_run_${className}_${functionSpec.name}`;
          const tool = createTool({
            id,
            description: functionSpec.description,
            inputSchema: functionSpec.inputSchema,
            outputSchema: functionSpec.outputSchema,
            execute: async (input) => this.run(className, functionSpec.name, input),
          });
          return [id, tool];
        })
      )
    );

    return {
      [viewSource.id]: viewSource,
      ...functionTools,
    } as Record<string, AnyTool>;
  }

  #createVmContext(logs: string[], context: GlobalContext): vm.Context {
    return vm.createContext({
      ...this.template.globals,
      ...this.template.modules,
      tools: toContextTools(this.template.tools, context),
      pq: this.#pq,
      console: createConsole(this.name, context.logger),
    });
  }

  #classFromExports(
    exports: unknown,
    className: string
  ): Record<string, unknown> & { new (): any } {
    if (typeof exports !== 'object' || exports === null) {
      throw new Error('Bot script did not return its exported classes');
    }
    const classConstructor = (exports as Record<string, unknown>)[className];
    if (typeof classConstructor !== 'function') {
      throw new Error(`Bot script must export a ${className} class`);
    }
    if (!/^class\s/u.test(Function.prototype.toString.call(classConstructor))) {
      throw new Error(`Bot export ${className} must be a class`);
    }
    return classConstructor as Record<string, unknown> & { new (): any };
  }

  #classEntries(
    classNames: string[]
  ): { className: string; classSpec: BotTemplate['classSpecs'][number] }[] {
    const entries: { className: string; classSpec: BotTemplate['classSpecs'][number] }[] = [];
    for (const className of classNames) {
      const classSpecs = this.template.classSpecs.filter((classSpec) =>
        classSpec.matchesName(className)
      );
      if (classSpecs.length > 1) {
        throw new Error(`Bot class ${className} matches multiple class specifications`);
      }
      if (classSpecs.length === 1) {
        entries.push({ className, classSpec: classSpecs[0] });
      }
    }

    for (const classSpec of this.template.classSpecs) {
      const classSpecEntries = entries.filter((entry) => entry.classSpec === classSpec);
      if (classSpec.numImplementations === 'single' && classSpecEntries.length === 0) {
        throw new Error(`Bot script must export a ${classSpec.name} class`);
      }
      if (classSpec.numImplementations === 'many' && classSpecEntries.length === 0) {
        throw new Error(
          `Bot script must export one or more classes matching ${classSpec.nameTemplate}`
        );
      }
    }

    return entries;
  }

  #toolClassEntries(): { className: string; classSpec: BotTemplate['classSpecs'][number] }[] {
    return this.template.classSpecs.flatMap((classSpec) => {
      if (classSpec.numImplementations === 'single') {
        return [{ className: classSpec.name!, classSpec }];
      }
      return Object.keys(this.functions)
        .filter((className) => classSpec.matchesName(className))
        .map((className) => ({ className, classSpec }));
    });
  }

  #generateErrorFunctions(e: unknown): void {
    const error = toError(e);
    this.script = undefined;
    this.functions = Object.fromEntries(
      this.template.classSpecs
        .filter((classSpec) => classSpec.numImplementations === 'single')
        .map((classSpec) => [
          classSpec.name!,
          Object.fromEntries(
            classSpec.functionSpecs.map(({ name }) => [
              name,
              async (): Promise<BotResult> => {
                throw new Error(
                  `${classSpec.name}.${name} unavailable due to error compiling script: ${error.message}`,
                  { cause: error }
                );
              },
            ])
          ),
        ])
    );
  }
}
