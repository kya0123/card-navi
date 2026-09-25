# カード払いナビ（クレカ使用判断アプリ）

お店の名前を入れると、保有カードと支払い方法の組み合わせのうち「年間でいちばんお得な払い方」を表示するPWAです。サーバ不要・オフラインで動作します（「近くのお店」を使うときだけ、丸めた現在地を OpenStreetMap または Yahoo!ローカルサーチに送ります）。

## 使い方（スマホ）

1. `dist/` フォルダの中身（7ファイル・サブフォルダなし）を静的ホスティング（GitHub Pages など、HTTPSが必要）に置く。スマホのブラウザからGitHubの「Upload files」でまとめて選べる
2. スマホのブラウザで開き、「ホーム画面に追加」
3. 一度開けば、以後は機内モードでも使えます

初回に「カード」タブの「カード一覧から選ぶ」で持っているカードにチェックを入れ、入会年月を設定してください。年間ボーナスを狙うかは「ボーナス」タブで設定します。おすすめは、選んだカードの中からだけ表示します。配色は「設定」タブで5つから選べます。

## 開発

| コマンド | 内容 |
|---|---|
| `npm run typecheck` | 型チェック（tsc） |
| `npm test` | 単体テスト＋ゴールデンテスト（node:test、tsx） |
| `npm run icons` | アイコン生成（sharp） |
| `npm run build` | `dist/`（PWA）と `dist-artifact/`（プレビュー用単一HTML）を生成。`affiliates.json` にエラーがあれば止まる |
| `npm run e2e` | Playwright によるE2E・オフライン試験（先に build） |
| `npm run check-links` | アフィリエイトリンクの確認（各URLへのアクセスを含む） |

### 構成

```
src/data/rules.json       還元ルールマスタ（master/build_master.py で生成）
src/data/affiliates.json  アフィリエイトリンク（公開まで空。収益化設計書 10章の手順で登録）
src/domain/               推奨エンジン・カード一覧（catalog）・配色（theme）・カード提案と年会費の損得（simulate/promo/affiliate）・近くのお店（nearby）などUI非依存の純粋関数
src/storage/              IndexedDB・設定の保存
src/ui/                   画面（依存なしの小さなJSXランタイム h.ts）。nearbyService.ts は位置情報と周辺店舗の問い合わせ
scripts/                  ビルド・アイコン生成・簡易サーバ・リンク確認
tests/                    単体・ゴールデン・E2E（`ONLY=E21,E22 npm run e2e` で一部だけ実行）
```

### 還元ルールの更新手順

1. `master/build_master.py` を編集して `python3 build_master.py`（整合性チェックつき）
2. 生成された `rules.json` を `src/data/` にコピー
3. `master/ref_engine.py` でゴールデンケースを再生成し `tests/golden/` にコピー
4. `npm test && npm run build && npm run e2e`
5. `dist/` を再デプロイ → アプリに「新しいバージョンがあります」が表示される

### カードの提案（見直す・ヒント・バナー）

- 設計：`design/monetization_design.md`、`design/detailed_design_card_suggest.md`
- 使い始めて14日間は、おすすめ画面のヒント・バナーを出さない。E2Eでは `?today=YYYY-MM-DD` で日付を進めて確認する
- 設定画面の「カードの提案」でオフにできる。「見直す」タブはいつでも開ける
