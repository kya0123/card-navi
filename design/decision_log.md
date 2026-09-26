# 開発経緯・決定事項ログ

このプロジェクトでのやり取り（2026-09-22〜24）の要点を、後から参照できるようにまとめたもの。詳細は各設計書・レポートを参照。

## 1. 経緯

| 日付 | 内容 | 主な成果物 |
|---|---|---|
| 09-22 | 要件方針を批判的にレビューし、要検討事項12件を洗い出し | — |
| 09-22 | 決定事項を反映して基本設計書 v1.1〜1.4 を作成 | `design/basic_design.md` |
| 09-22 | 還元ルールを公開情報から収集し、ルールマスタ初版を作成 | `master/rules.json`、`master/collection_report.md` |
| 09-22 | 詳細設計書を作成。Python参照実装でゴールデンケースを生成 | `design/detailed_design.md`、`master/ref_engine.py`、`master/golden_cases.json` |
| 09-22 | PWAを実装（TypeScript）。単体・ゴールデン・E2Eテスト | `app/`、`design/test_report.md` |
| 09-22 | 画面デザインをデジタル庁デザインシステム準拠に変更 | `app/src/ui/style.css` |
| 09-23 | 三井住友・三菱UFJの7%対象チェーンを公式ページから全件反映（店舗99・特約143） | `master/rules.json` |
| 09-23 | PayPayカード ゴールドを追加 | `master/rules.json` |
| 09-23 | 公開用ファイルをフォルダなしの7ファイルに変更。GitHub Actionsでzipを展開して公開する手順を案内 | `app/scripts/build.mjs` |
| 09-23 | カテゴリ選択後に店舗一覧から選べるように変更（高還元ラベル付き） | `app/src/ui/screens/category.tsx` |
| 09-24 | マネタイズ方法を調査し、収益化設計書（案）を作成。クレカ発行のアフィリエイトを主軸、攻略記事を集客手段とする方針 | `design/monetization_design.md` |
| 09-24 | カード追加シミュレーターの見せ方と表示タイミングを検討。モック3画面を作成し、収益化設計書を v0.2 に更新 | `design/monetization_design.md`、デザインキャンバス「カード追加シミュレーター モック」 |
| 09-24 | アフィリエイトリンクの運用手順を追記（収益化設計書 v0.3） | `design/monetization_design.md` |
| 09-24 | カード提案機能を実装（①ヒント・②見直す画面・③バナー・広告の方針・設定ON/OFF・affiliates.json・リンク確認スクリプト）。カードに公式サイトURLを追加 | `design/detailed_design_card_suggest.md`、`app/`、`master/` |
| 09-24 | 設計書を改訂内容に合わせて整理。基本設計書を v1.5 として復元・改訂、詳細設計書を v1.6（分冊への参照・変更履歴）に更新。全テストを再実行し、プレビュー版を再公開 | `design/basic_design.md`、`design/detailed_design.md` |
| 09-23〜24 | ※以下は別の会話で並行して実施（v1.5から分岐）→ 09-24 に統合。詳細設計書の版数は統合時に 1.7〜1.12 へ振り直し | — |
| 09-23 | 定番＋マニア推奨のカード一覧（19枚）を追加し、保有カードを一覧から選ぶ方式に変更（詳細設計 v1.7） | `master/rules.json`、`app/src/domain/catalog.ts`、`app/src/ui/screens/cards.tsx` |
| 09-23 | マリオット ボンヴォイ アメックス（プレミアム・通常）を追加（21枚。v1.8） | `master/rules.json` |
| 09-23 | 5案を比較し、配色をネイビー×ゴールド（C案）に変更（v1.9） | `app/src/ui/style.css`、アイコン |
| 09-24 | 5案を設定画面で選べるように変更（既定はネイビー×ゴールド。v1.10） | `app/src/domain/theme.ts`、`app/src/ui/screens/settings.tsx` |
| 09-24 | カード一覧・還元情報をカード会社順に（英字をアルファベット順→日本語をあいうえお順。v1.11〜1.12） | `app/src/domain/catalog.ts` |
| 09-24 | 2系統を統合（詳細設計 v1.13、基本設計 v1.6、ルール版 2026.09.24-2）。提案の候補を21枚に拡大、全カードに公式サイトURL | 全体 |
| 09-26 | ソース一式を GitHub リポジトリ（kya0123/card-navi）に移し、`app/dist/` を GitHub Pages に公開。ビルド・テストの依存を package.json に登録 | リポジトリ全体、`.github/workflows/deploy.yml` |
| 09-26 | 全画面のUIレビューを行い、見直し方針を決定（詳細設計 v1.19・31章、画面案 `design/mockups/`）。実装は画面案の確認後 | `design/detailed_design.md` |
| 09-26 | おすすめの比較範囲の切り替え（持っているカード／登録カード22枚、保有0枚は登録カード全体）、区分名「ポイ活向け」、見直すタブの利用額を1行表示に（詳細設計 v1.18、分冊 v1.3、基本設計 v1.11） | `app/src/domain/engine.ts`、`app/src/ui/screens/home.tsx`・`review.tsx`・`cards.tsx` |

## 2. 利用者の決定事項

### 要件
- 年間ボーナスは「狙う／狙わない」をカードごとのチェックボックスで設定。期限は**入会月基準**で自動計算し、表示・保持する
- 評価するのは**還元率と年間達成ボーナスまで**（キャンペーン・期間限定ポイント・マイル換算・月間上限は考慮しない）
- 店舗を入力すると、**カード＋支払い方法**を出力する
- ポイント払いは、1位が通常還元率どまりのときに「ポイント払いがおすすめ」と表示するだけのシンプルな機能
- キャンペーン情報は保持しない
- **オフラインで動作**させる（PWA・サーバなし）
- 利用明細は取り込まない。カード番号（下4桁も）は保持しない

### ルールデータ
- 三菱UFJポイント＝グローバルポイント（1pt＝5円相当）
- ANAマイル移行用ポイントは1pt＝1円（0.5%）で評価
- Suicaでの買い物は対象外（モバイルSuicaはJR東日本の乗車のみ）
- 「Yahoo!ゴールドカード」＝PayPayカード ゴールドとして登録
- Marriott Bonvoyポイントはホテル宿泊に使う前提で1pt＝1円で評価。無料宿泊特典もポイント上限×1円（2026-09-23）
- 条件付きの上乗せ（PayPayステップ、エポスの選べるポイントアップショップ等）は含めない

### 画面
- カテゴリを選んだあとは、そのカテゴリの店舗一覧から選べるようにする
- 世間一般で使われているカード（定番）とマニア界隈でお得とされるカード（マニア推奨）を一覧化し、保有カードをアプリ上で選ぶ。推奨は保有カードからのみ
- （09-26 変更）区分名「マニア推奨」を「ポイ活向け」に変更
- （09-26 変更）保有カードが0枚のときは登録カード（22枚）全体でおすすめする。選んだ後は結果の上で「持っているカード｜登録カード（22枚）」を切り替えられる（既定は持っているカード）。登録カード表示では「保有」「未保有」の印、未保有カードに公式サイトへのリンク（アフィリエイトなら「PR」）、結果の下に「アプリに登録している主なカード22枚の中での比較です。日本のすべてのカードではありません」の注記。未保有カードの提案ヒント（①）は出さず、ボーナスの加算とポイント払いの提案は持っているカードだけで判定する
- （09-26 決定・未実装）UIの見直し（詳細設計31章）：近くのお店のタグはすべて外す／タブは4つ（おすすめ／カード／カード診断／設定）。ボーナスタブを廃止し、「狙う」「今期は達成済み」はカードタブ、達成に向けた計算はカード診断タブ（「見直す」を改名）、入力欄は折りたたみ。ポイント率タブも廃止し、カードごとのポイント率画面と設定の一覧で見る／おすすめは1カード1枠・結果へ自動移動・理由は1行＋折りたたみ／バックアップ案内は設定タブ／支払い方法のチェックは廃止（すべて使える前提）／カード診断はカードごとに折りたたみ／近くのお店の検索先等は詳細設定（将来は管理者のみ）／用語は「持っている」「ポイント率」「おすすめ」／切り替えは「手持ちで比べる｜全22枚で比べる」
- （09-26 決定・未実装）おすすめでは年会費を考えず、ボーナスポイントだけを上乗せする（ボーナスポイント÷達成条件額。年会費無料になる初回特典は含めない）。加算は「狙う」がオンで今期未達成のときだけ。期限までに届くかは加算の条件にせず、カード診断で見込みを表示する。年会費差し引き（B案）は不採用
- （09-26 変更）見直すタブの利用額は、提案カードか年会費のある保有カードがあるときだけ表示する。普段は「月5万円のカード利用で計算しています［変更］」の1行で、［変更］で入力欄を開く（A案）
- カード一覧・還元情報はカード会社順→会社内はカード名順。どちらも英字で始まる名称をアルファベット順で先に、その後に日本語をあいうえお順。提携カードは発行・ブランドの主体で分類（dカードはNTTドコモ、Amazon Mastercardは三井住友カード、リクルートカードは三菱UFJニコス）。※v1.20でシリーズ順（シリーズ→ランク→カード名）に変更を決定（詳細設計32章）

### 収益化（案。公開する場合）
- カード追加シミュレーターでは**購入金額を入力しない**。「最近使ったお店」をもとに、上がるお店の数・率の変化・1万円あたりの増加額・年会費の回収ラインで見せる
- 提案は3つの場面で出す：①推奨直後の1行ヒント、②見直し画面（いつでも開ける）、③ホームのバナー（最近使ったお店の下）
- 頻度は**A＋B**：最初は7日ごと、反応がなければ7→14→30日に広げ、タップで7日に戻す（A）。内容が変わったら7日で出す（B）。×で閉じたら60日出さない
- 提案の候補カードは、マスタのうち保有していない全カード（統合時に21枚へ拡大）。①③は設定でON/OFF（初期ON）

### 画面デザイン
- デジタル庁デザインシステムを参考にする
- フォントは同梱せず、スマホ標準フォントを使う
- 政府のロゴ・名称は使わず、出典と「デジタル庁とは関係ない」旨を記載
- ライトテーマのみ（デザインシステムがライトのみのため）
- 配色は設定で5案から選択（既定ネイビー×ゴールド。アイコンはネイビー固定）。デザインシステムの構造・状態色・フォーカスは維持し、ゴールドは文字に使わない

## 3. 実装上の主な判断（Claude提案・了承済み）

- 推奨の比較単位は「カード×支払い方法」。同じカード・同じ率の支払い方法は1件にまとめて表示
- 実質還元率＝還元率＋ボーナス価値÷達成条件額（狙う設定ON・未達成・期限内のときのみ）
- 開発環境からnpmレジストリに接続できなかったため、Vite/Preactではなく esbuild＋自作の小さなJSXランタイムで実装
- 保存先はIndexedDB。バックアップはファイル書き出し・コピー・貼り付け読込
- 新規利用者の初期状態は保有カード0枚（従来は全カード保有）。既存の設定はそのまま引き継ぎ、新カードは自動追加しない
- 決済方法ID `smartphone_visa_touch` は互換のため据え置き、表示名を「スマホのタッチ決済」に変更（Mastercard/JCB等も含む）

## 4. 現在の状態（2026-09-24時点）

- アプリ版 1.0.0、ルール版 2026.09.24-2（カード21・支払い方法7・決済経路91・店舗103・特約375）
- テスト：単体54、ゴールデン52、E2E18 すべて合格（統合版）
- タブは「おすすめ／カード／ボーナス／見直す／還元情報／設定」の6つ。`affiliates.json` は空（公開まで）
- 設計書：基本設計書 v1.6、詳細設計書 v1.13、カード提案機能の詳細設計 v1.1、収益化設計書（案）v0.3
- プレビュー版（claude.ai上、オフライン不可）：https://claude.ai/artifact/M9WAg7nvYpk6hmtZwcDRDY（09-24 版。旧URLのページは上書きできなくなったため削除し、こちらに一本化）
- 本番版：`app/dist/` の7ファイル（zip）を GitHub Pages に置き、スマホで「ホーム画面に追加」する。09-24 版の zip は作成済み、再デプロイは利用者が実施
- アイコン画像（PNG）はプロジェクトに保存できないため、`app/scripts/icons.mjs` で再生成する
- マスタ更新時は `master/golden_cases.json` を `app/tests/golden/` にもコピーする（README の手順3）

## 5. 残課題

| No | 内容 |
|---|---|
| 1 | 信頼度の低いルールの再確認：ANAワイドゴールドのPayPay継続、三菱UFJ 7%のGoogle Pay可否、JRE POINTの2026年9月改定 |
| 2 | 各店舗の受入手段（PayPay等）の実態確認（大半はカテゴリの既定値） |
| 3 | 7%上乗せ分の実際の計算単位の確認 |
| 4 | 桃菜・三〇三のよみ（現在は漢字・数字でのみ検索可） |
| 5 | PayPayカード ゴールドの初年度（入会月を含む13か月）の期限は手動設定が必要 |
| 6 | iPhone実機での動作確認 |
| 7 | 本番版のホスティングとホーム画面への追加 |
| 8 | 収益化設計書の未決事項（公開の有無、公開先、ASP、計測、有料機能、運営者表記）の決定。公開前に勤務先の副業規定を確認 |
| 9 | ~~提案の候補になる人気カード（保有していないカード）のマスタ追加~~ → 統合で対応（21枚） |
| 10 | ~~プレビュー版・本番版への反映~~ → プレビュー版は新URLに一本化済み。本番版は09-24版のzipをGitHubへアップロードすれば反映（利用者作業） |
| 11 | 信頼度「中」以下の新カード情報の再確認：セブンカード・プラスのセブン10%（QUICPay可否含む）、JCB CARD Wの特約（マクドナルド・スタバ・Amazon）、dカード GOLDの年間特典の集計期間、プラプリの継続特典の集計期間 |
| 12 | dカードは2027年1月利用分から0.5%に改定予定。改定時にマスタ更新が必要 |
| 13 | 統合で追加した16枚の公式サイトURLの到達確認（`node scripts/check_affiliates.mjs --online`。開発環境はネット接続不可のため未実施） |
| 14 | 提案の並び順：件数優先のため、年会費82,500円のマリオット・プレミアムが「5件で+2%」で1位になりうる（詳細設計 25.4）。並び順・候補の条件の見直し要否 |
| 15 | 同じプロジェクトで複数の会話が並行して設計書・コードを更新し、分岐が2回発生。以後は1つの会話で作業するか、作業前にプロジェクトのファイルを最新化する |

## 追記：残課題の調査・見直すタブの年会費計算 v1.14（2026-09-25）

| No | 利用者の決定 |
|---|---|
| 1 | 近くのお店（F13）は API 問い合わせ方式。検索先は OpenStreetMap（Overpass）と Yahoo!ローカルサーチから設定で選ぶ（既定 OpenStreetMap） |
| 2 | おすすめタブは「このお店でどのカードを使うか」に特化。ただしヒント①・バナー③はおすすめタブに残す |
| 3 | 年会費を回収できるかの計算は既存の見直すタブで行う。並びは年間の損得順（月のカード利用額を入力） |
| 4 | ビューカードを対象に追加（モバイルSuicaのチャージ元として評価） |
| 5 | 調査で見つかったマスタの誤り（三井住友の計算単位、PayPayゴールド初年度、dカード GOLD）をマスタと設計書に反映 |

Claudeの判断：見直すタブでは、持っているカードの年会費の回収判定も表示する（「年会費を回収できるか」は保有カードにも当てはまるため）。ボーナスは「そのカードに移る利用額」で判定し、2年目以降の額で評価する。

## 追記：プロジェクト内ファイルの整理 v1.16（2026-09-25）

利用者の方針：git では管理しないため、このプロジェクト内のファイルの整合がとれていればよい。
対応：古い版のまま残っていた `src` を、設計書（20〜24章）・最新ビルド・E2E をもとに v1.13 相当へ復元し、v1.14〜v1.15 を統合。全ファイルをプロジェクトのファイル名（`app_src_…` 形式）で出力し、プロジェクトのファイルを置き換える。

## 追記：プロジェクトのファイル名の書き換え履歴（2026-09-25）

利用者の依頼により、ファイル名が書き換わった経緯を残す。

| 日付 | 内容 |
|---|---|
| 〜2026-09-24 | 元の構成（`app/src/domain/types.ts` 等）を、パスの「/」を「_」にした名前でプロジェクトに保存（例：`app_src_domain_types.ts`）。一部は拡張子の「.」も「_」にして `.txt` を付けた名前（例：`app_src_domain_types_ts.txt`） |
| 2026-09-25 | v1.16 の整理で全66ファイルを差し替え。iPhone の Claude アプリでは .ts・.tsx・.mjs・.py 等を選べないため、Claude が .md 以外の全ファイル名の末尾に `.txt` を付けて渡した（例：`app_src_domain_types.ts.txt`） |
| 2026-09-25 | アップロード時に拡張子の「.」が自動で「_」に変わり、`app_src_domain_types_ts.txt` の形で保存された。中身は1バイト単位で一致を確認済み |

**現在の命名規則**（元の構成に戻すときはこの逆）
1. パスの「/」を「_」にする（`app/` → `app_`、`master/` → `master_`、`design/` → `design_`）
2. 単体・ゴールデンのテストは `.test.ts` を `_test.ts` にする
3. `.md` 以外は拡張子の「.」を「_」にして末尾に `.txt` を付ける（`.gitignore` は `app__gitignore.txt`）
4. `.md` はそのまま（例：`design_basic_design.md`）

**対応表（v1.16 時点の全ファイル）**

| 元の構成のパス | プロジェクトのファイル名 |
|---|---|
| `app/README.md` | `app_README.md` |
| `app/.gitignore` | `app__gitignore.txt` |
| `app/dist/index.html` | `app_dist_index_html.txt` |
| `app/dist/manifest.webmanifest` | `app_dist_manifest_webmanifest.txt` |
| `app/dist/sw.js` | `app_dist_sw_js.txt` |
| `app/package.json` | `app_package_json.txt` |
| `app/scripts/build.mjs` | `app_scripts_build_mjs.txt` |
| `app/scripts/check_affiliates.mjs` | `app_scripts_check_affiliates_mjs.txt` |
| `app/scripts/icons.mjs` | `app_scripts_icons_mjs.txt` |
| `app/scripts/serve.mjs` | `app_scripts_serve_mjs.txt` |
| `app/src/data/affiliates.json` | `app_src_data_affiliates_json.txt` |
| `app/src/data/rules.json` | `app_src_data_rules_json.txt` |
| `app/src/domain/affiliate.ts` | `app_src_domain_affiliate_ts.txt` |
| `app/src/domain/bonus.ts` | `app_src_domain_bonus_ts.txt` |
| `app/src/domain/catalog.ts` | `app_src_domain_catalog_ts.txt` |
| `app/src/domain/date.ts` | `app_src_domain_date_ts.txt` |
| `app/src/domain/engine.ts` | `app_src_domain_engine_ts.txt` |
| `app/src/domain/master.ts` | `app_src_domain_master_ts.txt` |
| `app/src/domain/nearby.ts` | `app_src_domain_nearby_ts.txt` |
| `app/src/domain/pointPay.ts` | `app_src_domain_pointPay_ts.txt` |
| `app/src/domain/promo.ts` | `app_src_domain_promo_ts.txt` |
| `app/src/domain/review.ts` | `app_src_domain_review_ts.txt` |
| `app/src/domain/search.ts` | `app_src_domain_search_ts.txt` |
| `app/src/domain/settings.ts` | `app_src_domain_settings_ts.txt` |
| `app/src/domain/simulate.ts` | `app_src_domain_simulate_ts.txt` |
| `app/src/domain/theme.ts` | `app_src_domain_theme_ts.txt` |
| `app/src/domain/types.ts` | `app_src_domain_types_ts.txt` |
| `app/src/storage/db.ts` | `app_src_storage_db_ts.txt` |
| `app/src/storage/settingsRepo.ts` | `app_src_storage_settingsRepo_ts.txt` |
| `app/src/ui/app.tsx` | `app_src_ui_app_tsx.txt` |
| `app/src/ui/format.ts` | `app_src_ui_format_ts.txt` |
| `app/src/ui/h.ts` | `app_src_ui_h_ts.txt` |
| `app/src/ui/main.ts` | `app_src_ui_main_ts.txt` |
| `app/src/ui/nearbyService.ts` | `app_src_ui_nearbyService_ts.txt` |
| `app/src/ui/promoView.ts` | `app_src_ui_promoView_ts.txt` |
| `app/src/ui/screens/adpolicy.tsx` | `app_src_ui_screens_adpolicy_tsx.txt` |
| `app/src/ui/screens/bonus.tsx` | `app_src_ui_screens_bonus_tsx.txt` |
| `app/src/ui/screens/cards.tsx` | `app_src_ui_screens_cards_tsx.txt` |
| `app/src/ui/screens/category.tsx` | `app_src_ui_screens_category_tsx.txt` |
| `app/src/ui/screens/home.tsx` | `app_src_ui_screens_home_tsx.txt` |
| `app/src/ui/screens/info.tsx` | `app_src_ui_screens_info_tsx.txt` |
| `app/src/ui/screens/nearbySettings.tsx` | `app_src_ui_screens_nearbySettings_tsx.txt` |
| `app/src/ui/screens/nearby.tsx` | `app_src_ui_screens_nearby_tsx.txt` |
| `app/src/ui/screens/review.tsx` | `app_src_ui_screens_review_tsx.txt` |
| `app/src/ui/screens/settings.tsx` | `app_src_ui_screens_settings_tsx.txt` |
| `app/src/ui/style.css` | `app_src_ui_style_css.txt` |
| `app/tests/e2e/e2e.mjs` | `app_tests_e2e_e2e_mjs.txt` |
| `app/tests/golden/golden.test.ts` | `app_tests_golden_golden_test_ts.txt` |
| `app/tests/unit/catalog.test.ts` | `app_tests_unit_catalog_test_ts.txt` |
| `app/tests/unit/domain.test.ts` | `app_tests_unit_domain_test_ts.txt` |
| `app/tests/unit/fee.test.ts` | `app_tests_unit_fee_test_ts.txt` |
| `app/tests/unit/nearby.test.ts` | `app_tests_unit_nearby_test_ts.txt` |
| `app/tests/unit/suggest.test.ts` | `app_tests_unit_suggest_test_ts.txt` |
| `app/tsconfig.json` | `app_tsconfig_json.txt` |
| `design/basic_design.md` | `design_basic_design.md` |
| `design/decision_log.md` | `design_decision_log.md` |
| `design/detailed_design.md` | `design_detailed_design.md` |
| `design/detailed_design_card_suggest.md` | `design_detailed_design_card_suggest.md` |
| `design/monetization_design.md` | `design_monetization_design.md` |
| `design/test_report.md` | `design_test_report.md` |
| `master/build_master.py` | `master_build_master_py.txt` |
| `master/collection_report.md` | `master_collection_report.md` |
| `master/golden_cases.json` | `master_golden_cases_json.txt` |
| `master/ref_engine.py` | `master_ref_engine_py.txt` |
| `master/rules.json` | `master_rules_json.txt` |

## 追記：カードラインナップの再整理 v1.20（2026-09-26。設計のみ・未実装）

詳細設計 v1.20・32章、基本設計 v1.13、分冊 v1.4。

- 一覧を「シリーズ → ランク（一般・ゴールド・プラチナ）」の2段構成にし、見出しをシリーズ名にする。「JAL」「ゴールド」でシリーズ名・ランクにも当たるようにする。カードIDは変えない
- 収録基準：シリーズを収録したら、ゴールドが発行されている限り一般とゴールドを揃える。ゴールドが発行されていないシリーズ（Amazon Mastercard・リクルートカード）は外さず一般だけで残す。プラチナはポイント率に差があるものだけ
- 国際ブランドの違いは、還元ルールが同じなら1枚の属性。ルールが違えば別のカード（発行会社の違いは目安）
- 一覧にないカードは「その他のカード」として、名前・ポイント・基本のポイント率を入れて登録できる（F14）
- ポイントの評価：ANAマイル・JALマイルは1マイル＝1円（ANA SKY コイン・e JALポイントへの交換の下限）、永久不滅ポイントは1pt＝5円（セゾン公式「約5円相当」）、メンバーシップ・リワードは1pt＝0.3円（何も登録しない状態の基本レート）。これに伴い、ANA VISAワイドゴールドは0.5%から1.0%に変わる（1pt＝2マイルへの移行が手数料無料のため）。ANAの一般カードは手数料のかからない移行方法で0.5%
- JCB CARD W と JCBゴールドは「JCBオリジナルシリーズ」にまとめる。Marriott Bonvoy アメックスは残し、通常をゴールド、プレミアムをプラチナとする。Marriott・楽天プレミアムは使った金額でポイント率が変わらない（変わるのはMarriottの無料宿泊特典だけで、ボーナスとして登録済み）
- 全カードで比べるときは、同じシリーズで同じ率のカードを1枠にまとめる（持っていないカードにはボーナスを加算しないため、一般とゴールドが同率で上位を占めるのを防ぐ）。手持ちで比べるときは変えない
- 残課題：第1弾の還元率の調査（JAL・セゾンは何枚に分けるかも調査で決める）
- 楽天プレミアムカードは収録しない（基本が楽天カードと同じ1.0%で、プラチナの収録基準に当たらないため）
- 第2弾は、収録済みシリーズの上位カード（Olive プラチナプリファード、ソラチカカード、エポスプラチナ、三菱UFJカード プラチナ・アメックス、JCBプラチナ）とローソンPontaプラスだけ。プラチナの収録基準は「基本の率か年間ボーナスのどちらかに差があれば入れる」とする。ヨドバシ・ビックカメラ・オリコ・ライフカードは入れない（詳細設計32.3・L12）
- 単独で使うコード決済・電子マネー（d払い残高・楽天ペイ・au PAY・WAON・nanaco・楽天Edy）を「カード以外の支払い」に加える。多くは0.5%前後でランキングへの影響は小さく、マスタの追加だけで推奨エンジンは変えない。新規利用者の既定はオフ。現金は常に0%なので比べず、現金しか使えない店に注記する。チャージ元カードとの組み合わせは今回は対象外（09-26 決定）。利用者が使う支払いは、カードタブの一番下「カード以外の支払い」のチェックボックスを増やして選ぶ（詳細設計32.11）

