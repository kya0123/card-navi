# クレカ使用判断アプリ 詳細設計書（カード提案機能）

| 項目 | 内容 |
|---|---|
| 版数 | 1.3（見直すタブの利用額を1行表示に） |
| 作成日 | 2026-09-24（1.2：2026-09-25、1.3：2026-09-26） |
| 前提 | 収益化設計書 v0.3（`design/monetization_design.md`）の F2〜F5・F7、詳細設計書 v1.5（`design/detailed_design.md`） |
| 対象 | ①推奨直後のヒント、②カードを見直す画面、③ホームのバナー、広告の方針画面、設定のON/OFF、`affiliates.json`、リンク確認スクリプト |

本書は詳細設計書 v1.5 への追加分。既存の推奨エンジン（4章）・ボーナス（5章）・保存（8章）は変更しない。

---

## 1. 利用者の決定事項（2026-09-24）

| No | 内容 |
|---|---|
| K1 | 提案の候補カードは現行マスタの5枚のみ。人気カードの追加は別作業 → **v1.13（2026-09-24）で候補を保有していない全カード（最大21枚）に拡大**（詳細設計書 25章） |
| K2 | ①②③すべてと周辺一式（広告の方針・`affiliates.json`（中身は空）・リンク確認スクリプト）を実装する |
| K3 | 設定画面で①③をON/OFFできる（初期ON）。②はいつでも開ける |
| K4 | 購入金額は入力しない。最近使ったお店をもとに見せる |
| K5 | 表示頻度は A＋B（収益化設計書 8章） |

---

## 2. 追加・変更するファイル

```
app/
├─ src/data/affiliates.json         … アフィリエイトリンク（初期は空）
├─ src/domain/
│   ├─ simulate.ts                  … カード見直しシミュレーション（3章）
│   ├─ promo.ts                     … 表示タイミングの判定（4章）
│   └─ affiliate.ts                 … リンクの選択・検証（5章）
├─ src/ui/screens/
│   ├─ review.tsx                   … S07 カードを見直す（新規）
│   ├─ adpolicy.tsx                 … S09 広告の方針（新規）
│   ├─ home.tsx                     … ①ヒント・③バナーを追加
│   └─ settings.tsx                 … 提案のON/OFF・広告の方針へのリンクを追加
├─ src/ui/app.tsx                   … 画面追加、タブに「見直す」、提案状態の読み込み・保存
├─ scripts/check_affiliates.mjs     … リンク確認スクリプト（6章）
└─ scripts/build.mjs                … ビルド時に affiliates の検証（エラーでビルド失敗）
master/build_master.py              … カードに officialUrl を追加
```

---

## 3. カード見直しシミュレーション（`domain/simulate.ts`）

### 3.1 型とシグネチャ

```ts
export interface StoreDelta { storeId: Id; beforeRate: number; afterRate: number }
export interface SimResult {
  cardId: Id;
  totalStores: number;               // 対象にした最近のお店の数
  improved: StoreDelta[];            // 上がるお店（差の大きい順 → 最近使った順）
  per10kYen: number;                 // 上がるお店で1万円使うごとの増加額
  breakEvenMonthlyYen: number | null;// 年会費の回収ライン（月額）。年会費0円なら null
  annualFeeYen: number;
  bonusNote: string | null;          // 例「年1,000,000円の利用で10,000円相当のポイント」
}
simulateAddCard(mi, user, recent: Id[], today, opt = { minDelta: 0.02 }): SimResult[]
bestUnownedAt(mi, user, storeId, today): { cardId; beforeRate; afterRate; methodIds } | null
```

### 3.2 計算

1. **中立な設定**：ユーザ設定から `bonusGoals` を空にしたもの（ボーナス加算なしで比べる）
2. **現状の率** `beforeRate`：中立な設定で `recommend()` の1位の `rate`。候補がなければ 0
3. **候補カード**：マスタにあり保有していないカード。全支払い方法を有効、優先順 999 として中立な設定に加える
4. **追加後の率** `afterRate`：同じく1位の `rate`
5. **上がるお店**：`afterRate − beforeRate ≥ minDelta`（小数6桁で丸めて比較）
6. **1万円あたり** = `floor(差の単純平均 × 10,000)`
7. **年会費の回収ライン** = `ceil(年会費 ÷ 差の単純平均 ÷ 12 ÷ 100) × 100`。年会費0円なら `null`
8. **並べ替え**：①上がるお店の数（降順）②1万円あたり（降順）③カードID（昇順）。アフィリエイト情報は引数に取らない
9. 上がるお店が0件のカードは除外。最近のお店のうちマスタにないIDは無視する

### 3.3 ①用の `bestUnownedAt`

- 表示中のお店で、候補カードごとに 3.2 の手順で `afterRate` を求め、最大のものを返す（同率はカードID昇順）
- `afterRate − beforeRate < 0.03` なら `null`（ヒントを出さない）
- `methodIds` は追加後1位の支払い方法（例：スマホのVisaタッチ）

---

## 4. 表示タイミング（`domain/promo.ts`）

### 4.1 保存する状態（IndexedDB `meta` ストアのキー `promo`）

```ts
export interface PromoSlot {
  lastShownAt?: YMD; intervalDays: 7 | 14 | 30; tappedSinceShown: boolean;
  dismissedUntil?: YMD; lastSignature?: string;
  pendingEarly?: 'rollover' | 'master';
}
export interface PromoState {
  firstLaunchAt: YMD;
  hint: Record<Id, PromoSlot>;        // ①：お店ごと
  hintLastShownAt?: YMD; hintLastStoreId?: Id;
  banner: PromoSlot;                  // ③
  masterVersion?: string;             // 前回起動時の還元ルール版
}
```

- 既存の利用者も、新バージョンの初回起動日を `firstLaunchAt` とする（14日後から表示）
- ①の `hint` は最近使ったお店にない店舗のキーを起動時に削除する

### 4.2 判定関数

| 関数 | 内容 |
|---|---|
| `canShow(slot, sig, today)` | 収益化設計書 8.4 の手順。①×で閉じた期間中は不可 ②未表示なら可 ③`pendingEarly='rollover'` で1日以上、または `'master'` で内容が変わり1日以上なら可 ④内容が変わっていれば7日以上で可（B）⑤それ以外は `intervalDays` 以上で可（A） |
| `markShown(slot, sig, today)` | 前回表示後にタップがなければ間隔を 7→14→30 に広げる。`lastShownAt`・`lastSignature` を更新し、`tappedSinceShown=false`・`pendingEarly` を消す |
| `markTapped(slot)` | `tappedSinceShown=true`、`intervalDays=7` |
| `markDismissed(slot, today)` | `dismissedUntil=today+60日`、`intervalDays=30` |
| `isShowingToday(slot, today)` | 今日表示済みで、タップも×もされていない（同じ日の再描画では出し続ける） |

### 4.3 場面ごとの条件

| 場面 | 条件（すべて満たす） |
|---|---|
| ① ヒント | 設定ON・初回起動から14日以上・`bestUnownedAt` がある・今日③を出していない・今日ほかのお店で①を出していない・（今日このお店で表示中 または `canShow`） |
| ③ バナー | 設定ON・初回起動から14日以上・最近のお店5件以上・`simulateAddCard` の1位が2件以上で上がる・今日①を出していない・検索欄が空で結果表示中でない・（今日表示中 または `canShow`） |

内容の要約（signature）：①は `カードID|率`、③は上位3件の `カードID:上がるお店の数` をつないだもの。

### 4.4 早めに出すきっかけ

起動時に次を判定して `banner.pendingEarly` を立てる。

- ボーナス期間の繰り越し通知があった → `'rollover'`
- 前回起動時の還元ルール版と今回が違う → `'master'`（内容が変わった場合のみ有効）

---

## 5. アフィリエイトリンク（`domain/affiliate.ts`・`data/affiliates.json`）

```ts
export interface AffiliateLink { cardId: Id; url: string; asp: string; label: 'PR';
  validFrom: YMD | null; validTo: YMD | null; checkedAt: YMD }
export interface AffiliateMaster { schemaVersion: 1; version: string; links: AffiliateLink[] }
linkFor(mi, aff, cardId, today): { url: string; pr: boolean } | null
validateAffiliates(mi, aff): string[]
```

- `linkFor`：期間内のアフィリエイトリンクがあれば `pr=true`。なければカードの `officialUrl`（`pr=false`）。どちらもなければ `null`
- 「PR」表記は `pr=true` のときカード名の横に表示する。①ヒントとボタン、③バナー（上位にPRのカードがある場合）も同様
- リンクは `target="_blank" rel="noopener noreferrer sponsored"`。オフライン時は「オフラインのため開けません」と無効表示
- マスタのカードに `officialUrl` を追加する（還元ルール版 `2026.09.24-1`。v1.13 で21枚すべてに付与、版 `2026.09.24-2`。追加分は詳細設計書 25.3）

| カード | officialUrl |
|---|---|
| 三井住友カード ゴールド（NL） | https://www.smbc-card.com/nyukai/card/gold-numberless.jsp |
| 楽天カード | https://www.rakuten-card.co.jp/ |
| ANA VISAワイドゴールドカード | https://www.smbc-card.com/nyukai/affiliate/ana/index.jsp |
| 三菱UFJカード | https://www.cr.mufg.jp/apply/card/mucard/index.html |
| PayPayカード ゴールド | https://www.paypay-card.co.jp/service/card/overview/ |

---

## 6. リンク確認スクリプト（`scripts/check_affiliates.mjs`）

- `node scripts/check_affiliates.mjs`：オフラインのチェック（`cardId`・https・期限・確認日）
- `node scripts/check_affiliates.mjs --online`：上記＋各URLへのアクセス（リダイレクト後に 4xx/5xx なら警告）
- エラーがあれば終了コード1。`build.mjs` はオフラインのチェックを呼び、エラーならビルドを止める
- チェック内容は収益化設計書 10.5 のとおり

---

## 7. 画面

### 7.1 タブ

「おすすめ／カード／ボーナス／見直す／還元情報／設定」の6つにする（「見直す」を追加）。

### 7.2 S01 ホーム

- ① ヒント：ランキングの直後。「持っていないカードなら」「{カード名}で {率}」「{支払い方法}」「[PR] 詳しく見る ›」「×（このお店では表示しない）」
  - 「詳しく見る」：`markTapped` → S07 へ移り、そのカードの位置までスクロール
  - ×：`markDismissed`
- ③ バナー：検索欄が空で結果を表示していないとき、「最近使ったお店」の下。「あなたの使い方に合うカードが見つかりました」「よく行くお店で還元が上がるカード {n}件」「›」と「閉じる」ボタン
  - タップ：`markTapped` → S07。閉じる：`markDismissed`

### 7.3 S07 カードを見直す

- 見出し「カードを見直す」、説明「最近使ったお店をもとに、1枚追加すると還元が上がるカードです」
- カードごと：カード名・年会費・PR表記／見出し「よく行くお店 {n}件中{m}件で還元アップ」／お店3件まで「{店名} {前}→{後}」＋「ほか{k}件」（タップで全件）／「1万円ごとに ＋{円}」／最後の行（年会費ありは回収ライン、無料は「年会費無料：持つだけで損はありません」）／ボーナスがあれば `bonusNote`／ボタン「公式サイトで詳しく見る」（1枚目は塗り、2枚目以降は枠線）
- 最近のお店が5件未満：「お店を5件以上調べると表示されます（いま{n}件）」
- 該当なし：「今の組み合わせで十分です」
- 下部の注記：目安である旨、年会費の前提、並び順は計算結果で広告とは関係ない旨、「広告の方針」へのリンク

### 7.4 S09 広告の方針

収益化設計書 7章 S09 の3項目。設定画面と S07 からリンク。

### 7.5 設定

「カードの提案」パネル：チェックボックス「持っていないカードの提案を表示する（おすすめ画面のヒント・バナー）」、「広告の方針」へのボタン。

`UserSettings` に `showCardSuggestions?: boolean` を追加（未設定＝ON）。`reconcile` とバックアップで引き継ぐ。`schemaVersion` は1のまま（省略可能な項目の追加のため）。

---

## 8. テスト

### 8.1 単体（`tests/unit/suggest.test.ts`）

| ID | 観点 |
|---|---|
| S01 | 全カード保有なら見直し結果は0件 |
| S02 | 楽天のみ保有・最近のお店（セブン・マクドナルド・スタバ・ローソンスリーエフ・ファミマ）：1位は三井住友（4件で上がる）、三菱UFJ（2件）が続く |
| S07 | ボーナスを狙っていても比較はボーナス加算なし |
| S03 | 1万円あたりと回収ライン（100円切り上げ）、年会費0円は null |
| S04 | 差がちょうど2ポイントは含み、未満は除外 |
| S05 | 並び順：件数 → 1万円あたり → カードID |
| S06 | `bestUnownedAt`：3ポイント未満は null、同率はカードID順 |
| P01〜P06 | `canShow`：初回・A（7→14→30で止まる、タップで7）・B（内容変化で7日）・×（60日間は不可、以後は間隔30）・早めのきっかけ |
| P07 | `isShowingToday`：同じ日の再描画は表示を続け、タップ・×の後は消える |
| A01〜A03 | `linkFor`：期間内はPR、期間外・なしは公式URL、公式URLもなければ null。`validateAffiliates`：未知の cardId・http を検出 |
| N01 | 中立性：アフィリエイトリンクの有無を変えても S07 の順位は変わらない |

### 8.2 E2E（追加）

| ID | シナリオ |
|---|---|
| E10 | 楽天のみ保有の設定を読み込み、5店を調べる → 13日後はヒントなし → 21日後は起動時に③が出るため①は出ない → 翌日セブンでヒント表示・別のお店では出ない → 「詳しく見る」で S07 に移り、1位カードと「5件中4件」が出る。コントラスト4.5:1以上 |
| E11 | 翌日、ホーム（検索欄が空）に③バナーが出る → タップで S07 → さらに翌日は出ない（7日間隔） |
| E12 | 設定で提案をOFFにするとヒントもバナーも出ない。S07 はタブから開ける |
| E13 | ヒントの×でそのお店では出なくなる |

---

## 9. 実装結果

- 単体39（既存21＋追加18）・ゴールデン40・E2E 13 すべて合格（`design/test_report.md`）
- 起動時のホームで③が出た日は①が出ない。4.3 の「同じ日に両方出さない」ルールどおりの動き
- 提案の表示記録は `meta` ストアに保存するため、「設定を初期化」で初回起動日からやり直しになる


---

## 10. 年会費の回収計算（v1.2・2026-09-25）

### 10.1 利用者の決定事項

| No | 内容 |
|---|---|
| K6 | おすすめタブは「このお店でどのカードを使うか」に特化する。ただし①ヒント・③バナーはおすすめタブに残す |
| K7 | 年会費を回収できるかの計算は、既存の見直すタブ（S07）で行う（タブは増やさない） |
| K8 | 並び順は年間の損得（還元の増加＋ボーナス−年会費）の大きい順。月のカード利用額は利用者が入力する |

### 10.2 データ

`UserSettings` に `reviewMonthlySpendYen?: number` を追加（未設定＝50,000円）。範囲は10,000〜1,000,000円、10,000円単位。`reconcile` で範囲外・非整数を既定値に戻し、バックアップで引き継ぐ。`schemaVersion` は1のまま。

### 10.3 計算（`domain/simulate.ts`）

```ts
export interface NetResult {
  gainYen: number;              // 還元の増加（年）
  bonusYen: number;             // ボーナス（年）
  feeYen: number;               // 年会費
  netYen: number;               // gainYen + bonusYen − feeYen
  breakEvenMonthlyYen: number | null; // 回収ライン（月のカード利用額）。年会費0円は null
  movedAnnualYen: number;       // そのカードに移る利用額（年）
}
export function annualNet(mi, cardId, share, avgDelta, monthlySpendYen): NetResult
```

記号：M＝月のカード利用額、share＝上がるお店の数÷対象にしたお店の数、Δ＝上がるお店での率の差の単純平均（既存の `per10kYen` と同じ平均）。

1. `movedAnnualYen = floor(M × 12 × share)`
2. `gainYen = floor(round6(movedAnnualYen × Δ))`（浮動小数の誤差を避けるため小数6桁で丸めてから切り捨て）
3. `bonusYen`：カードにボーナスがあり `movedAnnualYen ≥ thresholdYen` なら `valueYen`（2年目以降の額。初年度の特典額・初回特典は使わない）、それ以外は0
4. `netYen = gainYen + bonusYen − feeYen`
5. `breakEvenMonthlyYen = ceil(feeYen ÷ (12 × share × Δ) ÷ 100) × 100`（ボーナスは含めない。年会費0円なら null）

**`simulateAddCard` の変更**
- 引数 `opt` に `monthlySpendYen`（既定50,000）を追加し、各結果に `net: NetResult` を付ける
- `SimResult.breakEvenMonthlyYen` は上の5の値に置き換える（従来の「上がるお店での月額」から「月のカード利用額」に変更。画面の入力と単位をそろえるため）
- 並べ替え：①`netYen` 降順 ②上がるお店の数 降順 ③1万円あたり 降順 ④カードID 昇順。アフィリエイト情報は引数に取らない（中立性 N01 は維持）

**持っているカードの判定（新規）**

```ts
export interface OwnedFeeResult {
  cardId: Id; totalStores: number;
  bestStores: StoreDelta[];     // そのカードが1位で、外すと率が下がるお店（beforeRate＝外した場合、afterRate＝持っている場合）
  net: NetResult;
  bonusAchievable: boolean;     // movedAnnualYen ≥ 条件額、または今期達成済み（goal.achieved）
}
export function ownedFeeReview(mi, user, recent, today, monthlySpendYen): OwnedFeeResult[]
```

1. 対象：保有カードのうち年会費が1円以上のもの
2. 中立な設定（`bonusGoals` を空）で、各お店の1位の率（持っている場合）と、そのカードを外した設定での1位の率（外した場合）を求める
3. 差が0より大きいお店を `bestStores` とし、share・Δ を求めて `annualNet` で計算する。今期達成済み（`goal.achieved`）のボーナスは `movedAnnualYen` によらず加算する
4. 並び：`netYen` 昇順（回収できていないカードを先に）→ カードID

**計算例**（楽天のみ保有、最近のお店＝セブン・マクドナルド・スタバ・ローソンスリーエフ・ファミマ、M＝50,000円）

| カード | share | Δ | 還元の増加 | ボーナス | 年会費 | 年間の損得 | 回収ライン |
|---|---|---|---|---|---|---|---|
| 三井住友カード（NL） | 4/5 | 6% | 28,800円 | 0円 | 0円 | ＋28,800円 | － |
| 三井住友カード ゴールド（NL） | 4/5 | 6% | 28,800円 | 0円（移る額48万円＜100万円） | 5,500円 | ＋23,300円 | 月9,600円 |
| マリオット・プレミアム | 5/5 | 2% | 12,000円 | 0円（60万円＜400万円） | 82,500円 | −70,500円 | 月343,800円 |

### 10.4 画面（S07 カードを見直す）

上から順に表示する。

1. **月のカード利用額**（v1.3 で11章の表示に変更）：「月のカード利用額 [ 50,000 ] 円」と −／＋ ボタン（1万円単位）。変更すると即座に再計算し、設定に保存する。説明「よく行くお店に均等に使う前提の目安です」
2. **持っているカードの年会費**（年会費のかかる保有カードがあるときのみ）：カードごとに「{カード名}（年会費{円}）」「1位になるお店 {n}件中{m}件」「年間の上乗せ 約{gain}円＋ボーナス{bonus}円」と判定1行
   - 回収できている：「年会費を回収できています（年＋{net}円）」（成功色）
   - 回収できていない：「この使い方では年会費を回収できません（年{net}円）。月{回収ライン}円以上で回収」（警告色）
   - 1位になるお店が0件：「よく行くお店ではほかのカードと同じか低い率です」
3. **追加すると得なカード**：`netYen ≥ 0` のカードを並び順どおりに表示。既存のカード表示（7.3）に「年間 ＋{net}円（還元＋{gain}円／ボーナス＋{bonus}円／年会費−{fee}円）」の行を追加し、回収ラインの行は「月{円}以上の利用で年会費を回収」に文言を変える
4. **この使い方では年会費を回収できません**：`netYen < 0` のカード。見出しの下に同じ形式で表示し、ボタンは枠線のみ
5. 下部の注記：既存の注記に「年間の損得は、入力した月の利用額をよく行くお店に均等に使った場合の目安です。ボーナスは2年目以降の額で、そのカードに移る利用額で判定しています」を追加

最近のお店が5件未満のときは、1〜4の代わりに既存の案内を出す（v1.3 で、このとき利用額は表示しない。11章）。

### 10.5 ヒント・バナーへの影響

- ①ヒント（`bestUnownedAt`）：変更なし（v1.3：おすすめを「登録カード」表示にしているときは出さない。詳細設計書 30.3）
- ③バナー：表示条件に「`simulateAddCard` の1位の `netYen > 0`（保存した月の利用額で計算）」を追加。`signature` は変更なし

### 10.6 テスト

| ID | 観点 |
|---|---|
| F01 | `annualNet`：10.3 の計算例3件（還元の増加・ボーナス・年会費・損得・回収ライン） |
| F02 | 移る利用額が条件額ちょうどでボーナス加算、1円少ないと加算しない |
| F03 | `simulateAddCard` の並び：損得 → 件数 → 1万円あたり → ID。月の利用額を変えると順位が変わる例 |
| F04 | 年会費0円は回収ライン null、損得は常に0以上 |
| F05 | `ownedFeeReview`：年会費0円のカードは対象外。1位のお店がないカードは share＝0・損得＝−年会費 |
| F06 | `ownedFeeReview`：今期達成済みのボーナスは移る利用額によらず加算 |
| F07 | `reconcile`：`reviewMonthlySpendYen` の範囲外・非整数を既定値に戻す |
| N01 | 中立性（既存）：アフィリエイトの有無で順位が変わらない |
| E19 | S07 で利用額を5万円→20万円に変えると、年会費ありのカードの判定が「回収できません」→「回収できています」に変わる。再読み込み後も20万円が残る |
| E20 | 損得がマイナスの候補しかないとき、③バナーが出ない |

既存 S02・S05 の期待値（件数順）は並び順の変更に合わせて更新する。

**実装結果（2026-09-25）**：F01〜F07・E19 合格。S03・E10 の期待値を更新。E20 は条件を作れる設定がないため未作成（バナーが出る側は E11 で確認）。

---

## 11. 利用額の表示（v1.3・2026-09-26）

### 11.1 利用者の決定事項

| No | 内容 |
|---|---|
| K9 | 月のカード利用額は、提案カード（`reviewItems` が1件以上）または年会費のある保有カード（`ownedFeeReview` が1件以上）があるときだけ表示する |
| K10 | 普段は「月{利用額}のカード利用で計算しています［変更］」の1行だけを出し、［変更］で入力欄を開く（A案） |

### 11.2 画面

- 1行（`#fee-spend-line`）：「月50,000円のカード利用で計算しています」とリンク風のボタン［変更］（`#fee-spend-edit`）
- ［変更］で 10.4 の1の入力欄（`#fee-spend-panel`）に置き換える。入力欄の下に［閉じる］（`#fee-spend-close`）。−／＋・入力で変えても開いたまま（開閉は画面の状態で、保存しない）
- 最近のお店が5件未満のときは、提案カード・保有カードの判定とも計算しないため、利用額は表示しない

### 11.3 テスト

| ID | 観点 |
|---|---|
| E19 | 既定は1行「月50,000円のカード利用で計算しています」で入力欄なし →［変更］で入力欄 → 変更後の再読み込みで1行が「月410,000円」 |
| E29 | お店0件では1行も入力欄も出さない → 5件調べて提案が出ると1行を出す →［変更］［閉じる］で開閉 |

