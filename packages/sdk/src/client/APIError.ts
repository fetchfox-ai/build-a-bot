export class APIError extends Error {
  readonly status: number;

  constructor(options: { message: string; status: number }) {
    super(options.message);
    this.status = options.status;
  }
}
