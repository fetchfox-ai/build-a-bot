import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import PQueue from 'p-queue';
import { UsesContext, type UsesContextOptions } from '../../../context/UsesContext.js';
import { getOrNull } from '../../../util/index.js';
import { Item } from '../Item.js';
import { Run } from '../Run.js';
import { type HistoricalItem, type IItemStorage } from './IItemStorage.js';

export type FileFormat = 'csv' | 'json' | 'jsonl' | 'tsv';

export type FileItemStorageOptions = UsesContextOptions & {
  directory: string;
  format?: FileFormat;
};

export class FileItemStorage extends UsesContext implements IItemStorage {
  readonly directory: string;
  readonly format: FileFormat;
  readonly #pq = new PQueue({ concurrency: 1 });

  constructor(options: FileItemStorageOptions) {
    super(options);
    this.directory = options.directory;
    this.format = options.format ?? 'jsonl';
  }

  async add(namespace: string, run: Run, items: Item[]): Promise<void> {
    const context = await this.context();
    await this.#pq.add(async () => {
      const itemsFilename = this.latestItemsFilename(namespace);
      const citationsFilename = this.latestCitationsFilename(namespace);
      const runItemsFilename = this.runItemsFilename(namespace, run);
      const runCitationsFilename = this.runCitationsFilename(namespace, run);
      context.logger.info(
        `Adding ${items.length} items to ${itemsFilename} and ${runItemsFilename}`
      );
      const current = await this.readItems(itemsFilename, citationsFilename);
      await this.write(itemsFilename, this.serializeItems([...current, ...items]));
      await this.write(citationsFilename, this.serializeCitations([...current, ...items]));
      await this.write(runItemsFilename, this.serializeItems(items, run));
      await this.write(runCitationsFilename, this.serializeCitations(items, run));
    });
  }

  async remove(namespace: string, identities: any[]): Promise<void> {
    const context = await this.context();
    await this.#pq.add(async () => {
      const itemsFilename = this.latestItemsFilename(namespace);
      const citationsFilename = this.latestCitationsFilename(namespace);
      const items = await this.readItems(itemsFilename, citationsFilename);
      const remaining = items.filter(
        (item) =>
          !identities.some((identity) => isDeepStrictEqual(getOrNull(item, 'identity'), identity))
      );
      context.logger.info(
        `Removing ${items.length - remaining.length} items from ${itemsFilename}`
      );
      await this.write(itemsFilename, this.serializeItems(remaining));
      await this.write(citationsFilename, this.serializeCitations(remaining));
    });
  }

  async list(
    namespace: string,
    { offset = 0, limit }: { offset?: number; limit?: number }
  ): Promise<Item[]> {
    return this.#pq.add(async () => {
      const items = await this.readItems(
        this.latestItemsFilename(namespace),
        this.latestCitationsFilename(namespace)
      );
      return limit === undefined ? items.slice(offset) : items.slice(offset, offset + limit);
    });
  }

  async listHistorical(namespace: string, identity: any): Promise<HistoricalItem[]> {
    return this.#pq.add(async () => {
      const dir = this.archiveDirectory(namespace);
      let filenames: string[];
      try {
        filenames = await readdir(dir);
      } catch (e) {
        if (getOrNull<string>(e, 'code') === 'ENOENT') {
          return [];
        }
        throw e;
      }
      const history = await Promise.all(
        filenames
          .filter((filename) => new RegExp(`^items-run-.*\\.${this.format}$`).test(filename))
          .sort()
          .map((filename) =>
            this.readRun(
              join(dir, filename),
              join(dir, filename.replace('items-run-', 'citations-run-'))
            )
          )
      );
      return history
        .flat()
        .filter(({ item }) => isDeepStrictEqual(getOrNull(item, 'identity'), identity));
    });
  }

  private namespaceDirectory(namespace: string): string {
    return join(this.directory, namespace);
  }
  private archiveDirectory(namespace: string): string {
    return join(this.namespaceDirectory(namespace), 'archive');
  }
  private latestItemsFilename(namespace: string): string {
    return join(this.namespaceDirectory(namespace), `items-latest.${this.format}`);
  }
  private latestCitationsFilename(namespace: string): string {
    return join(this.namespaceDirectory(namespace), `citations-latest.${this.format}`);
  }
  private runItemsFilename(namespace: string, run: Run): string {
    return join(
      this.archiveDirectory(namespace),
      `items-run-${this.timestamp(run)}.${this.format}`
    );
  }
  private runCitationsFilename(namespace: string, run: Run): string {
    return join(
      this.archiveDirectory(namespace),
      `citations-run-${this.timestamp(run)}.${this.format}`
    );
  }

  private timestamp(run: Run): string {
    const date = new Date(run.finishedAt ?? run.startedAt ?? new Date().toISOString());
    if (Number.isNaN(date.getTime())) {
      throw new TypeError('Invalid run timestamp.');
    }
    return date.toISOString().slice(0, 19).replace('T', '-');
  }

  private async readItems(itemsFilename: string, citationsFilename: string): Promise<Item[]> {
    const items = await this.read(itemsFilename);
    if (items === null) {
      return [];
    }
    const citations = await this.read(citationsFilename);
    if (citations === null) {
      throw new TypeError(`Citation storage file is missing: ${citationsFilename}`);
    }
    return items.map((item) => this.toItem(item, citations, itemsFilename));
  }

  private async readRun(
    itemsFilename: string,
    citationsFilename: string
  ): Promise<HistoricalItem[]> {
    const items = await this.read(itemsFilename);
    const citations = await this.read(citationsFilename);
    if (items === null || citations === null) {
      throw new TypeError(`Run storage files are missing: ${itemsFilename}, ${citationsFilename}`);
    }
    return items.map((item) => {
      const run = getOrNull<Record<string, unknown>>(item, 'run');
      if (run === null) {
        throw new TypeError(`Run storage file contains an invalid entry: ${itemsFilename}`);
      }
      const storedRun = new Run({});
      storedRun.finishedAt = getOrNull<string>(run, 'finishedAt');
      storedRun.startedAt = getOrNull<string>(run, 'startedAt');
      return { item: this.toItem(item, citations, itemsFilename), run: storedRun };
    });
  }

  private async read(filename: string): Promise<Record<string, unknown>[] | null> {
    let text: string;
    try {
      text = await readFile(filename, 'utf8');
    } catch (e) {
      if (getOrNull<string>(e, 'code') === 'ENOENT') {
        return null;
      }
      throw e;
    }
    if (this.format === 'json') {
      return JSON.parse(text) as Record<string, unknown>[];
    }
    if (this.format === 'jsonl') {
      return text
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    }
    return this.parseDelimited(text, this.format === 'csv' ? ',' : '\t');
  }

  private toItem(val: unknown, citations: Record<string, unknown>[], filename: string): Item {
    if (typeof val !== 'object' || val === null) {
      throw new TypeError(`Item storage file contains a non-object item: ${filename}`);
    }
    const storedItem = val as Record<string, unknown>;
    const identity = storedItem.identity;
    const data = getOrNull<Record<string, unknown>>(storedItem, 'data');
    if (data === null) {
      throw new TypeError(`Item storage file contains an invalid item: ${filename}`);
    }
    const citation = citations.find((val) =>
      isDeepStrictEqual(getOrNull(val, 'identity'), identity)
    );
    const itemCitations =
      citation && Object.hasOwn(citation, 'citations') ? citation.citations : undefined;
    return new Item(identity, data, itemCitations);
  }

  private serializeItems(items: Item[], run?: Run): Record<string, unknown>[] {
    return items.map((item) => {
      const data = { ...(item as Record<string, unknown>) };
      const { data: itemData, hash: itemHash, identity } = data;
      return run
        ? { identity, hash: itemHash, data: itemData, run }
        : { identity, hash: itemHash, data: itemData };
    });
  }

  private serializeCitations(items: Item[], run?: Run): Record<string, unknown>[] {
    return items.map((item) => {
      const data = item as Record<string, unknown>;
      const citation: Record<string, unknown> = {
        identity: data.identity,
        hash: data.hash,
      };
      if (Object.hasOwn(data, 'citations')) {
        citation.citations = data.citations;
      }
      if (run) {
        citation.run = run;
      }
      return citation;
    });
  }

  private async write(filename: string, vals: Record<string, unknown>[]): Promise<void> {
    await mkdir(dirname(filename), { recursive: true });
    let text: string;
    if (this.format === 'json') {
      text = JSON.stringify(vals);
    } else if (this.format === 'jsonl') {
      text = vals.map((val) => JSON.stringify(val)).join('\n');
    } else {
      text = this.serializeDelimited(vals, this.format === 'csv' ? ',' : '\t');
    }
    await writeFile(filename, text ? `${text}\n` : '', 'utf8');
  }

  private serializeDelimited(vals: Record<string, unknown>[], delimiter: string): string {
    const headers = [...new Set(vals.flatMap((val) => Object.keys(val)))];
    const identityIndex = headers.indexOf('identity');
    if (identityIndex > 0) {
      headers.splice(identityIndex, 1);
      headers.unshift('identity');
    }
    return [
      headers,
      ...vals.map((val) =>
        headers.map((header) => (val[header] === undefined ? '' : JSON.stringify(val[header])))
      ),
    ]
      .map((row) => row.map((val) => this.escapeDelimited(val, delimiter)).join(delimiter))
      .join('\n');
  }

  private parseDelimited(text: string, delimiter: string): Record<string, unknown>[] {
    const lines = text.split('\n').filter(Boolean);
    const headers = this.parseDelimitedLine(lines.shift() ?? '', delimiter);
    return lines.map((line) => {
      const vals = this.parseDelimitedLine(line, delimiter);
      const record: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i++) {
        if (vals[i] !== '') {
          record[headers[i]] = JSON.parse(vals[i]);
        }
      }
      return record;
    });
  }

  private escapeDelimited(val: string, delimiter: string): string {
    return val.includes(delimiter) || val.includes('"') ? `"${val.replaceAll('"', '""')}"` : val;
  }
  private parseDelimitedLine(line: string, delimiter: string): string[] {
    const vals: string[] = [];
    let val = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          val += char;
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        vals.push(val);
        val = '';
      } else {
        val += char;
      }
    }
    vals.push(val);
    return vals;
  }
}
