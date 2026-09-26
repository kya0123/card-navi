import { h } from '../h';
import type { Ctx } from '../app';
import type { MasterIndex } from '../../domain/master';
import {
  buildNearbyIndex, ERROR_TEXT, LOW_ACCURACY_M, NearbyError, nextRadius, PROVIDER_NAME, providerOf, radiusOf,
  toNearbyItems, type NearbyErrorKind, type NearbyIndex, type NearbyItem, type NearbyProvider,
} from '../../domain/nearby';
import { findPlaces, getPosition, type Position } from '../nearbyService';

/** S10 近くのお店（詳細設計 27.6） */

type Phase = 'start' | 'consent' | 'locating' | 'searching' | 'done' | 'error';
interface Session {
  phase: Phase;
  radiusM: number;
  provider: NearbyProvider;
  pos?: Position;
  items?: NearbyItem[];
  error?: NearbyErrorKind;
}

let session: Session | null = null;
let index: NearbyIndex | null = null;
let indexFor: MasterIndex | null = null;

export const YOLP_APPID_KEY = 'yolpAppId';
/** YOLP のアプリID（meta ストア）。設定画面と共有する */
export const yolpAppId = { value: null as string | null, loaded: false };

export async function loadYolpAppId(ctx: Ctx): Promise<string | null> {
  if (!yolpAppId.loaded) {
    yolpAppId.value = (await ctx.repo.getMeta<string>(YOLP_APPID_KEY)) ?? null;
    yolpAppId.loaded = true;
  }
  return yolpAppId.value;
}

/** ホームのボタンから開く。毎回新しく探す（前回の結果の再利用は通信層で判定） */
export function openNearby(ctx: Ctx): void {
  const s = ctx.state.settings;
  session = { phase: 'start', radiusM: radiusOf(s), provider: providerOf(s) };
  ctx.go('nearby');
}

async function search(ctx: Ctx): Promise<void> {
  const s = session!;
  try {
    const appId = s.provider === 'yolp' ? await loadYolpAppId(ctx) : null;
    if (s.provider === 'yolp' && !appId) throw new NearbyError('appid');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new NearbyError('offline');
    s.phase = 'locating'; ctx.render();
    s.pos = await getPosition();
    s.phase = 'searching'; ctx.render();
    const places = await findPlaces(s.provider, s.radiusM, s.pos, appId);
    if (!index || indexFor !== ctx.mi) { index = buildNearbyIndex(ctx.mi); indexFor = ctx.mi; }
    s.items = toNearbyItems(ctx.mi, index, places, s.pos, s.radiusM);
    s.phase = 'done';
  } catch (e) {
    s.error = e instanceof NearbyError ? e.kind : 'server';
    s.phase = 'error';
  }
  if (session === s && ctx.state.route === 'nearby') ctx.render();
}

function start(ctx: Ctx): void {
  const s = session!;
  const consented = !!ctx.state.settings.nearbyConsent?.[s.provider];
  if (!consented) { s.phase = 'consent'; return; }
  s.phase = 'locating';
  void search(ctx);
}

function Attribution(provider: NearbyProvider): Node {
  return provider === 'osm'
    ? <p class="note nearby-credit" id="nearby-credit">地図データ：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>（ODbL）</p>
    : <p class="note nearby-credit" id="nearby-credit"><a href="https://developer.yahoo.co.jp/sitemap/" target="_blank" rel="noopener noreferrer">Web Services by Yahoo! JAPAN</a></p>;
}

function OtherWays(ctx: Ctx): Node {
  return (
    <div class="nearby-other">
      <p class="muted">一覧にないお店は</p>
      <div class="btn-row">
        <button class="btn btn-ghost btn-small" id="nearby-by-name" onClick={() => { session = null; ctx.go('home'); document.getElementById('q')?.focus(); }}>名前で探す</button>
        <button class="btn btn-ghost btn-small" id="nearby-by-category" onClick={() => { session = null; ctx.go('category'); }}>カテゴリから選ぶ</button>
      </div>
    </div>
  );
}

export function NearbyScreen(ctx: Ctx): Node {
  const { state } = ctx;
  if (!session) session = { phase: 'start', radiusM: radiusOf(state.settings), provider: providerOf(state.settings) };
  const s = session;
  if (s.phase === 'start') start(ctx);

  const retry = () => { s.phase = 'start'; s.error = undefined; ctx.render(); };
  let body: Node;

  if (s.phase === 'consent') {
    body = (
      <div class="panel" id="nearby-consent-panel">
        <p>現在地を{PROVIDER_NAME[s.provider]}のサーバに送って、近くのお店を探します。送る位置は約10m単位に丸めます。アプリは位置を保存しません。</p>
        <div class="btn-row">
          <button class="btn" id="nearby-consent" onClick={() => {
            const p = s.provider;
            void ctx.update((x) => { x.nearbyConsent = { ...x.nearbyConsent, [p]: ctx.today }; }, { render: false })
              .then(() => { s.phase = 'start'; ctx.render(); });
          }}>同意して探す</button>
          <button class="btn btn-ghost" id="nearby-cancel" onClick={() => { session = null; ctx.go('home'); }}>やめる</button>
        </div>
      </div>
    );
  } else if (s.phase === 'locating' || s.phase === 'searching' || s.phase === 'start') {
    body = <p class="nearby-status" role="status" id="nearby-status">{s.phase === 'searching' ? '近くのお店を探しています…' : '現在地を確認しています…'}</p>;
  } else if (s.phase === 'error') {
    const kind = s.error ?? 'server';
    body = (
      <div class="panel nearby-error" role="alert" id="nearby-error" data-kind={kind}>
        <p>{ERROR_TEXT[kind]}</p>
        <div class="btn-row">
          {kind === 'appid'
            ? <button class="btn btn-small" id="nearby-to-settings" onClick={() => { session = null; ctx.go('settings'); }}>設定へ</button>
            : <button class="btn btn-small" id="nearby-retry" onClick={retry}>再試行</button>}
        </div>
      </div>
    );
  } else {
    const items = s.items ?? [];
    const wider = nextRadius(s.radiusM);
    body = (
      <div>
        <p class="sub" id="nearby-summary">半径{s.radiusM}m・{items.length}件</p>
        {s.pos && s.pos.accuracyM > LOW_ACCURACY_M && (
          <p class="note" id="nearby-accuracy">位置の精度が低いため（約{Math.round(s.pos.accuracyM)}m）、近くのお店が正しく出ないことがあります。</p>
        )}
        {items.length === 0 ? (
          <div class="panel" id="nearby-empty">
            <p>半径{s.radiusM}mに、登録しているお店が見つかりませんでした。</p>
            {wider && <button class="btn btn-small" id="nearby-wider" onClick={() => { s.radiusM = wider; retry(); }}>半径を広げる（{wider}m）</button>}
          </div>
        ) : (
          <ul class="suggest-list store-list nearby-list" aria-label="近くのお店">
            {/* ポイント率のタグは出さない。お店を選んでもらい履歴を貯める（詳細設計 31.2.2） */}
            {items.map((it) => {
              return (
                <li>
                  <button class="suggest-item nearby-item" data-store={it.storeId} onClick={() => { session = null; void ctx.selectStore(it.storeId); }}>
                    <span>{it.label}{ctx.mi.stores.get(it.storeId)?.cashOnly && <em class="cash-only-tag">現金のみ</em>}</span>
                    <small class="nearby-dist">約{it.distanceM}m</small>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {items.length > 0 && wider && (
          <button class="link-btn" id="nearby-wider-more" onClick={() => { s.radiusM = wider; retry(); }}>半径を広げる（{wider}m）</button>
        )}
      </div>
    );
  }

  return (
    <section>
      <header class="screen-head">
        <button type="button" class="back" onClick={() => { session = null; ctx.go('home'); }}>‹ 戻る</button>
        <h1>近くのお店</h1>
      </header>
      {body}
      {s.phase !== 'consent' && OtherWays(ctx)}
      {(s.phase === 'done' || s.phase === 'error') && (
        <button class="link-btn" id="nearby-research" onClick={retry}>もう一度探す</button>
      )}
      {Attribution(s.provider)}
    </section>
  );
}
