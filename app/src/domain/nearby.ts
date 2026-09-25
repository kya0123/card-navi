import { isValidYMD } from './date';
import type { MasterIndex } from './master';
import { normalize } from './search';
import type { Id, UserSettings } from './types';

/** 近くのお店から選ぶ（F13・詳細設計 27章）。UIや通信に依存しない純粋関数 */

export type NearbyProvider = 'osm' | 'yolp';
export const NEARBY_PROVIDERS: NearbyProvider[] = ['osm', 'yolp'];
export const NEARBY_RADII = [100, 300, 500, 1000] as const;
export type NearbyRadius = (typeof NEARBY_RADII)[number];
export const DEFAULT_RADIUS: NearbyRadius = 300;
export const NEARBY_LIMIT = 20;
export const REUSE_MS = 5 * 60 * 1000;
export const REUSE_M = 50;
export const LOW_ACCURACY_M = 100;
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const YOLP_URL = 'https://map.yahooapis.jp/search/local/V1/localSearch';

/** 近くのお店の対象外カテゴリ */
const EXCLUDED_CATEGORIES = new Set(['ec', 'transport', 'vending']);

export interface Place {
  id: string;
  name: string;
  brand?: string;
  brandWikidata?: string;
  branch?: string;
  lat: number;
  lon: number;
}

export interface NearbyItem { storeId: Id; place: Place; distanceM: number; label: string }

export interface NearbyIndex {
  byWikidata: Map<string, Id>;
  /** 正規化したキー → 店舗ID（同じキーは先に登録した店舗） */
  byKey: Map<string, Id>;
}

// ---------- 設定 ----------
export const providerOf = (s: UserSettings): NearbyProvider => s.nearbyProvider ?? 'osm';
export const radiusOf = (s: UserSettings): NearbyRadius => s.nearbyRadiusM ?? DEFAULT_RADIUS;
export const nearbyOn = (s: UserSettings): boolean => s.nearbyEnabled !== false;
export function nextRadius(r: number): NearbyRadius | null {
  return NEARBY_RADII.find((x) => x > r) ?? null;
}

/** reconcile 用：想定外の値を取り除く（詳細設計 27.2）。入力は変更しない */
export function sanitizeNearby(s: UserSettings): Pick<UserSettings, 'nearbyEnabled' | 'nearbyProvider' | 'nearbyRadiusM' | 'nearbyConsent'> {
  const out: Pick<UserSettings, 'nearbyEnabled' | 'nearbyProvider' | 'nearbyRadiusM' | 'nearbyConsent'> = {};
  if (typeof s.nearbyEnabled === 'boolean') out.nearbyEnabled = s.nearbyEnabled;
  if (s.nearbyProvider && NEARBY_PROVIDERS.includes(s.nearbyProvider)) out.nearbyProvider = s.nearbyProvider;
  if (s.nearbyRadiusM && (NEARBY_RADII as readonly number[]).includes(s.nearbyRadiusM)) out.nearbyRadiusM = s.nearbyRadiusM;
  if (s.nearbyConsent && typeof s.nearbyConsent === 'object') {
    const c: { osm?: string; yolp?: string } = {};
    for (const p of NEARBY_PROVIDERS) {
      const d = (s.nearbyConsent as Record<string, unknown>)[p];
      if (typeof d === 'string' && isValidYMD(d)) c[p] = d;
    }
    if (c.osm || c.yolp) out.nearbyConsent = c;
  }
  return out;
}

// ---------- 距離・座標 ----------
const R_EARTH = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** 2点間の距離（m、四捨五入） */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(x))));
}

/** 送る座標を小数点以下4桁（約10m）に丸める */
export function roundCoord(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

// ---------- 紐付け ----------
function targetStore(mi: MasterIndex, id: Id): boolean {
  const s = mi.stores.get(id);
  if (!s || EXCLUDED_CATEGORIES.has(s.categoryId)) return false;
  const methods = s.acceptedMethods;
  return !(methods && methods.length > 0 && methods.every((m) => m === 'online'));
}

export function buildNearbyIndex(mi: MasterIndex): NearbyIndex {
  const byWikidata = new Map<string, Id>();
  const byKey = new Map<string, Id>();
  for (const s of mi.raw.stores) {
    if (!targetStore(mi, s.id)) continue;
    for (const q of s.osmBrandWikidata ?? []) if (!byWikidata.has(q)) byWikidata.set(q, s.id);
    for (const k of [s.name, ...s.aliases].map(normalize)) if (k && !byKey.has(k)) byKey.set(k, s.id);
  }
  return { byWikidata, byKey };
}

const isHiragana = (ch: string) => /^[ぁ-ゖー]$/.test(ch);

/** OSM・YOLPの1件をマスタの店舗に紐付ける（詳細設計 27.3）。紐付かなければ null */
export function matchPlace(idx: NearbyIndex, p: Place): Id | null {
  if (p.brandWikidata) {
    for (const q of p.brandWikidata.split(';').map((x) => x.trim())) {
      const id = idx.byWikidata.get(q);
      if (id) return id;
    }
  }
  const exact = (s?: string) => (s ? idx.byKey.get(normalize(s)) ?? null : null);
  const byBrand = exact(p.brand);
  if (byBrand) return byBrand;
  const byName = exact(p.name);
  if (byName) return byName;
  const head = p.name.trim().split(/\s+/)[0];
  if (head !== p.name.trim()) {
    const byHead = exact(head);
    if (byHead) return byHead;
  }
  // 支店名が続く名前：キーで始まり、残りがひらがな以外で始まって「店」で終わる。長いキーを優先
  const n = normalize(p.name);
  let best: { key: string; id: Id } | null = null;
  for (const [key, id] of idx.byKey) {
    if (key.length >= n.length || !n.startsWith(key)) continue;
    const rest = n.slice(key.length);
    if (isHiragana(rest[0]) || !rest.endsWith('店')) continue;
    if (!best || key.length > best.key.length) best = { key, id };
  }
  return best?.id ?? null;
}

function labelOf(mi: MasterIndex, storeId: Id, p: Place): string {
  const name = mi.stores.get(storeId)!.name;
  if (p.branch) return `${name} ${p.branch}`;
  return normalize(p.name) === normalize(name) ? name : p.name;
}

/** 紐付け・距離計算・並べ替え（距離 → 店舗ID）・半径外の除外・重複の除外・件数の上限 */
export function toNearbyItems(
  mi: MasterIndex, idx: NearbyIndex, places: Place[], origin: { lat: number; lon: number }, radiusM: number,
  limit = NEARBY_LIMIT,
): NearbyItem[] {
  const seen = new Set<string>();
  const items: NearbyItem[] = [];
  for (const p of places) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const storeId = matchPlace(idx, p);
    if (!storeId) continue;
    const d = distanceM(origin, p);
    if (d > radiusM) continue;
    items.push({ storeId, place: p, distanceM: d, label: labelOf(mi, storeId, p) });
  }
  items.sort((a, b) => a.distanceM - b.distanceM || (a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0)
    || (a.place.id < b.place.id ? -1 : 1));
  return items.slice(0, limit);
}

// ---------- 再利用 ----------
export interface NearbyCache {
  provider: NearbyProvider; radiusM: number; lat: number; lon: number; atMs: number; places: Place[];
}

export function canReuse(
  c: NearbyCache | null, provider: NearbyProvider, radiusM: number, lat: number, lon: number, nowMs: number,
): boolean {
  if (!c || c.provider !== provider || c.radiusM !== radiusM) return false;
  if (nowMs - c.atMs > REUSE_MS || nowMs < c.atMs) return false;
  return distanceM(c, { lat, lon }) <= REUSE_M;
}

// ---------- Overpass ----------
export function buildOverpassQuery(lat: number, lon: number, radiusM: number): string {
  const a = `around:${radiusM},${roundCoord(lat)},${roundCoord(lon)}`;
  return `[out:json][timeout:10];\n(\n  nwr(${a})[shop];\n  nwr(${a})[amenity~"^(restaurant|fast_food|cafe|pharmacy|ice_cream|food_court)$"];\n);\nout center tags 200;`;
}

interface OsmElement {
  type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function parseOverpass(json: unknown): Place[] {
  const els = (json as { elements?: OsmElement[] })?.elements;
  if (!Array.isArray(els)) throw new Error('overpass: elements がありません');
  const out: Place[] = [];
  for (const e of els) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const name = t['name:ja'] || t.name || t['brand:ja'] || t.brand;
    if (typeof lat !== 'number' || typeof lon !== 'number' || !name) continue;
    const p: Place = { id: `osm:${e.type}/${e.id}`, name, lat, lon };
    const brand = t['brand:ja'] || t.brand;
    if (brand) p.brand = brand;
    if (t['brand:wikidata']) p.brandWikidata = t['brand:wikidata'];
    if (t.branch) p.branch = t.branch;
    out.push(p);
  }
  return out;
}

// ---------- YOLP ----------
export function buildYolpUrl(appId: string, lat: number, lon: number, radiusM: number, callback: string): string {
  const q = new URLSearchParams({
    appid: appId, lat: String(roundCoord(lat)), lon: String(roundCoord(lon)), dist: String(radiusM / 1000),
    sort: 'dist', results: '100', output: 'json', callback,
  });
  return `${YOLP_URL}?${q.toString()}`;
}

interface YolpFeature { Id?: string; Gid?: string; Name?: string; Geometry?: { Coordinates?: string } }

export function parseYolp(json: unknown): Place[] {
  const j = json as { Feature?: YolpFeature[]; ResultInfo?: { Count?: number }; Error?: unknown };
  if (j && (j as { Error?: unknown }).Error) throw new Error('yolp: エラー応答');
  if (!j || (!Array.isArray(j.Feature) && !j.ResultInfo)) throw new Error('yolp: 形式が不正');
  const out: Place[] = [];
  (j.Feature ?? []).forEach((f, i) => {
    const [lonS, latS] = (f.Geometry?.Coordinates ?? '').split(',');
    const lat = Number(latS), lon = Number(lonS);
    if (!f.Name || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    out.push({ id: `yolp:${f.Gid ?? f.Id ?? i}`, name: f.Name, lat, lon });
  });
  return out;
}

// ---------- 異常の分類 ----------
export type NearbyErrorKind = 'offline' | 'denied' | 'position' | 'appid' | 'server';
export class NearbyError extends Error {
  constructor(public kind: NearbyErrorKind, message: string = kind) { super(message); }
}

export const ERROR_TEXT: Record<NearbyErrorKind, string> = {
  offline: '近くのお店はネット接続が必要です。',
  denied: '位置情報の利用が許可されていません。端末の設定で、ブラウザ（またはホーム画面のアプリ）に位置情報を許可してください。',
  position: '現在地を取得できませんでした。',
  appid: 'Yahoo!ローカルサーチのアプリIDを設定してください。',
  server: '近くのお店を取得できませんでした。時間をおいて再試行してください。',
};

export const PROVIDER_NAME: Record<NearbyProvider, string> = { osm: 'OpenStreetMap', yolp: 'Yahoo! JAPAN' };
