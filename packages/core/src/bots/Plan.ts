export type PlanOptions = {
  report: string;
};

export class Plan {
  report: string;

  constructor(options: PlanOptions) {
    this.report = options.report;
  }
}
