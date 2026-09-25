// アフィリエイトリンクの確認（収益化設計書 10.5・詳細設計書（カード提案機能）6章）
// 使い方: node scripts/check_affiliates.mjs            … オフラインのチェック
//         node scripts/check_affiliates.mjs --online   … 各URLへのアクセスも確認
// build.mjs からはオフラインのチェックだけを呼ぶ（エラーならビルド失敗）
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DAY = 86400000;
const toUTC = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const days = (from, to) => Math.round((toUTC(to) - toUTC(from)) / DAY);
const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toUTC(s));

export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** オフラインのチェック。{ errors, warnings } を返す */
export function checkAffiliates(aff, rules, today) {
  const errors = [];
  const warnings = [];
  const cards = new Set(rules.cards.map((c) => c.id));
  if (aff.schemaVersion !== 1) errors.push('schemaVersionが1ではありません');
  if (!Array.isArray(aff.links)) return { errors: [...errors, 'linksが配列ではありません'], warnings };
  aff.links.forEach((l, i) => {
    const at = `links[${i}]（${l.cardId}）`;
    if (!cards.has(l.cardId)) errors.push(`${at}: cardIdがマスタにありません`);
    if (typeof l.url !== 'string' || !l.url.startsWith('https://')) errors.push(`${at}: URLがhttpsではありません`);
    if (l.label !== 'PR') errors.push(`${at}: labelはPRにしてください`);
    if (l.validFrom != null && !isYMD(l.validFrom)) errors.push(`${at}: validFromが日付ではありません`);
    if (l.validTo != null && !isYMD(l.validTo)) errors.push(`${at}: validToが日付ではありません`);
    if (!isYMD(l.checkedAt)) errors.push(`${at}: checkedAtが日付ではありません`);
    if (isYMD(l.validTo ?? '')) {
      const left = days(today, l.validTo);
      if (left < 0) warnings.push(`${at}: 期限切れ（${l.validTo}）。アプリでは公式サイトのリンクに切り替わります`);
      else if (left <= 14) warnings.push(`${at}: 期限まで${left}日（${l.validTo}）。更新の準備をしてください`);
    }
    if (isYMD(l.checkedAt) && days(l.checkedAt, today) >= 90)
      warnings.push(`${at}: 確認日（${l.checkedAt}）から${days(l.checkedAt, today)}日経過。ASPの管理画面で掲載状況を確認してください`);
  });
  return { errors, warnings };
}

/** オンラインのチェック：リダイレクト後の応答が4xx/5xxなら警告 */
export async function checkOnline(aff) {
  const warnings = [];
  for (const l of aff.links ?? []) {
    try {
      const res = await fetch(l.url, { method: 'GET', redirect: 'follow' });
      if (res.status >= 400) warnings.push(`${l.cardId}: ${l.url} が ${res.status} を返しました（案件終了の可能性）`);
    } catch (e) {
      warnings.push(`${l.cardId}: ${l.url} に接続できません（${e.message}）`);
    }
  }
  return warnings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const aff = JSON.parse(readFileSync(join(root, 'src/data/affiliates.json'), 'utf8'));
  const rules = JSON.parse(readFileSync(join(root, 'src/data/rules.json'), 'utf8'));
  const today = process.env.TODAY ?? localToday();
  const { errors, warnings } = checkAffiliates(aff, rules, today);
  if (process.argv.includes('--online')) warnings.push(...await checkOnline(aff));
  for (const e of errors) console.log(`エラー: ${e}`);
  for (const w of warnings) console.log(`警告: ${w}`);
  console.log(`リンク${aff.links?.length ?? 0}件：エラー${errors.length}件・警告${warnings.length}件`);
  process.exit(errors.length ? 1 : 0);
}
