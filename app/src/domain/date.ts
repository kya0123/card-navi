import type { YM, YMD } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toYMD(d: Date): YMD {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayYMD(): YMD {
  return toYMD(new Date());
}

export function parseYMD(s: YMD): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function parseYM(s: YM): { y: number; m: number } {
  const [y, m] = s.split('-').map(Number);
  return { y, m };
}

export function isValidYM(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function isValidYMD(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseYMD(s);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 年月にnか月加算 */
export function addMonths(y: number, m: number, n: number): { y: number; m: number } {
  const t = y * 12 + (m - 1) + n;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
}

export function ymd(y: number, m: number, d: number): YMD {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** 指定月の末日 */
export function lastDayOfMonth(y: number, m: number): YMD {
  const d = new Date(y, m, 0).getDate();
  return ymd(y, m, d);
}

/** 文字列比較で日付の大小を判定できる（ゼロ埋め前提） */
export function cmpYMD(a: YMD, b: YMD): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function daysBetween(from: YMD, to: YMD): number {
  const a = parseYMD(from), b = parseYMD(to);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86400000);
}
