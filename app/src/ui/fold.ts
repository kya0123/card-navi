/** 折りたたみ（details）の開閉を再描画をまたいで保つ（詳細設計 31.2）。画面を開き直すまで覚えておく */
const opened = new Set<string>();

export function foldProps(key: string, defaultOpen = false): { open: boolean; onToggle: (e: Event) => void } {
  return {
    open: opened.has(key) || defaultOpen,
    onToggle: (e: Event) => {
      if ((e.target as HTMLDetailsElement).open) opened.add(key); else opened.delete(key);
    },
  };
}
