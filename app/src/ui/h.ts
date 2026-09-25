/** 依存ライブラリなしの小さなJSXランタイム（DOMを直接生成する） */
export type Child = Node | string | number | boolean | null | undefined | Child[];
type Props = Record<string, unknown> | null;

const BOOL_PROPS = new Set(['checked', 'disabled', 'selected', 'hidden', 'open', 'multiple', 'readOnly']);

function append(parent: Node, c: Child): void {
  if (c == null || c === false || c === true) return;
  if (Array.isArray(c)) { c.forEach((x) => append(parent, x)); return; }
  parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
}

export function h(tag: string | ((p: Record<string, unknown>) => Node), props: Props, ...children: Child[]): Node {
  if (typeof tag === 'function') return tag({ ...(props ?? {}), children });
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false && !BOOL_PROPS.has(k)) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class' || k === 'className') {
      el.className = String(v);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (k === 'value' || BOOL_PROPS.has(k)) {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else if (k === 'ref' && typeof v === 'function') {
      (v as (e: HTMLElement) => void)(el);
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function Fragment(props: { children?: Child[] }): Node {
  const f = document.createDocumentFragment();
  append(f, props.children ?? []);
  return f;
}

export function mount(target: Element, node: Child): void {
  target.replaceChildren();
  append(target, node);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    type Element = Node;
    interface IntrinsicElements { [tag: string]: Record<string, unknown> }
  }
}
