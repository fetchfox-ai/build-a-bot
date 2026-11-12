import { MastraLogger } from '@mastra/core/logger';
import type { Logger } from '../logger.js';

export type RuntimeLoggerOptions = { logger: Logger };

/** Routes Mastra's internal logging through the runtime's configured logger. */
export class RuntimeLogger extends MastraLogger {
  readonly logger: Logger;

  constructor(options: RuntimeLoggerOptions) {
    super({ name: 'builder' });
    this.logger = options.logger;
  }

  debug(message: string, ...args: unknown[]): void {
    this.logger.debug(message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.logger.info(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.logger.warn(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.logger.error(message, ...args);
  }

  trackException(e: Error, metadata?: Record<string, unknown>): void {
    this.logger.error(e.message, e, metadata);
  }
}
