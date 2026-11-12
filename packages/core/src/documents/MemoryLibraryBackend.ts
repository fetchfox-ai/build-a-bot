import { type Logger } from '../logger.js';
import type { DocumentId, DocumentLibraryBackend, StoredDocument } from './DocumentLibrary.js';

const clone = (document: StoredDocument): StoredDocument => ({
  ...document,
  headers: { ...document.headers },
  request: {
    ...document.request,
    headers: { ...document.request.headers },
  },
});

export type MemoryLibraryBackendOptions = { logger: Logger };

export class MemoryLibraryBackend implements DocumentLibraryBackend {
  readonly logger: Logger;
  private documents = new Map<DocumentId, StoredDocument>();

  constructor(options: MemoryLibraryBackendOptions) {
    this.logger = options.logger;
  }

  save(document: StoredDocument): void {
    this.logger.info(`Saving document id=${document.id} backend=memory`);
    this.documents.set(document.id, clone(document));
  }

  get(id: DocumentId): StoredDocument | null {
    const document = this.documents.get(id);
    return document ? clone(document) : null;
  }

  list(): StoredDocument[] {
    return [...this.documents.values()].map(clone);
  }
}
