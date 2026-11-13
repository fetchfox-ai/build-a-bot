import { Logger as TsLogger, LogLevel } from 'tslog';
import { logLevel } from './constants.js';

const logLevels: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  error: LogLevel.ERROR,
  fatal: LogLevel.FATAL,
  info: LogLevel.INFO,
  silly: LogLevel.SILLY,
  trace: LogLevel.TRACE,
  warn: LogLevel.WARN,
};

export interface ILogger {
  silly(...args: unknown[]): void;
  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  fatal(...args: unknown[]): void;
}

export class Logger extends TsLogger<Record<string, unknown>> {
  constructor() {
    super({
      name: 'builder',
      minLevel: logLevels[logLevel?.toLowerCase() ?? ''],
      type: 'hidden',
      pretty: {
        style: true,
        inspectOptions: {
          depth: 3,
          maxArrayLength: 20,
          maxStringLength: 5_000,
          compact: true,
          breakLength: 120,
        },
        template:
          '{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}\t{{logLevelName}}\t{{name}}\t',
      },
      stack: { capture: 'lazy' },
      attachedTransports: [
        {
          format: 'pretty',
          write: (record, line) => {
            const source = record._logMeta.path?.filePathWithLine;
            process.stdout.write(`${line}${source == null ? '' : `\t${source}`}\n`);
          },
        },
      ],
    });
  }
}
