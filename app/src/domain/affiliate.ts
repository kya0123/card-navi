import { cmpYMD, isValidYMD } from './date';
import type { MasterIndex } from './master';
import type { Id, YMD } from './types';

/** アフィリエイトリンク（詳細設計書（カード提案機能）5章）。還元ルールとは別ファイルで管理する */

export interface AffiliateLink {
  cardId: Id;
  url: string;
  asp: string;
  label: 'PR';
  validFrom: YMD | null;
  validTo: YMD | null;
  checkedAt: YMD;
}

export interface AffiliateMaster { schemaVersion: 1; version: string; links: AffiliateLink[] }

export interface CardLink { url: string; pr: boolean }

const inPeriod = (l: AffiliateLink, today: YMD) =>
  (l.validFrom == null || cmpYMD(l.validFrom, today) <= 0) && (l.validTo == null || cmpYMD(today, l.validTo) <= 0);

/** 期間内のアフィリエイトリンク（PR）→ 公式サイト → なし の順 */
export function linkFor(mi: MasterIndex, aff: AffiliateMaster, cardId: Id, today: YMD): CardLink | null {
  const l = aff.links.find((x) => x.cardId === cardId && inPeriod(x, today));
  if (l) return { url: l.url, pr: true };
  const official = mi.cards.get(cardId)?.officialUrl;
  return official ? { url: official, pr: false } : null;
}

export function validateAffiliates(mi: MasterIndex, aff: AffiliateMaster): string[] {
  const errs: string[] = [];
  if (aff.schemaVersion !== 1) errs.push('affiliates: schemaVersionが1ではない');
  if (!Array.isArray(aff.links)) return [...errs, 'affiliates: linksが配列ではない'];
  aff.links.forEach((l, i) => {
    const at = `affiliates[${i}]`;
    if (!mi.cards.has(l.cardId)) errs.push(`${at}: cardId ${l.cardId} がマスタにない`);
    if (typeof l.url !== 'string' || !l.url.startsWith('https://')) errs.push(`${at}: URLがhttpsでない`);
    if (l.label !== 'PR') errs.push(`${at}: labelはPRにする`);
    for (const k of ['validFrom', 'validTo'] as const) if (l[k] != null && !isValidYMD(l[k]!)) errs.push(`${at}: ${k}が日付でない`);
    if (!isValidYMD(l.checkedAt)) errs.push(`${at}: checkedAtが日付でない`);
  });
  return errs;
}
