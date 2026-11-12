import type { GlobalContext } from './index.js';

export type UsesContextOptions = {
  context?: GlobalContext;
};

export class UsesContext {
  #context?: GlobalContext;
  #contextPromise?: Promise<GlobalContext>;

  constructor(options: UsesContextOptions) {
    const { context } = options;
    if (context) {
      this.#context = context;
      this.#contextPromise = Promise.resolve(context);
    }
  }

  async context(): Promise<GlobalContext> {
    this.#context ??= await (this.#contextPromise ??= this.#createContext());
    return this.#context;
  }

  receiveContext(other: UsesContext): void {
    const thisHasContext = Boolean(this.#context || this.#contextPromise);
    const otherHasContext = Boolean(other.#context || other.#contextPromise);

    if (thisHasContext && !otherHasContext) {
      throw new Error('Cannot receive an unbound context');
    }

    const contextsMatch = Boolean(
      this.#context && other.#context && this.#context === other.#context
    );
    const contextPromisesMatch = Boolean(
      this.#contextPromise &&
      other.#contextPromise &&
      this.#contextPromise === other.#contextPromise
    );

    if (thisHasContext && otherHasContext && !contextsMatch && !contextPromisesMatch) {
      throw new Error('Context is already bound to a different context');
    }

    if (!this.#context && !other.#context) {
      const contextPromise = other.#contextPromise ?? this.#createContext();
      this.#contextPromise = contextPromise;
      other.#contextPromise = contextPromise;
    } else {
      this.#context ??= other.#context;
      this.#contextPromise ??= other.#contextPromise;
    }
  }

  bindContext(context: GlobalContext): void {
    if (this.#context && this.#context !== context) {
      throw new Error('Context is already bound');
    }
    if (this.#contextPromise && !this.#context) {
      throw new Error('Context is already being created');
    }

    this.#context = context;
    this.#contextPromise = Promise.resolve(context);
  }

  protected boundContext(): GlobalContext | undefined {
    return this.#context;
  }

  async #createContext(): Promise<GlobalContext> {
    const { createGlobalContext } = await import('./index.js');
    return createGlobalContext({});
  }
}
