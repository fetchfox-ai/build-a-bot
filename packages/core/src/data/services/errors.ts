export class BotNotBuiltError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotNotBuiltError';
  }
}
