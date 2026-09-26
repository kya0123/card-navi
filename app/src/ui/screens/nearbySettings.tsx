import { h } from '../h';
import { foldProps } from '../fold';
import type { Ctx } from '../app';
import { NEARBY_RADII, nearbyOn, PROVIDER_NAME, providerOf, radiusOf, type NearbyProvider } from '../../domain/nearby';
import { clearNearbyCache } from '../nearbyService';
import { loadYolpAppId, YOLP_APPID_KEY, yolpAppId } from './nearby';

/** S06 設定の「近くのお店」パネル（詳細設計 27.6） */
export function NearbySettingsPanel(ctx: Ctx): Node {
  const s = ctx.state.settings;
  if (!yolpAppId.loaded) void loadYolpAppId(ctx).then(() => ctx.render());
  const provider = providerOf(s);
  const hasAppId = !!yolpAppId.value;
  const consented = !!(s.nearbyConsent?.osm || s.nearbyConsent?.yolp);

  const setProvider = (p: NearbyProvider) => { clearNearbyCache(); void ctx.update((x) => { x.nearbyProvider = p; }); };
  const saveAppId = async (v: string | null) => {
    if (v) await ctx.repo.setMeta(YOLP_APPID_KEY, v);
    else await ctx.repo.setMeta(YOLP_APPID_KEY, null);
    yolpAppId.value = v; yolpAppId.loaded = true;
    clearNearbyCache();
    if (!v && provider === 'yolp') await ctx.update((x) => { x.nearbyProvider = 'osm'; }, { render: false });
    ctx.toast(v ? 'アプリIDを保存しました' : 'アプリIDを削除しました');
  };

  return (
    <div class="panel" id="nearby-settings">
      <h2>近くのお店</h2>
      <label class="check">
        <input id="nearby-enabled" type="checkbox" checked={nearbyOn(s)}
          onChange={(e: Event) => { const on = (e.target as HTMLInputElement).checked; void ctx.update((x) => { x.nearbyEnabled = on; }); }} />
        <span>おすすめ画面に「近く」ボタンを表示する</span>
      </label>
      {/* 検索先・アプリID・半径は詳細設定（将来は管理者だけが設定する。詳細設計 31.1 U11） */}
      <details class="fold" id="nearby-advanced" {...foldProps('nearby-advanced')}>
        <summary>詳細設定</summary>
      <fieldset class="field">
        <legend>検索先</legend>
        <label class="check">
          <input type="radio" name="nearby-provider" id="nearby-provider-osm" checked={provider === 'osm'} onChange={() => setProvider('osm')} />
          <span>OpenStreetMap（準備不要）</span>
        </label>
        <label class="check">
          <input type="radio" name="nearby-provider" id="nearby-provider-yolp" checked={provider === 'yolp'} disabled={!hasAppId}
            onChange={() => setProvider('yolp')} />
          <span>Yahoo!ローカルサーチ{hasAppId ? '' : '（アプリIDを入力すると選べます）'}</span>
        </label>
      </fieldset>
      <label class="field">
        <span>検索する半径</span>
        <select id="nearby-radius" onChange={(e: Event) => {
          const v = Number((e.target as HTMLSelectElement).value) as (typeof NEARBY_RADII)[number];
          clearNearbyCache();
          void ctx.update((x) => { x.nearbyRadiusM = v; });
        }}>
          {NEARBY_RADII.map((r) => <option value={String(r)} selected={radiusOf(s) === r}>{r}m</option>)}
        </select>
      </label>
      <label class="field">
        <span>Yahoo!ローカルサーチのアプリID（Client ID）</span>
        <input id="yolp-appid" type="text" autocomplete="off" spellcheck={false} value={yolpAppId.value ?? ''} placeholder="Yahoo!デベロッパーネットワークで取得" />
      </label>
      <div class="btn-row">
        <button class="btn btn-small" id="yolp-appid-save" onClick={() => {
          const v = (document.getElementById('yolp-appid') as HTMLInputElement | null)?.value.trim() ?? '';
          if (!v) { ctx.toast('アプリIDを入力してください'); return; }
          void saveAppId(v);
        }}>保存</button>
        {hasAppId && <button class="btn btn-small btn-ghost" id="yolp-appid-delete" onClick={() => void saveAppId(null)}>削除</button>}
      </div>
      <p class="note">アプリIDは端末内にだけ保存し、バックアップには含めません。</p>
      </details>
      {consented && (
        <button type="button" class="link-btn" id="nearby-revoke" onClick={() => {
          void ctx.update((x) => { delete x.nearbyConsent; });
          ctx.toast('位置情報の送信への同意を取り消しました');
        }}>位置情報の送信への同意を取り消す</button>
      )}
      <p class="note">近くのお店を探すときだけ、約10m単位に丸めた現在地を{PROVIDER_NAME[provider]}のサーバに送ります。位置は保存しません。</p>
      <p class="note">地図データ：© OpenStreetMap contributors（ODbL）／ Web Services by Yahoo! JAPAN</p>
    </div>
  );
}
