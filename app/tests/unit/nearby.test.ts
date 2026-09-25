import { test } from 'node:test';
import assert from 'node:assert/strict';
import rules from '../../src/data/rules.json' with { type: 'json' };
import { indexMaster } from '../../src/domain/master';
import {
  buildNearbyIndex, buildOverpassQuery, buildYolpUrl, canReuse, distanceM, matchPlace, nextRadius, parseOverpass,
  parseYolp, roundCoord, sanitizeNearby, toNearbyItems, type NearbyCache, type Place,
} from '../../src/domain/nearby';
import type { Master, UserSettings } from '../../src/domain/types';

const mi = indexMaster(rules as unknown as Master);
const idx = buildNearbyIndex(mi);
const O = { lat: 35.3383, lon: 139.4476 };   // 辻堂駅付近
const P = (name: string, extra: Partial<Place> = {}): Place => ({ id: `t:${name}`, name, lat: O.lat, lon: O.lon, ...extra });

test('N01: 距離（同じ点は0m、緯度0.001度≒111m）', () => {
  assert.equal(distanceM(O, O), 0);
  assert.equal(distanceM(O, { lat: O.lat + 0.001, lon: O.lon }), 111);
});

test('N02: 座標は小数点以下4桁に丸める', () => {
  assert.equal(roundCoord(35.338349), 35.3383);
  assert.equal(roundCoord(139.44765), 139.4477);
});

test('N03: ブランド識別子・ブランド名・名前の完全一致', () => {
  assert.equal(matchPlace(idx, P('7-Eleven', { brandWikidata: 'Q259340' })), 'seven');
  assert.equal(matchPlace(idx, P('どこかの店', { brand: 'ファミリーマート' })), 'familymart');
  assert.equal(matchPlace(idx, P('スターバックス')), 'starbucks');
  assert.equal(matchPlace(idx, P('ファミマ')), 'familymart');
});

test('N04: 支店名が続く名前は紐付き、別のお店は紐付かない', () => {
  assert.equal(matchPlace(idx, P('セブン-イレブン 辻堂駅前店')), 'seven');
  assert.equal(matchPlace(idx, P('マクドナルド辻堂店')), 'mcdonalds');
  assert.equal(matchPlace(idx, P('サンクス辻堂店')), null);
  assert.equal(matchPlace(idx, P('マックハウス')), null);
  assert.equal(matchPlace(idx, P('イオンモール藤沢')), null);
  assert.equal(matchPlace(idx, P('イオン藤沢店')), 'aeon');
});

test('N05: 長いキーを優先（ローソンストア100）', () => {
  assert.equal(matchPlace(idx, P('ローソンストア100 藤沢店')), 'lawson100');
  assert.equal(matchPlace(idx, P('ローソンストア100藤沢店')), 'lawson100');
  assert.equal(matchPlace(idx, P('ローソン辻堂駅前店')), 'lawson');
});

test('N06: EC・交通・自販機・ネット注文のみの店舗は対象外', () => {
  assert.equal(matchPlace(idx, P('Amazon')), null);
  assert.equal(matchPlace(idx, P('JR東日本（電車）')), null);
  assert.equal(matchPlace(idx, P('ピザハット')), null);
});

test('N07: 距離順・半径外を除く・同じIDは1件・上限・表示名', () => {
  const near = { lat: O.lat + 0.0005, lon: O.lon };           // 約56m
  const far = { lat: O.lat + 0.004, lon: O.lon };             // 約445m
  const places: Place[] = [
    { id: 'a', name: 'セブン-イレブン 辻堂駅前店', ...far },
    { id: 'b', name: 'スターバックス', branch: 'テラスモール湘南店', ...near },
    { id: 'b', name: 'スターバックス', ...near },
    { id: 'c', name: '個人の喫茶店', ...near },
    { id: 'd', name: 'ファミリーマート', ...O },
  ];
  const items = toNearbyItems(mi, idx, places, O, 300);
  assert.deepEqual(items.map((i) => [i.storeId, i.distanceM, i.label]),
    [['familymart', 0, 'ファミリーマート'], ['starbucks', 56, 'スターバックス テラスモール湘南店']]);
  assert.equal(toNearbyItems(mi, idx, places, O, 500).at(-1)?.label, 'セブン-イレブン 辻堂駅前店');
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, name: 'ファミリーマート', ...O }));
  assert.equal(toNearbyItems(mi, idx, many, O, 300).length, 20);
  assert.equal(nextRadius(300), 500);
  assert.equal(nextRadius(1000), null);
});

test('N08: 5分以内かつ50m以内なら前回の結果を使う', () => {
  const c: NearbyCache = { provider: 'osm', radiusM: 300, lat: O.lat, lon: O.lon, atMs: 1_000_000, places: [] };
  assert.equal(canReuse(c, 'osm', 300, O.lat + 0.0004, O.lon, 1_000_000 + 299_000), true);
  assert.equal(canReuse(c, 'osm', 300, O.lat + 0.0005, O.lon, 1_000_000 + 1000), false);     // 56m
  assert.equal(canReuse(c, 'osm', 300, O.lat, O.lon, 1_000_000 + 301_000), false);           // 5分超
  assert.equal(canReuse(c, 'yolp', 300, O.lat, O.lon, 1_000_000), false);
  assert.equal(canReuse(c, 'osm', 500, O.lat, O.lon, 1_000_000), false);
  assert.equal(canReuse(null, 'osm', 300, O.lat, O.lon, 0), false);
});

test('N09: Overpass のクエリと応答の変換', () => {
  const q = buildOverpassQuery(35.338349, 139.447651, 300);
  assert.match(q, /nwr\(around:300,35\.3383,139\.4477\)\[shop\]/);
  assert.match(q, /out center tags 200;/);
  const places = parseOverpass({ elements: [
    { type: 'node', id: 1, lat: 35.1, lon: 139.1, tags: { name: '7-Eleven', 'name:ja': 'セブン-イレブン 辻堂店', brand: '7-Eleven', 'brand:ja': 'セブン-イレブン', 'brand:wikidata': 'Q259340' } },
    { type: 'way', id: 2, center: { lat: 35.2, lon: 139.2 }, tags: { name: 'スターバックス', branch: '辻堂店' } },
    { type: 'node', id: 3, lat: 35.3, lon: 139.3, tags: { shop: 'yes' } },
  ] });
  assert.deepEqual(places, [
    { id: 'osm:node/1', name: 'セブン-イレブン 辻堂店', brand: 'セブン-イレブン', brandWikidata: 'Q259340', lat: 35.1, lon: 139.1 },
    { id: 'osm:way/2', name: 'スターバックス', branch: '辻堂店', lat: 35.2, lon: 139.2 },
  ]);
  assert.throws(() => parseOverpass({ remark: 'runtime error' }));
});

test('N10: YOLP のURLと応答の変換（座標は「経度,緯度」）', () => {
  const u = new URL(buildYolpUrl('APPID', 35.338349, 139.447651, 300, 'cb1'));
  assert.equal(u.searchParams.get('dist'), '0.3');
  assert.equal(u.searchParams.get('lat'), '35.3383');
  assert.equal(u.searchParams.get('sort'), 'dist');
  assert.equal(u.searchParams.get('callback'), 'cb1');
  const places = parseYolp({ ResultInfo: { Count: 1 }, Feature: [{ Gid: 'g1', Name: 'ローソン 辻堂駅前店', Geometry: { Coordinates: '139.45,35.34' } }] });
  assert.deepEqual(places, [{ id: 'yolp:g1', name: 'ローソン 辻堂駅前店', lat: 35.34, lon: 139.45 }]);
  assert.deepEqual(parseYolp({ ResultInfo: { Count: 0 } }), []);
  assert.throws(() => parseYolp({ Error: { Message: 'invalid appid' } }));
});

test('N11: 設定の検査で想定外の値を取り除く', () => {
  const s = { nearbyEnabled: false, nearbyProvider: 'google', nearbyRadiusM: 250, nearbyConsent: { osm: '2026-09-25', yolp: 'x' } } as unknown as UserSettings;
  assert.deepEqual(sanitizeNearby(s), { nearbyEnabled: false, nearbyConsent: { osm: '2026-09-25' } });
  assert.deepEqual(sanitizeNearby({ nearbyProvider: 'yolp', nearbyRadiusM: 1000 } as UserSettings), { nearbyProvider: 'yolp', nearbyRadiusM: 1000 });
});
