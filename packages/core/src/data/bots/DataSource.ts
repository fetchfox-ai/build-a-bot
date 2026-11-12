import { UsesContext, type UsesContextOptions } from '../../context/UsesContext.js';
import { parseUrl } from '../../types.js';

export type DataSourceOptions = UsesContextOptions & {
  url: string;
};

export class DataSource extends UsesContext {
  url: string;

  constructor(options: DataSourceOptions) {
    super(options);
    this.url = parseUrl(options.url);
  }
}
