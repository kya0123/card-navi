// アプリアイコンをSVGから生成する（sharp使用）
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require('/home/claude/.npm-global/lib/node_modules/sharp');
const out = join(dirname(fileURLToPath(import.meta.url)), '../public/icons');

// カードを2枚重ねて、手前のカードにチェックマーク
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1f3a68"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
    <rect x="128" y="120" width="300" height="190" rx="26" fill="#c9a227" transform="rotate(-10 278 215)"/>
    <rect x="84" y="200" width="320" height="200" rx="28" fill="#ffffff"/>
    <rect x="84" y="244" width="320" height="34" fill="#1f3a68" opacity=".18"/>
    <path d="M150 336 l34 34 l70 -76" fill="none" stroke="#1f3a68" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

await sharp(Buffer.from(svg(0))).resize(512, 512).png().toFile(join(out, 'icon-512.png'));
await sharp(Buffer.from(svg(0))).resize(192, 192).png().toFile(join(out, 'icon-192.png'));
await sharp(Buffer.from(svg(0))).resize(180, 180).png().toFile(join(out, 'apple-touch-icon.png'));
await sharp(Buffer.from(svg(56))).resize(512, 512).png().toFile(join(out, 'icon-512-maskable.png'));
console.log('icons generated');
