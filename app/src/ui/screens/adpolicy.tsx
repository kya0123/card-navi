import { h } from '../h';
import type { Ctx } from '../app';

/** S09 広告の方針（収益化設計書 7章） */
export function AdPolicyScreen(ctx: Ctx): Node {
  return (
    <section>
      <header class="screen-head">
        <button type="button" class="back" onClick={() => ctx.go('settings')}>‹ 設定</button>
        <h1>広告の方針</h1>
      </header>
      <div class="panel">
        <ul class="policy">
          <li>本アプリは、カード会社の申込みページへのリンク（アフィリエイト広告）で運営する場合があります。広告のリンクには「PR」と表示します。</li>
          <li>おすすめ・見直し結果の順位は計算結果だけで決まり、広告の有無や報酬額には影響されません。</li>
          <li>持っているカードや最近使ったお店などの情報は、この端末の中だけに保存し、外部には送りません。</li>
        </ul>
        <p class="note">カードの提案（おすすめ画面のヒント・バナー）は、設定画面でオフにできます。</p>
      </div>
    </section>
  );
}
