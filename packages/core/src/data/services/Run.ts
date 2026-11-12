import { UsesContext, type UsesContextOptions } from '../../context/UsesContext.js';

export type RunOptions = UsesContextOptions & {};

export class Run extends UsesContext {
  startedAt: string | null;
  finishedAt: string | null;

  constructor(options: RunOptions) {
    super(options);
    this.startedAt = null;
    this.finishedAt = null;
  }

  async start<Result>(fn: () => Promise<Result>): Promise<Result> {
    this.startedAt = new Date().toISOString();
    try {
      return await fn();
    } finally {
      this.finishedAt = new Date().toISOString();
    }
  }
}
