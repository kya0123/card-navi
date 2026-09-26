import { h, mount } from './h';
import rules from '../data/rules.json';
import affiliates from '../data/affiliates.json';
import type { AffiliateMaster } from '../domain/affiliate';
import { preparePromo, type PromoState } from '../domain/promo';
import { indexMaster, validateMaster, type MasterIndex } from '../domain/master';
import { rolloverGoals } from '../domain/bonus';
import { buildSearchIndex, type SearchIndex } from '../domain/search';
import { daysBetween, isValidYMD, todayYMD } from '../domain/date';
import type { Id, Master, UserSettings, YMD } from '../domain/types';
import type { RecommendScope } from '../domain/engine';
import { openKV } from '../storage/db';
import { requestPersist, SettingsRepo } from '../storage/settingsRepo';
import { HomeScreen } from './screens/home';
import { CategoryScreen } from './screens/category';
import { CardsScreen } from './screens/cards';
import { InfoScreen } from './screens/info';
import { SettingsScreen } from './screens/settings';
import { ReviewScreen, showSuggestView } from './screens/review';
import { AdPolicyScreen } from './screens/adpolicy';
import { NearbyScreen } from './screens/nearby';
import { CardRateScreen } from './screens/cardRate';
import { themeOf } from '../domain/theme';
import { withCustomCards } from '../domain/custom';

export type RouteName = 'home' | 'category' | 'cards' | 'review' | 'info' | 'settings' | 'adpolicy' | 'nearby' | 'rate';

export interface AppState {
  settings: UserSettings;
  recent: Id[];
  query: string;
  selection: { storeId?: Id; categoryId?: Id } | null;
  amount: string;
  toasts: string[];
  persistGranted: boolean | null;
  storagePersistent: boolean;
  swWaiting: ServiceWorker | null;
  backupBannerDismissed: boolean;
  route: RouteName;
  /** 二度押し確認中のボタンID */
  armed: string | null;
  /** カード提案の表示状態（meta ストアの promo） */
  promo: PromoState;
  /** おすすめの比較範囲（保存しない。保有カードが0枚のときは常に登録カード全体） */
  recScope: RecommendScope;
  /** S11 カードのポイント率で表示するカードと、戻り先 */
  rateCardId: Id | null;
  rateBack: RouteName;
}

export interface Ctx {
  /** マスタの索引。その他のカード（詳細設計 32.8）を取り込んだもの */
  readonly mi: MasterIndex;
  search: SearchIndex;
  state: AppState;
  today: YMD;
  repo: SettingsRepo;
  /** 設定を更新して保存し、再描画する */
  update(mutate: (s: UserSettings) => void, opts?: { render?: boolean }): Promise<void>;
  setState(patch: Partial<AppState>): void;
  render(): void;
  go(route: RouteName): void;
  selectStore(storeId: Id): Promise<void>;
  toast(msg: string): void;
  aff: AffiliateMaster;
  /** 提案の表示状態を保存する（再描画はしない） */
  savePromo(): void;
  /** S07 を開く。cardId を渡すとそのカードの位置までスクロールする */
  openReview(cardId?: Id): void;
  /** S11 カードのポイント率を開く（戻ると今の画面へ） */
  openCardRate(cardId: Id): void;
}

const TABS: { route: RouteName; label: string; icon: string }[] = [
  { route: 'home', label: 'おすすめ', icon: '◎' },
  { route: 'cards', label: 'カード', icon: '▭' },
  { route: 'review', label: 'カード診断', icon: '⇄' },
  { route: 'settings', label: '設定', icon: '⚙' },
];

const ROUTES: RouteName[] = ['home', 'category', 'cards', 'review', 'info', 'settings', 'adpolicy', 'nearby'];

/** 初期表示の画面は #cards のような単純なハッシュで指定できる */
function initialRoute(): RouteName {
  const r = location.hash.replace(/^#\/?/, '') as RouteName;
  return ROUTES.includes(r) ? r : 'home';
}

/** E2E用に ?today=YYYY-MM-DD で日付を固定できる */
function resolveToday(): YMD {
  const p = new URLSearchParams(location.search).get('today');
  return p && isValidYMD(p) ? p : todayYMD();
}

export async function startApp(root: HTMLElement): Promise<void> {
  const master = rules as unknown as Master;
  const errs = validateMaster(master);
  if (errs.length) {
    mount(root, <div class="fatal">ポイント率のデータに誤りがあります：{errs.join(' / ')}</div>);
    return;
  }
  const mi = indexMaster(master);
  const kv = await openKV();
  const repo = new SettingsRepo(kv, mi);
  const today = resolveToday();
  const loaded = await repo.load();
  const roll = rolloverGoals(mi, loaded.settings.bonusGoals, loaded.settings.ownedCards, today);
  const settings = { ...loaded.settings, bonusGoals: roll.goals };
  if (loaded.isNew || roll.changed || loaded.dropped) await repo.save(settings);
  const recent = await repo.recent();
  const promo = preparePromo(await repo.getMeta<PromoState>('promo'), today, mi.raw.masterVersion, recent, roll.notices.length > 0);
  await repo.setMeta('promo', promo);

  const state: AppState = {
    settings,
    recent,
    query: '',
    selection: null,
    amount: '',
    toasts: [
      ...roll.notices.map((n) => `${n.cardName}のボーナス期間が新しくなりました（累計をリセットしました）`),
      ...(loaded.dropped ? [`ポイント率の更新で使えなくなった設定を${loaded.dropped}件取り除きました`] : []),
      ...(kv.persistent ? [] : ['この環境では設定が保存されません（プライベートモード等）']),
    ],
    persistGranted: null,
    storagePersistent: kv.persistent,
    swWaiting: null,
    backupBannerDismissed: false,
    route: initialRoute(),
    armed: null,
    promo,
    recScope: 'owned',
    rateCardId: null,
    rateBack: 'cards',
  };

  let rendering = false;
  let pending = false;
  const ctx: Ctx = {
    get mi() { return withCustomCards(mi, state.settings.customCards); },
    search: buildSearchIndex(mi), state, today, repo,
    async update(mutate, opts) {
      const next = structuredClone(state.settings);
      mutate(next);
      const r = rolloverGoals(mi, next.bonusGoals, next.ownedCards, today);
      next.bonusGoals = r.goals;
      state.settings = next;
      await repo.save(next);
      if (opts?.render !== false) ctx.render();
    },
    setState(patch) { Object.assign(state, patch); ctx.render(); },
    go(route) { state.route = route; state.armed = null; ctx.render(); window.scrollTo(0, 0); },
    async selectStore(storeId) {
      state.selection = { storeId };
      state.query = '';
      state.recent = await repo.touchRecent(storeId, new Date().toISOString());
      ctx.go('home');
      // 結果の位置まで自動で移動する（詳細設計 31.2.5）
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('result')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    },
    toast(msg) { state.toasts.push(msg); ctx.render(); },
    aff: affiliates as unknown as AffiliateMaster,
    savePromo() { void repo.setMeta('promo', state.promo); },
    openCardRate(cardId) {
      const back = state.route === 'rate' ? state.rateBack : state.route;
      state.rateCardId = cardId;
      state.rateBack = back;
      ctx.go('rate');
    },
    openReview(cardId) {
      showSuggestView();
      ctx.go('review');
      if (cardId) document.getElementById(`review-${cardId}`)?.scrollIntoView({ block: 'start' });
    },
    render() {
      // 描画中にフォーカスが外れて change → 再描画、という再入を防ぐ
      if (rendering) { pending = true; return; }
      rendering = true;
      try { render(root, ctx); } finally { rendering = false; }
      if (pending) { pending = false; queueMicrotask(() => ctx.render()); }
    },
  };

  ctx.render();

  requestPersist().then(async (granted) => {
    state.persistGranted = granted;
    await repo.setMeta('persistGranted', granted);
  });
  registerSW(ctx);
}

function render(root: HTMLElement, ctx: Ctx): void {
  const route = ctx.state.route;
  const screens: Record<RouteName, (c: Ctx) => Node> = {
    home: HomeScreen, category: CategoryScreen, cards: CardsScreen,
    review: ReviewScreen, info: InfoScreen, settings: SettingsScreen, adpolicy: AdPolicyScreen,
    nearby: NearbyScreen, rate: CardRateScreen,
  };
  const { state } = ctx;
  applyTheme(state.settings.theme);
  const last = state.settings.lastExportAt;
  const needBackup = !state.backupBannerDismissed && state.storagePersistent
    && (!last || daysBetween(last, ctx.today) > 30) && state.settings.ownedCards.some((c) => c.joinYm);
  const active = route === 'category' || route === 'nearby' ? 'home' : route === 'adpolicy' || route === 'info' ? 'settings'
    : route === 'rate' ? (state.rateBack === 'home' ? 'home' : 'cards') : route;

  const activeEl = document.activeElement as HTMLElement | null;
  const focusId = activeEl?.id;

  mount(root, (
    <div class="app">
      {state.swWaiting && (
        <div class="banner banner-update" role="status">
          <span>新しいバージョンがあります</span>
          <button class="btn btn-small" onClick={() => {
            state.swWaiting?.postMessage('skipWaiting');
          }}>更新</button>
        </div>
      )}
      {/* バックアップの案内は設定タブにだけ出す（詳細設計 31.2.5） */}
      {needBackup && route === 'settings' && (
        <div class="banner" role="status" id="backup-banner">
          <span>設定のバックアップをおすすめします</span>
          <button class="icon-btn" aria-label="閉じる" onClick={() => ctx.setState({ backupBannerDismissed: true })}>×</button>
        </div>
      )}
      <main class="view">{screens[route](ctx)}</main>
      {state.toasts.length > 0 && (
        <div class="toasts">
          {state.toasts.map((t, i) => (
            <div class="toast" role="status">
              <span>{t}</span>
              <button class="icon-btn" aria-label="閉じる" onClick={() => { state.toasts.splice(i, 1); ctx.render(); }}>×</button>
            </div>
          ))}
        </div>
      )}
      <nav class="tabbar" aria-label="メニュー">
        {TABS.map((t) => (
          <button type="button" class={`tab${active === t.route ? ' active' : ''}`}
            aria-current={active === t.route ? 'page' : null} onClick={() => ctx.go(t.route)}>
            <span class="tab-icon" aria-hidden="true">{t.icon}</span>
            <span class="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  ));

  if (focusId) {
    const el = document.getElementById(focusId) as HTMLInputElement | null;
    if (el && el !== document.activeElement) {
      el.focus({ preventScroll: true });
      if (typeof el.selectionStart === 'number' && el.type !== 'number') {
        const n = el.value.length;
        try { el.setSelectionRange(n, n); } catch { /* 一部のinput typeは非対応 */ }
      }
    }
  }
}

declare const __ENABLE_SW__: boolean;

function registerSW(ctx: Ctx): void {
  if (typeof __ENABLE_SW__ !== 'undefined' && !__ENABLE_SW__) return;
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const onWaiting = (w: ServiceWorker | null) => {
      if (w && navigator.serviceWorker.controller) ctx.setState({ swWaiting: w });
    };
    onWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') onWaiting(w); });
    });
    // 初回訪問時の clients.claim() でも controllerchange が起きるため、更新時（既に制御下だった場合）だけ再読込する
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      location.reload();
    });
  }).catch(() => { /* 埋め込み環境などでは登録できないことがある */ });
}

/** 配色を画面と theme-color に反映する（詳細設計 23.4） */
function applyTheme(id: unknown): void {
  const t = themeOf(id);
  const root = document.documentElement;
  if (root.dataset.theme !== t.id) root.dataset.theme = t.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && meta.getAttribute('content') !== t.key) meta.setAttribute('content', t.key);
}
