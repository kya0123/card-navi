import type { KV } from './db';
import type { MasterIndex } from '../domain/master';
import { defaultSettings, reconcile } from '../domain/settings';
import type { Id, UserSettings, YMD } from '../domain/types';

const RECENT_MAX = 20;

export class SettingsRepo {
  constructor(private kv: KV, private mi: MasterIndex) {}

  get persistent() { return this.kv.persistent; }

  /** 設定を読み込み、マスタと整合をとる。初回は既定値を返す */
  async load(): Promise<{ settings: UserSettings; dropped: number; isNew: boolean }> {
    const saved = await this.kv.get<UserSettings>('settings', 'user');
    if (!saved) return { settings: defaultSettings(this.mi), dropped: 0, isNew: true };
    const r = reconcile(this.mi, saved);
    return { ...r, isNew: false };
  }

  async save(s: UserSettings): Promise<void> {
    await this.kv.put('settings', 'user', s);
  }

  async recent(): Promise<Id[]> {
    const rows = await this.kv.getAll<{ storeId: Id; usedAt: string }>('recentStores');
    return rows
      .filter((r) => this.mi.stores.has(r.storeId))
      .sort((a, b) => (a.usedAt < b.usedAt ? 1 : -1))
      .map((r) => r.storeId);
  }

  async touchRecent(storeId: Id, now: string): Promise<Id[]> {
    await this.kv.put('recentStores', storeId, { storeId, usedAt: now });
    const rows = await this.kv.getAll<{ storeId: Id; usedAt: string }>('recentStores');
    rows.sort((a, b) => (a.usedAt < b.usedAt ? 1 : -1));
    for (const old of rows.slice(RECENT_MAX)) await this.kv.delete('recentStores', old.storeId);
    return this.recent();
  }

  async getMeta<T>(key: string) { return this.kv.get<T>('meta', key); }
  async setMeta<T>(key: string, v: T) { await this.kv.put('meta', key, v); }

  async resetAll(): Promise<UserSettings> {
    await this.kv.clear('settings');
    await this.kv.clear('recentStores');
    await this.kv.clear('meta');
    return defaultSettings(this.mi);
  }
}

/** 永続ストレージを要求（詳細設計 8.1） */
export async function requestPersist(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const backupFileName = (today: YMD) => `card-advisor-${today.replaceAll('-', '')}.json`;
