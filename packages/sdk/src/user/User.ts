import type { UsesClient } from '../client/UsesClient.js';

export type UserOptions = UsesClient & {
  username: string;
};

export class User {
  readonly client: UsesClient['client'];
  readonly username: string;

  constructor(options: UserOptions) {
    this.client = options.client;
    this.username = options.username;
  }
}
