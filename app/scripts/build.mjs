// ビルド：esbuildでバンドルし、HTMLにインライン化。Service Worker と manifest を生成する。
// 使い方: node scripts/build.mjs
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const globalMods = '/home/claude/.npm-global/lib/node_modules';
const esbuild = require(`${globalMods}/tsx/node_modules/esbuild`);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const rules = JSON.parse(readFileSync(join(root, 'src/data/rules.json'), 'utf8'));

// アフィリエイトリンクの検証（エラーならビルドを止める）
const { checkAffiliates, localToday } = await import('./check_affiliates.mjs');
const affCheck = checkAffiliates(JSON.parse(readFileSync(join(root, 'src/data/affiliates.json'), 'utf8')), rules, localToday());
for (const w of affCheck.warnings) console.warn(`affiliates 警告: ${w}`);
if (affCheck.errors.length) {
  console.error(`affiliates.json にエラーがあります:\n  ${affCheck.errors.join('\n  ')}`);
  process.exit(1);
}

async function bundle(enableSW, version) {
  const r = await esbuild.build({
    entryPoints: [join(root, 'src/ui/main.ts')],
    bundle: true, minify: true, write: false, format: 'iife', target: 'es2020',
    jsxFactory: 'h', jsxFragment: 'Fragment',
    define: { __ENABLE_SW__: String(enableSW), __ENABLE_DOWNLOAD__: String(enableSW), __APP_VERSION__: JSON.stringify(version) },
    legalComments: 'none',
  });
  return r.outputFiles[0].text;
}

const css = (await esbuild.transform(readFileSync(join(root, 'src/ui/style.css'), 'utf8'), { loader: 'css', minify: true })).code;
const probe = await bundle(true, 'x');
const hash = createHash('sha256').update(probe + css).digest('hex').slice(0, 8);
const version = `${pkg.version}+${rules.masterVersion}.${hash}`;
const TITLE = 'カード払いナビ';
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');

// ---- PWA（静的ホスティング用） ----
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
// スマホからのアップロードでもフォルダを作らずに済むよう、全ファイルをdist直下に置く
const js = await bundle(true, version);
writeFileSync(join(dist, 'index.html'), `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="お店を入力すると、年間でいちばんお得なカードと支払い方法を表示します">
<meta name="theme-color" content="#1f3a68">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${TITLE}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icon-192.png">
<link rel="apple-touch-icon" href="./apple-touch-icon.png">
<style>:root{padding-top:env(safe-area-inset-top,0px)}${css}</style>
</head>
<body>
<div id="root"></div>
<script>${esc(js)}</script>
</body>
</html>
`);
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: TITLE, short_name: TITLE, lang: 'ja', start_url: './', scope: './', display: 'standalone',
  background_color: '#f6f4ef', theme_color: '#1f3a68',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));
for (const f of ['icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png'])
  copyFileSync(join(root, 'public/icons', f), join(dist, f));

const precache = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png'];
writeFileSync(join(dist, 'sw.js'), `// 自動生成（scripts/build.mjs）
const CACHE = 'card-advisor-${hash}';
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('card-advisor-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
`);

// ---- Artifact（プレビュー公開用：単一HTML、Service Workerなし） ----
const art = join(root, 'dist-artifact');
rmSync(art, { recursive: true, force: true });
mkdirSync(art, { recursive: true });
const jsArt = await bundle(false, version);
writeFileSync(join(art, 'card-navi.html'), `<title>${TITLE}</title>
<style>${css}</style>
<div id="root"></div>
<script>${esc(jsArt)}</script>
`);

console.log(`built ${version}  index.html=${(readFileSync(join(dist, 'index.html')).length / 1024).toFixed(1)}KB`);
