import { hash } from '../../util/index.js';

export class Item {
  constructor(identity: any, data: any, citations?: any) {
    if (data.citations !== undefined && citations !== undefined) {
      throw new Error('Citations cannot be provided in both data and the citations argument.');
    }
    if (data.identity !== undefined) {
      throw new Error('Identity cannot be provided in data argument.');
    }
    Object.assign(this, { data });
    Object.assign(this, { hash: hash(identity) });
    Object.assign(this, { identity });
    if (citations !== undefined) {
      Object.assign(this, { citations });
    }
  }
}
