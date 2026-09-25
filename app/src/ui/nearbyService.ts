import {
  buildOverpassQuery, buildYolpUrl, canReuse, NearbyError, OVERPASS_URL, parseOverpass, parseYolp,
  type NearbyCache, type NearbyProvider, type Place,
} from '../domain/nearby';

/** 近くのお店の通信層（詳細設計 27.4）。位置情報の取得と検索先への問い合わせ */

const TIMEOUT_MS = 10_000;
let cache: NearbyCache | null = null;
/** 問い合わせた回数（E2Eで再利用の確認に使う） */
export let requestCount = 0;

export function clearNearbyCache(): void { cache = null; }

export interface Position { lat: number; lon: number; accuracyM: number }

export function getPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new NearbyError('position', 'geolocation なし'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy }),
      (e) => reject(new NearbyError(e.code === 1 ? 'denied' : 'position', e.message)),
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
}

async function fetchOverpass(lat: number, lon: number, radiusM: number): Promise<Place[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(buildOverpassQuery(lat, lon, radiusM))}`,
      signal: ctl.signal,
    });
    if (!res.ok) throw new NearbyError('server', `HTTP ${res.status}`);
    return parseOverpass(await res.json());
  } catch (e) {
    throw e instanceof NearbyError ? e : new NearbyError('server', String(e));
  } finally {
    clearTimeout(timer);
  }
}

let jsonpSeq = 0;

/** YOLP は JSONP で呼ぶ（詳細設計 27.4）。認証エラーは JSONP では区別できないため、Error 応答を appid とみなす */
function fetchYolp(appId: string, lat: number, lon: number, radiusM: number): Promise<Place[]> {
  return new Promise((resolve, reject) => {
    const name = `__yolpCb${Date.now()}_${jsonpSeq++}`;
    const w = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    const done = () => { clearTimeout(timer); delete w[name]; script.remove(); };
    const timer = setTimeout(() => { done(); reject(new NearbyError('server', 'timeout')); }, TIMEOUT_MS);
    w[name] = (json: unknown) => {
      done();
      if (json && typeof json === 'object' && 'Error' in (json as object)) { reject(new NearbyError('appid', 'yolp error')); return; }
      try { resolve(parseYolp(json)); } catch (e) { reject(new NearbyError('server', String(e))); }
    };
    script.onerror = () => { done(); reject(new NearbyError('server', 'script error')); };
    script.src = buildYolpUrl(appId, lat, lon, radiusM, name);
    document.head.appendChild(script);
  });
}

/** 検索先に問い合わせる。条件を満たせば前回の結果を使う */
export async function findPlaces(
  provider: NearbyProvider, radiusM: number, pos: Position, yolpAppId: string | null, nowMs = Date.now(),
): Promise<Place[]> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new NearbyError('offline');
  if (canReuse(cache, provider, radiusM, pos.lat, pos.lon, nowMs)) return cache!.places;
  if (provider === 'yolp' && !yolpAppId) throw new NearbyError('appid');
  requestCount++;
  const places = provider === 'osm'
    ? await fetchOverpass(pos.lat, pos.lon, radiusM)
    : await fetchYolp(yolpAppId!, pos.lat, pos.lon, radiusM);
  cache = { provider, radiusM, lat: pos.lat, lon: pos.lon, atMs: nowMs, places };
  return places;
}
