import { h } from '../h';
import type { Ctx } from '../app';
import { goalStatus, type GoalState } from '../../domain/bonus';
import { isValidYM, isValidYMD } from '../../domain/date';
import type { BonusGoal, UserSettings } from '../../domain/types';
import { yen } from '../format';

const STATE_LABEL: Record<GoalState, string> = {
  active: '進行中', achieved: '達成済み', expired: '期限切れ', unset: '入会年月が未設定',
};

const intOrUndef = (v: string) => {
  const n = Number(v.replace(/[,，]/g, ''));
  return v.trim() === '' || !Number.isFinite(n) || n < 0 ? undefined : Math.floor(n);
};

export function BonusScreen(ctx: Ctx): Node {
  const { mi, state } = ctx;
  const bonuses = mi.raw.bonuses.filter((b) => state.settings.ownedCards.some((c) => c.cardId === b.cardId));
  const edit = (bonusId: string, f: (g: BonusGoal, s: UserSettings) => void) =>
    ctx.update((s) => {
      const g = s.bonusGoals.find((x) => x.bonusId === bonusId)!;
      f(g, s);
      g.updatedAt = ctx.today;
    });

  return (
    <section>
      <header class="screen-head"><h1>年間ボーナス</h1></header>
      <p class="sub">「狙う」をオンにすると、達成に向けてそのカードを優先しておすすめします。累計は月1回くらいの概算で十分です。</p>
      {bonuses.length === 0 && <p class="empty">持っているカードに年間ボーナスのあるカードがありません。</p>}
      {bonuses.map((b) => {
        const g = state.settings.bonusGoals.find((x) => x.bonusId === b.id) ?? { bonusId: b.id, target: false };
        const card = state.settings.ownedCards.find((c) => c.cardId === b.cardId);
        const st = goalStatus(b, g, card, ctx.today);
        return (
          <div class="panel">
            <div class="panel-head">
              <h2>{mi.cards.get(b.cardId)?.name}</h2>
              <span class={`badge badge-${st.state}`}>{STATE_LABEL[st.state]}</span>
            </div>
            <p class="sub">{b.description}</p>
            <label class="switch">
              <input id={`target-${b.id}`} type="checkbox" checked={g.target}
                onChange={(e: Event) => edit(b.id, (x) => { x.target = (e.target as HTMLInputElement).checked; })} />
              <span>このボーナスを狙う</span>
            </label>

            <div class="progress" aria-label={`進捗 ${Math.round(st.progressRatio * 100)}%`}>
              <div class="progress-bar" style={{ width: `${st.progressRatio * 100}%` }} />
            </div>
            <dl class="stats">
              <div><dt>累計</dt><dd>{yen(st.progressYen)} / {yen(st.thresholdYen)}</dd></div>
              <div><dt>残り</dt><dd>{yen(st.remainingYen)}</dd></div>
              <div><dt>期限</dt><dd>{st.deadline ?? '—'}{st.deadline && st.state !== 'expired' ? `（あと${st.monthsLeft}か月）` : ''}</dd></div>
              <div><dt>必要な月額</dt><dd>{st.state === 'active' ? yen(st.requiredMonthlyYen) : '—'}</dd></div>
            </dl>

            <label class="field">
              <span>入会年月</span>
              <input id={`bjoin-${b.id}`} type="month" value={card?.joinYm ?? ''} max={ctx.today.slice(0, 7)}
                onChange={(e: Event) => {
                  const v = (e.target as HTMLInputElement).value;
                  if (v && (!isValidYM(v) || v > ctx.today.slice(0, 7))) { ctx.toast('入会年月が正しくありません'); return; }
                  void ctx.update((s) => {
                    const c = s.ownedCards.find((x) => x.cardId === b.cardId);
                    if (c) { if (v) c.joinYm = v; else delete c.joinYm; }
                  });
                }} />
              {st.start && <small>今期：{st.start}〜{st.deadline}（{b.periodNote ?? ''}）</small>}
            </label>
            <label class="field">
              <span>今期の累計利用額（概算・円）</span>
              <input id={`progress-${b.id}`} type="number" inputmode="numeric" min="0" step="1000" value={g.progressYen ?? ''}
                placeholder="例：300000"
                onChange={(e: Event) => edit(b.id, (x) => {
                  const v = intOrUndef((e.target as HTMLInputElement).value);
                  if (v === undefined) delete x.progressYen; else x.progressYen = v;
                })} />
            </label>
            <label class="field">
              <span>達成条件額（円）</span>
              <input id={`threshold-${b.id}`} type="number" inputmode="numeric" min="1" step="10000" value={g.thresholdYen ?? b.thresholdYen}
                onChange={(e: Event) => edit(b.id, (x) => {
                  const v = intOrUndef((e.target as HTMLInputElement).value);
                  if (!v || v === b.thresholdYen) delete x.thresholdYen; else x.thresholdYen = v;
                })} />
            </label>
            <label class="check">
              <input type="checkbox" checked={!!g.achieved}
                onChange={(e: Event) => edit(b.id, (x) => { x.achieved = (e.target as HTMLInputElement).checked; })} />
              <span>今期は達成済み</span>
            </label>
            {b.oneTimeValueYen ? (
              <label class="check">
                <input type="checkbox" checked={!!g.oneTimeAchieved}
                  onChange={(e: Event) => edit(b.id, (x) => { x.oneTimeAchieved = (e.target as HTMLInputElement).checked; })} />
                <span>{b.oneTimeNote ?? '初回特典'}は達成済み</span>
              </label>
            ) : null}
            <details class="override" open={!!g.deadlineOverride}>
              <summary>期限を手動で変更する</summary>
              <label class="field">
                <span>期限（空欄で自動計算に戻す）</span>
                <input id={`deadline-${b.id}`} type="date" value={g.deadlineOverride ?? ''}
                  onChange={(e: Event) => edit(b.id, (x) => {
                    const v = (e.target as HTMLInputElement).value;
                    if (v && isValidYMD(v)) x.deadlineOverride = v; else delete x.deadlineOverride;
                  })} />
                <small>手動の期限は自動で次の期間に切り替わりません。</small>
              </label>
            </details>
            {g.prevPeriod && (
              <p class="sub">前期（〜{g.prevPeriod.deadline}）：{yen(g.prevPeriod.progressYen)}{g.prevPeriod.achieved ? '・達成' : ''}</p>
            )}
            <p class="note">{b.excludedNote}</p>
          </div>
        );
      })}
    </section>
  );
}
