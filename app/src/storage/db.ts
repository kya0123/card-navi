/** IndexedDBの薄いラッパー。使えない環境ではメモリに保存する（詳細設計 11章） */
const DB_NAME = 'card-advisor';
const DB_VERSION = 1;
export const STORES = ['settings', 'recentStores', 'meta'] as const;
export type StoreName = (typeof STORES)[number];

export interface KV {
  readonly persistent: boolean;
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
  delete(store: StoreName, key: string): Promise<void>;
  clear(store: StoreName): Promise<void>;
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

class IdbKV implements KV {
  readonly persistent = true;
  constructor(private db: IDBDatabase) {}
  private tx(store: StoreName, mode: IDBTransactionMode) { return this.db.transaction(store, mode).objectStore(store); }
  get<T>(store: StoreName, key: string) { return req(this.tx(store, 'readonly').get(key)) as Promise<T | undefined>; }
  async put<T>(store: StoreName, key: string, value: T) { await req(this.tx(store, 'readwrite').put(value, key)); }
  getAll<T>(store: StoreName) { return req(this.tx(store, 'readonly').getAll()) as Promise<T[]>; }
  async delete(store: StoreName, key: string) { await req(this.tx(store, 'readwrite').delete(key)); }
  async clear(store: StoreName) { await req(this.tx(store, 'readwrite').clear()); }
}

export class MemoryKV implements KV {
  readonly persistent = false;
  private data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
  async get<T>(store: StoreName, key: string) { return this.data.get(store)!.get(key) as T | undefined; }
  async put<T>(store: StoreName, key: string, value: T) { this.data.get(store)!.set(key, structuredClone(value)); }
  async getAll<T>(store: StoreName) { return [...this.data.get(store)!.values()] as T[]; }
  async delete(store: StoreName, key: string) { this.data.get(store)!.delete(key); }
  async clear(store: StoreName) { this.data.get(store)!.clear(); }
}

export async function openKV(): Promise<KV> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      for (const s of STORES) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s);
    };
    const db = await Promise.race([
      req(open),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('indexedDB timeout')), 3000)),
    ]);
    return new IdbKV(db);
  } catch {
    return new MemoryKV();
  }
}
