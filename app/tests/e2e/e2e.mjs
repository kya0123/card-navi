// E2E・オフライン試験（詳細設計 12.3）。先に npm run build を実行しておくこと。
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { serve } from '../../scripts/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}/?today=2026-09-22`;
const SHOT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(SHOT, { recursive: true });

const server = await serve(PORT);
const browser = await chromium.launch();
const results = [];
const errors = [];

/** v1.5までの初期状態に相当する保有カード（詳細設計 20.8） */
const INITIAL_CARDS = ['smbc_gold_nl', 'rakuten', 'ana_wide_gold', 'mufg', 'paypay_gold'];

/** カード一覧から保有カードを選ぶ（選択UIの試験を兼ねる） */
async function selectCards(page, ids) {
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.click('#view-catalog');
  await page.click('#filter-all');
  for (const id of ids) await page.check(`#own-${id}`);
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click();
  await page.waitForSelector('.search-input');
}

/** 新規利用者は保有0枚のため、既定では初期5枚を一覧から選んでから始める（cards=[] で選ばない） */
async function newPage(opts = {}, url = BASE, cards = INITIAL_CARDS) {
  const context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP', ...opts });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // E25 はサーバエラーを意図的に返すため、その読み込み失敗は除く
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 504/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(url);
  await page.waitForSelector('.search-input');
  if (cards.length) await selectCards(page, cards);
  return { context, page };
}

async function run(id, name, fn) {
  // ONLY=E10,E21 のように指定すると一部だけ実行する
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(id)) return;
  try { await fn(); results.push(`ok   ${id} ${name}`); }
  catch (e) { results.push(`FAIL ${id} ${name}\n     ${e.message.split('\n').slice(0, 6).join(' | ')}`); }
}

const rank1 = (page) => page.locator('.rank-1');

async function contrastIssues(page) {
  return page.evaluate(() => {
    const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { rgb: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0.5) return c.rgb; } return [255, 255, 255]; };
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const fg = parse(getComputedStyle(el).color).rgb; const bg = bgOf(el);
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < 4.5) out.push(`${el.className || el.tagName}「${el.textContent.trim().slice(0, 12)}」${ratio.toFixed(2)}`);
    }
    return out;
  });
}

const lowContrast = contrastIssues;

await run('E01', '「せぶん」→候補タップで三井住友スマホのタッチ決済が1位（3タップ以内）', async () => {
  const { context, page } = await newPage();
  await page.fill('#q', 'せぶん');                                   // 1: 入力
  await page.locator('.suggest-item').first().click();               // 2: 候補タップ
  await page.waitForSelector('.rank-1');
  assert.match(await rank1(page).locator('.rank-card').innerText(), /三井住友カード ゴールド/);
  assert.match(await rank1(page).locator('.rank-method').innerText(), /スマホのタッチ決済/);
  assert.equal(await rank1(page).locator('.rate').innerText(), '7%');
  assert.equal(await page.locator('.pointpay').count(), 0);
  await page.screenshot({ path: `${SHOT}E01-seven.png`, fullPage: true });
  await context.close();
});

await run('E02', 'ボーナス設定（狙う・入会年月・累計）でセブンが8%（7%＋ボーナス1%。初回特典は含めない）になる', async () => {
  const { context, page } = await newPage();
  // 狙う・入会年月はカードタブ、累計はカード診断の「ボーナスの入力」（折りたたみ）
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.click('#view-owned');
  assert.equal(await page.getByText('使う支払い方法').count(), 0, '支払い方法のチェックはない');
  assert.equal(await page.locator('#join-rakuten').count(), 0, 'ボーナスのないカードは入会年月なし');
  await page.check('#target-smbcg_1m');
  await page.fill('#join-smbc_gold_nl', '2024-04');
  await page.locator('#join-smbc_gold_nl').dispatchEvent('change');
  await page.getByRole('button', { name: 'カード診断', exact: true }).click();
  assert.equal(await page.getAttribute('#diag-owned', 'aria-selected'), 'true', '既定は持っているカード');
  assert.equal(await page.isVisible('#progress-smbcg_1m'), false, '入力欄は折りたたみ');
  await page.click('#bonus-input-smbcg_1m > summary');
  await page.fill('#progress-smbcg_1m', '300000');
  await page.locator('#progress-smbcg_1m').dispatchEvent('change');
  await page.waitForTimeout(100);
  assert.match(await page.locator('#reach-smbcg_1m').innerText(), /月50,000円の利用では期限までに届きません/);
  const stats = await page.locator('#bonus-smbcg_1m .stats').innerText();
  assert.match(stats, /2027-03-31/);
  assert.match(stats, /100,000円/);
  await page.screenshot({ path: `${SHOT}E02-bonus.png`, fullPage: true });
  await page.getByRole('button', { name: 'おすすめ' }).click();
  await page.fill('#q', 'セブン');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.rank-1');
  assert.equal(await rank1(page).locator('.rate').innerText(), '8%');
  assert.match(await rank1(page).locator('.rank-why').innerText(), /7%\s*＋ボーナス1%\s*セブン-イレブンの特約/);
  // 詳しい条件は折りたたみ。同じカードの別の支払い方法（1.5%）はここに入る
  assert.equal(await page.locator('#rank-detail').getAttribute('open'), null);
  await page.click('#rank-detail > summary');
  assert.match(await page.locator('#rank-detail').innerText(), /ボーナス：年間1,000,000円の利用で＋1%相当/);
  assert.match(await page.locator('#rank-detail').innerText(), /は1.5%/);
  assert.equal(await page.locator('.rank .rank-card', { hasText: '三井住友カード ゴールド' }).count(), 1, '同じカードは1枠');
  // 再読込後も設定が残る（IndexedDB）
  await page.reload();
  await page.waitForSelector('.search-input');
  await page.locator('.chip', { hasText: 'セブン-イレブン' }).click();
  assert.equal(await rank1(page).locator('.rate').innerText(), '8%');
  // バックアップの案内はおすすめ画面に出さず、設定タブに出す（入会年月を設定済み・未バックアップ）
  assert.equal(await page.locator('#backup-banner').count(), 0);
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.locator('#backup-banner').waitFor();
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click();
  await page.screenshot({ path: `${SHOT}E02-seven-bonus.png`, fullPage: true });
  // ファミマではボーナス込み1.5%（0.5%＋1%）、ポイント払い推奨なし
  await page.fill('#q', 'ファミマ');
  await page.keyboard.press('Enter');
  await page.locator('.result-title', { hasText: 'ファミリーマート' }).waitFor();
  assert.equal(await rank1(page).locator('.rate').innerText(), '1.5%');
  assert.equal(await page.locator('.pointpay').count(), 0);
  await context.close();
});

await run('E03', 'バックアップの書き出し→設定変更→読み込みで元に戻る', async () => {
  const { context, page } = await newPage({ acceptDownloads: true });
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.click('#view-owned');
  await page.fill('#join-smbc_gold_nl', '2018-01');
  await page.locator('#join-smbc_gold_nl').dispatchEvent('change');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const file = `${SHOT}backup.json`;
  await dl.saveAs(file);
  // 設定を変更（楽天の入会年月を消す）
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.click('#view-owned');
  await page.fill('#join-smbc_gold_nl', '');
  await page.locator('#join-smbc_gold_nl').dispatchEvent('change');
  assert.equal(await page.inputValue('#join-smbc_gold_nl'), '');
  // 読み込み
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.setInputFiles('#import', file);
  await page.waitForSelector('.toast');
  assert.match(await page.locator('.toast').last().innerText(), /読み込みました/);
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.click('#view-owned');
  assert.equal(await page.inputValue('#join-smbc_gold_nl'), '2018-01');
  await context.close();
});

await run('E04', 'オフラインで再読込しても全画面が動作する', async () => {
  const { context, page } = await newPage();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();                       // SWの制御下に入る
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.search-input');
  await page.fill('#q', 'すたば');
  await page.locator('.suggest-item').first().click();
  assert.equal(await rank1(page).locator('.rate').innerText(), '7%');
  for (const tab of ['カード', 'カード診断', '設定']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.waitForSelector('.screen-head h1');
  }
  assert.equal(await page.locator('.tabbar .tab').count(), 4, 'タブは4つ');
  await page.click('#to-info');
  await page.locator('#info-smbc_gold_nl > summary').click();
  assert.ok(await page.locator('.src.disabled').count() > 0, 'オフライン時は出典リンクを無効表示');
  await page.screenshot({ path: `${SHOT}E04-offline-info.png`, fullPage: true });
  await context.close();
});

await run('E05', '該当なし→カテゴリ選択で結果が出る（ポイント払い推奨つき）', async () => {
  const { context, page } = await newPage();
  await page.fill('#q', 'ぜったいにないみせ');
  await page.waitForSelector('.nohit');
  await page.locator('.nohit .btn').click();
  await page.locator('.tile', { hasText: '飲食チェーン' }).click();
  await page.locator('#category-other').click();
  await page.waitForSelector('.rank-1');
  assert.match(await page.locator('.result-title').innerText(), /飲食チェーン/);
  assert.match(await rank1(page).locator('.rank-card').innerText(), /楽天カード/);
  assert.equal(await page.locator('.pointpay').count(), 1);
  await context.close();
});

await run('E06', '金額入力で獲得ポイントを表示（セブン850円→三井住友・三菱UFJとも約59円）', async () => {
  const { context, page } = await newPage();
  await page.fill('#q', 'せぶん');
  await page.keyboard.press('Enter');
  await page.locator('.amount summary').click();
  await page.fill('#amount', '850');
  await page.locator('#amount').dispatchEvent('change');
  await page.waitForSelector('.rank-earned');
  const earned = await page.locator('.rank-earned').allInnerTexts();
  // v1.14：三井住友系は月間合計で計算するため概算表示（旧：56円相当）
  assert.equal(earned[0], '約59円相当');
  assert.equal(earned[1], '約59円相当');
  await context.close();
});

await run('E07', '端末がダークモード・幅360pxでも崩れず横スクロールしない', async () => {
  const { context, page } = await newPage({ colorScheme: 'dark', viewport: { width: 360, height: 740 } });
  await page.fill('#q', 'ふぁみま');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.rank-1');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `横はみ出し ${overflow}px`);
  await page.screenshot({ path: `${SHOT}E07-dark-familymart.png`, fullPage: true });
  await context.close();
});

await run('E08', '文字のコントラスト比4.5:1以上・1位の金色の枠は3:1以上（推奨・カード一覧・ボーナス画面）', async () => {
  const { context, page } = await newPage();
  await page.fill('#q', 'ふぁみま');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.pointpay');
  await page.waitForTimeout(400);
  assert.deepEqual(await lowContrast(page), [], '推奨画面');
  // 非テキスト（1位の枠・順位番号の地）：WCAG 1.4.11 の 3:1
  const ui = await page.evaluate(() => {
    const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const cr = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
    const card = document.querySelector('.rank-1');
    const cs = getComputedStyle(card);
    return { border: cs.borderTopColor, ratio: cr(cs.borderTopColor, cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'rgb(255, 255, 255)' : cs.backgroundColor) };
  });
  assert.equal(ui.border, 'rgb(176, 141, 47)', '1位の枠は金色');
  assert.ok(ui.ratio >= 3, `1位の枠のコントラスト ${ui.ratio.toFixed(2)}`);
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.click('#view-catalog');
  assert.deepEqual(await lowContrast(page), [], 'カード一覧');
  await page.getByRole('button', { name: 'カード診断', exact: true }).click();
  assert.deepEqual(await lowContrast(page), [], 'カード診断');
  await context.close();
});

await run('E09', 'カテゴリ→店舗一覧から選ぶ（高還元ラベル付き）→結果が出る', async () => {
  const { context, page } = await newPage();
  await page.locator('.chip-ghost', { hasText: 'カテゴリで探す' }).click();
  await page.locator('.tile', { hasText: 'スーパー' }).click();
  const first = page.locator('.store-list .suggest-item').first();
  assert.match(await first.innerText(), /三菱UFJ 7%/);             // 高還元の店が先頭に並ぶ
  await page.screenshot({ path: `${SHOT}E09-category-list.png` });
  await page.locator('.store-list .suggest-item', { hasText: 'オーケー' }).click();
  await page.locator('.result-title', { hasText: 'オーケー' }).waitFor();
  assert.match(await rank1(page).locator('.rank-card').innerText(), /三菱UFJカード/);
  assert.equal(await rank1(page).locator('.rate').innerText(), '7%');
  await context.close();
});

// ---- カード提案（詳細設計書（カード提案機能）8.2） ----
const at = (d) => `http://127.0.0.1:${PORT}/?today=${d}`;
const RAKUTEN_ONLY = JSON.stringify({ app: 'card-advisor', exportedAt: '2026-09-01', settings: {
  schemaVersion: 1,
  ownedCards: [{ cardId: 'rakuten', enabledMethods: ['card_physical', 'applepay_quicpay', 'smartphone_visa_touch', 'online'], priority: 1 }],
  enabledNonCardRoutes: ['paypay_balance', 'suica_ride'], bonusGoals: [], staleWarnDays: 180 } });

async function goto(page, d) { await page.goto(at(d)); await page.waitForSelector('.search-input'); }
async function pick(page, q, title) {
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click();
  await page.fill('#q', q);
  await page.keyboard.press('Enter');
  await page.locator('.result-title', { hasText: title }).waitFor();
}
/** 9/1 に初回起動し、楽天のみ保有の設定を読み込んで5店を調べる */
async function setupRakutenOnly() {
  const { context, page } = await newPage({}, at('2026-09-01'), []);
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.fill('#paste', RAKUTEN_ONLY);
  await page.click('#paste-import');
  await page.locator('.toast', { hasText: '読み込みました' }).waitFor();
  for (const [q, t] of [['せぶん', 'セブン-イレブン'], ['まくどなるど', 'マクドナルド'], ['すたば', 'スターバックス'],
    ['ろーそんすりーえふ', 'ローソンスリーエフ'], ['ふぁみま', 'ファミリーマート']]) await pick(page, q, t);
  return { context, page };
}

await run('E10', '楽天のみ：13日後はヒントなし→21日目はバナーの日で出ない→翌日セブンでヒント（セブンカード10%）→S07へ（1日1回・コントラスト）', async () => {
  const { context, page } = await setupRakutenOnly();
  assert.equal(await page.locator('#hint').count(), 0, '初日は出さない');
  await goto(page, '2026-09-14');
  await pick(page, 'せぶん', 'セブン-イレブン');
  assert.equal(await page.locator('#hint').count(), 0, '13日目は出さない');
  await goto(page, '2026-09-22');
  await page.locator('#promo-banner').waitFor();                   // 起動時のホームで③が出る
  await pick(page, 'せぶん', 'セブン-イレブン');
  assert.equal(await page.locator('#hint').count(), 0, '③を出した日は①を出さない');
  await goto(page, '2026-09-23');
  assert.equal(await page.locator('#promo-banner').count(), 0, '③は7日後まで出ない');
  await pick(page, 'せぶん', 'セブン-イレブン');
  const hint = page.locator('#hint');
  await hint.waitFor();
  assert.match(await hint.innerText(), /セブンカード・プラスで 10%/);   // v1.13：21枚から最大（旧：三菱UFJ 7%）
  assert.equal(await page.locator('#hint .pr').count(), 0, 'アフィリエイトなしならPRなし');
  await page.screenshot({ path: `${SHOT}E10-hint.png`, fullPage: true });
  await pick(page, 'まくどなるど', 'マクドナルド');
  assert.equal(await page.locator('#hint').count(), 0, '同じ日に別のお店では出さない');
  await pick(page, 'せぶん', 'セブン-イレブン');
  await page.locator('#hint').waitFor();                         // 同じ日の同じお店は出し続ける
  await page.click('#hint-more');
  await page.locator('h1', { hasText: 'カード診断' }).waitFor();
  const first = page.locator('.review-card').first();
  // v1.15（分冊10章）：並びは年間の損得順（月5万円）。v1.17 で Olive は8%になり1位
  assert.match(await first.locator('h2').innerText(), /Olive/);
  assert.match(await first.locator('.review-lead').innerText(), /5件中4件/);
  assert.equal(await first.locator('.net-headline').innerText(), '年間 ＋33,600円');
  await first.locator('details.fold > summary').click();
  assert.match(await first.innerText(), /年間 ＋33,600円（ポイント＋33,600円／ボーナス＋0円／年会費−0円）/);
  assert.match(await first.innerText(), /1万円ごとに ＋700円/);
  // 年会費82,500円のマリオット・プレミアムは「回収できません」の下
  const mbp = page.locator('#fee-loss .review-card', { hasText: 'Marriott Bonvoy アメリカン・エキスプレス・プレミアム' });
  assert.match(await mbp.innerText(), /年間 −70,500円/);
  await mbp.locator('details.fold > summary').evaluate((el) => el.click());
  assert.match(await mbp.innerText(), /月343,800円以上の利用で年会費を回収/);
  assert.equal(await mbp.locator('a.btn').getAttribute('href'), 'https://www.americanexpress.com/jp/credit-cards/marriott-bonvoy-premium-card/');
  const smbc = page.locator('.review-card', { hasText: '三井住友カード ゴールド（NL）' });
  assert.match(await smbc.locator('.review-lead').innerText(), /5件中4件/);
  await smbc.locator('details.fold > summary').evaluate((el) => el.click());
  assert.match(await smbc.innerText(), /1万円ごとに ＋600円/);
  assert.match(await smbc.innerText(), /年間 ＋23,300円/);
  assert.match(await smbc.innerText(), /月9,600円以上の利用で年会費を回収/);   // 旧定義（上がるお店での月額）は7,700円
  assert.equal(await smbc.locator('a.btn').getAttribute('href'), 'https://www.smbc-card.com/nyukai/card/gold-numberless.jsp');
  await page.locator('.review-card').nth(1).locator('details.fold > summary').evaluate((el) => el.click());
  assert.match(await page.locator('.review-card').nth(1).innerText(), /年会費無料：持つだけで損はありません/);
  assert.deepEqual(await contrastIssues(page), []);
  await page.screenshot({ path: `${SHOT}E10-review.png`, fullPage: true });
  await context.close();
});

await run('E11', 'バナー：翌日ホームに表示→タップでS07→翌日は出ない→7日後に再表示', async () => {
  const { context, page } = await setupRakutenOnly();
  await goto(page, '2026-09-23');
  const banner = page.locator('#promo-banner');
  await banner.waitFor();
  assert.match(await banner.innerText(), /あなたの使い方に合うカードが見つかりました/);
  assert.match(await banner.innerText(), /9件/);                  // v1.13：21枚で9枚（旧：2件）
  assert.deepEqual(await contrastIssues(page), []);
  await page.screenshot({ path: `${SHOT}E11-banner.png`, fullPage: true });
  await pick(page, 'せぶん', 'セブン-イレブン');
  assert.equal(await page.locator('#hint').count(), 0, 'バナーを出した日はヒントを出さない');
  await page.click('.result-head .btn');                           // クリア
  await banner.waitFor();                                          // 同じ日は出し続ける
  await page.locator('.promo-main').click();
  await page.locator('h1', { hasText: 'カード診断' }).waitFor();
  await goto(page, '2026-09-24');
  assert.equal(await page.locator('#promo-banner').count(), 0, 'タップ後は7日間出さない');
  await goto(page, '2026-09-30');
  await page.locator('#promo-banner').waitFor();
  await context.close();
});

await run('E12', '設定で提案をオフ：ヒントもバナーも出ない。見直すタブは開ける', async () => {
  const { context, page } = await setupRakutenOnly();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.uncheck('#suggest-toggle');
  await page.waitForTimeout(300);                                  // IndexedDBへの保存を待つ
  await goto(page, '2026-09-22');
  assert.equal(await page.locator('#promo-banner').count(), 0);
  await pick(page, 'せぶん', 'セブン-イレブン');
  assert.equal(await page.locator('#hint').count(), 0);
  await page.getByRole('button', { name: 'カード診断', exact: true }).click();
  assert.equal(await page.locator('.review-card').count(), 9);    // v1.13：21枚で9枚（旧：2）
  await page.click('#to-adpolicy');
  await page.locator('h1', { hasText: '広告の方針' }).waitFor();
  await context.close();
});

await run('E13', 'ヒントの×でそのお店では60日出なくなる', async () => {
  const { context, page } = await setupRakutenOnly();
  await goto(page, '2026-09-22');                                  // ③の日
  await goto(page, '2026-09-23');
  await pick(page, 'すたば', 'スターバックス');
  await page.locator('#hint').waitFor();
  await page.click('#hint-close');
  assert.equal(await page.locator('#hint').count(), 0);
  await goto(page, '2026-10-20');
  await pick(page, 'すたば', 'スターバックス');
  assert.equal(await page.locator('#hint').count(), 0);
  await context.close();
});

await run('E14', '初回：案内バナー・登録カード全体でおすすめ→カード一覧（ポイ活向け・検索）でリクルートカードを選ぶ→ファミマで1.2%が1位→外すと登録カード全体に戻る', async () => {
  const { context, page } = await newPage({}, BASE, []);
  // 保有カードなしでは案内を表示し、登録カード全体でおすすめする（切り替えは出さない）
  await page.waitForSelector('#onboard');
  assert.match(await page.locator('#onboard').innerText(), /登録カード（22枚）全体/);
  await page.fill('#q', 'ふぁみま');
  await page.keyboard.press('Enter');
  await page.locator('.result-title', { hasText: 'ファミリーマート' }).waitFor();
  assert.equal(await page.locator('.rank').count(), 3);
  assert.equal(await page.locator('#scope-all').count(), 0, '保有0枚では切り替えを出さない');
  assert.equal(await page.locator('.rank .own-no').count(), 3, 'すべて未保有');
  assert.equal(await page.locator('.rank .own-yes').count(), 0);
  assert.match(await page.locator('#scope-note').innerText(), /主なカード22枚の中での比較です。日本のすべてのカードではありません/);
  await page.locator('#onboard .btn').click();
  // 保有0枚ではカード一覧を初期表示
  await page.waitForSelector('#catalog-list');
  const total = await page.locator('.catalog-item').count();
  assert.ok(total >= 19, `一覧の件数 ${total}`);
  await page.click('#filter-enthusiast');
  const ent = await page.locator('.catalog-item').allInnerTexts();
  assert.ok(ent.every((t) => t.includes('ポイ活向け')), 'ポイ活向けのみ');
  assert.ok(ent.some((t) => t.includes('リクルートカード')));
  await page.screenshot({ path: `${SHOT}E14-catalog-enthusiast.png`, fullPage: true });
  // 日本語入力（変換中）でも入力欄が作り直されない
  await page.click('#filter-all');
  await page.locator('#card-q').pressSequentially('りくる');
  assert.equal(await page.locator('.catalog-item').count(), 1);
  assert.equal(await page.inputValue('#card-q'), 'りくる');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'card-q');
  await page.check('#own-recruit');
  await page.locator('.catalog-item.is-owned').waitFor();
  await page.locator('#view-owned', { hasText: '持っているカード（1）' }).waitFor({ timeout: 3000 });
  await page.fill('#card-q', '');
  await page.locator('#card-q').dispatchEvent('input');
  // おすすめ：リクルート1.2%が1位、案内は消える
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click();
  assert.equal(await page.locator('#onboard').count(), 0);
  await page.fill('#q', 'ふぁみま');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.rank-1');
  assert.match(await rank1(page).locator('.rank-card').innerText(), /リクルートカード/);
  assert.equal(await rank1(page).locator('.rate').innerText(), '1.2%');
  // 保有後は切り替えが出て、既定は「持っているカード」（印・注記なし）
  assert.equal(await page.getAttribute('#scope-owned', 'aria-selected'), 'true');
  assert.equal(await page.locator('.own-mark').count(), 0);
  assert.equal(await page.locator('#scope-note').count(), 0);
  // 外すと登録カード全体に戻る（入会年月なしなので確認ダイアログなし）
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.uncheck('#own-recruit');
  await page.locator('#view-owned', { hasText: '持っているカード（0）' }).waitFor({ timeout: 3000 });
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click();
  await page.locator('.result-title', { hasText: 'ファミリーマート' }).waitFor();
  assert.equal(await page.locator('#scope-all').count(), 0);
  assert.equal(await page.locator('.rank .own-yes').count(), 0);
  await page.locator('#scope-note').waitFor();
  await context.close();
});

await run('E15', '入会年月を設定したカードを一覧で外すときは確認し、キャンセルなら保有のまま', async () => {
  const { context, page } = await newPage({}, BASE, ['smbc_gold_nl']);
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.click('#view-owned');
  await page.fill('#join-smbc_gold_nl', '2018-01');
  await page.locator('#join-smbc_gold_nl').dispatchEvent('change');
  await page.click('#view-catalog');
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#own-smbc_gold_nl').click();
  await page.waitForTimeout(100);
  assert.equal(await page.isChecked('#own-smbc_gold_nl'), true);
  page.once('dialog', (d) => d.accept());
  await page.locator('#own-smbc_gold_nl').click();
  await page.waitForTimeout(100);
  assert.equal(await page.isChecked('#own-smbc_gold_nl'), false);
  // ポイント率の一覧（設定から開く）：持っていないカードは折りたたみに入る
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.click('#to-info');
  assert.match(await page.locator('#info-others > summary').innerText(), /持っていないカード（\d+枚）/);
  await context.close();
});

await run('E16', '設定でティールを選ぶ→色とtheme-colorが変わる→再読み込み後も維持', async () => {
  const { context, page } = await newPage();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'navy');
  await page.getByRole('button', { name: '設定', exact: true }).click();
  assert.equal(await page.isChecked('#theme-navy'), true);
  await page.check('#theme-teal');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'teal');
  assert.equal(await page.getAttribute('meta[name="theme-color"]', 'content'), '#006b73');
  await page.screenshot({ path: `${SHOT}E16-theme-settings.png` });
  await page.reload();
  await page.waitForSelector('.search-input');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'teal');
  await page.fill('#q', 'せぶん');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.rank-1');
  assert.equal(await page.locator('.rank-1').evaluate((e) => getComputedStyle(e).borderTopColor), 'rgb(0, 107, 115)');
  await context.close();
});

await run('E17', '5つの配色すべてで文字4.5:1以上・1位の枠3:1以上（推奨・カード一覧・設定）', async () => {
  const { context, page } = await newPage();
  const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (const id of ['navy', 'blue', 'teal', 'terra', 'green']) {
    await page.getByRole('button', { name: '設定', exact: true }).click();
    await page.check(`#theme-${id}`);
    await page.waitForFunction((t) => document.documentElement.dataset.theme === t, id);
    assert.deepEqual(await lowContrast(page), [], `${id}：設定`);
    await page.getByRole('button', { name: 'おすすめ', exact: true }).click();
    await page.fill('#q', 'まくど');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.rank-1');
    await page.waitForTimeout(400);
    assert.deepEqual(await lowContrast(page), [], `${id}：推奨`);
    const border = await page.locator('.rank-1').evaluate((e) => getComputedStyle(e).borderTopColor);
    const ratio = (1.05) / (lum(border) + 0.05);
    assert.ok(ratio >= 3, `${id}：1位の枠 ${ratio.toFixed(2)}`);
    await page.screenshot({ path: `${SHOT}E17-${id}.png` });
    await page.getByRole('button', { name: 'カード', exact: true }).click();
    await page.click('#view-catalog');
    assert.deepEqual(await lowContrast(page), [], `${id}：カード一覧`);
  }
  await context.close();
});

await run('E18', 'カード一覧：カード会社の見出しが英字（アルファベット順）→日本語（あいうえお順）・同じ会社はまとまる', async () => {
  const { context, page } = await newPage({}, BASE, []);
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.waitForSelector('#catalog-list');
  const heads = await page.locator('.catalog-company').allInnerTexts();
  assert.deepEqual(heads.slice(0, 5), ['auフィナンシャルサービス', 'JCB', 'NTTドコモ', 'PayPayカード', 'アメリカン・エキスプレス']);
  assert.equal(heads.at(-1), '楽天カード');
  assert.equal(heads.length, new Set(heads).size, '会社の見出しは1回ずつ');
  const first = await page.locator('.catalog-item').first().innerText();
  assert.match(first, /au PAY カード/);
  await page.screenshot({ path: `${SHOT}E18-catalog-order.png` });
  await context.close();
});

// ---------- v1.15：見直すタブの年会費回収計算（分冊10.6） ----------
const MARRIOTT_OWNER = JSON.stringify({ app: 'card-advisor', exportedAt: '2026-09-01', settings: {
  schemaVersion: 1,
  ownedCards: [
    { cardId: 'rakuten', enabledMethods: ['card_physical', 'applepay_quicpay', 'smartphone_visa_touch', 'online'], priority: 1 },
    { cardId: 'marriott_premium', enabledMethods: ['card_physical', 'smartphone_visa_touch', 'applepay_quicpay', 'online'], priority: 2 },
    { cardId: 'ana_wide_gold', enabledMethods: ['card_physical', 'smartphone_visa_touch', 'applepay_id', 'online', 'paypay'], priority: 3 }],
  enabledNonCardRoutes: [], bonusGoals: [], staleWarnDays: 180 } });

await run('E19', '見直す：持っているカードの判定。月の利用額を5万→40万円にすると「回収できません」→「回収できています」、再読み込み後も残る', async () => {
  const { context, page } = await newPage({}, at('2026-09-22'), []);
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.fill('#paste', MARRIOTT_OWNER);
  await page.click('#paste-import');
  await page.locator('.toast', { hasText: '読み込みました' }).waitFor();
  for (const [q, t] of [['せぶん', 'セブン-イレブン'], ['まくどなるど', 'マクドナルド'], ['すたば', 'スターバックス'],
    ['ろーそんすりーえふ', 'ローソンスリーエフ'], ['ふぁみま', 'ファミリーマート']]) await pick(page, q, t);
  await page.getByRole('button', { name: 'カード診断', exact: true }).click();
  const mbp = page.locator('#fee-owned-marriott_premium');
  const ana = page.locator('#fee-owned-ana_wide_gold');
  // 普段は1行だけ。［変更］で入力欄を開く（A案）
  assert.match(await page.locator('#fee-spend-line').innerText(), /月50,000円のカード利用で計算しています/);
  assert.equal(await page.locator('#fee-spend').count(), 0);
  await page.click('#fee-spend-edit');
  assert.equal(await page.inputValue('#fee-spend'), '50000');
  assert.match(await mbp.locator('.fee-verdict').innerText(), /回収できません（年−70,500円）。月343,800円以上で回収/);
  await page.locator('#fee-detail-ana_wide_gold > summary').evaluate((el) => el.click());
  assert.match(await ana.locator('.review-lead').innerText(), /ほかのカードと同じか低い率/);
  assert.match(await ana.locator('.fee-verdict').innerText(), /回収できません（年−15,400円）/);
  await page.fill('#fee-spend', '400000');
  await page.locator('#fee-spend').dispatchEvent('change');
  await page.locator('#fee-owned-marriott_premium .fee-verdict', { hasText: '回収できています' }).waitFor();
  assert.match(await mbp.locator('.fee-verdict').innerText(), /年＋88,500円/);   // 96,000＋ボーナス75,000−82,500
  await page.click('#fee-spend-up');
  await page.waitForFunction(() => document.querySelector('#fee-spend')?.value === '410000');
  assert.deepEqual(await contrastIssues(page), []);
  await page.screenshot({ path: `${SHOT}E19-fee.png`, fullPage: true });
  await page.waitForTimeout(300);
  await goto(page, '2026-09-22');
  await page.getByRole('button', { name: 'カード診断', exact: true }).click();
  assert.match(await page.locator('#fee-spend-line').innerText(), /月410,000円/);
  await page.click('#fee-spend-edit');
  assert.equal(await page.inputValue('#fee-spend'), '410000');
  await context.close();
});

await run('E28', 'おすすめの切り替え：登録カード（22枚）で保有・未保有の印と公式サイトのリンク、注記。ヒント・ポイント払いは持っているカードで判定', async () => {
  const { context, page } = await setupRakutenOnly();
  await goto(page, '2026-09-22');                                // ③を出す日（同じ日は①を出さない）
  await page.locator('#promo-banner').waitFor();
  await goto(page, '2026-09-23');
  await pick(page, 'せぶん', 'セブン-イレブン');
  assert.equal(await page.getAttribute('#scope-owned', 'aria-selected'), 'true', '既定は持っているカード');
  await page.locator('#hint').waitFor();
  assert.equal(await page.locator('.own-mark').count(), 0);
  await page.click('#scope-all');
  await page.waitForSelector('#scope-note');
  assert.equal(await page.getAttribute('#scope-all', 'aria-selected'), 'true');
  assert.match(await page.locator('#scope-all').innerText(), /全22枚で比べる/);
  assert.match(await page.locator('#scope-owned').innerText(), /手持ちで比べる/);
  assert.equal(await page.locator('#hint').count(), 0, '登録カード表示ではヒントを出さない');
  assert.match(await rank1(page).locator('.rank-card').innerText(), /セブンカード・プラス/);
  assert.equal(await rank1(page).locator('.own-no').innerText(), '持っていない');
  const link = rank1(page).locator('.card-link');
  assert.equal(await link.innerText(), '公式サイトを見る');
  assert.match(await link.getAttribute('href'), /^https:\/\//);
  assert.equal(await rank1(page).locator('.pr').count(), 0, 'アフィリエイト未登録なのでPRなし');
  assert.match(await page.locator('#scope-note').innerText(), /主なカード22枚の中での比較です。日本のすべてのカードではありません/);
  assert.deepEqual(await contrastIssues(page), []);
  await page.screenshot({ path: `${SHOT}E28-scope-all.png`, fullPage: true });
  // 持っているカードに戻すと印・注記は消え、ヒントが出る
  await page.click('#scope-owned');
  await page.waitForSelector('#scope-note', { state: 'detached' });
  assert.equal(await page.locator('.own-mark').count(), 0);
  await page.locator('#hint').waitFor();
  // ポイント払いは切り替えても同じ（持っているカードの1位で判定）。保有カードに印・リンクなし
  const ppText = async () => (await page.locator('.pointpay').count() ? page.locator('.pointpay').innerText() : null);
  for (const [q, t] of [['ふぁみま', 'ファミリーマート'], ['まくどなるど', 'マクドナルド']]) {
    await page.click('#scope-owned');
    await pick(page, q, t);
    const pp = await ppText();
    await page.click('#scope-all');
    await page.waitForSelector('#scope-note');
    assert.equal(await ppText(), pp, `${t}：ポイント払いは持っているカードで判定`);
    const ownedRows = page.locator('.rank', { has: page.locator('.own-yes') });
    assert.equal(await ownedRows.locator('.card-link').count(), 0, '保有カードにはリンクを出さない');
  }
  await context.close();
});

await run('E29', '見直す：提案カードも年会費のある保有カードもないときは利用額を出さない→お店を調べて提案が出ると1行で出す', async () => {
  const { context, page } = await newPage({}, at('2026-09-22'), ['rakuten']);
  await page.getByRole('button', { name: 'カード診断', exact: true }).click();
  await page.waitForSelector('#review-empty');
  assert.equal(await page.locator('#fee-spend-line').count(), 0);
  assert.equal(await page.locator('#fee-spend-panel').count(), 0);
  for (const [q, t] of [['せぶん', 'セブン-イレブン'], ['まくどなるど', 'マクドナルド'], ['すたば', 'スターバックス'],
    ['ろーそんすりーえふ', 'ローソンスリーエフ'], ['ふぁみま', 'ファミリーマート']]) await pick(page, q, t);
  await page.getByRole('button', { name: 'カード診断', exact: true }).click();
  await page.waitForSelector('#fee-gain-head');
  assert.match(await page.locator('#fee-spend-line').innerText(), /月50,000円のカード利用で計算しています/);
  await page.click('#fee-spend-edit');
  await page.waitForSelector('#fee-spend');
  await page.click('#fee-spend-close');
  await page.waitForSelector('#fee-spend-line');
  await context.close();
});

await run('E30', 'お店を選ぶと結果の位置まで自動で移動する（最近使ったお店が多いとき）', async () => {
  const { context, page } = await setupRakutenOnly();
  await goto(page, '2026-09-02');
  await page.locator('.chip', { hasText: 'マクドナルド' }).click();
  await page.waitForSelector('.rank-1');
  await page.waitForFunction(() => {
    const r = document.getElementById('result')?.getBoundingClientRect();
    return !!r && window.scrollY > 0 && r.top >= 0 && r.top < 160;
  }, null, { timeout: 5000 });
  await context.close();
});

await run('E31', 'カードのポイント率（S11）：カードタブ・カード一覧・おすすめの詳しい条件から開き、戻ると元の画面', async () => {
  const { context, page } = await newPage();
  // カードタブ（持っているカード）から
  await page.getByRole('button', { name: 'カード', exact: true }).click();
  await page.click('#view-owned');
  await page.click('#rate-smbc_gold_nl');
  await page.locator('h1', { hasText: '三井住友カード ゴールド（NL）' }).waitFor();
  assert.match(await page.locator('#rate-routes').innerText(), /スマホのタッチ決済/);
  assert.match(await page.locator('#rate-routes').innerText(), /特約 \d+店舗（7%）/);
  assert.match(await page.locator('#rate-bonus').innerText(), /＋1%として計算/);
  assert.equal(await page.locator('.tab.active .tab-label').innerText(), 'カード');
  assert.deepEqual(await contrastIssues(page), []);
  await page.screenshot({ path: `${SHOT}E31-card-rate.png`, fullPage: true });
  await page.click('#rate-back');
  await page.locator('#view-owned.active').waitFor();
  // カード一覧（持っていないカード）から
  await page.click('#view-catalog');
  await page.click('#catalog-rate-recruit');
  await page.locator('h1', { hasText: 'リクルートカード' }).waitFor();
  assert.equal(await page.locator('#rate-bonus').count(), 0, 'ボーナスのないカード');
  await page.click('#rate-back');
  await page.locator('#catalog-list').waitFor();
  // おすすめの詳しい条件から → 戻るとおすすめ
  await pick(page, 'せぶん', 'セブン-イレブン');
  await page.click('#rank-detail > summary');
  await page.click('#rank-rate-link');
  await page.locator('#rate-routes').waitFor();
  assert.equal(await page.locator('.tab.active .tab-label').innerText(), 'おすすめ');
  await page.click('#rate-back');
  await page.locator('.result-title', { hasText: 'セブン-イレブン' }).waitFor();
  await context.close();
});

// ---------- v1.15：近くのお店（詳細設計 27.7） ----------
const ORIGIN = { latitude: 35.3383, longitude: 139.4476 };
const GEO = { geolocation: { ...ORIGIN, accuracy: 20 }, permissions: ['geolocation'] };
const OVERPASS_JSON = { elements: [
  { type: 'node', id: 1, lat: 35.3383, lon: 139.4476, tags: { shop: 'convenience', name: 'ファミリーマート 辻堂駅前店', brand: 'ファミリーマート', branch: '辻堂駅前店' } },
  { type: 'node', id: 2, lat: 35.3388, lon: 139.4476, tags: { shop: 'convenience', name: 'セブン-イレブン 辻堂駅北口店', 'brand:wikidata': 'Q259340' } },
  { type: 'way', id: 3, center: { lat: 35.3393, lon: 139.4476 }, tags: { amenity: 'cafe', name: 'スターバックス' } },
  { type: 'node', id: 4, lat: 35.3385, lon: 139.4476, tags: { amenity: 'cafe', name: '喫茶ひまわり' } },
  { type: 'node', id: 5, lat: 35.3423, lon: 139.4476, tags: { shop: 'convenience', name: 'ローソン 辻堂元町店' } },
] };

async function mockOverpass(context, body = OVERPASS_JSON, status = 200) {
  const calls = [];
  await context.route('https://overpass-api.de/**', (route) => {
    calls.push(route.request().postData() ?? '');
    return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  return calls;
}

await run('E21', '近くのお店：初回の同意→距離順の一覧（未登録・半径外は出ない、出典）→セブンをタップで推奨', async () => {
  const { context, page } = await newPage(GEO, at('2026-09-22'));
  const calls = await mockOverpass(context);
  await page.click('#nearby-btn');
  await page.locator('#nearby-consent-panel').waitFor();
  assert.match(await page.locator('#nearby-consent-panel').innerText(), /OpenStreetMapのサーバに送って/);
  assert.equal(calls.length, 0, '同意前は送らない');
  await page.click('#nearby-consent');
  await page.locator('.nearby-item').first().waitFor();
  const labels = await page.locator('.nearby-item span').allInnerTexts();
  assert.deepEqual(labels, ['ファミリーマート 辻堂駅前店', 'セブン-イレブン 辻堂駅北口店', 'スターバックス']);
  assert.deepEqual(await page.locator('.nearby-dist').allInnerTexts(), ['約0m', '約56m', '約111m']);
  assert.equal(await page.locator('.nearby-item .tag').count(), 0, 'ポイント率のタグは出さない');
  assert.match(await page.locator('#nearby-summary').innerText(), /半径300m・3件/);
  assert.match(await page.locator('#nearby-credit').innerText(), /© OpenStreetMap contributors/);
  assert.match(calls[0], /around%3A300%2C35\.3383%2C139\.4476/);
  assert.deepEqual(await contrastIssues(page), []);
  await page.screenshot({ path: `${SHOT}E21-nearby.png`, fullPage: true });
  await page.locator('.nearby-item', { hasText: 'セブン-イレブン' }).click();
  await page.locator('.result-title', { hasText: 'セブン-イレブン' }).waitFor();
  await page.fill('#q', '');
  assert.match(await page.locator('#suggest').innerText(), /セブン-イレブン/);      // 最近使った店に追加
  await context.close();
});

await run('E22', '2回目は同意を聞かず、5分以内・同じ場所なら問い合わせない', async () => {
  const { context, page } = await newPage(GEO, at('2026-09-22'), []);
  const calls = await mockOverpass(context);
  await page.click('#nearby-btn');
  await page.click('#nearby-consent');
  await page.locator('.nearby-item').first().waitFor();
  await page.click('#nearby-by-name');
  await page.click('#nearby-btn');
  await page.locator('.nearby-item').first().waitFor();
  assert.equal(await page.locator('#nearby-consent-panel').count(), 0);
  assert.equal(calls.length, 1);
  await context.close();
});

await run('E23', '0件→「半径を広げる」で500mの問い合わせ', async () => {
  const { context, page } = await newPage(GEO, at('2026-09-22'), []);
  const calls = await mockOverpass(context, { elements: [] });
  await page.click('#nearby-btn');
  await page.click('#nearby-consent');
  await page.locator('#nearby-empty').waitFor();
  await page.click('#nearby-wider');
  await page.locator('#nearby-summary', { hasText: '半径500m' }).waitFor();
  assert.match(calls[1], /around%3A500/);
  await context.close();
});

await run('E24', '位置情報の許可なし→案内と「名前で探す」', async () => {
  const { context, page } = await newPage({}, at('2026-09-22'), []);
  await mockOverpass(context);
  await page.click('#nearby-btn');
  await page.click('#nearby-consent');
  await page.locator('#nearby-error[data-kind="denied"]').waitFor();
  assert.match(await page.locator('#nearby-error').innerText(), /位置情報の利用が許可されていません/);
  await page.click('#nearby-by-name');
  await page.locator('.search-input').waitFor();
  await context.close();
});

await run('E25', 'サーバエラー→再試行で成功。オフライン→ネット接続が必要', async () => {
  const { context, page } = await newPage(GEO, at('2026-09-22'), []);
  let fail = true;
  await context.route('https://overpass-api.de/**', (route) => (fail
    ? route.fulfill({ status: 504, body: 'timeout', headers: { 'access-control-allow-origin': '*' } })
    : route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(OVERPASS_JSON) })));
  await page.click('#nearby-btn');
  await page.click('#nearby-consent');
  await page.locator('#nearby-error[data-kind="server"]').waitFor();
  fail = false;
  await page.click('#nearby-retry');
  await page.locator('.nearby-item').first().waitFor();
  await page.click('#nearby-by-name');
  await context.setOffline(true);
  await page.click('#nearby-btn');
  await page.locator('#nearby-error[data-kind="offline"]').waitFor();
  await context.setOffline(false);
  await context.close();
});

await run('E26', '設定にYahoo!ローカルサーチの項目を出さない（連携は見送り中）。検索は OpenStreetMap', async () => {
  const { context, page } = await newPage(GEO, at('2026-09-22'), []);
  await mockOverpass(context);
  await page.getByRole('button', { name: '設定', exact: true }).click();
  if (!(await page.isVisible('#nearby-radius'))) await page.click('#nearby-advanced > summary');
  assert.equal(await page.locator('#nearby-provider-yolp').count(), 0);
  assert.equal(await page.locator('#yolp-appid').count(), 0);
  assert.doesNotMatch(await page.locator('#nearby-settings').innerText(), /Yahoo/);
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click();
  await page.click('#nearby-btn');
  await page.locator('#nearby-consent-panel', { hasText: 'OpenStreetMap' }).waitFor();
  await page.click('#nearby-consent');
  await page.locator('.nearby-item').first().waitFor();
  assert.match(await page.locator('#nearby-credit').innerText(), /OpenStreetMap/);
  await context.close();
});

await run('E27', '設定でオフ→ホームに「近く」ボタンが出ない', async () => {
  const { context, page } = await newPage(GEO, at('2026-09-22'), []);
  assert.equal(await page.locator('#nearby-btn').count(), 1);
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.uncheck('#nearby-enabled');
  await page.getByRole('button', { name: 'おすすめ', exact: true }).click();
  assert.equal(await page.locator('#nearby-btn').count(), 0);
  await context.close();
});

await browser.close();
server.close();
console.log(results.join('\n'));
if (errors.length) console.log('ブラウザのエラー:\n  ' + [...new Set(errors)].join('\n  '));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
