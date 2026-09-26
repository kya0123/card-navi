export type Id = string;
/** 'YYYY-MM-DD'（端末のローカル日付） */
export type YMD = string;
/** 'YYYY-MM' */
export type YM = string;

// ---- マスタ ----
/** カードの区分（詳細設計 20.3）：定番／ポイ活向け */
export type CardSegment = 'popular' | 'enthusiast';
/** カードのランク（詳細設計 32.5）。名前ではなく券種の位置付けで決める */
export type CardTier = 'general' | 'gold' | 'platinum';
/** カードのシリーズ（一覧の見出し・並び順・検索用。詳細設計 32.5） */
export interface Series {
  id: Id;
  /** 見出しに出すシリーズ名（例：「ANAカード」） */
  name: string;
  /** 並び順・検索用のよみ */
  kana: string;
  /** 検索用の別名 */
  aliases: string[];
}
export interface Card {
  id: Id; name: string; brand: string; pointId: Id; annualFee: number;
  /** 一覧・ラベル用の略称（例：「三菱UFJ」） */
  shortName: string;
  /** 検索用のよみ */
  kana: string;
  /** 発行会社 */
  issuer: string;
  segments: CardSegment[];
  /** 一覧に出す1行の特徴 */
  highlight: string;
  aliases: string[];
  annualFeeNote?: string;
  /** カード会社名とよみ（詳細設計 24.2）。v1.20 から見出しには使わず、行の補足に出す */
  company: string; companyKana: string;
  series: Id; tier: CardTier;
  /** その他のカード（利用者が登録したカード。詳細設計 32.8）。マスタのカードにはない */
  userDefined?: boolean;
  officialUrl?: string;
}
export interface Method { id: Id; name: string; type: 'card' | 'tap' | 'wallet' | 'code' | 'transit' }
export type UsableScope = 'visaMerchants' | 'paypayMerchants' | 'suicaMerchants' | 'listed' | 'none';
export interface Point {
  id: Id; name: string; yenPerPoint: number; usableScope: UsableScope;
  aliases?: string[]; note?: string; needsReview?: boolean;
}
export type Confidence = 'high' | 'medium' | 'low';
export interface Route {
  id: Id; cardId: Id | null; methodId: Id; pointId: Id;
  baseRate: number; unitYen: number; pointsPerUnit: number;
  unitScope: 'perTransaction' | 'monthlyTotal'; rounding: 'floor';
  countsTowardBonus: boolean;
  sourceUrl: string; checkedAt: YMD; confidence: Confidence;
  needsReview?: boolean; note?: string;
  /** その他のカードの経路（詳細設計 32.8）。出典・確認日の警告を出さない */
  userDefined?: boolean;
}
export interface Bonus {
  id: Id; cardId: Id; thresholdYen: number; valueYen: number;
  oneTimeValueYen?: number; oneTimeNote?: string;
  /** joinMonth＝入会月基準の1年ごと / fixed＝毎年同じ月日から1年（詳細設計 5.1） */
  periodType: 'joinMonth' | 'fixed'; startOffsetMonths: number; excludedMethods: Id[];
  /** fixed のときの開始月日（MM-DD） */
  fixedStartMonthDay?: string;
  /** 入会初年度だけ集計期間が異なる場合の月数（入会月から数える）と、その期間の特典額 */
  firstPeriodMonths?: number; firstPeriodValueYen?: number;
  description: string; periodNote?: string; excludedNote?: string;
  sourceUrl: string; checkedAt: YMD; confidence?: Confidence;
}
export interface Category { id: Id; name: string; defaultMethods: Id[] }
export interface Store {
  id: Id; name: string; kana: string; aliases: string[]; categoryId: Id;
  acceptedMethods?: Id[]; usablePoints?: Id[]; note?: string;
  /** 近くのお店（F13）の紐付けに使う OpenStreetMap のブランド識別子（Wikidata ID） */
  osmBrandWikidata?: string[];
}
export interface RateRule {
  id: Id; target: { storeId?: Id; categoryId?: Id }; routeId: Id; rate: number;
  validFrom: YMD | null; validTo: YMD | null; sourceUrl: string; checkedAt: YMD;
  confidence: string; conditions: string;
}
export interface Master {
  schemaVersion: 1; masterVersion: string; checkedAt: YMD; disclaimer: string;
  series: Series[]; cards: Card[]; methods: Method[]; points: Point[]; routes: Route[]; bonuses: Bonus[];
  categories: Category[]; stores: Store[]; rateRules: RateRule[];
}

// ---- ユーザ設定 ----
export type ThemeId = 'navy' | 'blue' | 'teal' | 'terra' | 'green';
export interface OwnedCard { cardId: Id; joinYm?: YM; enabledMethods: Id[]; priority: number }
export interface BonusGoal {
  bonusId: Id;
  /** 狙う */
  target: boolean;
  thresholdYen?: number;
  progressYen?: number;
  /** 今期達成済み */
  achieved?: boolean;
  /** 年会費永年無料など初回特典を達成済み */
  oneTimeAchieved?: boolean;
  deadlineOverride?: YMD;
  /** 前回計算した期限（自動繰り越しの判定用） */
  periodEnd?: YMD;
  prevPeriod?: { deadline: YMD; progressYen: number; achieved: boolean };
  updatedAt?: YMD;
}
export interface UserSettings {
  schemaVersion: 1;
  ownedCards: OwnedCard[];
  enabledNonCardRoutes: Id[];
  bonusGoals: BonusGoal[];
  staleWarnDays: number;
  lastExportAt?: YMD;
  /** 持っていないカードの提案（ヒント・バナー）を表示する。未設定は表示する */
  showCardSuggestions?: boolean;
  /** 配色（詳細設計 23.3）。未設定は navy */
  theme?: ThemeId;
  /** 見直すタブの月のカード利用額（円）。未設定は50,000円（分冊10.2） */
  reviewMonthlySpendYen?: number;
  /** 近くのお店（F13・詳細設計 27.2）。未設定は ON・OpenStreetMap・300m */
  nearbyEnabled?: boolean;
  nearbyProvider?: 'osm' | 'yolp';
  nearbyRadiusM?: 100 | 300 | 500 | 1000;
  /** 検索先ごとの位置情報の送信への同意日 */
  nearbyConsent?: { osm?: YMD; yolp?: YMD };
  /** その他のカード（一覧にないカード。最大5枚。詳細設計 32.8） */
  customCards?: CustomCard[];
}

/** その他のカード（詳細設計 32.8） */
export interface CustomCard {
  /** 'custom_' ＋連番 */
  id: Id;
  /** 利用者が付ける名前。空なら「その他のカード1」 */
  name: string;
  pointId: Id;
  /** 基本のポイント率（0.001〜0.03。0.1%刻み） */
  baseRate: number;
}

// ---- 推奨結果 ----
export type RateSource = 'store' | 'category' | 'base';
export interface RecommendItem {
  cardId: Id | null; routeIds: Id[]; methodIds: Id[];
  rate: number; rateSource: RateSource;
  bonusRate: number; effectiveRate: number;
  earnedYen: number | null; earnedApprox: boolean;
  reasons: string[];
  /** 同じカードの、より低い率の支払い方法（1カード1枠。詳細設計 31.2.3） */
  others: { methodIds: Id[]; effectiveRate: number }[];
  /** 全カードで比べるとき、この枠にまとめた同じシリーズ・同じ率のカード（詳細設計 32.7） */
  sameRateCardIds?: Id[];
}
export interface RecommendResult {
  storeId: Id | null; categoryId: Id;
  top: RecommendItem[];
  pointPay: Id[] | null;
  warnings: string[];
}
