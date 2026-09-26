import { h } from '../h';
import { foldProps } from '../fold';
import { compareCards, masterCards } from '../../domain/catalog';
import type { Card } from '../../domain/types';
import type { Ctx } from '../app';
import { daysBetween } from '../../domain/date';
import type { RateRule, Route } from '../../domain/types';
import { methodShort, pct, pointName } from '../format';

function groupByCondition(rules: RateRule[]): [string, RateRule[]][] {
  const m = new Map<string, RateRule[]>();
  for (const r of rules) m.set(r.conditions, [...(m.get(r.conditions) ?? []), r]);
  return [...m.entries()];
}

const CONF: Record<string, string> = { high: '公式', medium: '二次情報', low: '推定' };

/** 支払い方法ごとの行（ポイント率の一覧 S05 とカードのポイント率 S11 で共通） */
export function routeRows(ctx: Ctx) {
  const { mi, state } = ctx;
  const stale = (d: string) => daysBetween(d, ctx.today) > state.settings.staleWarnDays;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const Src = (url: string) => offline
    ? <span class="src disabled">出典（オフライン）</span>
    : <a class="src" href={url} target="_blank" rel="noopener noreferrer">出典</a>;

  const RouteRow = (r: Route) => {
    const rules = mi.rulesByRoute.get(r.id) ?? [];
    return (
      <li class={`info-route${r.needsReview || r.confidence === 'low' ? ' review' : ''}`}>
        <div class="info-line">
          <strong>{methodShort(r.methodId)}</strong>
          <span>{pct(r.baseRate)}</span>
          <span class="muted">{r.unitScope === 'monthlyTotal' ? '月間合計' : '1回ごと'}{r.unitYen}円単位・{pointName(mi, r.pointId)}</span>
        </div>
        <div class="info-meta">
          <span class={`conf conf-${r.confidence}`}>{CONF[r.confidence]}</span>
          {r.needsReview && <span class="conf conf-low">要確認</span>}
          {r.countsTowardBonus && <span class="conf">年間ボーナス集計対象</span>}
          <span class={stale(r.checkedAt) ? 'stale' : 'muted'}>確認 {r.checkedAt}</span>
          {Src(r.sourceUrl)}
        </div>
        {r.note && <p class="note">{r.note}</p>}
        {rules.length > 0 && (
          <details>
            <summary>特約 {rules.length}店舗（{pct(Math.max(...rules.map((x) => x.rate)))}）</summary>
            {groupByCondition(rules).map(([cond, list]) => (
              <div class="rule-group">
                <p class="stores">{list.map((x) => x.target.storeId ? mi.stores.get(x.target.storeId)?.name : mi.categories.get(x.target.categoryId!)?.name).join('、')}</p>
                <p class="note">{pct(list[0].rate)}：{cond}</p>
              </div>
            ))}
            <div class="info-meta">
              <span class={stale(rules[0].checkedAt) ? 'stale' : 'muted'}>確認 {rules[0].checkedAt}</span>
              {Src(rules[0].sourceUrl)}
            </div>
          </details>
        )}
      </li>
    );
  };
  return RouteRow;
}

export function InfoScreen(ctx: Ctx): Node {
  const { mi } = ctx;
  const RouteRow = routeRows(ctx);

  return (
    <section>
      <header class="screen-head">
        <button type="button" class="back" id="info-back" onClick={() => ctx.go('settings')}>‹ 設定</button>
        <h1>ポイント率の一覧</h1>
      </header>
      <p class="sub">版 {mi.raw.masterVersion}・確認日 {mi.raw.checkedAt}。キャンペーンと月間上限は含みません。</p>
      {(() => {
        // 保有カードを先に、保有していないカードは折りたたみに（詳細設計 20.6・24.3）
        const owned = new Set(ctx.state.settings.ownedCards.map((c) => c.cardId));
        const CardPanel = (c: Card) => {
          const bonus = mi.bonusByCard.get(c.id);
          // カードごとに折りたたむ（詳細設計 31.1 U10）
          return (
            <details class="panel info-card" id={`info-${c.id}`} {...foldProps(`info-${c.id}`)}>
              <summary><h2>{c.name}</h2></summary>
              <p class="muted">年会費 {c.annualFee.toLocaleString()}円{c.annualFeeNote ? `（${c.annualFeeNote}）` : ''}・{pointName(mi, c.pointId)}</p>
              <ul class="info-list">{mi.raw.routes.filter((r) => r.cardId === c.id).map(RouteRow)}</ul>
              {bonus && <p class="note">★ {bonus.description}（{bonus.periodNote}）</p>}
            </details>
          );
        };
        const sorted = masterCards(mi).sort(compareCards(mi));
        const others = sorted.filter((c) => !owned.has(c.id));
        return [
          ...sorted.filter((c) => owned.has(c.id)).map(CardPanel),
          others.length > 0 && (
            <details class="panel" id="info-others">
              <summary>持っていないカード（{others.length}枚）</summary>
              {others.map(CardPanel)}
            </details>
          ),
        ];
      })()}
      <div class="panel">
        <h2>カード以外</h2>
        <ul class="info-list">{mi.raw.routes.filter((r) => r.cardId === null).map(RouteRow)}</ul>
      </div>
      <div class="panel">
        <h2>ポイント</h2>
        <ul class="info-list">
          {mi.raw.points.map((p) => (
            <li class="info-route">
              <div class="info-line"><strong>{p.name}</strong><span>1pt＝{p.yenPerPoint}円</span></div>
              {p.note && <p class="note">{p.note}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
