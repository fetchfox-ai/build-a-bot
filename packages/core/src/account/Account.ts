import { UsesContext, type UsesContextOptions } from '../context/UsesContext.js';

export type AccountOptions = UsesContextOptions & {
  id?: string;
  username: string;
};

export class Account extends UsesContext {
  id: string | null;
  username: string;

  constructor(options: AccountOptions) {
    super(options);
    this.id = options.id ?? null;
    this.username = options.username;
  }

  toJson(): { username: string } {
    return { username: this.username };
  }
}
