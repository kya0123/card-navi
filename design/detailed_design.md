# クレカ使用判断アプリ 詳細設計書

| 項目 | 内容 |
|---|---|
| 版数 | 1.20（カードラインナップの再整理：設計。未実装） |
| 更新日 | 2026-09-26 |
| 前提 | 基本設計書 v1.13、ルールマスタ `master/rules.json`（masterVersion 2026.09.26-1） |
| 分冊 | カード提案機能：`design/detailed_design_card_suggest.md`（v1.4。見直すタブの年会費回収計算は10章、利用額の表示は11章、候補の拡大は12章） |
| 参照実装 | `master/ref_engine.py`（推奨エンジンのPython参照実装。TypeScript実装はこれと同じ結果を返すこと） |

### 変更履歴

| 版数 | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026-09-22 | 初版 |
| 1.1 | 2026-09-22 | 実装時の変更（14章） |
| 1.2 | 2026-09-22 | 画面デザインをデジタル庁デザインシステム準拠に変更（15章） |
| 1.3 | 2026-09-23 | 三井住友・三菱UFJの対象店舗を全件反映（16章） |
| 1.4 | 2026-09-23 | PayPayカード ゴールドを追加（17章） |
| 1.5 | 2026-09-23 | カテゴリから店舗一覧で選ぶ（18章） |
| 1.6 | 2026-09-24 | カード提案機能を分冊で追加（19章）。ヘッダーの版数表記を整理 |
| 1.7 | 2026-09-23 | カード一覧（定番・マニア推奨）と保有カードの選択（20章）※別の会話で並行実施、1.13で統合 |
| 1.8 | 2026-09-23 | マリオット ボンヴォイ アメックスを追加（21章） |
| 1.9 | 2026-09-23 | 配色をネイビー×ゴールドに変更（22章） |
| 1.10 | 2026-09-24 | 配色を設定で選べるように変更（23章） |
| 1.11 | 2026-09-24 | カード一覧をカード会社順に（24章） |
| 1.12 | 2026-09-24 | 並び順を英字→あいうえお順に変更（24.5） |
| 1.13 | 2026-09-24 | カード提案（1.6）と 1.7〜1.12 を統合。提案の候補を21枚に拡大（25章） |
| 1.14 | 2026-09-25 | 残課題3〜13の調査を反映：ボーナス期間の種類（初年度・固定期間）、ビューカード スタンダード追加、三井住友系を月間合計に、ANAのPayPay・Suica乗車の確認、dカード GOLDの特典修正（26章）。見直すタブの年会費回収計算は分冊10章 |
| 1.15 | 2026-09-25 | 近くのお店から選ぶ（F13・S10）の詳細設計（27章） |
| 1.16 | 2026-09-25 | プロジェクト内のソースを整理。v1.13 で統合済みのはずの v1.7〜v1.12 の実装が一部の古いファイルのまま保存されていたため、設計書（20〜24章）と最新のビルド・E2Eをもとに復元し、v1.14〜v1.15 と合わせて全テストを通した（28章） |
| 1.17 | 2026-09-26 | 残課題3・11・15〜17・19の調査結果（29章）。ルール版 2026.09.26-1 |
| 1.19 | 2026-09-26 | UIの見直し（31章。設計のみ・未実装）：近くのお店のタグ廃止、タブを4つに（ボーナス・ポイント率タブを廃止、「見直す」をカード診断に改名して統合）、おすすめを1カード1枠に、支払い方法の選択廃止、用語統一、ボーナスの上乗せから年会費無料特典を除外 |
| 1.18 | 2026-09-26 | おすすめの比較範囲を「持っているカード／登録カード（22枚）」で切り替え、保有0枚は登録カード全体でおすすめ。区分名「マニア推奨」を「ポイ活向け」に変更（30章） |
| 1.20 | 2026-09-26 | カードラインナップの再整理（32章。設計のみ・未実装）：一覧をシリーズ→ランクの2段構成に、シリーズごとに一般とゴールドを揃える、ポイントの評価（マイル1円・永久不滅ポイント5円・メンバーシップ・リワード0.3円）とANAワイドゴールドの率の変更、全カードで比べるときに同じシリーズ・同じ率のカードを1枠に、その他のカード（F14）、カード以外の支払い（d払い残高・楽天ペイ・au PAY・WAON・nanaco・楽天Edy）の追加と現金のみの店（32.11） |

---

## 1. ディレクトリ構成

```
app/
├─ public/
│   ├─ manifest.webmanifest
│   └─ icons/
├─ src/
│   ├─ data/rules.json            … ルールマスタ（ビルド時に同梱）
│   ├─ domain/                    … UIに依存しない純粋関数
│   │   ├─ types.ts               … 型定義（3章）
│   │   ├─ master.ts              … マスタの読込・索引作成・検証
│   │   ├─ engine.ts              … 推奨エンジン（4章）
│   │   ├─ bonus.ts               … ボーナス期間・状態（5章）
│   │   ├─ pointPay.ts            … ポイント払い判定（6章）
│   │   ├─ search.ts              … 店舗検索（7章）
│   │   └─ date.ts                … 日付ユーティリティ（ローカル日付のみ扱う）
│   ├─ storage/
│   │   ├─ db.ts                  … IndexedDB（idb）
│   │   ├─ settingsRepo.ts        … ユーザ設定の読み書き
│   │   └─ backup.ts              … エクスポート/インポート（8章）
│   ├─ ui/                        … Preactコンポーネント（9章）
│   │   ├─ App.tsx / router.ts
│   │   └─ screens/ S01Home.tsx … S06Settings.tsx
│   └─ sw/                        … Service Worker設定（10章）
├─ tests/
│   ├─ unit/                      … Vitest
│   ├─ golden/golden_cases.json   … master/ref_engine.py の出力をコピー
│   └─ e2e/                       … Playwright
└─ vite.config.ts
```

- `domain/` は `Date.now()` を直接呼ばない。「今日」は引数で受け取る（テストで固定するため）
- 日付は `YYYY-MM-DD` 文字列（端末のローカル日付）で扱い、タイムゾーン変換はしない

---

## 2. 基本設計からの変更・追加点

| No | 内容 | 理由 |
|---|---|---|
| D1 | 同じカードで実質還元率が同じ経路は **1件にまとめ、使える支払い方法を列挙** する | まとめないと上位3件が同じカードの別手段で埋まり、比較にならない（参照実装で確認） |
| D2 | ボーナス目標に `oneTimeAchieved`（年会費永年無料を達成済み）を追加 | 初回のみの価値（5,500円）を2年目以降に加算しないため |
| D3 | カード以外の経路（PayPay残高、モバイルSuica乗車）は `enabledNonCardRoutes` で個別にON/OFF | カードに紐付かないため |
| D4 | Suicaでの買い物は対象外。モバイルSuicaは乗車のみ | 利用者の決定（2026-09-22） |

---

## 3. 型定義（`domain/types.ts`）

```ts
export type Id = string;
export type YMD = string;            // 'YYYY-MM-DD'
export type YM = string;             // 'YYYY-MM'

// ---- マスタ ----
export interface Card { id: Id; name: string; brand: string; pointId: Id; annualFee: number }
export interface Method { id: Id; name: string; type: 'card'|'tap'|'wallet'|'code'|'transit' }
export interface Point {
  id: Id; name: string; yenPerPoint: number;
  usableScope: 'visaMerchants'|'paypayMerchants'|'suicaMerchants'|'listed'|'none';
  aliases?: string[]; note?: string; needsReview?: boolean;
}
export interface Route {
  id: Id; cardId: Id|null; methodId: Id; pointId: Id;
  baseRate: number; unitYen: number; pointsPerUnit: number;
  unitScope: 'perTransaction'|'monthlyTotal'; rounding: 'floor';
  countsTowardBonus: boolean;
  sourceUrl: string; checkedAt: YMD; confidence: 'high'|'medium'|'low';
  needsReview?: boolean; note?: string;
}
export interface Bonus {
  id: Id; cardId: Id; thresholdYen: number; valueYen: number; oneTimeValueYen?: number;
  periodType: 'joinMonth'; startOffsetMonths: number; excludedMethods: Id[];
  description: string; sourceUrl: string; checkedAt: YMD;
}
export interface Category { id: Id; name: string; defaultMethods: Id[] }
export interface Store {
  id: Id; name: string; kana: string; aliases: string[]; categoryId: Id;
  acceptedMethods?: Id[]; usablePoints?: Id[]; note?: string;
}
export interface RateRule {
  id: Id; target: { storeId?: Id; categoryId?: Id }; routeId: Id; rate: number;
  validFrom: YMD|null; validTo: YMD|null; sourceUrl: string; checkedAt: YMD;
  confidence: string; conditions: string;
}
export interface Master {
  schemaVersion: 1; masterVersion: string; checkedAt: YMD; disclaimer: string;
  cards: Card[]; methods: Method[]; points: Point[]; routes: Route[]; bonuses: Bonus[];
  categories: Category[]; stores: Store[]; rateRules: RateRule[];
}

// ---- ユーザ設定 ----
export interface OwnedCard { cardId: Id; joinYm: YM; enabledMethods: Id[]; priority: number }
export interface BonusGoal {
  bonusId: Id; target: boolean;              // 狙う
  thresholdYen?: number;                     // 未設定ならマスタ値
  progressYen?: number;                      // 概算累計
  achieved?: boolean;                        // 今期達成済み
  oneTimeAchieved?: boolean;                 // 年会費永年無料など初回特典を達成済み
  deadlineOverride?: YMD;                    // 手動の期限
  prevPeriod?: { deadline: YMD; progressYen: number; achieved: boolean };
  updatedAt?: YMD;
}
export interface UserSettings {
  schemaVersion: 1;
  ownedCards: OwnedCard[];
  enabledNonCardRoutes: Id[];
  bonusGoals: BonusGoal[];
  staleWarnDays: number;                     // 既定180
  lastExportAt?: YMD;
}

// ---- 推奨結果 ----
export interface RecommendItem {
  cardId: Id|null; routeIds: Id[]; methodIds: Id[];
  rate: number; rateSource: 'store'|'category'|'base';
  bonusRate: number; effectiveRate: number;
  earnedYen: number|null; earnedApprox: boolean;
  reasons: string[];                         // 表示用の理由（4.6）
}
export interface RecommendResult {
  storeId: Id|null; categoryId: Id;
  top: RecommendItem[];                      // 最大3件
  pointPay: Id[]|null;                       // ポイント払い推奨のポイントID
  warnings: string[];                        // 要確認・古いルールなど
}
```

---

## 4. 推奨エンジン（`domain/engine.ts`）

### 4.1 シグネチャ

```ts
recommend(master: MasterIndex, user: UserSettings,
          q: { storeId?: Id; categoryId?: Id; amountYen?: number },
          today: YMD, topN = 3): RecommendResult
```

`storeId` と `categoryId` はどちらか一方が必須。両方ない場合は例外を投げる。

### 4.2 処理手順

1. **受入手段の決定**：`accepted = store.acceptedMethods ?? category.defaultMethods`
2. **候補経路の抽出**：全経路のうち、次をすべて満たすもの
   - `route.methodId ∈ accepted`
   - カード経路の場合：`cardId` を保有していて、そのカードで `methodId` が有効
   - カード以外の経路の場合：`route.id ∈ user.enabledNonCardRoutes`
3. **還元率の決定**（`resolveRate`）：有効期間内（`validFrom ≤ today ≤ validTo`、nullは無制限）のルールから
   店舗一致 → カテゴリ一致 → `route.baseRate` の順に採用。同じ段階に複数あれば最大値
4. **ボーナス換算率**：5.3節の条件を満たす場合
   `bonusRate = (valueYen + (oneTimeAchieved ? 0 : oneTimeValueYen ?? 0)) ÷ (goal.thresholdYen ?? bonus.thresholdYen)`
5. **実質還元率**：`effectiveRate = rate + bonusRate`。比較の前に小数6桁で丸める（浮動小数の誤差対策）
6. **並べ替え**：①実質還元率の降順 ②ボーナス対象（bonusRate>0）を先 ③カードの `priority` 昇順（カード以外は99） ④routeId 昇順
7. **グループ化（D1）**：キー `(cardId ?? routeId, effectiveRate)` が同じ経路を1件にまとめ、`methodIds` と `routeIds` を並べ替え順に保持
8. **上位 topN 件**を返す。候補が0件なら `top=[]`、画面は「使える支払い方法がありません」と表示

### 4.3 付与ポイントの計算（金額入力時のみ）

| unitScope | 計算式 | 表示 |
|---|---|---|
| perTransaction | `floor( floor(金額 ÷ unitYen) × unitYen × rate )` | 「56円相当」 |
| monthlyTotal | `floor( 金額 × rate )` | 「約59円相当」（月間合計で計算されるため概算） |

- 特約率（7%など）も同じ付与単位で切り捨ててから掛ける（簡略化。実際の上乗せ分の計算単位とずれる場合がある旨をマスタ情報画面に注記）
- 金額は1〜9,999,999円の整数。範囲外は入力エラー

### 4.4 計算例（参照実装の結果）

| 条件 | 1位 | 2位 | 3位 |
|---|---|---|---|
| セブン・ボーナスOFF | 三井住友 スマホVisaタッチ 7% | 三菱UFJ カード/QUICPay 7% | 楽天 1% |
| セブン・ボーナスON（累計30万） | 三井住友 スマホVisaタッチ 8.55% | 三菱UFJ 7% | 三井住友 その他の手段 2.05% |
| ファミマ・ボーナスOFF | 楽天 1%＋**ポイント払い推奨** | 三井住友 0.5% | ANA 0.5% |
| ファミマ・ボーナスON | 三井住友 全手段 2.05% | 楽天 1% | ANA 0.5% |

### 4.5 性能

経路19件×ルール48件程度のため全件走査で十分（目標100ms以内に対し1ms未満の見込み）。起動時に `rateRules` を `routeId` ごとの索引にしておく。

### 4.6 理由文の生成

| 条件 | 理由文 |
|---|---|
| rateSource=store | 「{店舗名}で{率}%（{ルールのconditions}）」 |
| rateSource=base | 「通常還元{率}%」 |
| bonusRate>0 | 「年間{条件額}円ボーナス狙い中：+{率}%相当（残り{残額}円・期限{期限}）」 |
| route.confidence=low または needsReview | warningsに「{経路}の情報は要確認です」 |
| today − checkedAt > staleWarnDays | warningsに「還元ルールの確認日から{n}日経過しています」 |

---

## 5. ボーナス期間と状態（`domain/bonus.ts`）

### 5.1 期間計算

```ts
bonusPeriod(joinYm: YM, offset: number, today: YMD): { start: YMD; end: YMD }
```

1. 起点月 = 入会月 + offset
2. 起点月から12か月ずつ進め、`today` を含む期間を求める
3. `start` = その月の1日、`end` = 12か月後の1日の前日

| 入会 | offset | 今日 | 期間 |
|---|---|---|---|
| 2024-04 | 0 | 2026-09-22 | 2026-04-01〜2027-03-31 |
| 2024-04 | 0 | 2027-03-31 | 2026-04-01〜2027-03-31 |
| 2024-04 | 0 | 2027-04-01 | 2027-04-01〜2028-03-31 |
| 2025-12 | 0 | 2026-09-22 | 2025-12-01〜2026-11-30 |
| 2026-09 | 0 | 2026-09-22 | 2026-09-01〜2027-08-31（初年度。実際は入会日から） |
| 2024-04 | 1 | 2026-09-22 | 2026-05-01〜2027-04-30 |

入会年月が未来の場合は入力エラーにする。

※ v1.14 で期間の種類を追加した。ボーナスごとの期間は `periodFor`（26.2）で求め、`bonusPeriod` は入会月基準の計算部品として残す。

### 5.2 状態

| 状態 | 条件（上から優先） |
|---|---|
| achieved（達成済み） | `achieved = true` または `progressYen ≥ 条件額` |
| expired（期限切れ） | `today > 期限`（手動期限のときのみ発生。自動計算の期限は常に今日を含む） |
| active（進行中） | 上記以外 |

- **残月数** = 期限の月 − 今日の月 + 1（今月を含む）
- **必要な月額** = `ceil(残額 ÷ 残月数)`（active のときのみ）
- 例：入会2024-04、累計30万円、今日2026-09-22 → 期限2027-03-31、残り70万円、残り7か月、月10万円

### 5.3 推奨への反映条件

`goal.target = true` かつ 状態が active かつ `route.countsTowardBonus = true` かつ `route.methodId ∉ bonus.excludedMethods`

### 5.4 期間の自動繰り越し

アプリ起動時と S04 表示時に実行する。

1. 保存している `periodEnd`（前回計算した期限）より今日が後で、手動期限ではない場合に実行
2. `prevPeriod` に現在の値（期限・累計・達成済み）を退避
3. `progressYen = 0`、`achieved = false` にリセット（`oneTimeAchieved` は維持）
4. 「{カード名}のボーナス期間が新しくなりました」を1回だけ表示

---

## 6. ポイント払い判定（`domain/pointPay.ts`）

推奨1位について次をすべて満たすとき、使えるポイントを返す。

1. `rateSource = 'base'`（特約なし）
2. `bonusRate = 0`
3. 使えるポイントが1つ以上ある

**使えるポイント** = (店舗の `usablePoints` ∪ 受入手段から決まるポイント) ∩ 保有ポイント

| usableScope | 使える条件 |
|---|---|
| visaMerchants | 受入手段に `smartphone_visa_touch` または `online` がある（VポイントPay） |
| paypayMerchants | 受入手段に `paypay` がある |
| listed | 店舗の `usablePoints` に含まれる |
| none / suicaMerchants | 使えない（Suicaでの買い物は対象外のため） |

**保有ポイント** = 保有カードの `pointId` ＋ 有効なカード以外経路の `pointId`

表示は「ポイント払いがおすすめ：楽天ポイント／Vポイント／PayPayポイント」。並び順はマスタの `points` の定義順。

---

## 7. 店舗検索（`domain/search.ts`）

- **正規化**：NFKC → 小文字化 → カタカナをひらがなに変換 → 空白・「-」「‐」「・」「ー」以外の記号を除去
  - 例：「ｾﾌﾞﾝ」「セブン」「せぶん」はすべて「せぶん」になる
- **照合対象**：`name`、`kana`、`aliases`（すべて正規化した値を起動時に作成）
- **順位**：①前方一致 ②部分一致。同順位の中では、最近使った店 → 名前の短い順
- **件数**：最大8件。入力が空のときは最近使った店を最大8件表示
- **該当なし**：「カテゴリで探す」ボタンを表示し、S02 に移る
- 入力は150msのデバウンスで検索する

---

## 8. 保存とバックアップ（`storage/`）

### 8.1 IndexedDB

| DB / ストア | キー | 内容 |
|---|---|---|
| `card-advisor` v1 / `settings` | 固定キー `'user'` | `UserSettings` |
| `card-advisor` v1 / `recentStores` | `storeId` | `{ storeId, usedAt }`（最大20件。超えたら古い順に削除） |
| `card-advisor` v1 / `meta` | 固定キー | `periodEnd`（カードごと）、通知済みフラグ、`persistGranted` |

- 起動時に `navigator.storage.persist()` を呼び、結果を `meta` に保存。拒否された場合は設定画面に「データが消える可能性があります。定期的にエクスポートしてください」と表示
- 初回起動時の既定値：4枚すべて保有・全手段ON・優先順は三井住友→楽天→ANA→三菱UFJ、カード以外の経路はON、ボーナスはOFF

### 8.2 エクスポート/インポート

- 形式：`{ "app": "card-advisor", "exportedAt": "YYYY-MM-DD", "settings": UserSettings }`
- ファイル名：`card-advisor-YYYYMMDD.json`
- インポート時の検証：`app` 名、`schemaVersion`、各IDがマスタに存在するか。存在しないIDは読み飛ばして件数を通知
- 最終エクスポートから30日を過ぎたら、ホームに控えめなバナーを表示

### 8.3 スキーマの移行

`schemaVersion` を比較し、古い場合は `migrations[n]` を順に適用する（v1では移行処理なし）。

---

## 9. 画面詳細（`ui/screens/`）

### S01 推奨（ホーム）

```
┌───────────────────────────┐
│ 🔍 店舗名を入力            │
│ [最近: セブン][ファミマ]… │
├───────────────────────────┤
│ セブン-イレブン            │
│ ┌───────────────────────┐ │
│ │ 1  三井住友ゴールドNL │ │
│ │    スマホのVisaタッチ │ │
│ │    8.55%（7%＋1.55%） │ │
│ │    理由…              │ │
│ └───────────────────────┘ │
│ 2 三菱UFJ（カード/QUICPay）7% │
│ 3 三井住友（その他）2.05%  │
│ [金額を入れて計算 ▼]       │
│ ⚠ 要確認：…               │
│ 還元ルール確認日 2026-09-22 │
│ ※推奨は参考情報です…      │
└───────────────────────────┘
```

- 候補をタップするとホームで結果を表示し、`recentStores` を更新する
- ポイント払い推奨がある場合は、1位の下にバッジを表示
- 金額欄は折りたたみ（入力すると付与ポイントを表示）

### S02 カテゴリ選択

7カテゴリのボタン。選択するとS01に「カテゴリ：飲食チェーン（店舗未登録）」として結果を表示。

### S03 保有カード

カードごとに、保有のON/OFF、入会年月、支払い方法のチェック（そのカードの経路がある手段だけ表示）、並べ替え（上下ボタン）。下部にカード以外の経路（PayPay残高、モバイルSuica乗車）のON/OFF。

### S04 ボーナス目標

カードにボーナスがある場合のみ表示。狙う（チェック）、条件額、概算累計（数値入力と「今期達成済み」チェック）、年会費永年無料達成済み（チェック）、期限（自動計算の表示と「手動で変更」）、進捗バー、残額・残月数・必要な月額、前期実績。

### S05 マスタ情報

カード → 経路 → 特約ルールの順に一覧表示。各行に率、条件、確認日、信頼度、出典リンク（オフライン時はリンクを無効表示）。要確認・古いルールは強調表示。

### S06 設定

エクスポート、インポート、警告日数（30〜365日）、アプリ版数、マスタ版数、永続化の状態。

---

## 10. オフラインと更新（`sw/`）

- vite-plugin-pwa（`generateSW`、`registerType: 'prompt'`）
- precache 対象：HTML/JS/CSS/アイコン/manifest（`rules.json` はJSにバンドルするため個別キャッシュ不要）
- ランタイムキャッシュ：なし（外部通信をしないため）
- 更新：新しいSWを検知したら「新しいバージョンがあります（還元ルール {masterVersion}）［更新］」を表示し、押されたら `skipWaiting` → 再読込
- マスタの版数が変わった場合、ユーザ設定内のIDがマスタから消えていれば無視し、S03 に「このカード/手段は削除されました」と表示

---

## 11. エラー処理

| 事象 | 対応 |
|---|---|
| IndexedDBが使えない（プライベートモード等） | メモリ上の既定設定で動作し、「設定は保存されません」と表示 |
| マスタの検証エラー（ビルド時） | ビルドを失敗させる（`master.ts` の検証をビルドスクリプトからも実行） |
| インポートファイルが不正 | 取り込まず、理由を表示 |
| 候補経路が0件 | 「このお店で使える支払い方法が登録されていません」と表示し、S03 への導線を出す |

---

## 12. テスト設計

### 12.1 単体テスト

| 対象 | 観点 |
|---|---|
| resolveRate | 店舗 > カテゴリ > 基本の優先順、有効期間の境界（当日を含む） |
| bonusPeriod | 5.1節の6ケース、年またぎ、offset=1 |
| goalStatus | achieved/expired/active、必要な月額の切り上げ、残月数 |
| earned | 付与単位の境界（199/200/201円）、monthlyTotalの概算 |
| グループ化 | 同じカード・同じ率はまとまり、率が違えば別になる |
| search | 半角カナ・ひらがな・別名、前方一致が部分一致より上、最近使った店の優先 |
| backup | 往復で一致、不正ファイル、未知IDの読み飛ばし |

### 12.2 ゴールデンテスト

`tests/golden/golden_cases.json`（参照実装の出力）の全ケースで、TypeScript実装の `top`（cardId・methodIds・rate・bonusRate・effectiveRate・earnedYen）と `pointPay` が一致すること。

| ID | 内容 |
|---|---|
| G01 | セブン・ボーナスOFF：三井住友スマホVisaタッチ7%が1位（同率の三菱UFJより優先順で上） |
| G02 | セブン・ボーナスON：7%＋1.55% |
| G03 | ファミマ・ボーナスOFF：楽天1%、ポイント払い推奨あり |
| G04 | ファミマ・ボーナスON：三井住友0.5%＋1.55%が1位、ポイント払い推奨なし |
| G05 | 年会費無料は達成済み：0.5%＋1.0% |
| G06 | 今期達成済み：ボーナス加算なし |
| G07 | 累計が条件額以上：加算なし |
| G08 | 手動期限切れ：加算なし |
| G09 | オーケー：三菱UFJ 7% |
| G10 | Amazon：楽天オンライン1% |
| G11 | 楽天市場：楽天2% |
| G12 | JR東日本：モバイルSuica乗車2% |
| G13 | 未登録店舗→飲食カテゴリ：楽天1% |
| G14 | セブン850円：三井住友56円、三菱UFJ約59円 |
| G15 | ファミマ199円：楽天1円、三井住友0円 |
| G16 | 楽天・三菱UFJのみ保有でセブン：三菱UFJ 7% |
| G17 | 三井住友のスマホタッチOFFでセブン：三菱UFJ 7%が1位 |
| G18 | 三井住友のみ保有でファミマ：0.5%、Vポイント払い推奨 |
| G19 | スタバ・ボーナスON：三井住友8.55% |
| G20 | マクドナルド・ボーナスOFF：三井住友7%、ポイント払い推奨なし |
| G21 | Yahoo!ショッピング・ボーナスON：三井住友（オンライン/PayPay）2.05% |

### 12.3 E2E・オフライン

| ID | シナリオ |
|---|---|
| E01 | 起動 → 「せぶん」と入力 → 候補をタップ → 1位が三井住友スマホVisaタッチ（3タップ以内） |
| E02 | S04でボーナスON → ホームで同じ店舗を検索 → 率が8.55%に変わる |
| E03 | エクスポート → 設定を変更 → インポート → 元の設定に戻る |
| E04 | 一度表示した後にオフラインにして再読込 → 全画面が表示・動作する |
| E05 | 検索で該当なし → カテゴリ選択 → 結果が表示される |

---

## 13. 残課題

| No | 内容 |
|---|---|
| 1 | マスタの信頼度が低い項目（ANAのPayPay継続、三菱UFJ 7%のGoogle Pay可否、JRE POINT改定）の再確認 |
| 2 | 店舗ごとの受入手段（PayPay等）の実態確認。現状は大半がカテゴリの既定値 |
| 3 | 7%特約の上乗せ分の実際の計算単位（4.3節の簡略化との差） |

---

## 14. 実装時の変更（v1.1）

| No | 設計 | 実装 | 理由 |
|---|---|---|---|
| I1 | Vite / Preact / vite-plugin-pwa / idb / Vitest | esbuild＋自作の小さなJSXランタイム（`ui/h.ts`）、IndexedDBの自作ラッパー、手書きのService Worker、node:test | 開発環境からnpmレジストリに接続できず、手元にある道具だけで構成したため。依存ライブラリがなくなり、アプリは約96KBの単一HTMLになった |
| I2 | ハッシュによる画面遷移 | 画面の状態をメモリで持つ（起動時のみ `#cards` 等で初期画面を指定可） | プレビュー環境（claude.ai上の公開ページ）でも同じ動きにするため |
| I3 | `confirm()` による確認 | ボタンの二度押しで確定 | 埋め込み環境では `confirm()` が使えないため |
| I4 | バックアップはファイル書き出しのみ | ファイル書き出し＋クリップボードへのコピー＋内容表示、読み込みはファイル選択＋貼り付け | スマホではファイル操作より貼り付けの方が扱いやすいため |
| I5 | — | 描画中の再入防止（入力欄のフォーカスが外れた際の二重描画） | E2Eで検出した不具合の修正 |
| I6 | — | E2E用に `?today=YYYY-MM-DD` で日付を固定できる | 期限計算の試験を再現可能にするため |

---

## 15. 画面デザイン（v1.2）

デジタル庁デザインシステム（β版 v2.18、design-tokens 2.0.1）のトークン値と部品仕様を参考に、本アプリ向けに編集して適用する。

| 項目 | 適用内容 |
|---|---|
| 色 | キーカラー Blue-900（#0017C1）、文字 Solid Gray-800／900、補助文字 Solid Gray-600、背景 Solid Gray-50と白。成功 Green-800、警告 Yellow-900／Yellow-400、エラー Red-800 |
| 文字 | 'Noto Sans JP' を先頭にした指定だが、フォントは同梱しない（端末に無ければ標準フォント）。本文16px・行間1.7・字間0.02em |
| フォーカス | 黒4pxの枠＋黄色（Yellow-300）2pxの縁 |
| ボタン | 塗り／枠線の2種、高さ48px（小36px＋タップ領域44px）、角丸8px（小6px）、ホバー・押下で下線 |
| 入力欄 | 枠 Solid Gray-600、角丸8px、検索欄は高さ56px |
| チェックボックス | 24px、チェック時 Blue-900 |
| 通知 | ポイント払い推奨は成功色、警告は黄色の左帯つき枠（通知バナー color-chip 型） |
| 1位の表示 | 3pxのキーカラー枠で強調し、還元率をキーカラーの大きな数字で表示 |
| テーマ | デザインシステムがライトテーマのみを定義しているため、ライト固定 |
| 表記 | 設定画面とCSS冒頭に出典（MIT License／CC BY 4.0）と「デジタル庁とは関係ない」旨を記載。政府のロゴ・名称は使わない |

試験：E08 で画面上の全テキストのコントラスト比が4.5:1以上であることを確認する。

---

## 16. 対象店舗の全件反映（v1.3）

| No | 内容 |
|---|---|
| M1 | 三井住友・三菱UFJの7%対象チェーンを公式ページから全件登録（店舗99、特約143件）。詳細は `master/collection_report.md` 6章 |
| M2 | 支払い方法 `online` を「ネット・アプリ注文」とし、モバイルオーダーも含める。モバイルオーダー対象店舗は `acceptedMethods` に `online` を追加 |
| M3 | カテゴリ「自販機」「その他」を追加 |
| M4 | マスタ検証に「特約の支払い方法が店舗の受入手段に含まれること」を追加（Python・TypeScriptの両方） |
| M5 | 還元情報画面の特約表示を、条件ごとに店舗をまとめて表示する形に変更 |
| M6 | 不具合修正：初回訪問時にService Workerの有効化で画面が再読込され入力が消える問題（更新時のみ再読込に変更）、検索候補の遅延描画が古い要素に描かれる問題 |

ゴールデンケースに G22〜G27（ナチュラルローソン、ローソンスリーエフ、ピザハット、コカ・コーラ自販機、むさしの森珈琲、松屋）を追加。

---

## 17. PayPayカード ゴールドの追加（v1.4）

| No | 内容 |
|---|---|
| P1 | カード `paypay_gold`、経路5件（カード・QUICPay・スマホタッチ・ネット/アプリ・PayPayクレジット、いずれも1.0%・200円単位2pt）、ボーナス `ppg_1m`（100万円で11,000円相当、`startOffsetMonths=1`）を追加。コードの変更は不要（マスタのみ） |
| P2 | 既存の利用者の設定には自動で追加しない。「カード」画面の「カードを追加」から追加する（新規利用者は初期状態で保有扱い） |
| P3 | 初年度の集計期間（入会月を含む13か月）は自動計算の対象外。必要に応じて期限を手動で設定する |

ゴールデンケースに G28〜G31、期間計算に P07（入会2023-05・offset1 → 2026-06-01〜2027-05-31）を追加。

---

## 18. カテゴリから店舗一覧で選ぶ（v1.5）

| 項目 | 内容 |
|---|---|
| 画面 | S02 カテゴリ選択 → カテゴリをタップすると、そのカテゴリの**店舗一覧**を表示。店舗をタップすると S01 に結果を表示し、「最近使ったお店」に追加 |
| 並び順 | 保有カードで特約（高還元）がある店を先頭、その中はよみ順 |
| ラベル | 保有カードの特約を「三井住友 7%」「三菱UFJ 7%」のように表示（カードごとの最大率） |
| 一覧にない店 | 一覧の下の「一覧にないお店（◯◯の通常還元で比べる）」で、従来どおりカテゴリの既定値で比較 |
| カテゴリ表示 | タイルに店舗数を表示 |
| 試験 | E05 を「一覧にないお店」経由に変更、E09（スーパー → 高還元の店が先頭 → オーケーを選ぶ → 三菱UFJ 7%）を追加 |

## 19. カード提案機能（v1.6・分冊）

詳細は `design/detailed_design_card_suggest.md` を参照。推奨エンジン・ボーナス・ポイント払い・検索のロジック（4〜7章）は変更しない。本書側に関係する差分のみ記す。

| 対象 | 変更 |
|---|---|
| 1章 ディレクトリ | `domain/simulate.ts`・`promo.ts`・`affiliate.ts`、`data/affiliates.json`、`ui/promoView.ts`、`ui/screens/review.tsx`（S07）・`adpolicy.tsx`（S09）、`scripts/check_affiliates.mjs` を追加。公開用ファイルは `public/` ではなく `scripts/build.mjs` が `dist/` にフォルダなしの7ファイルとして生成する |
| 3章 型 | `Card.officialUrl?`、`UserSettings.showCardSuggestions?`（未設定＝ON）を追加。schemaVersion は1のまま |
| 8章 保存 | 提案の表示記録を `meta` ストアのキー `promo` に保存（「設定を初期化」で初回起動日からやり直し） |
| 9章 画面 | タブを6つ（おすすめ／カード／ボーナス／見直す／還元情報／設定）に変更。S01 に①ヒント・③バナー、設定に「カードの提案」パネルを追加 |
| 12章 テスト | 単体18件（S01〜S07、P01〜P07、A01〜A03、N01）、E2E 4件（E10〜E13）を追加 |

---

## 20. カード一覧と保有カードの選択（v1.7）

### 20.1 要件

| No | 要件 | 設計上の扱い |
|---|---|---|
| R1 | 世間一般で使われているクレジットカードを一覧化する | マスタのカードに区分 `segments` を追加し、`popular`（定番）を付けたカードを一覧に載せる |
| R2 | マニア界隈でお得とされるカードも一覧に追加する | 同じく `enthusiast`（ポイ活向け。v1.18 で「マニア推奨」から改称）を付ける。両方に該当するカードは両方を付ける |
| R3 | アプリ上で自分が保有しているカードを選べる | S03「カード」画面に「カード一覧から選ぶ」を追加。チェックで保有カードに追加／外す |
| R4 | 推奨は保有カードからのみ | 推奨エンジンは従来どおり `ownedCards` にあるカードの経路だけを候補にする（4.2）。新規利用者の初期値を「全カード保有」から「保有カードなし」に変更する |

### 20.2 収録カード（ルールマスタ 2026.09.23-3、19枚）

> v1.20：シリーズ・ランクで収録カードを整理し直す（32.3）。本節は当時の記録として残す。

還元率は公開情報（2026年5〜9月時点の各社公式・比較記事）から収集。キャンペーン・条件付きの上乗せ（PayPayステップ、SPU、選べるポイントアップショップ等）は含めない（基本設計の方針どおり）。

| カード | 区分 | 基本 | 主な特約・ボーナス | 信頼度 |
|---|---|---|---|---|
| 三井住友カード ゴールド（NL） | 定番・マニア | 0.5% | 7%特約／年100万円で10,000pt | 高 |
| 楽天カード | 定番 | 1.0% | 楽天市場2% | 高 |
| ANA VISAワイドゴールド | 定番 | 0.5% | — | 中 |
| 三菱UFJカード | 定番・マニア | 0.5% | 7%特約（コンビニ・スーパー等） | 高 |
| PayPayカード ゴールド | 定番 | 1.0% | 年100万円で11,000pt | 中 |
| 三井住友カード（NL） | 定番・マニア | 0.5% | 7%特約 | 高 |
| Olive フレキシブルペイ | 定番 | 0.5% | 7%特約 | 中 |
| PayPayカード | 定番 | 1.0% | — | 高 |
| イオンカードセレクト | 定番 | 0.5% | イオングループ1% | 高 |
| dカード | 定番 | 1.0% | 2027年1月から0.5%（要確認フラグ） | 中 |
| dカード GOLD | 定番 | 1.0% | 年100万円で11,000円相当（クーポン） | 中／ボーナスは低 |
| au PAY カード | 定番 | 1.0% | — | 高 |
| JCB CARD W | 定番・マニア | 1.0%（月間合計） | セブン1.5%・マクドナルド5.5%・スタバ10.5%・Amazon2% | 中 |
| セブンカード・プラス | 定番 | 0.5% | セブン-イレブン10% | 中 |
| エポスカード | 定番 | 0.5% | — | 高 |
| Amazon Mastercard | 定番・マニア | 1.0% | Amazon2%・コンビニ3社1.5%・7%特約 | 高／中 |
| リクルートカード | マニア | 1.2%（月間合計） | — | 高 |
| 三井住友カード プラチナプリファード | マニア | 1.0% | 7%特約／年100万円ごとに10,000pt | 高／中 |
| エポスゴールドカード | マニア | 0.5% | 年100万円で10,000pt | 中 |

追加した店舗：マックスバリュ、まいばすけっと、ダイエー（イオングループ2倍の対象）。追加したポイント：WAON POINT、dポイント、Pontaポイント、J-POINT、nanacoポイント、エポスポイント、Amazonポイント、リクルートポイント（いずれも1pt＝1円）。ポイントが使える店舗（`usablePoints`）にセブン（nanaco）、ローソン系（Ponta・d）、ファミマ（d）、マクドナルド（d・Ponta）、イオン系（WAON）、Amazon（Amazon）を追加。

### 20.3 データ定義の変更（`domain/types.ts`）

```ts
export type CardSegment = 'popular' | 'enthusiast';
export interface Card {
  id: Id; name: string; brand: string; pointId: Id; annualFee: number;
  shortName: string;        // 一覧・ラベル用の略称（例：「三菱UFJ」）
  kana: string;             // 検索用のよみ
  issuer: string;           // 発行会社
  segments: CardSegment[];  // 1つ以上
  highlight: string;        // 一覧に出す1行の特徴
  aliases: string[];        // 検索用の別名（例：「Yahoo!ゴールドカード」）
  annualFeeNote?: string;   // 年会費の無料条件など
}
```

- `validateMaster` に「segments が1つ以上・既知の値」「shortName・kana がある」「決済経路が1件以上」を追加（Python側 `build_master.py` にも同じ検証）
- 既存のルートID・ルールIDは変更しない（利用者の設定・ゴールデンケースの互換のため）
- 決済方法 `smartphone_visa_touch` は名称を「スマホのタッチ決済（Visa/Mastercard/JCB等）」に変更。IDは互換のため据え置き。三井住友の7%特約がMastercardタッチにも拡大されたことと、JCB等のカードにもタッチ決済の経路を持たせるため

### 20.4 カード一覧（`domain/catalog.ts`、新規）

> v1.20：検索の対象にシリーズ名・ランク名を加え、並び順をシリーズ順に変える（32.6）。

```ts
export type SegmentFilter = 'all' | CardSegment | 'owned';
export interface CatalogEntry {
  card: Card; owned: boolean;
  baseRate: number;   // そのカードの経路のうち最大の基本還元率
  maxRate: number;    // 特約を含めた最大還元率（ボーナスは含めない）
  hasBonus: boolean;
}
export function cardCatalog(mi, user, filter: SegmentFilter, query: string): CatalogEntry[];
export function addOwnedCard(mi, s: UserSettings, cardId): UserSettings;     // 末尾（優先順位最下位）に追加。経路のある支払い方法はすべて有効
export function removeOwnedCard(s: UserSettings, cardId): UserSettings;       // 外して優先順位を振り直す
```

- 絞り込み：`all`＝全件、`popular`／`enthusiast`＝区分を含むカード、`owned`＝保有中のみ
- 検索：`normalize()`（7章）した名前・よみ・略称・別名・発行会社に部分一致
- 並び順：マスタの定義順（定番の代表から並べてある）
- `addOwnedCard` は既に保有していれば何もしない。`removeOwnedCard` は入会年月も消える（ボーナス目標の値は残し、再追加時に復元できるようにする）

### 20.5 画面（S03 カード）

```
[ 保有カード（N） | カード一覧から選ぶ ]   ← 表示切替（保有0枚なら一覧を初期表示）

■ 保有カード表示：既存どおり（優先順↑↓・入会年月・使う支払い方法・外す）＋カード以外の支払い

■ カード一覧表示
┌ カード一覧から選ぶ ──────────────────┐
│ [すべて 19][定番 16][ポイ活向け 8][保有中 N]   ← 絞り込み │
│ [カード名・発行会社で検索            ]      │
│ ☑ 三井住友カード（NL）   [定番][マニア]         │
│    Visa/Mastercard・年会費無料・基本0.5%・最大7%     │
│    年会費無料。対象コンビニ・飲食店で…（highlight）   │
│ ☐ リクルートカード  [マニア]  …                │
└──────────────────────────┘
```

- 一覧と保有カードを同じ縦並びにすると、追加のたびに一覧の位置がずれるため、表示を切り替える方式にする
- 検索欄は入力のたびに画面全体を作り直すと日本語変換が途切れるため、一覧部分だけを差し替える（S01の候補欄と同じ方式）

- 一覧の各行はチェックボックス（`<label>` 全体がタップ領域、高さ44px以上）。チェックで `addOwnedCard`、外すと `removeOwnedCard`
- 外すときに入会年月が設定済みなら `confirm()` で確認（消えるため）。キャンセルならチェックを戻す
- 追加・外した結果は、行の強調表示（保有中は枠と背景をキーカラー）と切替ボタンの枚数「保有カード（N）」で示す。続けて何枚も選ぶため、トーストは出さない
- 区分バッジ：定番＝グレー、ポイ活向け＝キーカラー（DADSのタグ相当）。コントラスト4.5:1以上
- 保有カードが0枚のとき、保有カード表示に「カード一覧から選ぶ」ボタン付きの案内を表示

### 20.6 他画面への影響

| 画面 | 変更 |
|---|---|
| S01 推奨 | 保有カードが0枚なら検索欄の上に案内バナー「まず持っているカードを選んでください」＋「カードを選ぶ」ボタン |
| S02 カテゴリ | 特約ラベルの略称をマスタの `shortName` から取得（コード内の略称表を廃止） |
| S04 ボーナス | 変更なし（既に保有カードのボーナスだけを表示） |
| S05 還元情報 | 保有カードを先に表示し、保有していないカードは「保有していないカード（N枚）」の折りたたみ内に表示 |

### 20.7 初期値・移行

| 対象 | 変更前 | 変更後 |
|---|---|---|
| 新規利用者の `ownedCards` | マスタの全カード（5枚） | 空（一覧から選ぶ） |
| 新規利用者の `enabledNonCardRoutes` | PayPay残高・モバイルSuica | 変更なし（カードではないため従来どおり） |
| 既存利用者 | — | 保存済みの `ownedCards` をそのまま使う。新しいカードは自動で追加しない。新しいボーナスは `target:false` で追加（`reconcile` の既存動作） |

スキーマ版数（`schemaVersion: 1`）は変更しない（利用者設定の形は変わらないため）。

### 20.8 テスト

| 種別 | 追加・変更 |
|---|---|
| 単体 | `defaultSettings` が保有カード0枚になること、`cardCatalog` の区分絞り込み・検索（「やふー」→PayPayゴールド、「プラプリ」→プラチナプリファード）・保有中の絞り込み、`addOwnedCard` の重複防止と支払い方法の既定、`removeOwnedCard` の優先順位振り直し、保有していないカードの特約が推奨に出ないこと、マスタ検証（区分なしを検出） |
| ゴールデン | G01〜G31 は結果不変（回帰）。G32〜G39 を追加（Amazon同率・リクルート月間合計の概算・セブンカード10%・イオン2倍・プラプリのボーナス・非保有カードは出ない・JCB W 5.5%・d/Pontaポイント払い推奨） |
| E2E | 新規利用者は各テストの前に「カード一覧」から従来の5枚を選ぶ（選択UIの試験を兼ねる）。E14（初回は案内バナー→一覧の「マニア推奨」で絞り込み→リクルートカードを選ぶ→ファミマで1.2%が1位→外すと出なくなる）を追加。E01 の支払い方法名を「スマホのタッチ決済」に変更 |

---

## 21. マリオット ボンヴォイ アメックスの追加（v1.8）

| No | 内容 |
|---|---|
| M1 | カード2枚を追加（区分：マニア推奨）。`marriott_premium`（年会費82,500円・100円＝3pt）、`marriott`（年会費34,100円・100円＝2pt）。2025年8月リニューアル後の条件。支払い方法はカード・タッチ決済・Apple Pay（QUICPay）・ネット |
| M2 | ポイント `marriott_point` は現金・請求額に使えないが、ホテル宿泊に使う前提で **1pt＝1円** と評価（利用者決定 2026-09-23）。マイル換算しない方針とは別扱い |
| M3 | 年間ボーナス＝無料宿泊特典を、ポイント上限×1円で評価。プレミアム：400万円で75,000円相当（`mbp_4m`、+1.875%）、スタンダード：250万円で50,000円相当（`mb_25m`、+2.0%）。いずれも入会月基準の1年で近似 |
| M4 | 店舗「マリオット系ホテル（宿泊・レストラン）」を追加（カテゴリ：その他、別名にシェラトン・ウェスティン等）。特約：プレミアム6%・スタンダード5%。会員としての宿泊ポイントは全カード共通のため含めない |
| M5 | コード変更なし（マスタのみ）。ゴールデン G40〜G43、単体1件を追加 |
| 影響 | 1pt＝1円の評価のため、保有していれば7%特約の店以外ではほぼ1位になる。ポイント払い推奨は「1位が通常還元」のときに出るため、マリオット3%が1位のときも他のポイント払いを案内する（仕様どおり） |

---

## 22. 配色の変更：ネイビー×ゴールド（v1.9）

### 22.1 経緯
5案（現行ブルー・ティール・ネイビー×ゴールド・テラコッタ・フォレストグリーン）を実画面で比較し、利用者がC案「ネイビー×ゴールド」を選定（2026-09-23）。テラコッタはエラー（赤）と、グリーンは成功表示（緑）と色が重なるため不採用。

### 22.2 トークン（`style.css`）

| 役割トークン | 値 | 用途 | 白地／地色とのコントラスト |
|---|---|---|---|
| `--key` | navy-900 `#1f3a68` | ボタン・選択中・還元率の数字・リンク | 白文字 11.3:1、地色上 10.3:1 |
| `--key-hover` / `--key-active` | `#172c50` / `#0f1d36` | ホバー・押下 | — |
| `--key-soft` | navy-50 `#eef1f7` | 支払い方法の帯・保有中の行 | 上に置くキー色 10.0:1 |
| `--key-tint-100/200/300` | `#dde3ef` / `#c5cfe3` / `#9fb0d0` | 押下・ホバーの面（従来 blue-100〜300 を直接参照していた箇所を置換） | — |
| `--accent` | gold-500 `#c9a227` | 1位の順位番号の地、選択中タブの上線 | ネイビー文字 4.66:1 |
| `--accent-line` | gold-600 `#b08d2f` | 1位の枠、「ポイ活向け」タグの枠 | 白地 3.1:1（非テキストの基準3:1以上） |
| `--ground` | ivory-50 `#f6f4ef` | 画面の地色 | 本文 11.5:1、補足文字 5.2:1 |

- ゴールドは文字色に使わない（白地で3.1:1のため）
- 成功（緑）・注意（黄）・エラー（赤）・フォーカス（黒＋黄）は DADS のまま変更しない
- `theme-color`・マニフェストの `theme_color` は `#1f3a68`、`background_color` は `#f6f4ef`。アプリアイコンもネイビー地＋金色のカードに変更

### 22.3 強調の変更点
| 要素 | 変更前 | 変更後 |
|---|---|---|
| 1位のカード枠 | キー色（青）3px | 金色 3px |
| 1位の順位番号 | 青地に白文字 | 金色地にネイビー文字 |
| 下部タブの選択中の上線 | キー色 | 金色（文字はネイビーのまま） |
| ポイ活向けタグ | 青の枠と文字 | 金色の枠・ネイビー文字 |

### 22.4 テスト
E08 を拡張：推奨画面に加えてカード一覧・ボーナス画面の全文字が4.5:1以上、1位の枠が金色かつ3:1以上であることを確認。

---

## 23. 配色の選択（v1.10）

### 23.1 要件
比較した5案を設定画面で選べるようにする。既定はネイビー×ゴールド（v1.8で選定）。

### 23.2 配色一覧（`domain/theme.ts`）

| ID | 名称 | キー色 | 強調色（1位の枠・順位番号・選択中タブ） | 地色 | 注意書き（設定画面に表示） |
|---|---|---|---|---|---|
| `navy`（既定） | ネイビー×ゴールド | `#1f3a68` | 金 `#c9a227`／枠 `#b08d2f` | `#f6f4ef` | — |
| `blue` | ブルー | `#0017c1` | キー色と同じ | `#f2f2f2` | — |
| `teal` | ティール | `#006b73` | キー色と同じ | `#f1f4f4` | — |
| `terra` | テラコッタ | `#a8400e` | キー色と同じ | `#f8f5f2` | エラー表示（赤）と色が近い |
| `green` | フォレストグリーン | `#1b6843` | キー色と同じ | `#f2f4f1` | 達成表示（緑）と色が近い |

全案で白文字／キー色 6.1:1 以上、キー色／地色 5.6:1 以上（22章の計算）。状態色・フォーカスは共通。

### 23.3 データ
- `UserSettings.theme?: ThemeId`（省略時 `navy`）。任意項目のため `schemaVersion` は1のまま
- `reconcile`：未知の値は `navy` に戻す。バックアップの書き出し・読み込みに含まれる
- 既存利用者：値がないので `navy`（v1.8と同じ見た目）

### 23.4 適用方法
- CSS：`:root` はネイビー（既定）。`html[data-theme="blue"]` 等でプリミティブ `--navy-*`・`--accent*`・`--ground` を上書きする。コンポーネントは役割トークンだけを参照（22.2で置換済み）
- 描画のたびに `document.documentElement.dataset.theme` と `<meta name="theme-color">` を設定値に合わせる。設定の読み込み後に初回描画するため、起動時のちらつきはない
- アプリアイコンとマニフェストは差し替えない（ネイビー固定。ホーム画面アイコンは端末側に固定されるため）

### 23.5 画面（S06 設定）
「配色」パネルをバックアップの上に追加。各案は色見本（キー色＋2色目の丸。ネイビーは金、他は淡色）＋名称＋注意書きのラジオボタン（1行44px以上）。選ぶと即時に反映・保存する。

### 23.6 テスト
- 単体：既定が `navy`、未知値は `navy` に戻る、バックアップで引き継がれる、全案のキー色が白文字4.5:1以上
- E2E：E16（設定でティールを選ぶ→画面の色・theme-colorが変わる→再読み込み後も維持）、E17（5案すべてで推奨・カード一覧・設定画面の文字4.5:1以上、1位の枠3:1以上）

---

## 24. カード一覧の並び順：カード会社のあいうえお順（v1.11）

> v1.20：見出しと並び順をシリーズ順に置き換える（32.6）。英字→あいうえお順の規則（24.5）はシリーズ名とカード名に引き続き使う。

### 24.1 仕様
- カード一覧（S03）と還元情報（S05）のカードを、**カード会社のよみのあいうえお順**、同じ会社の中は**カード名のよみのあいうえお順**に並べる
- カード一覧では会社ごとに小見出し（会社名）を付ける
- 比較は `Intl.Collator('ja')`（長音・濁点を日本語の辞書順で扱う）。英字の会社名は読みで並べる（JCB＝じぇーしーびー、NTTドコモ＝えぬてぃーてぃーどこも）
- 保有カード表示（優先順位）とおすすめの順位は変更しない

### 24.2 データ
`Card` に `company`（見出しに出す会社名）と `companyKana`（並び順用のよみ）を追加。提携カードは発行・ブランドの主体で分類する。

| 会社（よみ順） | カード |
|---|---|
| アメリカン・エキスプレス | Marriott Bonvoy アメックス（通常・プレミアム） |
| イオンフィナンシャルサービス | イオンカードセレクト |
| auフィナンシャルサービス | au PAY カード |
| NTTドコモ | dカード、dカード GOLD |
| エポスカード | エポスカード、エポスゴールドカード |
| JCB | JCB CARD W |
| セブン・カードサービス | セブンカード・プラス |
| PayPayカード | PayPayカード、PayPayカード ゴールド |
| 三井住友カード | Amazon Mastercard、ANA VISAワイドゴールド、Olive、三井住友カード ゴールド（NL）、三井住友カード（NL）、プラチナプリファード |
| 三菱UFJニコス | 三菱UFJカード、リクルートカード |
| 楽天カード | 楽天カード |

マスタ検証に「company・companyKana がある」を追加。マスタ版数 2026.09.24-1（還元内容は変更なし。ゴールデン全件の結果不変を確認）。

### 24.3 API
`domain/catalog.ts` に `compareCards(a, b)` を追加し、`cardCatalog` の戻り値をこの順に並べる。還元情報画面も同じ関数で並べる。

### 24.4 テスト
- 単体：一覧が会社のよみ順→カード名のよみ順になること（先頭がアメックス、末尾が楽天。三井住友の中はAmazon→ANA→Olive→…）、検索・絞り込み後も同じ順
- E2E：E18（カード一覧の会社見出しが あいうえお順に並ぶ）

### 24.5 変更（v1.12）：英字→あいうえお順
英字の会社名をよみで五十音に混ぜると不自然なため、**英字で始まる名称を先にアルファベット順（大文字小文字は区別しない）、その後に日本語の名称をよみのあいうえお順**に変更。会社名・カード名の両方に同じ規則を適用する。

| 順 | カード会社 | 会社内のカード順 |
|---|---|---|
| 1 | auフィナンシャルサービス | au PAY カード |
| 2 | JCB | JCB CARD W |
| 3 | NTTドコモ | dカード → dカード GOLD |
| 4 | PayPayカード | PayPayカード → PayPayカード ゴールド |
| 5 | アメリカン・エキスプレス | Marriott Bonvoy アメックス → 同プレミアム |
| 6 | イオンフィナンシャルサービス | イオンカードセレクト |
| 7 | エポスカード | エポスカード → エポスゴールドカード |
| 8 | セブン・カードサービス | セブンカード・プラス |
| 9 | 三井住友カード | Amazon Mastercard → ANA VISAワイドゴールド → Olive → 三井住友カード ゴールド（NL）→（NL）→ プラチナプリファード |
| 10 | 三菱UFJニコス | 三菱UFJカード → リクルートカード |
| 11 | 楽天カード | 楽天カード |

判定は名称の先頭文字が半角英字か（`/^[A-Za-z]/`）。英字同士は `Intl.Collator('en')`、日本語同士はよみ（`kana`・`companyKana`）を `Intl.Collator('ja')` で比較。マスタの変更はなし。

---

## 25. 統合（v1.13）

### 25.1 経緯
v1.5 から2つの作業が並行して進んでいた。カード提案側は本書の版数を 1.6 としたため、並行側の版数を 1.7〜1.12（章番号 20〜24）に振り直して統合した。

| 系統 | 内容 | 設計書 |
|---|---|---|
| A | カード提案・収益化（ヒント・見直す画面・バナー・広告の方針・affiliates.json・リンク確認スクリプト、カードに公式サイトURL）。本書 v1.6・19章、基本設計書 v1.5 | `detailed_design_card_suggest.md` |
| B | v1.7〜v1.12（カード一覧21枚・保有カードの選択・マリオット・配色・配色の選択・並び順） | 本書 20〜24章 |

両系統ともルール版を `2026.09.24-1` としていたため、統合版を **2026.09.24-2** とする。

### 25.2 統合の方針
- 土台は系統A（プロジェクト側）。系統Bの変更を取り込む
- 画面：タブは6つ（おすすめ／カード／ボーナス／見直す／還元情報／設定）。設定画面は上から「配色」「カードの提案」「バックアップ」…の順
- カード提案の候補は、マスタのうち**保有していない全カード（最大21枚）**に拡大。計算仕様（提案設計書 3章）は変更しない
- 全カードに `officialUrl` を付与（初期5枚は系統Aの値、残り16枚は統合時に追加）
- 配色：系統Aで追加した画面（見直す・広告の方針・ヒント・バナー）も役割トークンを使っているため、5つの配色すべてに追従する

### 25.3 追加した公式サイトURL（到達確認は残課題）

| カード | officialUrl |
|---|---|
| 三井住友カード（NL） | https://www.smbc-card.com/nyukai/card/numberless.jsp |
| Olive | https://www.smbc.co.jp/kojin/olive/ |
| 三井住友カード プラチナプリファード | https://www.smbc-card.com/nyukai/card/platinum-preferred.jsp |
| Amazon Mastercard | https://www.smbc-card.com/nyukai/affiliate/amazon/index.jsp |
| PayPayカード | https://www.paypay-card.co.jp/ |
| イオンカードセレクト | https://www.aeon.co.jp/card/lineup/select/ |
| dカード／dカード GOLD | https://dcard.docomo.ne.jp/ |
| au PAY カード | https://www.kddi-fs.com/ |
| JCB CARD W | https://www.jcb.co.jp/ordercard/kojin_card/os_card_w.html |
| セブンカード・プラス | https://www.7card.co.jp/ |
| エポスカード／エポスゴールド | https://www.eposcard.co.jp/ ／ https://www.eposcard.co.jp/gold/ |
| リクルートカード | https://recruit-card.jp/ |
| Marriott Bonvoy アメックス（通常／プレミアム） | https://www.americanexpress.com/jp/credit-cards/marriott-bonvoy-card/ ／ …/marriott-bonvoy-premium-card/ |

### 25.4 候補の拡大で生じる動き（要判断）
提案の並び順は「上がるお店の数 → 1万円あたり → カードID」で、年会費は並びに使わない。21枚になると、どこでも +2% になる **マリオット・プレミアム（年会費82,500円）** が件数で1位になりうる（楽天のみ保有・最近5店の例：5件中5件・1万円あたり＋200円・回収ライン月343,800円）。見直す画面には回収ラインが表示されるため誤解は抑えられるが、並び順・候補条件（例：回収ラインが一定以上のカードを下げる）の見直し要否は利用者判断とし、残課題に記載。

### 25.5 テスト
- 提案の計算仕様（S01〜S07）は、候補を初期5枚に絞ったマスタで従来の期待値のまま検証。21枚での動きは S08・S09 で確認
- 新規利用者は保有0枚のため、E2E の前準備で初期5枚を一覧から選ぶ
- 結果は `design/test_report.md`「統合 v1.13」


---

## 26. 残課題3〜13の調査の反映（v1.14・2026-09-25）

### 26.1 調査結果とマスタの変更（ルール版 2026.09.25-1）

| 課題 | 調査結果 | マスタ・実装の変更 |
|---|---|---|
| 4 Suicaのチャージ元 | 一般カード（三井住友・JCB・三菱UFJ系など）はモバイルSuicaへのチャージにポイントが付かない。ビューカードは1.5% | ビューカード スタンダードを追加（26.3）。`suica_ride` の注記を更新 |
| 6 ANAのPayPay | 三井住友カード発行の個人向けカード（ANAカード等の提携カードを含む）は2026/9以降も従来方式で継続（PayPay公式） | `ana_paypay` を信頼度 high、要確認を解除 |
| 6 三菱UFJ 7% | 対象はカード・カードのタッチ決済・Apple Pay（QUICPay）。スマホのVisaタッチ・Google Payは対象外 | 変更なし（もともとスマホのタッチ決済の経路を持たない） |
| 6 JRE POINT改定 | 2026/9の改定は駅ビル・エキナカのポイント（JRE CARD等）。乗車はモバイルSuicaで50円＝1ptのまま | `suica_ride` を信頼度 high、要確認を解除 |
| 6 7%の計算単位 | 三井住友カードは1か月の利用金額の合計200円ごとに計算 | 三井住友カード ゴールド（NL）・（NL）・Olive・プラチナプリファードの全経路を `monthlyTotal` に（26.4） |
| 7 PayPayゴールド初年度 | 初年度は入会月を含む13か月で6,000pt（別に新規入会特典5,000pt）、2年目以降は年会費更新月（入会月の翌月）を含む12か月で11,000pt | `ppg_1m` に `firstPeriodMonths: 13`・`firstPeriodValueYen: 6000`（26.2） |
| 11 dカード | 一般カードは2027年1月利用分から0.5%。d払い（dカード設定）は1%維持、新番号のスマホのタッチ決済は2027年5月から1% | 注記と出典を更新（要確認は継続。2027年1月にマスタ更新） |
| 11 dカード GOLD | 年間100万円で10,000円相当（200万円区分は廃止）。集計は12月16日〜翌年12月15日 | `dg_1m` を `valueYen: 10000`・`periodType: fixed`・`fixedStartMonthDay: "12-16"`、信頼度 medium |
| 13 OSMブランド識別子 | 日本のブランド別に識別子と表記ゆれ・店舗数をまとめたデータセット（yuiseki/osm-wikidata-brand-jp、2026-08-31時点、ODbL） | F13 の実装時に付与 |

### 26.2 ボーナス期間の種類（`domain/types.ts`・`domain/bonus.ts`）

**型の追加**

```ts
interface Bonus {
  periodType: 'joinMonth' | 'fixed';
  fixedStartMonthDay?: string;      // fixed の開始月日 'MM-DD'
  firstPeriodMonths?: number;       // 入会初年度の月数（入会月から数える。12〜24）
  firstPeriodValueYen?: number;     // 入会初年度の特典額
  // 既存の項目は変更なし
}
interface GoalStatus { /* 既存 */ firstPeriod: boolean }
```

**`periodFor(bonus, joinYm | undefined, today): { start, end, first } | null`**

1. `fixed`：今年の開始月日が今日より後なら前年の開始月日を開始日とし、終了日は1年後の開始月日の前日。入会年月は使わない
2. `joinMonth` で入会年月がない：`null`（状態は unset）
3. `firstPeriodMonths` があり、今日が「入会月の1日〜入会月＋(月数−1)の末日」に入る：その期間を `first: true` で返す
4. それ以外：従来の `bonusPeriod(joinYm, startOffsetMonths, today)`

| ボーナス | 入会 | 今日 | 期間 | 初年度 |
|---|---|---|---|---|
| PayPayゴールド | 2026-03 | 2026-09-22 | 2026-03-01〜2027-03-31 | ○ |
| PayPayゴールド | 2026-03 | 2027-04-01 | 2027-04-01〜2028-03-31 | |
| PayPayゴールド | 2023-05 | 2026-09-22 | 2026-06-01〜2027-05-31 | |
| dカード GOLD | なし | 2026-09-22 | 2025-12-16〜2026-12-15 | |
| dカード GOLD | なし | 2026-12-16 | 2026-12-16〜2027-12-15 | |

**変更する関数**
- `goalStatus`：期間を `periodFor` で求め、`firstPeriod` を返す。手動期限は従来どおり優先
- `bonusValueYen(bonus, goal, firstPeriod = false)`：初年度で `firstPeriodValueYen` があればその額、なければ `valueYen`。初回特典の扱いは従来どおり
- 推奨エンジン：`bonusValueYen(bonus, goal, st.firstPeriod)` で加算率を求める
- `rolloverGoals`：期間を `periodFor` で求める。固定期間は入会年月がなくても繰り越す（保有カードの目標のみ）
- 参照実装 `ref_engine.py` に同じ `period_for` を追加

マスタ生成の検証に、`periodType` の値、`fixedStartMonthDay` の形式、`firstPeriodMonths` の範囲（12〜24）を追加。

### 26.3 ビューカード スタンダード

| 項目 | 値 |
|---|---|
| カード | `view_std`、年会費524円、JRE POINT、カード会社「ビューカード」、区分 定番・マニア推奨 |
| 通常の経路 | カード・スマホのタッチ決済・ネット：1,000円＝5pt（0.5%、月間合計） |
| モバイルSuica乗車 | 経路 `view_suica_ride`（支払い方法 `mobile_suica_ride`）：乗車ポイント2%＋チャージ1.5%＝3.5%（月間合計・概算） |
| 含めないもの | ビューサンクスボーナス（年間利用額に応じた段階制）、駅ビル・エキナカの上乗せ（該当する店舗がマスタにない） |

Suica乗車は、チャージ元がビューカードなら `view_suica_ride`（3.5%）、それ以外は従来のカード以外の経路 `suica_ride`（2%）が1位になる。一般カードはチャージにポイントが付かないため、他のカードにSuica乗車の経路は持たせない。

### 26.4 三井住友系の計算単位

三井住友カード ゴールド（NL）・三井住友カード（NL）・Olive・プラチナプリファードの全経路（PayPayを含む）を `unitScope: monthlyTotal` に変更。推奨の率・順位は変わらず、金額入力時のポイント数が「概算」表示になる（例：セブンで850円・7% → 従来56円、変更後 約59円）。ANA・Amazon Mastercard など他の三井住友カード発行の提携カードは、公式の計算単位を確認していないため従来どおり。

### 26.5 テスト

| 区分 | 内容 |
|---|---|
| ゴールデン（追加） | G44 PayPayゴールド初年度 1%＋0.6%、G45 2年目 1%＋1.1%、G46 dカード GOLD（入会年月なし）1%＋1%、G47 JR東日本 ビューカード3.5%＞Suica乗車2%、G48 三井住友ゴールド（NL）ファミマ1,050円＝約5円。期間 Q01〜Q09（26.2 の表を含む） |
| ゴールデン（結果の変化） | G14・G15：三井住友のポイント数が概算表示に（G14 は56円→約59円）。率・順位は全件不変 |
| 単体（追加） | `periodFor`（入会年月なし・固定期間）、初年度の期限・特典額、固定期間の繰り越し |
| 単体（期待値の更新） | 付与単位の境界テストの例を ANA（1回ごと）に変更、要確認の警告テストの例を dカード に変更（Suica乗車の要確認を解除したため） |

### 26.6 見直すタブの年会費回収計算

分冊（`design/detailed_design_card_suggest.md`）10章。


---

## 27. 近くのお店から選ぶ（F13・v1.15）

基本設計書 v1.9 の 4.6 節を実装するための詳細。検索先は OpenStreetMap（Overpass API）と Yahoo!ローカルサーチ（YOLP）の2つ。

### 27.1 ファイル構成

```
src/domain/nearby.ts          … 純粋関数：紐付け・距離・並べ替え・再利用判定・問い合わせ文の組み立て・応答の変換
src/ui/nearbyService.ts       … 位置情報の取得、Overpass への問い合わせ（fetch）、YOLP への問い合わせ（JSONP）
src/ui/screens/nearby.tsx     … S10 近くのお店
（変更）src/domain/types.ts    … UserSettings に近くのお店の設定
（変更）src/domain/settings.ts … reconcile で設定値を検査
（変更）src/ui/app.tsx         … ルート 'nearby' を追加（タブ外）
（変更）src/ui/screens/home.tsx     … 検索欄の横に「近くのお店」ボタン
（変更）src/ui/screens/settings.tsx … 「近くのお店」パネル
（変更）src/ui/style.css
```

Service Worker は他のオリジンへの要求を扱わない（既存の実装どおり）ため変更しない。

### 27.2 データ

```ts
// UserSettings（すべて省略可。schemaVersion は1のまま）
nearbyEnabled?: boolean;                 // 未設定＝ON
nearbyProvider?: 'osm' | 'yolp';         // 未設定＝'osm'
nearbyRadiusM?: 100 | 300 | 500 | 1000;  // 未設定＝300
nearbyConsent?: { osm?: YMD; yolp?: YMD }; // 検索先ごとの同意日
```

- YOLP のアプリIDは `meta` ストアの `yolpAppId` に保存し、`UserSettings` には入れない（バックアップに含めないため）。「設定を初期化」では消える
- `reconcile`：`nearbyProvider`・`nearbyRadiusM` が想定外の値なら削除（既定値に戻る）。`nearbyConsent` の日付が不正なら削除
- `Store` に `osmBrandWikidata?: string[]`（任意）。今回はセブン-イレブン（Q259340）のみ登録し、残りは課題13で付与する。未登録の店舗は店名で紐付ける

### 27.3 紐付け（`domain/nearby.ts`）

```ts
export interface Place {            // 検索先の応答を共通の形にしたもの
  id: string;                       // 'osm:node/123' 'yolp:xxxx'
  name: string; brand?: string; brandWikidata?: string; branch?: string;
  lat: number; lon: number;
}
export interface NearbyItem { storeId: Id; place: Place; distanceM: number; label: string }
buildNearbyIndex(mi): NearbyIndex
matchPlace(idx, place): Id | null
toNearbyItems(mi, idx, places, origin, radiusM, limit = 20): NearbyItem[]
```

**対象店舗**：カテゴリが EC・交通・自販機以外で、受け付ける支払い方法がネット注文だけではない店舗。

**キー**：店舗の名前と別名を F01 と同じ `normalize` にかけたもの。

**判定の順序**（最初に決まったもので確定）
1. `brandWikidata` が店舗の `osmBrandWikidata` に含まれる
2. `brand` の正規化がキーと完全一致
3. `name` の正規化がキーと完全一致
4. `name` を空白で区切った先頭の語の正規化がキーと完全一致（例「セブン-イレブン 辻堂駅前店」）
5. `name` の正規化がキーで始まり、残りが「ひらがな以外の文字で始まり」「店で終わる」（例「マクドナルド辻堂店」）。カタカナはひらがなに正規化されるため、「サンクス辻堂店」が「サンク」に紐付くような誤りを防げる
6. 2〜5で複数の店舗が当てはまるときは、長いキーの店舗を採用（例「ローソンストア100」は「ローソン」より優先）

**距離**：球面の2点間距離（半径6,371,000mの球）。1m単位で四捨五入。

**並べ替え・件数**：距離の近い順 → 店舗ID。半径を超えるもの・紐付かないものは除く。同じ `Place.id` は1件にまとめる。最大20件。

**表示名（label）**：`branch` があれば「店舗名 支店名」、なければ OSM／YOLP の名前が店舗名と異なるときはその名前、同じなら店舗名。

### 27.4 問い合わせ

**座標の丸め**：緯度・経度を小数点以下4桁に四捨五入してから送る（`roundCoord`）。

**Overpass**
- 送り先：`https://overpass-api.de/api/interpreter`（POST、`data=` にクエリ。`application/x-www-form-urlencoded`）
- クエリ（`buildOverpassQuery(lat, lon, radiusM)`）

```
[out:json][timeout:10];
(
  nwr(around:{r},{lat},{lon})[shop];
  nwr(around:{r},{lat},{lon})[amenity~"^(restaurant|fast_food|cafe|pharmacy|ice_cream|food_court)$"];
);
out center tags 200;
```

- 変換（`parseOverpass`）：`lat/lon`（way・relation は `center`）、`name:ja` → `name` の順で名前、`brand:ja` → `brand` の順でブランド、`brand:wikidata`、`branch`。名前もブランドもない要素は捨てる

**YOLP**
- 送り先：`https://map.yahooapis.jp/search/local/V1/localSearch`（JSONP）。パラメータ `appid`・`lat`・`lon`・`dist`（km。半径÷1000）・`sort=dist`・`results=100`・`output=json`・`callback`
- 変換（`parseYolp`）：`Feature[]` の `Name`、`Geometry.Coordinates`（「経度,緯度」）、`Id`。ブランドの項目はないため店名だけで紐付ける
- パラメータ名・応答の形は公開資料からの想定。課題17で実際の応答を確認し、違えばこの変換だけを直す

**時間切れ**：位置情報10秒、問い合わせ10秒。

**再利用**（`canReuse(cache, provider, radiusM, lat, lon, nowMs)`）：同じ検索先・同じ半径で、前回から5分以内かつ50m以内なら前回の結果を使う。結果はメモリ上だけに持つ。

**位置情報**：`getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 })`。精度が100mより粗いときは注記を出す。

### 27.5 異常の分類（`NearbyError`）

| 種類 | 条件 | 表示 |
|---|---|---|
| `offline` | `navigator.onLine === false` | 近くのお店はネット接続が必要です |
| `denied` | 位置情報の許可なし（`PERMISSION_DENIED`） | 位置情報の利用が許可されていません。端末の設定で、ブラウザ（またはホーム画面のアプリ）に位置情報を許可してください |
| `position` | 位置が取れない・時間切れ | 現在地を取得できませんでした |
| `appid` | YOLP を選んでいてアプリIDが未入力、または YOLP の応答が認証エラー | Yahoo!ローカルサーチのアプリIDを設定してください（設定へのボタン） |
| `server` | 応答のエラー・時間切れ・形式の誤り | 近くのお店を取得できませんでした。時間をおいて再試行してください |

どの場合も「再試行」「名前で探す」「カテゴリから選ぶ」を出す（`appid` は「設定へ」も）。

### 27.6 画面

**S01 ホーム**：検索欄の右に「📍 近くのお店」ボタン（`#nearby-btn`）。`nearbyEnabled === false` なら出さない。

**S10 近くのお店**（`#/nearby`・タブ外。下部タブは「おすすめ」を選択状態で表示）
1. 見出し「近くのお店」、戻るボタン（ホームへ）
2. 選んだ検索先に同意していない：説明「現在地を{OpenStreetMap／Yahoo! JAPAN}のサーバに送って、近くのお店を探します。送る位置は約10m単位に丸めます。アプリは位置を保存しません。」とボタン「同意して探す」（`#nearby-consent`）・「やめる」。同意したら `nearbyConsent[provider] = 今日` を保存して検索を始める
3. 検索中：「現在地を確認しています…」→「近くのお店を探しています…」
4. 結果：「半径{r}m・{n}件」、精度の注記（必要なとき）、一覧（`.nearby-item`：店舗名・支店名、距離「約120m」、高還元ラベル（S02 と同じ `highlightLabel`））。タップで `ctx.selectStore(storeId)`（最近使った店に追加され、ホームに推奨を表示）
5. 0件：「半径{r}mに、登録しているお店が見つかりませんでした」と「半径を広げる（{次の半径}m）」（1000mのときは出さない）
6. 一覧の下：「一覧にないお店は」＋「名前で探す」「カテゴリから選ぶ」、再検索ボタン、出典（OSM：「© OpenStreetMap contributors（ODbL）」とリンク、YOLP：「Web Services by Yahoo! JAPAN」とリンク）

**S06 設定**：「近くのお店」パネル
- チェックボックス「近くのお店ボタンを表示する」（`#nearby-enabled`）
- 検索先（ラジオ `#nearby-provider-osm` / `#nearby-provider-yolp`）。YOLP はアプリIDが保存されていなければ選べない（無効化し「アプリIDを入力すると選べます」）
- 検索半径（セレクト `#nearby-radius`：100／300／500／1000m）
- YOLP のアプリID（`#yolp-appid`、保存ボタン、削除ボタン）。「このIDは端末内にだけ保存し、バックアップには含めません」
- 「位置情報の送信への同意を取り消す」ボタン（同意がある場合）
- 地図データの出典（両方）

### 27.7 テスト

**単体（`tests/unit/nearby.test.ts`）**

| ID | 観点 |
|---|---|
| N01 | 距離：同じ点は0m、緯度0.001度≒111m |
| N02 | 座標の丸め：小数点以下4桁 |
| N03 | 紐付け：ブランド識別子（セブン Q259340）・ブランド名の完全一致・名前の完全一致 |
| N04 | 紐付け：「セブン-イレブン 辻堂駅前店」「マクドナルド辻堂店」は紐付く。「サンクス辻堂店」「マックハウス」「イオンモール藤沢」は紐付かない |
| N05 | 紐付け：「ローソンストア100 藤沢店」はローソンストア100（長いキー優先） |
| N06 | 対象外：EC・交通・自販機、ネット注文のみの店舗（ピザハット） |
| N07 | 並べ替え：距離順・半径外を除く・同じIDを1件に・最大20件・表示名 |
| N08 | 再利用：5分以内かつ50m以内・検索先や半径が違えば不可 |
| N09 | Overpass：クエリの組み立て（丸めた座標・半径）、応答の変換（node／way の center、name:ja 優先、名前なしは捨てる） |
| N10 | YOLP：URLの組み立て（dist はkm）、応答の変換（「経度,緯度」の順） |
| N11 | `reconcile`：想定外の検索先・半径・同意日を取り除く |

**E2E**（Playwright。位置情報は `geolocation` と権限を設定、Overpass・YOLP はルーティングで応答をモックし、実サーバに依存しない）

| ID | シナリオ |
|---|---|
| E21 | 近くのお店 → 初回の同意 → 一覧（距離順・未登録のお店は出ない・出典）→ セブンをタップでホームに推奨（7%）。最近使った店に追加 |
| E22 | 2回目は同意を聞かない。5分以内の再表示は問い合わせない（要求回数で確認） |
| E23 | 0件 → 「半径を広げる」で500mの問い合わせ |
| E24 | 位置情報の権限なし → 案内と「名前で探す」 |
| E25 | 問い合わせが500 → 再試行ボタン。オフライン → 「ネット接続が必要です」 |
| E26 | 設定で YOLP（アプリID入力）に切り替え → 同意をもう一度聞く → JSONP の応答で一覧 |
| E27 | 設定でOFF → ホームにボタンが出ない |
| E28 | S10 のコントラスト4.5:1以上（E21 の中で確認） |

### 27.8 実装時の変更

- 高還元ラベルは率の高い順に3件まで表示する（保有カードが多いと一覧が読みにくいため）
- ホームのボタンの表記は「📍 近く」（検索欄の幅を確保するため。読み上げは「近くのお店から選ぶ」）
- 設定画面の「このアプリについて」の文言を「近くのお店を探すとき以外、入力内容が外部に送信されることはありません」に変更
- E2E は `tests/e2e/e2e.mjs` に追加（E21〜E27）。`ONLY` 環境変数で一部だけ実行できる


---

## 28. プロジェクト内ファイルの整理（v1.16・2026-09-25）

### 28.1 経緯
プロジェクトに保存されていたファイルは、設計書・E2E・ビルド済み `dist`・マスタが統合 v1.13 の版だった一方、`src` の多く（`types.ts`・`settings.ts`・`app.tsx`・`cards.tsx`・`home.tsx`・`info.tsx`・`category.tsx`・`settings.tsx`・`format.ts` と単体テスト）は v1.6 以前の版で、`domain/catalog.ts`・`domain/theme.ts` がなかった。利用者は git を使っていないため、プロジェクト内のファイルだけで整合がとれる状態に整理する。

### 28.2 方針
- 20〜24章の設計と、最新のビルド（`dist/index.html` の整形結果）・E2E（E14〜E18）を仕様として、欠けていた実装を復元する
- 復元した部分：`Card` の項目（略称・よみ・区分・特徴・会社）と `ThemeId`、マスタ検証、新規利用者の保有0枚、`domain/catalog.ts`（一覧・絞り込み・検索・会社順・追加／外す）、`domain/theme.ts`、S03 の「保有カード／カード一覧から選ぶ」、S01 の案内、S05 の保有カード優先と折りたたみ、S02 の略称、S06 の配色、配色の適用（`data-theme`・`theme-color`）、支払い方法の表記「スマホのタッチ決済」
- v1.14（ボーナス期間・ビューカード・三井住友の月間合計）、v1.15（近くのお店・年会費の損得）はこの上に載せる

### 28.3 テスト
- 単体：`catalog.test.ts` を追加（C01〜C08・T01〜T02・S08〜S09）。`domain.test.ts`・`suggest.test.ts` は新規利用者0枚に合わせ、初期5枚を持たせる形にした。提案の計算仕様（S01〜S07）は候補を初期5枚に絞ったマスタで検証
- E2E：E06 の期待値を三井住友の月間合計（約59円）に更新
- 結果は `design/test_report.md`「整理 v1.16」


---

## 29. 残課題の調査結果（v1.17・2026-09-26）

### 29.1 マスタの修正（課題11・19、ルール版 2026.09.26-1）
`master/collection_report.md` 9章のとおり。主な影響：
- 対象のコンビニ・飲食店で Olive が8%になり、全カードでの提案（見直すタブ）の1位が Amazon Mastercard から Olive に変わる（楽天のみ・月5万円で年＋33,600円）
- Amazon Mastercard が上がるお店はセブン‐イレブンのみ（Apple Pay）
- JR東日本の乗車は、楽天カードを持っていれば楽天ペイ経由のチャージで2.5%（ビューカードは3.5%）
- ビューカードに年間ボーナス（固定期間 4/1〜3/31）

### 29.2 YOLP（課題17）
- 呼び出し：JSONP（`callback`）に対応。`lat`・`lon`・`dist`（km、最大20）・`sort=dist`（2点間の直線距離順。`geo` は球面三角法でより遅い）・`results`（最大100）・`output=json` は実装どおり。応答の `Feature[].Name`・`Gid`・`Geometry.Coordinates`（経度,緯度）も一致
- 追加する指定：`device=mobile`（モバイル端末で掲載できない情報を除く）、`group=gid`（名寄せされた同じ店舗を1件に）
- クレジット：所定のHTML（「Web Services by Yahoo! JAPAN」を https://developer.yahoo.co.jp/sitemap/ へリンクし、指定の余白を付けた span）を**改変せず**、YOLP を使う画面の下部に置く。色・大きさをCSSで変えることは禁止。現在の実装は独自のクラスで表示しているため、所定のHTMLに差し替える（実装待ち）
- 料金：個人・法人とも基本無償。有償版が必要なのは、特定の人しか使えない非公開サイト、1日5万回以上、有償アプリ・有償サービス。広告収入があっても、サービスが無償で一般公開されていれば無償
- 注意：本番版を認証付きの非公開ページで公開する場合は有償版の対象になる。GitHub Pages の公開URLなら対象外

### 29.3 Overpass の切り替え（課題15）
- 公開インスタンスの目安は1利用者あたり1日約1万回・1GB。本アプリの利用（手動操作のたび1回）は十分に小さい
- 方針：時間切れ・429・5xx のときだけ、`overpass-api.de` → `overpass.kumi.systems` → `overpass.private.coffee` の順に1回ずつ試す。3つとも失敗したら従来どおり再試行ボタン。どこも同じ OpenStreetMap のデータなので、同意（OpenStreetMap への送信）はそのまま有効とする
- 実装：`nearbyService.ts` の接続先を配列にし、E2E に「1つ目が504→2つ目で成功」を追加（実装待ち）

### 29.4 実質還元率の近似（課題3）
- 現行：ボーナスを狙う設定のカードは、特典額÷条件額（例：100万円で1万円→＋1%）を常に加算する
- 評価：平均化の考え方自体は妥当（直前の達成間近のときの限界価値は大きいが、利用者に説明しやすい平均を採用）。問題は、残り期間で到底届かない場合も加算されること（例：残り3か月で残り90万円、月30万円必要でも＋1%）
- 方針：見直すタブの「月のカード利用額」を使い、**達成に必要な月額が月の利用額を超える場合は加算しない**。その場合は推奨の理由欄に「月◯円必要（月の利用額を超えるため加算していません）」と出す。月の利用額を設定していない場合は既定の5万円で判定
- 実装待ち（次の実装時に、おすすめの対象切り替えと合わせて行う）

### 29.5 公開版での利用条件（課題16）
- Overpass：上記の目安。利用者が増える場合は、事前抽出して同梱する方式か、専用インスタンスを検討
- YOLP：29.2 の条件。公開版で利用者ごとにアプリIDを入力させる現行方式は、各利用者の利用量で判定される
- プライバシーポリシー：現在地を丸めて外部に送る旨、送り先、保存しない旨を記載する（公開時）

### 29.6 課題13（OSMブランド識別子）
この環境からデータセットをまとめて取得できないため、今回は付与しない。店名での紐付けで主要チェーンは紐付いている（単体テスト N03〜N05）。実機で紐付け漏れが見つかった店舗から、個別に識別子か別名を追加する。

---

## 30. おすすめの比較範囲の切り替え（v1.18・2026-09-26）

### 30.1 利用者の決定事項

| No | 内容 |
|---|---|
| R1 | 保有カードが0枚のときは、登録カード（22枚）全体でおすすめする |
| R2 | 保有カードを選んだ後は、結果の上で「持っているカード｜登録カード（22枚）」を切り替えられる。既定は「持っているカード」 |
| R3 | 登録カード表示では、各カードに「保有」「未保有」の印を付ける。未保有カードには公式サイトへのリンクを出し、アフィリエイトのリンクなら「PR」と表記する |
| R4 | 登録カード表示の結果の下に「アプリに登録している主なカード22枚の中での比較です。日本のすべてのカードではありません」と注記する（枚数はマスタのカード枚数。v1.20以降はその他のカードを含めない） |
| R5 | 登録カード表示では、未保有カードの提案ヒント（①）は出さない。ボーナスの加算とポイント払いの提案は、持っているカードだけで判定する |
| R6 | 区分名「マニア推奨」を「ポイ活向け」に変更する（区分IDの `enthusiast` は変えない） |
| R7 | 見直すタブの利用額は、提案カードか年会費のある保有カードがあるときだけ表示する。普段は1行、［変更］で入力欄を開く（A案。分冊11章） |

### 30.2 推奨エンジン（`domain/engine.ts`）

```ts
export type RecommendScope = 'owned' | 'all';
export interface RecommendQuery { storeId?: Id; categoryId?: Id; amountYen?: number; scope?: RecommendScope } // 既定 'owned'
```

- **候補経路**：`owned` は従来どおり（保有カード×有効な支払い方法、有効にしたカード以外の経路）。`all` はこれに、持っていないカードの経路をすべて加える（支払い方法はマスタにある経路すべて。店舗で使えるものに限るのは従来どおり）。持っているカードは `all` でも利用者が有効にした支払い方法だけを使う
- **並べ替え**：従来の順（実質還元率 → ボーナス対象 → 優先順 → 経路ID）。持っていないカードの優先順は `1000＋マスタの定義順` とし、同率なら持っているカードが先になる
- **ボーナス**：持っているカードの経路だけに加算する。カードを外しても目標（`bonusGoals`）は残るため、目標があっても持っていないカードには加算しない（`owned` の結果は変わらない）
- **ポイント払い**：`all` のときも `owned` で求めた1位をもとに判定する（`recommend({...q, scope: 'owned'}).pointPay`）
- `RecommendItem`・`RecommendResult` の形は変えない（ゴールデンケースは `owned` のまま一致）

### 30.3 画面（S01 おすすめ）

- 比較範囲：`AppState.recScope`（既定 `'owned'`。保存しない）。保有カードが0枚なら常に `'all'` として扱い、切り替えは出さない
- 切り替え：結果見出しの下に2分割のボタン（`#scope-owned`「持っているカード」／`#scope-all`「登録カード（{マスタのカード枚数}枚）」、`role="tab"`・`aria-selected`）。見た目はカード画面の切り替え（`.segs`）と同じ
- 登録カード表示の各順位：カード名の右に印（`.own-yes`「保有」＝成功色／`.own-no`「未保有」＝グレー）。カード以外の経路（PayPay残高など）には印を付けない
- 未保有カードのリンク：`linkFor`（分冊5章）で期間内のアフィリエイトリンク → 公式サイトの順に選び、「公式サイトを見る」を出す。アフィリエイトのときは左に「PR」、`rel` に `sponsored` を付ける。保有カードにはリンクを出さない
- 注記（`#scope-note`）：結果の直後に R4 の文言
- ①ヒント：登録カード表示では判定そのものを行わない（表示記録も更新しない）。「持っているカード」に戻すと従来どおり判定する
- 案内（保有0枚）：「今は登録カード（22枚）全体でおすすめしています。選ぶと、持っているカードの中から表示します。」に変更

### 30.4 テスト

| ID | 観点 |
|---|---|
| 単体 | 登録カード全体では未保有カードも候補（セブン：セブンカード・プラス 10%）、同率なら保有カードが先、保有0枚でも候補が出てポイント払いは出さない、ポイント払いは持っているカードで判定、未保有カードにボーナスを加算しない |
| E14 | 保有0枚：案内・3件すべて「未保有」・注記あり・切り替えなし。カードを選ぶと既定は「持っているカード」（印・注記なし）。区分「ポイ活向け」で絞り込み |
| E28 | 切り替え：登録カード（22枚）で1位セブンカード・プラスに「未保有」とリンク（PRなし）、注記、ヒントなし、コントラスト。戻すと印・注記が消えヒントが出る。ポイント払いは切り替えても同じ。保有カードにリンクなし |
| E19・E29 | 見直すタブの利用額（分冊11章） |

---

## 31. UIの見直し（v1.19・2026-09-26。設計のみ・未実装）

2026-09-26 の全画面レビューをもとに利用者が決めた内容。画面案（31.3）の確認後に実装する。

### 31.1 利用者の決定事項

| No | 区分 | 内容 |
|---|---|---|
| U1 | 近くのお店 | 一覧（S10）の高還元タグ（「三井住友G 7%」「三菱UFJ 7%」等）を**すべて外す**。店名と距離だけにして、お店を選んでもらい履歴を貯める。カテゴリの店舗一覧（S02）のタグは変更しない |
| U2 | タブ構成 | 「見直す」タブを**「カード診断」**に改名する。**ボーナスタブとポイント率（旧・還元情報）タブは廃止**し、タブを4つにする（おすすめ／カード／カード診断／設定） |
| U3 | ボーナス | 「このボーナスを狙う」と「今期は達成済み」だけをカードタブに移す。達成に向けた計算（累計・残り・期限・必要な月額）はカード診断タブへ。入力欄（累計・達成条件額・初回特典の達成済み・期限の手動変更）は折りたたむ |
| U4 | おすすめ | 同じカードは1枠にまとめる（31.2.3） |
| U5 | おすすめ | お店を選んだら結果の位置まで自動で移動する |
| U6 | おすすめ | 1位の理由は1行の要約にし、詳しい条件は折りたたむ |
| U7 | バックアップ | おすすめ画面上部のバックアップ案内をやめ、設定タブにだけ出す |
| U8 | カード | 支払い方法のチェックは廃止し、経路のある支払い方法はすべて使える前提にする。「カード以外の支払い」（PayPay残高・モバイルSuica）の選択は残す |
| U9 | カード診断 | カードごとの説明は、年間の損得の1行を残して内訳を折りたたむ |
| U10 | ポイント率 | タブをやめ、カードごとの「ポイント率」画面（カードタブ・おすすめの詳しい条件から開く）と、設定からの一覧（カードごとに折りたたみ）で見る（31.2.8） |
| U11 | 設定 | 近くのお店の検索先・Yahoo!ローカルサーチのアプリID・半径は「詳細設定」にまとめて折りたたむ。将来は管理者だけが設定する（公開版では利用者に見せない） |
| U12 | 用語 | 「持っている」「ポイント率」「おすすめ」に統一する（31.2.6） |
| U13 | ボーナス | おすすめでは年会費を考えず、ボーナスポイントだけを上乗せする。年会費無料になる初回特典は上乗せに含めない。加算は「狙う」がオンのときだけで、今期の達成済みは加算しない（31.2.4）。年会費の損得はカード診断だけで扱う |
| U14 | おすすめ | 比較範囲の切り替えの文言を「手持ちで比べる｜全22枚で比べる」にする（枚数はマスタのカード数） |

### 31.2 仕様

#### 31.2.1 タブと画面（U2・U3・U9）

| タブ | 内容 |
|---|---|
| おすすめ | 変更は U4〜U7・U14 |
| カード | 持っているカード：カードごとに優先順（↑↓）、ボーナスのあるカードだけ「入会年月」「このボーナスを狙う」「今期は達成済み」、「ポイント率を見る」、外すボタン。支払い方法のチェックはなし（U8）。カード一覧から選ぶ：各カードに「ポイント率を見る」を追加 |
| カード診断 | 上部で［持っているカード｜おすすめカード］を切り替え → 月のカード利用額（1行＋［変更］、共通の値）→ カードごとの説明 |
| 設定 | バックアップ（案内 U7 を含む）、ポイント率の一覧（31.2.8）、配色、カードの提案、詳細設定（U11） |

タブ外の画面：カテゴリ（S02）、近くのお店（S10）、広告の方針（S09）、カードのポイント率（S11・新設）、ポイント率の一覧（S05 を設定から開く形に変更）。

カード診断の［持っているカード］（年会費のある持っているカード・ボーナスのある持っているカードを表示）：
1. カード名・年会費、判定1行（「年会費を回収できています（年＋6,500円）」等。分冊10.4と同じ）
2. ボーナスを狙っているカード：進捗バー、累計／条件額、残り、期限、必要な月額、見込み（必要な月額と月の利用額の比較。「月5万円の利用では届きません」等）
3. 折りたたみ「内訳」：年間の上乗せ・ボーナス・年会費
4. 折りたたみ「ボーナスの入力」：今期の累計利用額、達成条件額、初回特典は達成済み、期限を手動で変更する

［おすすめカード］：分冊10.4の「追加すると得なカード」「年会費を回収できないカード」。各カードは「年間 ＋3,500円」と上がるお店の数を見せ、内訳・お店の一覧は折りたたむ（U9）。公式サイトへのリンク・PR表記・「このカードを持っている」は従来どおり。

切り替えの既定：持っているカードに年会費かボーナスのあるカードがあれば［持っているカード］、なければ［おすすめカード］。

#### 31.2.2 近くのお店（U1）
- `nearby.tsx` の `highlightTags` を一覧で使わない（関数はカテゴリ一覧と共通化していないため削除してよい）
- E21 の期待値は変わらない（タグは検証していない）。タグが出ないことを確認する行を追加する

#### 31.2.3 おすすめを1カード1枠に（U4）
- グループ化の単位を「カード×実質ポイント率」から「カード」に変える。各カードはいちばん高い実質ポイント率の経路で1枠とし、その率の支払い方法を並べる
- 同じカードの低い率の支払い方法は枠にしない。1位のカードに限り、折りたたみの詳しい条件に「カード・iD・PayPayは2.05%」のように添える
- カード以外の経路（PayPay残高など）は従来どおり経路ごとに1枠
- 影響：詳細設計 D1、`engine.ts` の grouping、参照実装 `master/ref_engine.py` とゴールデンケース（同じカードが複数枠に出るケース）を更新する

#### 31.2.4 ボーナスの上乗せ（U13）

```
上乗せ率 = ボーナスポイント ÷ 達成条件額
  ボーナスポイント = 特典額（valueYen。入会初年度だけ異なる場合は firstPeriodValueYen）
                     ※ 年会費無料になる初回特典（oneTimeValueYen）は含めない
```

加算する条件（すべて満たすとき）：
1. 「このボーナスを狙う」がオン
2. 今期は未達成（「今期は達成済み」がオフ、かつ累計 < 達成条件額）。達成済みなら、それ以上使ってもボーナスは増えないため加算しない
3. 期限内（入会年月か手動の期限がある）
4. その支払い方法がボーナスの集計対象

期限までに届くかどうか（月の利用額との比較）は加算の条件にしない。届かない見込みはカード診断で「月5万円の利用では期限までに届きません」と表示する。

| ボーナス | 従来 | 新 |
|---|---|---|
| 三井住友カード ゴールド（NL） | 1.55%（初回特典5,500円を含む） | **1.0%** |
| PayPayカード ゴールド | 1.1%（初年度0.6%） | 変更なし |
| 三井住友カード プラチナプリファード／dカード GOLD／エポスゴールド | 1.0% | 変更なし |
| マリオット・プレミアム／マリオット | 1.875%／2.0% | 変更なし |
| ビューカード スタンダード | 0.35% | 変更なし |

- 画面：1位は「8%」を大きく、下に「7% ＋ ボーナス1%」（ボーナスはバッジ）
- 影響：`bonus.ts` の `bonusValueYen` をおすすめ用（初回特典を除く）とカード診断用（従来どおり含む）に分ける。参照実装・ゴールデンケース（三井住友ゴールドのボーナス率）を更新
- 年会費の損得（初回特典を含む）はカード診断（分冊10章）で従来どおり計算する

#### 31.2.5 おすすめの画面（U5〜U7・U14）
- 自動移動：お店を選んだ直後に結果見出しへ `scrollIntoView`（`prefers-reduced-motion` なら瞬時）。入力欄に文字がある間は移動しない
- 理由の要約：1行目に「セブン-イレブンで7%＋ボーナス1%」。条件の全文、ボーナスの残り・期限、同じカードの別の支払い方法は［詳しい条件］の折りたたみへ
- バックアップ案内：おすすめ画面では出さず、設定タブのバックアップ欄の上に出す
- 切り替え：`#scope-owned`「手持ちで比べる」／`#scope-all`「全{カード数}枚で比べる」

#### 31.2.6 用語の統一（U12）

| 統一後 | 置き換える語 | 主な箇所 |
|---|---|---|
| 持っている | 保有 | 「保有カード（3）」→「持っているカード（3）」、印「保有／未保有」→「持っている／持っていない」、「保有カードから外す」→「持っているカードから外す」、「保有中」→「持っている」 |
| ポイント率 | 還元率・還元 | タブ「還元情報」→「ポイント率」、「通常還元」→「通常のポイント率」、「還元ルール確認日」→「ポイント率の確認日」、「還元アップ」→「ポイント率アップ」 |
| おすすめ | 推奨 | 画面の文言（設計書内の用語は変えない） |

#### 31.2.8 ポイント率の見せ方（U10）
- **カードのポイント率（S11・新設）**：1枚のカードについて、支払い方法ごとの率・付与単位・出典・確認日、特約のお店（折りたたみ）、ボーナスの内容。カードタブの「ポイント率を見る」と、おすすめの［詳しい条件］の中のリンクから開く。「‹ 戻る」で元の画面へ
- **ポイント率の一覧**：設定タブの「ポイント率の一覧（出典・確認日）」から開く。旧・還元情報タブと同じ内容を、カードごとに折りたたんで表示。末尾にポイントの価値（1pt＝何円）
- 還元ルールの版・確認日は、一覧の先頭と設定の「このアプリについて」に表示する

#### 31.2.7 支払い方法の選択廃止（U8）
- `OwnedCard.enabledMethods` は残し、常に「経路のある支払い方法すべて」にする（バックアップの互換のため）。起動時の整理（`reconcile`）で既存の設定もすべてオンに戻す
- カードタブの「使う支払い方法」を削除。説明文は「同じポイント率のときは上のカードを優先します」だけにする

### 31.3 画面案（確認用）
`design/mockups/ui_review_2026-09-26.html`（スクリーンショット：同フォルダの PNG）。おすすめ、カードタブ、カード診断の［持っているカード］［おすすめカード］、カードのポイント率（S11）、設定を示す。タブ名は「カード診断」、タブは4つに決定（2026-09-26）。

### 31.4 テストの見込み
- 更新：E02（ボーナスの率）、E04・E08（還元情報タブの廃止）、E10〜E13・E19・E28・E29（見直すタブの文言・構成）、E14・E15（支払い方法の欄）、E16〜E18（タブ数）、E21（タグなし）、ゴールデン（1カード1枠・ボーナス率）
- 追加：自動移動、理由の折りたたみ、カード診断の切り替えの既定、`reconcile` で支払い方法がすべてオンになること

### 31.5 実装状況
| 段階 | 内容 | 状態 |
|---|---|---|
| 1 | おすすめ画面（U1・U4〜U7・U13・U14）と用語の統一（U12） | 実装済み（2026-09-26）。ゴールデン12件の期待値を更新（1カード1枠・ボーナス率）。E30（自動移動）を追加 |
| 2 | タブの再構成（U2・U3・U8〜U11） | 実装済み（2026-09-26）。タブは4つ、ボーナスタブを廃止（`bonus.tsx` 削除）、ポイント率の一覧は設定から開く。折りたたみの開閉は再描画をまたいで保つ（`ui/fold.ts`） |
| 3 | カードのポイント率画面（S11） | 実装済み（2026-09-26）。`ui/screens/cardRate.tsx`（ルート `rate`）。入口はカードタブ（持っているカード・カード一覧）とおすすめの「詳しい条件」。戻ると開いた画面へ。行の描画は一覧（S05）と共通（`routeRows`） |


---

## 32. カードラインナップの再整理（v1.20・2026-09-26。設計のみ・未実装）

### 32.1 経緯

これまでの一覧は、目についたカードを1枚ずつ追加してきたため、次のような穴があった（収録22枚を点検した結果）。

- ランクの抜け：ANAは一般カードがない。楽天・三菱UFJ・au PAY・JCB・イオン・Olive・ビューカード・セブンカード・プラスはゴールドがない
- シリーズの抜け：JAL、セゾン、アメックスのプロパーカード
- 見出しを発行会社にしていることの弊害：ANA・Amazon・Oliveが「三井住友カード」の見出しの下に並ぶため、「ANAのカード」を探す人の感覚と合わない

そこで一覧を「シリーズ → ランク」の2段構成に変え、シリーズごとに一般からゴールドまでを揃えて収録する。

### 32.2 利用者の決定事項

| No | 区分 | 内容 |
|---|---|---|
| L1 | 収録基準 | シリーズを収録したら、ゴールドが発行されている限り「一般」と「ゴールド」を必ずセットで入れる。ゴールドが発行されていないシリーズ（Amazon Mastercard・リクルートカード）は一般だけで残す（外さない）。プラチナはポイント率に差があるものだけ入れる。シリーズは今の区分（定番／ポイ活向け）で選ぶ |
| L2 | まとめ方 | 同じシリーズで還元ルール（率・付与単位・特約）が同じなら、国際ブランドの違いは1枚のカードの属性として扱う。ルールが違えば別のカードにする。発行会社が違う（例：ANA VISA は三井住友カード、ANA JCB はJCB）ことはルールが違う目安であって、判断の基準はルールの違いそのもの |
| L3 | その他のカード | 一覧にないカードを持っている人のために「その他のカード」を用意する。基本のポイント率とポイントを選ぶだけで、おすすめの候補に加わる（32.8） |
| L4 | 見出し | 見出しをシリーズ名にし、シリーズ内は「一般 → ゴールド → プラチナ」の順に並べる |
| L5 | 検索 | 「JAL」「ゴールド」のような語で、シリーズ名やランクにも当たるようにする |
| L6 | ID | 既存のカードIDとルートIDは変えない（保存済みの設定とゴールデンケースをそのまま使うため） |
| L7 | ポイントの評価 | ANAマイル・JALマイルは1マイル＝1円、永久不滅ポイントは1pt＝5円、メンバーシップ・リワードは1pt＝0.3円とする（32.4） |
| L8 | ランク | ランクは名前ではなく券種の位置付けで決める。JCB CARD W と JCBゴールドは同じ「JCBオリジナルシリーズ」に入れる。Marriott Bonvoy アメックスは残し、通常をゴールド、プレミアムをプラチナとする |
| L9 | 全N枚で比べる | 全カードで比べるときは、同じシリーズで同じ率のカードを1枠にまとめる（32.7） |
| L11 | カード以外の支払い | 単独で使うコード決済・電子マネー（d払い残高・楽天ペイ・au PAY・WAON・nanaco・楽天Edy）を「カード以外の支払い」に加える。マスタの追加だけで、推奨エンジンは変えない。現金は比べる対象にせず、現金しか使えない店に注記を出す（32.11） |
| L10 | 楽天プレミアム | 楽天プレミアムカードは収録しない（基本が楽天カードと同じ1.0%で、L1の「プラチナはポイント率に差があるものだけ」に当たらないため） |

L8について：Marriott（100円＝3pt／2pt）と楽天プレミアム（1.0%）は、どちらも使った金額でポイント率が変わらない（楽天プレミアムはL10により収録しない）。使った金額で変わるのは、Marriottの年間利用額に応じた無料宿泊特典だけで、これはボーナスとしてマスタに入れ済み（21章）。

### 32.3 収録カード（第1弾）

「新」は追加するカード。還元率はマスタに入れる前に公開情報で調べ、`master/collection_report.md` に出典を記録する。IDは仮。

| シリーズ | 一般 | ゴールド | プラチナ |
|---|---|---|---|
| ANAカード | 新 ANA VISA一般（三井住友）、新 ANA JCB一般 | `ana_wide_gold`（ANA VISAワイドゴールド）、新 ANA JCBワイドゴールド | — |
| Amazon Mastercard | `amazon_mc` | （発行なし） | — |
| au PAY カード | `aupay_card` | 新 au PAY ゴールドカード | — |
| dカード | `dcard` | `dcard_gold` | — |
| JALカード | 新 JAL普通カード | 新 JAL CLUB-Aゴールドカード | — |
| JCBオリジナルシリーズ | `jcb_w` | 新 JCBゴールド | — |
| Marriott Bonvoy アメックス | — | `marriott` | `marriott_premium` |
| Olive | `olive` | 新 Olive ゴールド | — |
| PayPayカード | `paypay_card` | `paypay_gold` | — |
| アメリカン・エキスプレス | 新 グリーン | 新 ゴールド・プリファード | — |
| イオンカード | `aeon_select` | 新 イオンゴールドカード | — |
| エポスカード | `epos` | `epos_gold` | — |
| セゾンカード | 新（調査で決める） | 新（調査で決める） | — |
| セブンカード・プラス | `seven_plus` | 新 セブンカード・プラス ゴールド | — |
| ビューカード | `view_std` | 新 ビューゴールドプラス | — |
| 三井住友カード（NL） | `smbc_nl` | `smbc_gold_nl` | `smbc_pp`（プラチナプリファード） |
| 三菱UFJカード | `mufg` | 新 ゴールド、新 ゴールドプレステージ | — |
| 楽天カード | `rakuten` | 新 楽天ゴールドカード | —（楽天プレミアムは収録しない。L10） |
| リクルートカード | `recruit` | （発行なし） | — |

- 新しく加えるのは約19枚（JALの発行会社別の枚数は、L2に沿って還元ルールを調べてから決める）。登録は約41枚になる
- 楽天ゴールド・JCBゴールドのように、このアプリ上では「ポイント率は一般カードと同じか低く、年会費だけ高い」カードもある。一覧を揃えるために収録する
- 区分（`segments`）は追加するカードにも1枚ずつ付ける

### 32.4 ポイントの評価（L7）

| ポイント | 評価 | 根拠 |
|---|---|---|
| ANAマイル（新 `ana_mile`） | 1マイル＝1円 | ANA SKY コインに1マイル＝1コイン（10コイン＝10円）で交換できる。1万マイル以上の交換は1.2〜1.7倍になるが、下限を採る |
| JALマイル（新 `jal_mile`） | 1マイル＝1円 | e JALポイントに1,000マイル＝1,000ポイント（1pt＝1円）で交換できる。1万マイル単位なら1.5倍になるが、下限を採る |
| 永久不滅ポイント（新） | 1pt＝5円 | セゾン公式に「1ポイント＝約5円相当」とある。交換先によっては5円未満 |
| メンバーシップ・リワード（新） | 1pt＝0.3円 | 何も登録しない状態の基本レート。有料のメンバーシップ・リワード・プラス（年3,300円）に登録すると1pt＝1円になるが、登録しない前提で評価する。公式ページで再確認してからマスタに入れる |

**ANAの既存カードへの影響**
- 今はANAマイル移行用ポイントを「マイル換算せず1pt＝1円」（`ana_transfer_point`）で評価しており、ANA VISAワイドゴールドは0.5%になっている
- ワイドゴールドは1pt＝2マイルへの移行が手数料無料なので、1マイル＝1円に揃えると **1.0%** になる
- ANAカードの経路は、ポイントを `ana_mile` にしてマイル数で持つ（`ana_wide_gold`：200円＝2マイル）。ルートIDは変えない。`ana_transfer_point` は参照する経路がなくなるので削除する
- 一般カードは、1pt＝2マイルにすると年6,600円の移行手数料がかかる。そこで手数料のかからない方法（VISAは1pt＝1マイル、JCBは5マイルコース）で評価し、0.5%とする
- ゴールデンケースのうち、結果にANAが出る14件（G03〜G08・G10・G11・G13・G15・G20・G21・G23・G26）の期待値を見直す
- 基本設計の「マイル換算は行わない」は、「マイルは1マイル＝1円、移行手数料のかからない方法で評価する」に改める

### 32.5 データ定義（`domain/types.ts`）

```ts
export type CardTier = 'general' | 'gold' | 'platinum';
export interface Series {
  id: Id; name: string;          // 見出しに出すシリーズ名（例：「ANAカード」）
  kana: string;                  // 並び順・検索用のよみ
  aliases: string[];             // 検索用の別名（例：「アナ」「ANA」）
}
export interface Card { /* 既存の項目 */ series: Id; tier: CardTier }
export interface Master { /* 既存の項目 */ series: Series[] }
```

- シリーズ名・よみ・別名はマスタの `series` 表にまとめる（各カードに同じ名前を重複して持たせない）
- `company`・`companyKana` は残す。見出しには使わず、行の補足（発行会社）に出す。ANAシリーズの中でVISAとJCBを見分けるのに使う
- マスタの `schemaVersion` は1のまま（これまでの項目追加と同じ扱い）
- マスタ検証（`master.ts`・`build_master.py`）に次を加える
  - `series` が `series` 表にある
  - `tier` が既知の値である
  - シリーズ内に一般とゴールドの両方がある。ただし例外リスト（ゴールドが発行されていない Amazon Mastercard・リクルートカード、一般のない Marriott）は除く

### 32.6 カード一覧・並び順・検索（S03・S05、`domain/catalog.ts`）

- **並び順**：シリーズ名（24.5の規則：英字で始まる名前を先にアルファベット順、その後に日本語をよみのあいうえお順）→ ランク（一般 → ゴールド → プラチナ）→ カード名（24.5の規則）。`compareCards` を差し替える。ポイント率の一覧（S05）とカードのポイント率画面（S11）の並びも同じ関数で変わる
- **見出し**：会社名の小見出し（`.catalog-company`）をシリーズ名に置き換える
- **行**：カード名の下の補足行に発行会社を加える（例：「JCB・ANA JCB一般」）
- **検索**：対象に、シリーズ名・シリーズのよみ・シリーズの別名と、ランク名（「一般」「ゴールド」「プラチナ」）を加える。既存の対象（名前・よみ・略称・発行会社・別名）はそのまま
- **絞り込み**：絞り込み・検索の後は、該当カードのあるシリーズの見出しだけを出す
- **その他のカード**：一覧の末尾に固定して置く（32.8）

### 32.7 全N枚で比べるときのシリーズまとめ（L9、`domain/engine.ts`）

**課題**：持っていないカードにはボーナスを加算しない（30.1 R5）ため、同じシリーズの一般とゴールドは、ほとんどの店で同じ率になる。全カードで比べると、同じシリーズのカードが上位3枠を占め（例：三井住友カード（NL）とゴールド（NL）、楽天カードと楽天ゴールドカード）、他のシリーズが見えなくなる。

**仕様**
- `scope: 'all'` のとき、1カード1枠にまとめた（31.2.3）後で、**同じシリーズで実質ポイント率が同じ枠**をさらに1枠にまとめる。上位3件はまとめた後で数える
- 代表にするカード：①持っているカード → ②年会費が安いカード → ③ランクが低いカード → ④マスタの定義順
- まとめたほかのカードは `RecommendItem.sameRateCardIds?: Id[]` に入れる。画面では代表のカード名の下に「楽天ゴールドカードも同じポイント率」と添える
- 支払い方法は代表のカードのものを出す
- `scope: 'owned'` ではまとめない（同じシリーズを2枚持っていても、そのまま別の枠に出す）。手持ちで比べる結果とゴールデンケースは変わらない
- カード以外の経路（PayPay残高など）とその他のカードは、まとめの対象外
- 参照実装 `ref_engine.py` にも同じ処理を入れる

### 32.8 その他のカード（L3・F14）

**データ**（`UserSettings`。省略可なので `schemaVersion` は1のまま）

```ts
export interface CustomCard {
  id: Id;              // 'custom_' ＋連番。マスタのIDと重ならない
  name: string;        // 利用者が付ける名前（例：「〇〇銀行カード」）。空なら「その他のカード1」
  pointId: Id;         // マスタのポイントから選ぶ
  baseRate: number;    // 基本のポイント率（0.1〜3.0%。0.1%刻み）
}
customCards?: CustomCard[];   // 最大5枚
```

**推奨エンジン**
- その他のカードは登録した時点で持っているカードとして扱う（`ownedCards` にも `cardId` を入れ、優先順に並べる）
- 支払い方法は「カード」「スマホのタッチ決済」「ネット」の経路を作る。特約とボーナスはなし
- 付与単位がわからないので `unitScope: 'monthlyTotal'` として扱う（率で評価し、金額は概算で表示する）
- 理由文は「その他のカード（登録した基本のポイント率）」
- 参照実装とゴールデンケースに1〜2件追加する

**対象外**：カード提案（ヒント・バナー・カード診断の［おすすめカード］）、「全N枚で比べる」の枚数、公式サイトへのリンク、32.7のまとめ

**整理（`reconcile`）**：ポイントIDがマスタにない、率が範囲外、IDが重複しているものは外す。バックアップの書き出し・読み込みの対象に含める

**画面**（S03 カード）：カード一覧の末尾に「その他のカード（一覧にないカード）」の見出しを置き、［追加］で名前・ポイント（選択）・基本のポイント率を入力する。持っているカードの表示では、その他のカードにも優先順・外すボタンを出す（入会年月・ボーナスの欄はない）

### 32.9 他画面への影響・移行

| 対象 | 変更 |
|---|---|
| S01 おすすめ | 32.7のまとめと添え書き。切り替えの「全{N}枚」は、その他のカードを除くマスタのカード枚数 |
| S03 カード | 32.6・32.8 |
| S05・S11 ポイント率 | 並び順が32.6に変わる |
| カード診断・提案 | 候補が約41枚に増える（分冊12章） |
| `affiliates.json` | 追加カードの `officialUrl` を加える |
| 既存利用者 | カードIDを変えないので、保存済みの設定はそのまま使える。ANA VISAワイドゴールドの率が0.5%から1.0%に変わる |

### 32.10 テスト

| 種別 | 内容 |
|---|---|
| 単体 | 並び順（シリーズ → ランク → 名前、英字のシリーズが先）、検索（「JAL」→JALシリーズ、「ゴールド」→各シリーズのゴールド、「あな」→ANAシリーズ）、マスタ検証（一般とゴールドの組の例外リスト）、32.7のまとめ（代表の選び方、`owned` ではまとめない）、その他のカードの `reconcile`（範囲外・重複・未知のポイント） |
| ゴールデン | ANAの14件の期待値を見直す。追加：32.7（楽天市場で全N枚 → 楽天が1枠）、その他のカード（1.2%のカードがファミマで1位など） |
| E2E | E18（会社見出し）をシリーズ見出しの確認に変える。区分ごとの枚数と「全N枚」の枚数の期待値を変える。追加：その他のカードの登録 → おすすめに出る → 外す |
| 提案 | S08・S09（候補が増えたときの動き）の期待値を見直す |

### 32.11 カード以外の支払いの追加と現金のみの店（L11）

**方針**
- 単独で使うコード決済・電子マネー（残高払い）を、今の「カード以外の支払い」（PayPay残高・モバイルSuica）と同じ扱いで追加する。マスタに `cardId: null` の経路を足すだけで、推奨エンジン（`engine.ts`）は変えない（カード以外の経路は、利用者が有効にしたものだけが優先順99で候補に入る。30.2・31.2.3 の「経路ごとに1枠」もそのまま）
- 評価するのは**単独のポイントだけ**（銀行口座・現金からのチャージを前提にする）。PayPay残高（`paypay_balance`）と同じ考え方
- 現金は経路にしない。ポイントが付かず常に0%で、比べる意味がないため。現金しか使えない店だけ、おすすめの代わりに注記を出す
- ランキングへの影響は小さい見込み。多くは0.5%前後で、カードの通常1%に勝たない。ただし楽天ペイ（楽天キャッシュ払い）のように1%前後のものもあるので、率は調査で確かめる

**追加の候補**（率・付与単位は公開情報で調べてから確定し、`master/collection_report.md` に出典を記録する）

| 支払い方法（新しい `methodId`） | 経路（仮） | ポイント | 種別 |
|---|---|---|---|
| d払い（`d_barai`） | `dbarai_balance`（d払い残高・口座払い） | dポイント | code |
| 楽天ペイ（`rakuten_pay`） | `rpay_cash`（楽天キャッシュ払い） | 楽天ポイント | code |
| au PAY（`au_pay`） | `aupay_balance`（au PAY残高） | Pontaポイント | code |
| WAON（`waon`） | `waon_emoney` | WAON POINT | emoney |
| nanaco（`nanaco`） | `nanaco_emoney` | nanacoポイント | emoney |
| 楽天Edy（`edy`） | `edy_emoney` | 楽天ポイント | emoney |

- 支払い方法の種別に `emoney`（電子マネー）を加える（`Method.type`。マスタ検証の既知の値にも加える）
- 既存のポイント（dポイント・楽天ポイント・Pontaポイント・WAON POINT・nanacoポイント）を使うので、ポイントの追加はない
- ポイント払いの判定（F03）は変えない。dポイント・Pontaなどが使える店は、今どおり店舗の `usablePoints` で持つ

**チャージ元カードの組み合わせ**：楽天カードから楽天キャッシュにチャージして楽天ペイで払うように、チャージでポイントが付く組み合わせもある。これは単独の経路には含めない。組み合わせを評価するときは、今の `rakuten_suica_ride`（楽天ペイ経由のSuica）や `view_suica_ride` と同じく、**そのカードの経路**として追加する。今回は対象外とする（利用者決定 2026-09-26。基本設計 残課題23）

**店舗で使えるかどうか**（マスタの作業の中心）
- 84店舗はカテゴリの既定（`defaultMethods`）を使っている。新しい支払い方法は、そのカテゴリの大手チェーンがほぼ使える場合だけ既定に加える（目安：コード決済はコンビニ・ドラッグストア・スーパー、WAON・nanacoは加えない）
- 既定と違う店は店舗の `acceptedMethods` で持つ（例：WAONはイオン系、nanacoはセブン-イレブン・イトーヨーカドー）
- 調べきれない店は既定のままとし、信頼度を「中」にする

**利用者の設定**
- 今は、新規利用者の `enabledNonCardRoutes` にマスタのカード以外の経路が**すべて**入る（`defaultSettings`）。このままだと、使っていないd払いやWAONが最初からおすすめに出る
- そこで経路に `defaultEnabled?: boolean` を加え、新規利用者には `true` の経路だけを入れる。PayPay残高・モバイルSuicaは `true`、今回追加する経路は付けない（オフ）
- 既存の利用者には、新しい経路を自動で加えない（`reconcile` の今の動作どおり）
- 画面：カードタブの一番下にある「カード以外の支払い」（今はPayPay残高払い・モバイルSuicaの2つ）のチェックボックスを増やす。チェックは「自分がこの支払いを使うか」で、店舗で使えるかどうかはマスタ（上記）で決まる。使うものにチェックを入れると、使える店でおすすめの候補に加わる
- 並びと見出し：「コード決済」（PayPay残高・d払い残高・楽天ペイ・au PAY残高）→「電子マネー」（WAON・nanaco・楽天Edy）→「交通」（モバイルSuica）の小見出しに分ける
- 表示名：今は `cards.tsx` に2つの名前を直接書いている。経路が増えるので、経路に表示名 `label?: string`（例：「d払い（残高・口座払い）」）を持たせ、画面はそれを出す。ないときは支払い方法の名前
- チャージ元カードとの組み合わせは今回は対象外（利用者決定 2026-09-26。基本設計 残課題23）

**現金のみの店**
- 店舗に `cashOnly?: boolean` を加える。`true` の店は `acceptedMethods: []` とする（マスタ検証：`cashOnly` のときは空、そうでなければ1件以上）
- おすすめ（S01）：`cashOnly` の店を選んだら、結果の代わりに「このお店は現金のみです。ポイントは付きません」と出す。推奨エンジンは今どおり候補0件を返すだけで、変えない
- 近くのお店・カテゴリの店舗一覧では、店名の横に「現金のみ」と出す
- 今のマスタには現金のみの店がない。該当するチェーンがあれば、調査のときに加える

**テスト**

| 種別 | 内容 |
|---|---|
| 単体 | 新規利用者の `enabledNonCardRoutes` が `defaultEnabled` の経路だけになる、既存利用者の設定に新しい経路が加わらない、マスタ検証（`emoney` の種別、`cashOnly` と `acceptedMethods` の組み合わせ） |
| ゴールデン | 既存48件は結果が変わらない（新しい経路は既定でオフ）。追加：d払い残高を有効にしたとき、カードを持っていない利用者のコンビニでd払い0.5%が1位／1%のカードを持っていればカードが1位。WAONを有効にしたイオンで `waon_emoney` が候補に出る |
| E2E | カード以外の支払いでd払いを有効にするとおすすめに出る。現金のみの店（テスト用マスタ）で注記が出る |

### 32.12 実装の段階

| 段階 | 内容 | 還元ルールの変更 |
|---|---|---|
| 1 | 既存22枚に `series`・`tier` を付け、シリーズ表を作る。見出し・並び順・検索を変える（32.5・32.6） | なし（ゴールデンケースの結果は変わらない） |
| 2 | その他のカード（32.8）、全N枚のまとめ（32.7） | なし |
| 3 | ポイントの評価（32.4）とANAの経路の変更、追加カードのマスタ登録（32.3）。ANA・楽天・三菱UFJ・au・JCB・イオン・Olive・ビュー・セブンを先に、JAL・セゾン・アメックスを続けて入れる | ルール版を更新 |
| 4 | カード以外の支払いの追加と現金のみの店（32.11）。コードの変更は新規利用者の既定値・`emoney` の種別・カード以外の支払いのチェックボックスの表示名と小見出し・現金のみの注記だけ。段階1〜3とは独立に進められる | ルール版を更新（既存の結果は変わらない） |
