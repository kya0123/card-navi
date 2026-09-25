import { h } from '../h';
import type { Ctx } from '../app';
import { makeBackup, parseBackup } from '../../domain/settings';
import { rolloverGoals } from '../../domain/bonus';
import { backupFileName, downloadJson } from '../../storage/settingsRepo';
import { newPromoState } from '../../domain/promo';
import { THEMES, themeOf } from '../../domain/theme';
import { NearbySettingsPanel } from './nearbySettings';
import { yolpAppId } from './nearby';
import { clearNearbyCache } from '../nearbyService';

declare const __APP_VERSION__: string;
declare const __ENABLE_DOWNLOAD__: boolean;
const canDownload = typeof __ENABLE_DOWNLOAD__ === 'undefined' || __ENABLE_DOWNLOAD__;

let showJson = false;

export function SettingsScreen(ctx: Ctx): Node {
  const { mi, state } = ctx;
  const s = state.settings;
  const persistText = !state.storagePersistent
    ? 'この環境では保存できません'
    : state.persistGranted === true ? '端末に保存（消えにくい設定）'
      : state.persistGranted === false ? '端末に保存（容量不足時に消える可能性あり）' : '端末に保存';

  const importText = async (text: string) => {
    const r = parseBackup(mi, text);
    if (!r.ok) { ctx.toast(`読み込めませんでした：${r.error}`); return; }
    const roll = rolloverGoals(mi, r.settings.bonusGoals, r.settings.ownedCards, ctx.today);
    await ctx.update((x) => { Object.assign(x, r.settings, { bonusGoals: roll.goals }); }, { render: false });
    ctx.toast(`設定を読み込みました${r.dropped ? `（使えない設定${r.dropped}件は読み飛ばしました）` : ''}`);
  };

  const onFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await importText(await file.text());
  };

  const markExported = () => ctx.update((x) => { x.lastExportAt = ctx.today; }, { render: false });
  const backupJson = () => JSON.stringify(makeBackup({ ...state.settings, lastExportAt: ctx.today }, ctx.today), null, 2);
  const resetArmed = state.armed === 'reset';

  return (
    <section>
      <header class="screen-head"><h1>設定</h1></header>
      <div class="panel">
        <fieldset class="themes">
          <legend><h2>配色</h2></legend>
          {THEMES.map((t) => (
            <label class="theme-opt">
              <input type="radio" name="theme" id={`theme-${t.id}`} value={t.id} checked={themeOf(s.theme).id === t.id}
                onChange={() => { void ctx.update((x) => { x.theme = t.id; }); }} />
              <span class="swatch" aria-hidden="true"><span style={`background:${t.key}`} /><span style={`background:${t.sub}`} /></span>
              <span class="theme-text">
                <span class="theme-name">{t.name}{t.id === 'navy' ? '（標準）' : ''}</span>
                {t.note && <span class="muted theme-note">{t.note}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      </div>
      <div class="panel">
        <h2>バックアップ</h2>
        <p class="sub">設定はこの端末のブラウザ内だけに保存されます。機種変更や削除に備えて書き出しておけます。</p>
        <p class="muted">最終バックアップ：{s.lastExportAt ?? 'まだありません'}</p>
        <div class="row">
          {canDownload && <button class="btn" id="export" onClick={async () => {
            const json = backupJson();
            await markExported();
            downloadJson(backupFileName(ctx.today), JSON.parse(json));
            ctx.render();
          }}>ファイルに書き出す</button>}
          <button class="btn btn-ghost" id="copy" onClick={async () => {
            const json = backupJson();
            try {
              await navigator.clipboard.writeText(json);
              await markExported();
              ctx.toast('バックアップをコピーしました。メモアプリなどに貼り付けて保管してください');
            } catch {
              showJson = true;
              ctx.render();
            }
          }}>コピーする</button>
          <button class="btn btn-ghost" id="show-json" onClick={() => { showJson = !showJson; ctx.render(); }}>
            {showJson ? '閉じる' : '内容を表示'}
          </button>
        </div>
        {showJson && (
          <textarea id="backup-text" class="code" readonly rows="8" onFocus={(e: Event) => (e.target as HTMLTextAreaElement).select()}>
            {backupJson()}
          </textarea>
        )}
        <h3>読み込む</h3>
        <div class="row">
          <label class="btn btn-ghost" for="import">
            ファイルを選ぶ
          </label>
          <input id="import" type="file" accept="application/json,.json" class="visually-hidden" onChange={onFile} />
        </div>
        <label class="field">
          <span>またはバックアップの内容を貼り付け</span>
          <textarea id="paste" class="code" rows="3" placeholder='{"app":"card-advisor", …}' />
        </label>
        <button class="btn btn-ghost btn-small" id="paste-import" onClick={() => {
          const t = (document.getElementById('paste') as HTMLTextAreaElement | null)?.value ?? '';
          if (t.trim()) void importText(t);
        }}>貼り付けた内容を読み込む</button>
      </div>
      <div class="panel">
        <h2>カードの提案</h2>
        <label class="check">
          <input id="suggest-toggle" type="checkbox" checked={s.showCardSuggestions !== false}
            onChange={(e: Event) => {
              const on = (e.target as HTMLInputElement).checked;
              void ctx.update((x) => { x.showCardSuggestions = on; });
            }} />
          <span>持っていないカードの提案を表示する（おすすめ画面のヒント・バナー）</span>
        </label>
        <p class="note">「見直す」タブはオフにしてもいつでも開けます。</p>
        <button type="button" class="link-btn" id="settings-adpolicy" onClick={() => ctx.go('adpolicy')}>広告の方針</button>
      </div>
      {NearbySettingsPanel(ctx)}
      <div class="panel">
        <h2>還元情報の警告</h2>
        <label class="field">
          <span>確認日からこの日数を過ぎたら警告する（30〜365日）</span>
          <input id="stale" type="number" min="30" max="365" step="1" value={s.staleWarnDays}
            onChange={(e: Event) => {
              const v = Math.round(Number((e.target as HTMLInputElement).value));
              if (!Number.isFinite(v) || v < 30 || v > 365) { ctx.toast('30〜365の範囲で入力してください'); return; }
              void ctx.update((x) => { x.staleWarnDays = v; });
            }} />
        </label>
      </div>
      <div class="panel">
        <h2>このアプリについて</h2>
        <dl class="stats">
          <div><dt>アプリ版</dt><dd>{typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'}</dd></div>
          <div><dt>還元ルール版</dt><dd>{mi.raw.masterVersion}</dd></div>
          <div><dt>保存先</dt><dd>{persistText}</dd></div>
        </dl>
        <p class="note">カード番号や利用明細は保存しません。近くのお店を探すとき以外、入力内容が外部に送信されることはありません。</p>
        <p class="note">画面デザインは「デジタル庁デザインシステム」（MIT License / CC BY 4.0）のトークンと部品仕様を参考に編集したものです。本アプリはデジタル庁とは関係ありません。</p>
        <button id="reset" class={`btn btn-small ${resetArmed ? 'btn-danger' : 'btn-ghost danger'}`} onClick={async () => {
          if (!resetArmed) { ctx.setState({ armed: 'reset' }); return; }
          state.armed = null;
          const def = await ctx.repo.resetAll();
          yolpAppId.value = null; yolpAppId.loaded = false;
          clearNearbyCache();
          state.recent = [];
          state.selection = null;
          state.promo = newPromoState(ctx.today, mi.raw.masterVersion);
          ctx.savePromo();
          await ctx.update((x) => { Object.assign(x, def); delete x.lastExportAt; }, { render: false });
          ctx.toast('初期状態に戻しました');
        }}>{resetArmed ? 'もう一度押すとすべての設定を消します' : '設定を初期化'}</button>
      </div>
    </section>
  );
}
