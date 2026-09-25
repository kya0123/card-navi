import type { ThemeId } from './types';

/** 配色（詳細設計 23.2）。全案で白文字／キー色 6.1:1 以上、キー色／地色 5.6:1 以上 */
export interface Theme { id: ThemeId; name: string; key: string; accent: string; sub: string; note?: string }

export const THEMES: Theme[] = [
  { id: 'navy', name: 'ネイビー×ゴールド', key: '#1f3a68', accent: '#c9a227', sub: '#c9a227' },
  { id: 'blue', name: 'ブルー', key: '#0017c1', accent: '#0017c1', sub: '#c5d7fb' },
  { id: 'teal', name: 'ティール', key: '#006b73', accent: '#006b73', sub: '#b3dcdf' },
  { id: 'terra', name: 'テラコッタ', key: '#a8400e', accent: '#a8400e', sub: '#f5c8b0', note: 'エラー表示（赤）と色が近くなります' },
  { id: 'green', name: 'フォレストグリーン', key: '#1b6843', accent: '#1b6843', sub: '#b7dcc3', note: '達成表示（緑）と色が近くなります' },
];

export function isThemeId(x: unknown): x is ThemeId {
  return typeof x === 'string' && THEMES.some((t) => t.id === x);
}

/** 未設定・未知の値は既定（navy） */
export function themeOf(id: unknown): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
