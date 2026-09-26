"""ルールマスタ初版の生成と検証。python3 build_master.py で rules.json を出力する。"""
import json, re, sys

CHECKED = "2026-09-22"
SRC = {
    "smbc_gold": "https://www.smbc-card.com/nyukai/card/gold-numberless.jsp",
    "smbc_7pct": "https://www.smbc-card.com/nyukai/merit/proper_p5.jsp",
    "smbc_7pct_cards": "https://www.smbc-card.com/mem/cardinfo/23/cardinfo9001629.jsp",
    "smbc_excl": "https://www.smbc-card.com/mem/cardinfo/25/cardinfo4030019.jsp",
    "smbc_excl2": "https://www.smbc-card.com/mem/update/pop/kirikae_caution_gold-numberless.jsp",
    "smbc_paypay": "https://money-credit-card.com/2026/04/18/mitsui-sumitomo-card-paypay-double-point/",
    "paypay_other": "https://paypay.ne.jp/notice/20260701/c-card_voucher/",
    "paypay_rate": "https://paypay.ne.jp/article/reward-rate/",
    "ana": "https://www.happy-mi-life.net/entry/2018-01-18-221228",
    "ana_7pct": "https://matsunosuke.jp/post-155314/",
    "rakuten": "https://www.for-it.co.jp/mediverse/creditcard/rakuten-card-point/",
    "rakuten_ichiba": "https://www.rakuten-card.co.jp/campaign/rakuten-card/point-up/",
    "mufg_7pct": "https://www.cr.mufg.jp/mufgcard/point/global/save/convenience_store/index.html",
    "mufg": "https://www.diamond.co.jp/zai/articles/-/187",
    "jre_ride": "https://www.jrepoint.jp/point/append/railway/",
    "ppg_point": "https://www.paypay-card.co.jp/service/benefit/point/",
    "ppg_change": "https://www.paypay-card.co.jp/info/010242.html",
    "ppg_bonus": "https://www.paypay-card.co.jp/service/benefit/gold-point/",
    "suica_charge": "https://money.it-trend.jp/articles/credit/card/02-0324",
    # ---- v1.7 追加カード ----
    "smbc_nl": "https://diamond.jp/zai/articles/-/1065046",
    "smbc_pp": "https://www.diamond.co.jp/zai/articles/-/179",
    "smbc_pp_7pct": "https://www.bousaid.com/?p=50734",
    "amazon_mc": "https://money.it-trend.jp/articles/brand/amazon-mastercard/08-0002",
    "amazon_mc_rate": "https://www.businessinsider.jp/post-258224",
    "jcb_w": "https://money.it-trend.jp/articles/brand/jcb-w/02-0002",
    "jcb_jpoint": "https://www.watch.impress.co.jp/docs/news/2071666.html",
    "recruit": "https://money.it-trend.jp/articles/brand/recruit-card/07-0001",
    "paypay_card": "https://money.it-trend.jp/articles/brand/paypay-card/17-0002",
    "aeon": "https://kakakumag.com/money/?id=21128",
    "dcard_change": "https://mobareco.jp/?p=360923",
    "dcard_gold": "https://matsunosuke.jp/?p=62150",
    "aupay": "https://money.it-trend.jp/articles/brand/au-pay-card/19-0002",
    "seven_plus": "https://diamond.jp/zai/articles/-/200557",
    "epos": "https://money.it-trend.jp/articles/brand/epos-card/05-0002",
    "epos_gold": "https://www.diamond.co.jp/zai/articles/-/202",
    # ---- v1.8 マリオット ボンヴォイ アメックス（2025年8月リニューアル後） ----
    "mb_premium": "https://www.diamond.co.jp/zai/articles/-/139",
    "mb_premium_spec": "https://spaceshipearth.jp/finance/?p=140724",
    "mb_standard": "https://spaceshipearth.jp/finance/?p=140727",
    "mb_renewal": "https://www.watch.impress.co.jp/docs/news/2037002.html",
    # ---- 2026-09-25 課題3〜13の調査・ビューカード追加 ----
    "smbc_7pct_calc": "https://www.smbc-card.com/mem/cardinfo/23/cardinfo9001629.jsp",
    "dcard_gold_2026": "https://www.for-it.co.jp/mediverse/creditcard/dcard-bad/",
    "dcard_gold_period": "https://www.docomo.ne.jp/binary/pdf/support/startup_guide/smartphone_tablet_d_card.pdf",
    "dcard_2027": "https://www.itmedia.co.jp/news/article/2609/02/2000001066/",
    "view_std": "https://www.jreast.co.jp/en/card/first/viewcardstandard.html",
}
C925 = "2026-09-25"
C926 = "2026-09-26"
SRC.update({
    # ---- 2026-09-26 残課題の調査（11・19） ----
    "ppg_2026": "https://www.paypay-card.co.jp/info/010241.html",
    "mb_points": "https://www.americanexpress.com/ja-jp/benefits/marriott-bonvoy/marriott-bonvoy-point/",
    "mb_benefits": "https://www.americanexpress.com/ja-jp/credit-cards/card-types/both-marriott-bonvoy-mclp-ieep/",
    "amazon_mc_seven": "https://k-tammm.com/archives/584",
    "view_bonus": "https://www.jreast.co.jp/en/card/point/save/bonus.html",
    "view_bonus_amount": "https://itnavi.com/creditcard-archives/viewcard-bonus-point-732.html",
    "rakuten_pay_suica": "https://appuser-help.pay.rakuten.net/%E6%A5%BD%E5%A4%A9%E3%83%9A%E3%82%A4%E3%82%A2%E3%83%97%E3%83%AA%E3%81%8B%E3%82%89%E3%83%A2%E3%83%90%E3%82%A4%E3%83%ABSuica%E3%81%B8%E3%83%81%E3%83%A3%E3%83%BC%E3%82%B8%E3%81%97%E3%81%9F%E5%A0%B4%E5%90%88%E3%80%81%E6%A5%BD%E5%A4%A9%E3%83%9D%E3%82%A4%E3%83%B3%E3%83%88%E3%81%AF%E4%BB%98%E4%B8%8E%E3%81%95%E3%82%8C%E3%81%BE%E3%81%99%E3%81%8B%EF%BC%9F-615b1604e95a560022b0210f",
})

C926B = "2026-09-26"
SRC.update({
    # ---- 2026-09-26 カードラインナップ第1弾・第2弾（詳細設計 32.3） ----
    "ana_visa_general": "https://my-best.com/products/1679790",
    "ana_mile_course": "https://www.smbc-card.com/mem/cardinfo/cardinfo4010320.jsp",
    "ana_jcb_general": "https://kakaku.com/card/item.asp?id=036003",
    "ana_jcb_wide_gold": "https://kakaku.com/card/item.asp?id=036007",
    "ana_skycoin": "https://www.ana.co.jp/ja/jp/amc/redeem/anaskycoins/",
    "jal_mile": "https://www.jal.co.jp/jp/ja/jalcard/function/shoppingmile.html",
    "jal_ejal": "https://www.jal.co.jp/jp/ja/jalmile/use/ejalpoint/miles.html",
    "jal_gold": "https://www.jal.co.jp/jp/ja/jalcard/card/club_a_gold.html",
    "jal_tokuyaku": "https://www.jal.co.jp/jp/ja/jalcard/service/tokuyakuten/",
    "jal_aeon": "https://partner.jal.co.jp/shop/?tp=701768",
    "jal_welcia": "https://partner.jal.co.jp/shop/?tp=702250",
    "rakuten_gold": "https://www.rakuten-card.co.jp/minna-money/credit-card/knowledge/article_2110_00001/",
    "mufg_gold": "https://www.bk.mufg.jp/tsukau/credit/sagasu/mufgcard_goldprestige/index.html",
    "mufg_bonus": "https://www.cr.mufg.jp/mufgcard/point/global/save/pt/index.html",
    "aupay_gold": "https://www.kddi-fs.com/function/promotion/goldlp/index.html",
    "jcb_gold": "https://money.it-trend.jp/articles/brand/jcb-gold/09-0002",
    "jcb_partner": "https://kakakumag.com/money/?id=22348",
    "jcb_bonus": "https://www.jcb.co.jp/point/j-point-bonus/index.html",
    "aeon_gold": "https://www.diamond.co.jp/zai/articles/-/190",
    "olive_gold": "https://www.smbc.co.jp/kojin/olive-account/gold/",
    "olive_gold_bonus": "https://www.smbc.co.jp/kojin/olive-account/flexible-pay/gold_utilize/",
    "olive_pp": "https://www.smbc.co.jp/kojin/olive-account/platinum-preferred/",
    "view_gold": "https://kakaku.com/card/item.asp?id=040007",
    "view_gold_bonus": "https://www.for-it.co.jp/mediverse/creditcard/view-card-gold-standard/",
    "seven_gold": "https://kakaku.com/card/item.asp?id=034003",
    "saison_point": "https://www.saisoncard.co.jp/aqf-point/",
    "saison_intl": "https://adviser-navi.co.jp/card/column/16254/",
    "saison_gold": "https://www.saisoncard.co.jp/amex/content-about/returnrate/",
    "amex_mr": "https://diamond.jp/zai/articles/-/1049652",
    "amex_green": "https://www.nissen-ncs.jp/media/contents/details-amex-green/",
    "amex_gold_pref": "https://www.americanexpress.com/ja-jp/benefits/gold-preferred-card/",
    "epos_platinum": "https://www.eposcard.co.jp/platinum/bonus_point.html",
    "lawson_ponta": "https://www.lawsonbank.jp/news/2026/06041000.html",
    "lawson_ponta_lp": "https://www.lawsonbank.jp/lp/lp_credit.html",
})

# カード会社（一覧の並び順・見出し用。v1.11）。提携カードは発行・ブランドの主体で分類
_SMBC = ("三井住友カード", "みついすみともかーど")
_MUFG = ("三菱UFJニコス", "みつびしゆーえふじぇいにこす")
_AMEX = ("アメリカン・エキスプレス", "あめりかんえきすぷれす")
_DOCOMO = ("NTTドコモ", "えぬてぃーてぃーどこも")
_PAYPAY = ("PayPayカード", "ぺいぺいかーど")
_EPOS = ("エポスカード", "えぽすかーど")
COMPANY = {
    "smbc_gold_nl": _SMBC, "ana_wide_gold": _SMBC, "smbc_nl": _SMBC, "olive": _SMBC, "amazon_mc": _SMBC, "smbc_pp": _SMBC,
    "mufg": _MUFG, "recruit": _MUFG,
    "rakuten": ("楽天カード", "らくてんかーど"),
    "paypay_gold": _PAYPAY, "paypay_card": _PAYPAY,
    "aeon_select": ("イオンフィナンシャルサービス", "いおんふぃなんしゃるさーびす"),
    "dcard": _DOCOMO, "dcard_gold": _DOCOMO,
    "aupay_card": ("auフィナンシャルサービス", "えーゆーふぃなんしゃるさーびす"),
    "jcb_w": ("JCB", "じぇーしーびー"),
    "seven_plus": ("セブン・カードサービス", "せぶんかーどさーびす"),
    "epos": _EPOS, "epos_gold": _EPOS,
    "marriott_premium": _AMEX, "marriott": _AMEX,
    "view_std": ("ビューカード", "びゅーかーど"),
    # ---- 2026-09-26 ラインナップ第1弾・第2弾 ----
    "ana_visa_general": _SMBC, "ana_jcb_general": ("JCB", "じぇーしーびー"), "ana_jcb_wide_gold": ("JCB", "じぇーしーびー"),
    "jal_general": ("JALカード", "じゃるかーど"), "jal_club_a_gold": ("JALカード", "じゃるかーど"),
    "rakuten_gold": ("楽天カード", "らくてんかーど"), "mufg_gold": _MUFG, "aupay_gold": ("auフィナンシャルサービス", "えーゆーふぃなんしゃるさーびす"),
    "jcb_gold": ("JCB", "じぇーしーびー"), "aeon_gold": ("イオンフィナンシャルサービス", "いおんふぃなんしゃるさーびす"),
    "olive_gold": _SMBC, "olive_pp": _SMBC, "view_gold": ("ビューカード", "びゅーかーど"),
    "seven_gold": ("セブン・カードサービス", "せぶんかーどさーびす"),
    "saison_intl": ("クレディセゾン", "くれでぃせぞん"), "saison_gold_amex": ("クレディセゾン", "くれでぃせぞん"),
    "amex_green": _AMEX, "amex_gold_pref": _AMEX, "epos_platinum": _EPOS,
    "lawson_ponta": ("ローソン銀行", "ろーそんぎんこう"),
}

# シリーズ（一覧の見出し・並び順・検索用。詳細設計 32.5）。name・kana・aliases
series = [
    {"id": "amazon", "name": "Amazon Mastercard", "kana": "あまぞんますたーかーど", "aliases": ["アマゾン"]},
    {"id": "ana", "name": "ANAカード", "kana": "えーえぬえーかーど", "aliases": ["アナ", "全日空"]},
    {"id": "aupay", "name": "au PAY カード", "kana": "えーゆーぺいかーど", "aliases": ["エーユー"]},
    {"id": "dcard", "name": "dカード", "kana": "でぃーかーど", "aliases": ["ドコモ"]},
    {"id": "jcb_original", "name": "JCBオリジナルシリーズ", "kana": "じぇーしーびーおりじなるしりーず", "aliases": []},
    {"id": "marriott", "name": "Marriott Bonvoy アメックス", "kana": "まりおっとぼんゔぉいあめっくす", "aliases": ["マリオット", "ボンヴォイ", "ボンボイ"]},
    {"id": "olive", "name": "Olive", "kana": "おりーぶ", "aliases": []},
    {"id": "paypay", "name": "PayPayカード", "kana": "ぺいぺいかーど", "aliases": []},
    {"id": "aeon", "name": "イオンカード", "kana": "いおんかーど", "aliases": []},
    {"id": "epos", "name": "エポスカード", "kana": "えぽすかーど", "aliases": ["丸井"]},
    {"id": "seven", "name": "セブンカード・プラス", "kana": "せぶんかーどぷらす", "aliases": []},
    {"id": "view", "name": "ビューカード", "kana": "びゅーかーど", "aliases": ["JR東日本"]},
    {"id": "smbc_nl", "name": "三井住友カード（NL）", "kana": "みついすみともかーどなんばーれす", "aliases": ["ナンバーレス"]},
    {"id": "mufg", "name": "三菱UFJカード", "kana": "みつびしゆーえふじぇいかーど", "aliases": []},
    {"id": "rakuten", "name": "楽天カード", "kana": "らくてんかーど", "aliases": []},
    {"id": "recruit", "name": "リクルートカード", "kana": "りくるーとかーど", "aliases": []},
    # ---- 2026-09-26 ラインナップ第1弾・第2弾 ----
    {"id": "jal", "name": "JALカード", "kana": "じゃるかーど", "aliases": ["ジャル", "日本航空"]},
    {"id": "saison", "name": "セゾンカード", "kana": "せぞんかーど", "aliases": ["クレディセゾン", "永久不滅"]},
    {"id": "amex", "name": "アメリカン・エキスプレス", "kana": "あめりかんえきすぷれす", "aliases": ["アメックス", "Amex"]},
    {"id": "lawson_ponta", "name": "ローソンPontaプラス", "kana": "ろーそんぽんたぷらす", "aliases": ["ポンタ", "ローソン"]},
]
# カード → (シリーズ, ランク)。ランクは名前ではなく券種の位置付けで決める（詳細設計 32.2 L8）
G, GO, PL = "general", "gold", "platinum"
CARD_SERIES = {
    "smbc_nl": ("smbc_nl", G), "smbc_gold_nl": ("smbc_nl", GO), "smbc_pp": ("smbc_nl", PL),
    "olive": ("olive", G), "amazon_mc": ("amazon", G), "ana_wide_gold": ("ana", GO),
    "rakuten": ("rakuten", G), "mufg": ("mufg", G), "recruit": ("recruit", G),
    "paypay_card": ("paypay", G), "paypay_gold": ("paypay", GO),
    "aeon_select": ("aeon", G), "dcard": ("dcard", G), "dcard_gold": ("dcard", GO),
    "aupay_card": ("aupay", G), "jcb_w": ("jcb_original", G), "seven_plus": ("seven", G),
    "epos": ("epos", G), "epos_gold": ("epos", GO),
    "marriott": ("marriott", GO), "marriott_premium": ("marriott", PL),
    "view_std": ("view", G),
    # ---- 2026-09-26 ラインナップ第1弾・第2弾 ----
    "ana_visa_general": ("ana", G), "ana_jcb_general": ("ana", G), "ana_jcb_wide_gold": ("ana", GO),
    "jal_general": ("jal", G), "jal_club_a_gold": ("jal", GO),
    "rakuten_gold": ("rakuten", GO), "mufg_gold": ("mufg", GO), "aupay_gold": ("aupay", GO), "jcb_gold": ("jcb_original", GO),
    "aeon_gold": ("aeon", GO), "olive_gold": ("olive", GO), "olive_pp": ("olive", PL), "view_gold": ("view", GO),
    "seven_gold": ("seven", GO), "saison_intl": ("saison", G), "saison_gold_amex": ("saison", GO),
    "amex_green": ("amex", G), "amex_gold_pref": ("amex", GO), "epos_platinum": ("epos", PL),
    "lawson_ponta": ("lawson_ponta", G),
}
# 一般とゴールドの組の例外（詳細設計 32.5）。ゴールドが発行されていない／一般がない
SERIES_PAIR_EXEMPT = {"amazon", "recruit", "marriott", "lawson_ponta"}
# 段階3で追加するまで一般かゴールドが欠けているシリーズ（32.3）。追加したら消す
SERIES_PAIR_PENDING = set()

# segments: popular＝世間一般で広く使われている定番 / enthusiast＝ポイントマニア界隈でお得とされる
def card(id, name, short, kana, issuer, brand, point, fee, segments, highlight, aliases=(), fee_note=None):
    c = {"id": id, "name": name, "shortName": short, "kana": kana, "issuer": issuer, "brand": brand,
         "pointId": point, "annualFee": fee, "segments": list(segments), "highlight": highlight, "aliases": list(aliases)}
    if fee_note: c["annualFeeNote"] = fee_note
    c["company"], c["companyKana"] = COMPANY[id]
    c["series"], c["tier"] = CARD_SERIES[id]
    return c

POP, ENT = "popular", "enthusiast"
cards = [
    # ---- 初期対象（v1.0〜1.4） ----
    card("smbc_gold_nl", "三井住友カード ゴールド（NL）", "三井住友G", "みついすみともかーどごーるどなんばーれす", "三井住友カード", "Visa/Mastercard",
         "vpoint", 5500, (POP, ENT), "対象コンビニ・飲食店でスマホのタッチ決済7%。年100万円利用で10,000pt＋年会費永年無料（通称100万修行）",
         ["三井住友ゴールド", "NLゴールド", "SMBCゴールド"], "年100万円利用で翌年以降永年無料"),
    card("rakuten", "楽天カード", "楽天", "らくてんかーど", "楽天カード", "Visa/Mastercard/JCB/Amex",
         "rakuten_point", 0, (POP,), "どこでも1%。楽天市場で2%（カード分）", ["楽天"]),
    card("ana_wide_gold", "ANA VISAワイドゴールドカード", "ANA", "えーえぬえーわいどごーるど", "三井住友カード", "Visa",
         "ana_mile", 15400, (POP,), "200円＝2マイル（1%。2マイルコースは移行手数料無料）。マイルは1マイル＝1円で評価", ["ANAカード", "ANAワイドゴールド"]),
    card("mufg", "三菱UFJカード", "三菱UFJ", "みつびしゆーえふじぇいかーど", "三菱UFJニコス", "Visa/Mastercard/JCB/Amex",
         "global_point", 0, (POP, ENT), "セブン・ローソン・オーケー等のスーパーで7%（月5万円まで）", ["MUFGカード", "三菱UFJ"]),
    card("paypay_gold", "PayPayカード ゴールド", "PayPayG", "ぺいぺいかーどごーるど", "PayPayカード", "Visa/Mastercard/JCB",
         "paypay_point", 11000, (POP,), "1%。年100万円利用で11,000pt（年会費相当）", ["Yahoo!ゴールドカード", "ヤフーゴールド", "PayPayゴールド"]),
    # ---- v1.7 追加：世間一般で使われている定番 ----
    card("smbc_nl", "三井住友カード（NL）", "三井住友", "みついすみともかーどなんばーれす", "三井住友カード", "Visa/Mastercard",
         "vpoint", 0, (POP, ENT), "年会費無料。対象コンビニ・飲食店でスマホのタッチ決済7%", ["三井住友NL", "SMBC NL", "ナンバーレス"]),
    card("olive", "Olive フレキシブルペイ（クレジットモード）", "Olive", "おりーぶ", "三井住友カード", "Visa",
         "vpoint", 0, (POP,), "三井住友銀行の口座一体型。三井住友カード（NL）と同じ7%特約", ["オリーブ", "Olive"]),
    card("paypay_card", "PayPayカード", "PayPay", "ぺいぺいかーど", "PayPayカード", "Visa/Mastercard/JCB",
         "paypay_point", 0, (POP,), "年会費無料で1%。PayPayのクレジット払い（PayPayクレジット）に使える", ["ペイペイカード", "Yahooカード"]),
    card("aeon_select", "イオンカードセレクト", "イオン", "いおんかーどせれくと", "イオンフィナンシャルサービス", "Visa/Mastercard/JCB",
         "waon_point", 0, (POP,), "イオングループの対象店舗で1%（通常0.5%）", ["イオンカード"]),
    card("dcard", "dカード", "dカード", "でぃーかーど", "三井住友カード（NTTドコモ提携）", "Visa/Mastercard",
         "d_point", 0, (POP,), "1%。※2027年1月利用分から0.5%に改定予定", ["ディーカード"]),
    card("dcard_gold", "dカード GOLD", "dGOLD", "でぃーかーどごーるど", "三井住友カード（NTTドコモ提携）", "Visa/Mastercard",
         "d_point", 11000, (POP,), "1%。年100万円利用で11,000円相当の特典（クーポン）", ["dゴールド", "ディーカードゴールド"]),
    card("aupay_card", "au PAY カード", "au PAY", "えーゆーぺいかーど", "auフィナンシャルサービス", "Visa/Mastercard/Amex",
         "ponta_point", 0, (POP,), "年会費無料で1%（Pontaポイント）", ["auカード", "エーユーペイカード"]),
    card("jcb_w", "JCB CARD W", "JCB W", "じぇーしーびーかーどだぶりゅー", "JCB", "JCB",
         "j_point", 0, (POP, ENT), "1%（月間合計）。セブン1.5%・マクドナルド5.5%・スタバ最大10.5%・Amazon2%（入会は39歳以下）", ["JCBカードW", "JCB W", "JCBW"]),
    card("seven_plus", "セブンカード・プラス", "セブンカード", "せぶんかーどぷらす", "セブン・カードサービス", "JCB",
         "nanaco_point", 0, (POP,), "0.5%。セブン-イレブンで最大10%（7iD登録）", ["セブンカード", "セブンプラス"]),
    card("epos", "エポスカード", "エポス", "えぽすかーど", "エポスカード", "Visa",
         "epos_point", 0, (POP,), "0.5%。マルイ・優待店向け。ゴールドへの招待の入口", ["エポス"]),
    card("amazon_mc", "Amazon Mastercard", "Amazon", "あまぞんますたーかーど", "三井住友カード（Amazon提携）", "Mastercard",
         "amazon_point", 0, (POP, ENT), "1%。Amazonで2%（プライム会員）・コンビニ3社1.5%・対象店でスマホのタッチ決済7%",
         ["アマゾンカード", "Amazon Prime Mastercard", "アマゾンマスターカード"]),
    # ---- v1.7 追加：マニア界隈でお得とされる ----
    card("recruit", "リクルートカード", "リクルート", "りくるーとかーど", "三菱UFJニコス／JCB（リクルート提携）", "Visa/Mastercard/JCB",
         "recruit_point", 0, (ENT,), "年会費無料で1.2%（月間合計）。基本還元率の高さで定番のサブカード", ["リクルート"]),
    card("smbc_pp", "三井住友カード プラチナプリファード", "プラチナプリファード", "みついすみともかーどぷらちなぷりふぁーど", "三井住友カード", "Visa",
         "vpoint", 33000, (ENT,), "1%。対象コンビニ・飲食店7%。年100万円利用ごとに10,000pt（最大40,000pt）", ["プラチナプリファード", "プラプリ"]),
    card("epos_gold", "エポスゴールドカード", "エポスG", "えぽすごーるどかーど", "エポスカード", "Visa",
         "epos_point", 5000, (ENT,), "0.5%。年100万円利用で10,000pt（1.5%相当）。招待なら年会費永年無料", ["エポスゴールド", "エポゴ"],
         "年50万円利用または招待で永年無料"),
    # ---- v1.8 追加 ----
    card("marriott_premium", "Marriott Bonvoy アメリカン・エキスプレス・プレミアム・カード", "マリオットP", "まりおっとぼんぼいあめっくすぷれみあむ",
         "アメリカン・エキスプレス", "Amex", "marriott_point", 82500, (ENT,),
         "100円＝3pt（3%）・マリオット系ホテル6%。年400万円利用で無料宿泊1泊（75,000ptまで）。ポイントは1pt＝1円で評価",
         ["マリオットボンボイ", "マリオットボンヴォイ", "マリオットアメックス", "マリオットプレミアム", "SPGアメックス", "Marriott", "ボンボイ"]),
    card("marriott", "Marriott Bonvoy アメリカン・エキスプレス・カード", "マリオット", "まりおっとぼんぼいあめっくす",
         "アメリカン・エキスプレス", "Amex", "marriott_point", 34100, (ENT,),
         "100円＝2pt（2%）・マリオット系ホテル5%。年250万円利用で無料宿泊1泊（50,000ptまで）。ポイントは1pt＝1円で評価",
         ["マリオットボンボイ", "マリオットボンヴォイ", "マリオットアメックス", "Marriott", "ボンボイ"]),
    # ---- 2026-09-25 追加：ビューカード（モバイルSuicaのチャージ元） ----
    card("view_std", "ビューカード スタンダード", "ビュー", "びゅーかーどすたんだーど", "ビューカード", "Visa/Mastercard/JCB",
         "jre_point", 524, (POP, ENT), "モバイルSuicaへのチャージで1.5%（JRE POINT）。JR東日本の乗車ポイント2%と合わせて3.5%。通常の買い物は0.5%",
         ["ビューカード", "ビュー・スイカ", "VIEWカード"]),
    # ---- 2026-09-26 ラインナップ第1弾・第2弾（詳細設計 32.3）。マイルは1マイル＝1円で評価 ----
    card("ana_visa_general", "ANA VISA 一般カード", "ANA VISA", "えーえぬえーびざいっぱんかーど", "三井住友カード", "Visa",
         "ana_mile", 2200, (POP,), "200円＝1マイル（0.5%。手数料のかからない1pt＝1マイルで評価。2倍コースは年6,600円）", ["ANAカード", "ANA一般"],
         "初年度無料"),
    card("ana_jcb_general", "ANA JCB 一般カード", "ANA JCB", "えーえぬえーじぇーしーびーいっぱんかーど", "JCB", "JCB",
         "ana_mile", 2200, (POP,), "1,000円＝5マイル（0.5%。手数料のかからない5マイルコースで評価）", ["ANAカード", "ANA一般",
         "ソラチカカード", "ソラチカ", "ANA To Me CARD PASMO JCB"], "初年度無料"),
    card("ana_jcb_wide_gold", "ANA JCB ワイドゴールドカード", "ANA JCB G", "えーえぬえーじぇーしーびーわいどごーるど", "JCB", "JCB",
         "ana_mile", 15400, (POP,), "1,000円＝10マイル（1%。10マイルコースは移行手数料無料）", ["ANAカード", "ANAゴールド"]),
    card("jal_general", "JALカード 普通カード", "JAL", "じゃるかーどふつうかーど", "JALカード（JCBほか各ブランド）", "Visa/Mastercard/JCB",
         "jal_mile", 2200, (POP,), "200円＝1マイル（0.5%）。イオン・ウエルシア等のJALカード特約店で2倍", ["JALカード", "日本航空"],
         "初年度無料。JAL・アメリカン・エキスプレス・カードは年会費6,600円"),
    card("jal_club_a_gold", "JALカード CLUB-Aゴールドカード", "JAL G", "じゃるかーどくらぶえーごーるどかーど", "JALカード（JCBほか各ブランド）", "Visa/Mastercard/JCB",
         "jal_mile", 17600, (POP,), "100円＝1マイル（1%。ショッピングマイル・プレミアムに自動入会）。JALカード特約店で2%", ["JALゴールド", "CLUB-Aゴールド"],
         "JAL・アメリカン・エキスプレス・カード CLUB-Aゴールドは年会費が異なる"),
    card("rakuten_gold", "楽天ゴールドカード", "楽天G", "らくてんごーるどかーど", "楽天カード", "Visa/Mastercard/JCB",
         "rakuten_point", 2200, (POP,), "1%。楽天市場で2%（カード分）。ポイント率は楽天カードと同じで、空港ラウンジ等が付く", ["楽天ゴールド"]),
    card("mufg_gold", "三菱UFJカード ゴールド", "三菱UFJ G", "みつびしゆーえふじぇいかーどごーるど", "三菱UFJニコス", "Visa/Mastercard/JCB/Amex",
         "global_point", 11000, (POP,), "セブン・ローソン・オーケー等で7%（一般と同じ）。年100万円利用で2,200pt（11,000円相当）",
         ["三菱UFJゴールド", "ゴールドプレステージ", "MUFGゴールド"], "2025年12月に「ゴールドプレステージ」から名称変更"),
    card("aupay_gold", "au PAY ゴールドカード", "au PAY G", "えーゆーぺいごーるどかーど", "auフィナンシャルサービス", "Visa/Mastercard",
         "ponta_point", 11000, (POP,), "1%（Pontaポイント）。au携帯料金等の上乗せはauの契約に依存するため含めない", ["auゴールド", "au PAYゴールド"]),
    card("jcb_gold", "JCBゴールド", "JCB G", "じぇーしーびーごーるど", "JCB", "JCB",
         "j_point", 11000, (POP,), "0.5%（月間合計）。J-POINTパートナーでセブン・Amazon1.5%、スタバ・マクドナルドのモバイルオーダー10%。年100万円で3,000pt",
         ["JCBゴールドカード", "JCB GOLD"]),
    card("aeon_gold", "イオンゴールドカードセレクト", "イオンG", "いおんごーるどかーどせれくと", "イオンフィナンシャルサービス", "Visa/Mastercard/JCB",
         "waon_point", 0, (POP,), "イオングループで1%（一般と同じ）。年会費無料・招待制（年50万円以上の利用等）", ["イオンゴールド", "イオンゴールドカード"],
         "招待制・年会費無料"),
    card("olive_gold", "Olive フレキシブルペイ ゴールド", "Olive G", "おりーぶごーるど", "三井住友カード", "Visa",
         "vpoint", 5500, (POP,), "対象コンビニ・飲食店で8%（Oliveのクレジットモード）。年100万円利用で10,000pt＋翌年以降の年会費永年無料",
         ["Oliveゴールド", "オリーブゴールド"], "年100万円利用で翌年以降永年無料"),
    card("olive_pp", "Olive フレキシブルペイ プラチナプリファード", "Olive PP", "おりーぶぷらちなぷりふぁーど", "三井住友カード", "Visa",
         "vpoint", 33000, (ENT,), "1%。対象コンビニ・飲食店で8%。年100万円利用ごとに10,000pt（最大40,000pt）",
         ["Oliveプラチナプリファード", "オリーブプラチナ", "Oliveプラプリ"]),
    card("view_gold", "ビューカード ゴールド", "ビューG", "びゅーかーどごーるど", "ビューカード", "Visa/Mastercard/JCB",
         "jre_point", 11000, (POP,), "モバイルSuicaへのチャージで1.5%（乗車ポイントと合わせて3.5%）。通常0.5%。年300万円利用で12,000pt",
         ["ビューゴールドプラス", "ビューゴールド"]),
    card("seven_gold", "セブンカード・プラス（ゴールド）", "セブンG", "せぶんかーどぷらすごーるど", "セブン・カードサービス", "JCB",
         "nanaco_point", 0, (POP,), "0.5%。セブン-イレブンで最大10%（一般と同じ）。年会費無料・招待制", ["セブンゴールド"], "招待制・年会費無料"),
    card("saison_intl", "セゾンカードインターナショナル", "セゾン", "せぞんかーどいんたーなしょなる", "クレディセゾン", "Visa/Mastercard/JCB",
         "eikyu_point", 0, (POP,), "1,000円＝永久不滅ポイント1pt（1pt＝5円で評価して0.5%）。ポイントの有効期限なし", ["セゾンカード"]),
    card("saison_gold_amex", "セゾンゴールド・アメリカン・エキスプレス・カード", "セゾンG", "せぞんごーるどあめっくす", "クレディセゾン", "Amex",
         "eikyu_point", 11000, (POP,), "国内1,000円＝1.5pt（0.75%）。永久不滅ポイントは1pt＝5円で評価", ["セゾンゴールドアメックス", "セゾンアメックス"],
         "初年度無料"),
    card("amex_green", "アメリカン・エキスプレス・グリーン・カード", "アメックス", "あめりかんえきすぷれすぐりーんかーど", "アメリカン・エキスプレス", "Amex",
         "amex_mr", 13200, (POP,), "100円＝1pt。メンバーシップ・リワードは何も登録しない状態の1pt＝0.3円で評価（0.3%）。月会費1,100円",
         ["アメックスグリーン", "アメックス・グリーン"], "月会費1,100円"),
    card("amex_gold_pref", "アメリカン・エキスプレス・ゴールド・プリファード・カード", "アメックスG", "あめりかんえきすぷれすごーるどぷりふぁーど",
         "アメリカン・エキスプレス", "Amex", "amex_mr", 39600, (POP,),
         "100円＝1pt（1pt＝0.3円で評価して0.3%）。年200万円利用で無料宿泊券（フリー・ステイ・ギフト。評価に含めない）", ["アメックスゴールド", "ゴールドプリファード"]),
    card("epos_platinum", "エポスプラチナカード", "エポスP", "えぽすぷらちなかーど", "エポスカード", "Visa",
         "epos_point", 30000, (ENT,), "0.5%。年100万円利用で20,000pt（ゴールドの2倍）", ["エポスプラチナ"],
         "招待または年100万円利用で翌年以降20,000円"),
    card("lawson_ponta", "ローソンPontaプラス", "Pontaプラス", "ろーそんぽんたぷらす", "ローソン銀行（三菱UFJニコス提携）", "Mastercard",
         "ponta_point", 0, (POP,), "1%（Pontaポイント）。オーケー・スシロー・くら寿司・松屋等で5%（月3万円まで）", ["ポンタプラス", "Pontaプラス", "ローソンカード"]),
]

# 公式サイト（カード提案画面の「公式サイトで詳しく見る」に使う）。
# 初期5枚は 2026-09-24 追加、v1.13 で統合時に残り16枚を追加（到達確認は check_affiliates.mjs --online で行う）
OFFICIAL_URL = {
    "smbc_gold_nl": "https://www.smbc-card.com/nyukai/card/gold-numberless.jsp",
    "rakuten": "https://www.rakuten-card.co.jp/",
    "ana_wide_gold": "https://www.smbc-card.com/nyukai/affiliate/ana/index.jsp",
    "mufg": "https://www.cr.mufg.jp/apply/card/mucard/index.html",
    "paypay_gold": "https://www.paypay-card.co.jp/service/card/overview/",
    "smbc_nl": "https://www.smbc-card.com/nyukai/card/numberless.jsp",
    "olive": "https://www.smbc.co.jp/kojin/olive/",
    "paypay_card": "https://www.paypay-card.co.jp/",
    "aeon_select": "https://www.aeon.co.jp/card/lineup/select/",
    "dcard": "https://dcard.docomo.ne.jp/",
    "dcard_gold": "https://dcard.docomo.ne.jp/",
    "aupay_card": "https://www.kddi-fs.com/",
    "jcb_w": "https://www.jcb.co.jp/ordercard/kojin_card/os_card_w.html",
    "seven_plus": "https://www.7card.co.jp/",
    "epos": "https://www.eposcard.co.jp/",
    "epos_gold": "https://www.eposcard.co.jp/gold/",
    "amazon_mc": "https://www.smbc-card.com/nyukai/affiliate/amazon/index.jsp",
    "recruit": "https://recruit-card.jp/",
    "smbc_pp": "https://www.smbc-card.com/nyukai/card/platinum-preferred.jsp",
    "marriott_premium": "https://www.americanexpress.com/jp/credit-cards/marriott-bonvoy-premium-card/",
    "marriott": "https://www.americanexpress.com/jp/credit-cards/marriott-bonvoy-card/",
    "view_std": SRC["view_std"],
    # ---- 2026-09-26（到達確認は check_affiliates.mjs --online で行う） ----
    "ana_visa_general": "https://www.smbc-card.com/nyukai/affiliate/ana/index.jsp",
    "ana_jcb_general": "https://www.jcb.co.jp/promotion/jcb_anacard/first.html",
    "ana_jcb_wide_gold": "https://www.jcb.co.jp/promotion/jcb_anacard/cp1.html",
    "jal_general": "https://www.jal.co.jp/jp/ja/jalcard/index03.html",
    "jal_club_a_gold": "https://www.jal.co.jp/jp/ja/jalcard/card/club_a_gold.html",
    "rakuten_gold": "https://www.rakuten-card.co.jp/campaign/gold_card/",
    "mufg_gold": "https://www.cr.mufg.jp/apply/card/mucard_goldprestige/index.html",
    "aupay_gold": "https://www.kddi-fs.com/function/promotion/goldlp/index.html",
    "jcb_gold": "https://www.jcb.co.jp/promotion/ordercard/gold/index.html",
    "aeon_gold": "https://www.aeon.co.jp/card/lineup/select/",
    "olive_gold": "https://www.smbc.co.jp/kojin/olive-account/gold/",
    "olive_pp": "https://www.smbc.co.jp/kojin/olive-account/platinum-preferred/",
    "view_gold": "https://www.jreast.co.jp/card/",
    "seven_gold": "https://www.7card.co.jp/",
    "saison_intl": "https://www.saisoncard.co.jp/",
    "saison_gold_amex": "https://www.saisoncard.co.jp/amex/",
    "amex_green": "https://www.americanexpress.com/ja-jp/",
    "amex_gold_pref": "https://www.americanexpress.com/ja-jp/benefits/gold-preferred-card/",
    "epos_platinum": "https://www.eposcard.co.jp/platinum/main.html",
    "lawson_ponta": "https://www.lawsonbank.jp/lp/lp_credit.html",
}
for _c in cards:
    _c["officialUrl"] = OFFICIAL_URL[_c["id"]]

methods = [
    {"id": "card_physical", "name": "カード（挿し込み・カードのタッチ）", "type": "card"},
    {"id": "smartphone_visa_touch", "name": "スマホのタッチ決済（Apple Pay/Google Pay・Visa/Mastercard/JCB等）", "type": "tap"},
    {"id": "applepay_quicpay", "name": "Apple Pay（QUICPay）", "type": "wallet"},
    {"id": "applepay_id", "name": "Apple Pay/Google Pay（iD）", "type": "wallet"},
    {"id": "online", "name": "ネット・アプリ注文（カード登録・Apple Pay等）", "type": "card"},
    {"id": "paypay", "name": "PayPay", "type": "code"},
    {"id": "mobile_suica_ride", "name": "モバイルSuica（乗車）", "type": "transit"},
]

points = [
    {"id": "vpoint", "name": "Vポイント", "yenPerPoint": 1, "usableScope": "visaMerchants",
     "note": "VポイントPay（Visaのタッチ決済/オンライン）で充当できる前提"},
    {"id": "rakuten_point", "name": "楽天ポイント", "yenPerPoint": 1, "usableScope": "listed"},
    {"id": "ana_mile", "name": "ANAマイル", "yenPerPoint": 1, "usableScope": "none",
     "note": "1マイル＝1円で評価（ANA SKY コインへの1マイル＝1コインの交換。2026-09-26 決定）。移行手数料のかからない方法で付与を計算"},
    {"id": "jal_mile", "name": "JALマイル", "yenPerPoint": 1, "usableScope": "none",
     "note": "1マイル＝1円で評価（e JALポイントへの1,000マイル＝1,000円の交換。2026-09-26 決定）"},
    {"id": "eikyu_point", "name": "永久不滅ポイント", "yenPerPoint": 5, "usableScope": "none",
     "note": "1pt＝5円で評価（セゾン公式「約5円相当」。交換先により5円未満。2026-09-26 決定）"},
    {"id": "amex_mr", "name": "メンバーシップ・リワード", "yenPerPoint": 0.3, "usableScope": "none",
     "note": "1pt＝0.3円で評価（メンバーシップ・リワード・プラス未登録の基本レート。2026-09-26 決定）"},
    {"id": "global_point", "name": "三菱UFJポイント（グローバルポイント）", "yenPerPoint": 5, "usableScope": "none",
     "aliases": ["グローバルポイント"], "note": "1pt=5円相当（交換先による）"},
    {"id": "paypay_point", "name": "PayPayポイント", "yenPerPoint": 1, "usableScope": "paypayMerchants"},
    {"id": "jre_point", "name": "JRE POINT", "yenPerPoint": 1, "usableScope": "suicaMerchants",
     "note": "Suicaへチャージして利用する前提"},
    # ---- v1.7 追加 ----
    {"id": "waon_point", "name": "WAON POINT", "yenPerPoint": 1, "usableScope": "listed"},
    {"id": "d_point", "name": "dポイント", "yenPerPoint": 1, "usableScope": "listed"},
    {"id": "ponta_point", "name": "Pontaポイント", "yenPerPoint": 1, "usableScope": "listed"},
    {"id": "j_point", "name": "J-POINT", "yenPerPoint": 1, "usableScope": "none",
     "note": "2026年1月にOki Dokiポイントから刷新。MyJCB Pay充当で1pt＝1円"},
    {"id": "nanaco_point", "name": "nanacoポイント", "yenPerPoint": 1, "usableScope": "listed"},
    {"id": "epos_point", "name": "エポスポイント", "yenPerPoint": 1, "usableScope": "none", "note": "請求額への充当で1pt＝1円"},
    {"id": "amazon_point", "name": "Amazonポイント", "yenPerPoint": 1, "usableScope": "listed"},
    {"id": "recruit_point", "name": "リクルートポイント", "yenPerPoint": 1, "usableScope": "none",
     "note": "Pontaポイント・dポイントへ等価交換可"},
    {"id": "marriott_point", "name": "Marriott Bonvoyポイント", "yenPerPoint": 1, "usableScope": "none",
     "note": "現金・請求額には使えない。ホテル宿泊に使う前提で1pt＝1円と評価（2026-09-23 決定。マイル移行なら6万pt＝2.5万マイル）"},
]

def route(id, card, method, rate, unit, ppu, point, counts, scope="perTransaction", note=None, review=False, src=None, conf="high"):
    r = {"id": id, "cardId": card, "methodId": method, "baseRate": rate, "unitYen": unit, "pointsPerUnit": ppu,
         "pointId": point, "unitScope": scope, "rounding": "floor", "countsTowardBonus": counts,
         "sourceUrl": src, "checkedAt": CHECKED, "confidence": conf}
    if note: r["note"] = note
    if review: r["needsReview"] = True
    return r

routes = [
    # 三井住友カード ゴールド（NL）: 200円=1pt
    route("smbcg_card", "smbc_gold_nl", "card_physical", 0.005, 200, 1, "vpoint", True, scope="monthlyTotal", src=SRC["smbc_gold"]),
    route("smbcg_touch", "smbc_gold_nl", "smartphone_visa_touch", 0.005, 200, 1, "vpoint", True, scope="monthlyTotal", src=SRC["smbc_gold"]),
    route("smbcg_id", "smbc_gold_nl", "applepay_id", 0.005, 200, 1, "vpoint", True, scope="monthlyTotal", src=SRC["smbc_gold"]),
    route("smbcg_online", "smbc_gold_nl", "online", 0.005, 200, 1, "vpoint", True, scope="monthlyTotal", src=SRC["smbc_gold"]),
    route("smbcg_paypay", "smbc_gold_nl", "paypay", 0.005, 200, 1, "vpoint", True, scope="monthlyTotal",
          note="三井住友カード発行の個人カードは2026/9以降もPayPay払い継続。PayPayポイントは付与なし",
          src=SRC["smbc_paypay"], conf="medium"),
    # 楽天カード: 100円=1pt、2023/11から1回ごと計算
    route("rakuten_card", "rakuten", "card_physical", 0.01, 100, 1, "rakuten_point", False, src=SRC["rakuten"]),
    route("rakuten_quicpay", "rakuten", "applepay_quicpay", 0.01, 100, 1, "rakuten_point", False, src=SRC["rakuten"]),
    route("rakuten_touch", "rakuten", "smartphone_visa_touch", 0.01, 100, 1, "rakuten_point", False,
          note="Google PayのVisaタッチを想定", src=SRC["rakuten"], conf="medium"),
    route("rakuten_online", "rakuten", "online", 0.01, 100, 1, "rakuten_point", False, src=SRC["rakuten"]),
    # ANA VISAワイドゴールド: 200円=1pt(=2マイル)
    route("ana_card", "ana_wide_gold", "card_physical", 0.01, 200, 2, "ana_mile", False, src=SRC["ana"], conf="medium"),
    route("ana_touch", "ana_wide_gold", "smartphone_visa_touch", 0.01, 200, 2, "ana_mile", False, src=SRC["ana"], conf="medium"),
    route("ana_id", "ana_wide_gold", "applepay_id", 0.01, 200, 2, "ana_mile", False, src=SRC["ana"], conf="medium"),
    route("ana_online", "ana_wide_gold", "online", 0.01, 200, 2, "ana_mile", False, src=SRC["ana"], conf="medium"),
    route("ana_paypay", "ana_wide_gold", "paypay", 0.01, 200, 2, "ana_mile", False,
          note="三井住友カード発行の個人向けカード（ANAカード等の提携カードを含む）は2026/9以降も従来方式で継続（PayPay公式）",
          src=SRC["paypay_other"], conf="high"),
    # 三菱UFJカード: 月間合計1,000円=1pt(5円相当)
    route("mufg_card", "mufg", "card_physical", 0.005, 1000, 1, "global_point", False, scope="monthlyTotal", src=SRC["mufg"]),
    route("mufg_quicpay", "mufg", "applepay_quicpay", 0.005, 1000, 1, "global_point", False, scope="monthlyTotal", src=SRC["mufg"]),
    route("mufg_online", "mufg", "online", 0.005, 1000, 1, "global_point", False, scope="monthlyTotal", src=SRC["mufg"]),
    # PayPayカード ゴールド（旧Yahoo! JAPANカード系）: 200円=2pt（1.0%）。2026/6/2に+0.5%特典を廃止
    route("ppg_card", "paypay_gold", "card_physical", 0.01, 200, 2, "paypay_point", True, src=SRC["ppg_change"], conf="medium",
          note="+0.5%特典は2026年6月2日に廃止（2026年5月末までの入会者は次の年会費請求月まで経過措置あり）"),
    route("ppg_quicpay", "paypay_gold", "applepay_quicpay", 0.01, 200, 2, "paypay_point", True, src=SRC["ppg_change"], conf="medium"),
    route("ppg_touch", "paypay_gold", "smartphone_visa_touch", 0.01, 200, 2, "paypay_point", True, src=SRC["ppg_change"], conf="medium",
          note="Visa/Mastercardブランドの場合"),
    route("ppg_online", "paypay_gold", "online", 0.01, 200, 2, "paypay_point", True, src=SRC["ppg_change"], conf="medium"),
    route("ppg_paypay", "paypay_gold", "paypay", 0.01, 200, 2, "paypay_point", True, src=SRC["ppg_bonus"], conf="medium",
          note="PayPayアプリのPayPayクレジット払い。PayPayステップの上乗せ（条件付き）は含めない"),
    # カード以外
    route("paypay_balance", None, "paypay", 0.005, 200, 1, "paypay_point", False,
          note="銀行口座チャージ前提。他社カードのPayPay払いは2026/8/31終了", src=SRC["paypay_rate"]),
    route("suica_ride", None, "mobile_suica_ride", 0.02, 50, 1, "jre_point", False,
          note="JR東日本線のみ・定期区間外。JRE POINT登録が必要。2026/9のJRE POINT改定（駅ビル・エキナカ）の影響なし。チャージ元カードのポイントは含めない（一般カードはモバイルSuicaチャージでポイント付与なし）",
          src=SRC["jre_ride"], conf="high"),
]

for _r in routes:
    if _r['cardId'] == 'paypay_gold':
        _r['checkedAt'] = '2026-09-23'

# ---- v1.7 追加カードの決済経路 ----
V16_CHECKED = "2026-09-23"
M_SHORT = {"card_physical": "card", "smartphone_visa_touch": "touch", "applepay_quicpay": "quicpay",
           "applepay_id": "id", "online": "online", "paypay": "paypay"}
def card_routes(prefix, card_id, methods, rate, unit, ppu, point, counts, src, conf="high", scope="perTransaction",
                notes=None, review=()):
    for m in methods:
        r = route(f"{prefix}_{M_SHORT[m]}", card_id, m, rate, unit, ppu, point, counts, scope=scope,
                  note=(notes or {}).get(m), review=m in review, src=src, conf=conf)
        r["checkedAt"] = V16_CHECKED
        routes.append(r)

SMBC_METHODS = ["card_physical", "smartphone_visa_touch", "applepay_id", "online"]
SMBC_PAYPAY_NOTE = {"paypay": "三井住友カード発行の個人カードは2026/9以降もPayPay払い継続。PayPayポイントは付与なし"}
card_routes("nl", "smbc_nl", SMBC_METHODS + ["paypay"], 0.005, 200, 1, "vpoint", False, SRC["smbc_nl"],
            scope="monthlyTotal", notes=SMBC_PAYPAY_NOTE)
card_routes("olv", "olive", SMBC_METHODS + ["paypay"], 0.005, 200, 1, "vpoint", False, SRC["smbc_nl"], conf="medium",
            scope="monthlyTotal", notes={"paypay": SMBC_PAYPAY_NOTE["paypay"], "card_physical": "クレジットモードでの利用。デビット・ポイント払いモードは対象外"})
card_routes("pp", "smbc_pp", SMBC_METHODS + ["paypay"], 0.01, 100, 1, "vpoint", True, SRC["smbc_pp"], scope="monthlyTotal",
            notes=SMBC_PAYPAY_NOTE)
card_routes("amzmc", "amazon_mc", SMBC_METHODS, 0.01, 100, 1, "amazon_point", False, SRC["amazon_mc_rate"])
card_routes("jcbw", "jcb_w", ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "online"], 0.01, 200, 2, "j_point", False,
            SRC["jcb_w"], scope="monthlyTotal")
card_routes("rec", "recruit", ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "online"], 0.012, 1000, 12,
            "recruit_point", False, SRC["recruit"], scope="monthlyTotal")
card_routes("ppc", "paypay_card", ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "online", "paypay"],
            0.01, 200, 2, "paypay_point", False, SRC["paypay_card"],
            notes={"paypay": "PayPayアプリのPayPayクレジット払い。PayPayステップの上乗せ（条件付き）は含めない"})
card_routes("aeon", "aeon_select", ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "online"],
            0.005, 200, 1, "waon_point", False, SRC["aeon"])
card_routes("dc", "dcard", SMBC_METHODS, 0.01, 100, 1, "d_point", False, SRC["dcard_change"], conf="medium",
            review=SMBC_METHODS,
            notes={m: "2027年1月利用分から200円＝1pt（0.5%）に改定。d払い（dカード設定）は改定後も1%、新番号（4363/5344/5365）のスマホのタッチ決済は2027年5月利用分から1%。改定時にマスタ更新が必要" for m in SMBC_METHODS})
card_routes("dg", "dcard_gold", SMBC_METHODS, 0.01, 100, 1, "d_point", True, SRC["dcard_gold"], conf="medium")
card_routes("au", "aupay_card", ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "online"],
            0.01, 100, 1, "ponta_point", False, SRC["aupay"])
card_routes("sp", "seven_plus", ["card_physical", "applepay_quicpay", "online"], 0.005, 200, 1, "nanaco_point", False,
            SRC["seven_plus"], conf="medium")
card_routes("ep", "epos", ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "online"], 0.005, 200, 1,
            "epos_point", False, SRC["epos"])
card_routes("epg", "epos_gold", ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "online"], 0.005, 200, 1,
            "epos_point", True, SRC["epos_gold"],
            notes={"card_physical": "選べるポイントアップショップ（最大3店舗・2倍）は利用者ごとに異なるため含めない"})
# ---- v1.8：マリオット ボンヴォイ アメックス（Apple PayはQUICPay、Amexのタッチ決済も可） ----
MB_METHODS = ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "online"]
MB_NOTE = {"card_physical": "100円未満の端数は切り捨て。電子マネーチャージ等は対象外"}
card_routes("mbp", "marriott_premium", MB_METHODS, 0.03, 100, 3, "marriott_point", True, SRC["mb_premium"], notes=MB_NOTE)
card_routes("mb", "marriott", MB_METHODS, 0.02, 100, 2, "marriott_point", True, SRC["mb_standard"], conf="medium", notes=MB_NOTE)
# ---- 2026-09-25：ビューカード スタンダード（通常は1,000円＝5pt。モバイルSuicaのチャージ元として乗車時3.5%） ----
card_routes("view", "view_std", ["card_physical", "smartphone_visa_touch", "online"], 0.005, 1000, 5, "jre_point", False,
            SRC["view_std"], conf="medium", scope="monthlyTotal",
            notes={"card_physical": "ビューサンクスボーナス（年間利用額に応じた段階制）は含めない"})
_vr = route("view_suica_ride", "view_std", "mobile_suica_ride", 0.035, 1000, 35, "jre_point", False, scope="monthlyTotal",
            note="モバイルSuicaのチャージ元をビューカードにした場合：乗車ポイント2%＋チャージ1.5%（いずれもJRE POINT）。JRE POINTへのSuica登録が必要",
            src=SRC["view_std"], conf="medium")
routes.append(_vr)
for _r in routes:
    if _r["cardId"] == "view_std" or _r["id"] in ("ana_paypay", "suica_ride"):
        _r["checkedAt"] = C925
    if _r["cardId"] in ("smbc_gold_nl", "smbc_nl", "olive", "smbc_pp"):
        _r["note"] = ((_r.get("note") + "。") if _r.get("note") else "") + "ポイントは1か月の利用金額の合計で計算"
        _r["checkedAt"] = C925
    if _r["cardId"] == "dcard":
        _r["sourceUrl"] = SRC["dcard_2027"]; _r["checkedAt"] = C925
# ---- 2026-09-26：残課題11・19の調査結果 ----
routes.append(route("rakuten_suica_ride", "rakuten", "mobile_suica_ride", 0.025, 1000, 25, "jre_point", False, scope="monthlyTotal",
                    note="楽天ペイアプリから楽天カードでモバイルSuicaにチャージした場合：乗車ポイント2%（JRE POINT）＋チャージ0.5%（楽天ポイント）。Apple Pay・モバイルSuicaアプリからの直接チャージはポイントなし",
                    src=SRC["rakuten_pay_suica"], conf="medium"))
for _r in routes:
    if _r["cardId"] == "paypay_gold":
        _r["confidence"] = "high"; _r["sourceUrl"] = SRC["ppg_2026"]; _r["checkedAt"] = C926
        if _r["id"] == "ppg_card":
            _r["note"] = "2026年6月2日以降（年会費支払予定月から順次）は基本1.0%のみ。+0.5%特典は年間100万円利用特典に変更"
    if _r["cardId"] in ("marriott", "marriott_premium"):
        _r["confidence"] = "high"; _r["sourceUrl"] = SRC["mb_points"]; _r["checkedAt"] = C926
    if _r["id"] == "rakuten_suica_ride":
        _r["checkedAt"] = C926

bonuses = [
    {"id": "smbcg_1m", "cardId": "smbc_gold_nl", "thresholdYen": 1000000, "valueYen": 10000,
     "oneTimeValueYen": 5500, "oneTimeNote": "初回達成で翌年以降の年会費永年無料（5,500円）",
     "periodType": "joinMonth", "startOffsetMonths": 0,
     "description": "年間100万円利用で10,000ポイント（毎年）＋初回達成で年会費永年無料",
     "periodNote": "入会月の1日から11か月後の末日まで（初年度は入会日から）",
     "excludedMethods": [],
     "excludedNote": "年会費、つみたて投資、電子マネーチャージ（Suica等）、au PAY・Kyash等へのチャージ、国民年金等は対象外",
     "sourceUrl": SRC["smbc_gold"], "checkedAt": CHECKED, "confidence": "high"},
    {"id": "ppg_1m", "cardId": "paypay_gold", "thresholdYen": 1000000, "valueYen": 11000,
     "periodType": "joinMonth", "startOffsetMonths": 1, "firstPeriodMonths": 13, "firstPeriodValueYen": 6000,
     "description": "年間100万円利用で11,000ポイント（2年目以降・年会費相当）。入会初年度は6,000ポイント（別に新規入会特典5,000ポイント）",
     "periodNote": "入会初年度は入会月を含む13か月、2年目以降は年会費更新月（入会月の翌月）を含む12か月",
     "excludedMethods": [],
     "excludedNote": "PayPay残高チャージ、キャッシング、決済サービスへのチャージ、PayPayステップ対象外の加盟店でのPayPayクレジット利用は集計対象外",
     "sourceUrl": SRC["ppg_bonus"], "checkedAt": C925, "confidence": "high"},
    # ---- v1.7 追加 ----
    {"id": "pp_1m", "cardId": "smbc_pp", "thresholdYen": 1000000, "valueYen": 10000,
     "periodType": "joinMonth", "startOffsetMonths": 0,
     "description": "年間100万円利用ごとに10,000ポイント（最大40,000ポイント・継続特典）",
     "periodNote": "集計期間は入会月基準で近似。正確な期間は会員サイトで確認し、必要なら期限を手動設定",
     "excludedMethods": [],
     "excludedNote": "年会費、電子マネーチャージ、つみたて投資等は対象外。100万円を超えた分（200万・300万…）は計算に含めない",
     "sourceUrl": SRC["smbc_pp"], "checkedAt": V16_CHECKED, "confidence": "medium"},
    {"id": "view_15m", "cardId": "view_std", "thresholdYen": 1500000, "valueYen": 5250,
     "periodType": "fixed", "startOffsetMonths": 0, "fixedStartMonthDay": "04-01",
     "description": "ビューサンクスボーナス：年間150万円で合計5,250ポイント（30万円250・70万円1,000・100万円1,500・150万円2,500の段階制。アプリは最終段階の合計で評価）",
     "periodNote": "4月〜翌年3月に発行する利用代金明細の利用額（アプリでは4月1日〜3月31日で近似）。Suicaへのチャージは対象外",
     "excludedMethods": ["mobile_suica_ride"], "oneTimeValueYen": 0,
     "sourceUrl": SRC["view_bonus"], "checkedAt": C926, "confidence": "medium"},
    {"id": "dg_1m", "cardId": "dcard_gold", "thresholdYen": 1000000, "valueYen": 10000,
     "periodType": "fixed", "startOffsetMonths": 0, "fixedStartMonthDay": "12-16",
     "description": "年間100万円利用で10,000円相当の特典（クーポン）。200万円の区分は2025年配布分から廃止",
     "periodNote": "毎年12月16日〜翌年12月15日の利用分（入会月によらない固定期間）。特典は翌年7月ごろから利用可",
     "excludedMethods": [],
     "excludedNote": "ドコモ料金等の一部は対象外。特典はクーポンのため1円相当とみなして評価",
     "sourceUrl": SRC["dcard_gold_2026"], "checkedAt": C925, "confidence": "medium"},
    {"id": "epg_1m", "cardId": "epos_gold", "thresholdYen": 1000000, "valueYen": 10000,
     "periodType": "joinMonth", "startOffsetMonths": 0,
     "description": "年間100万円利用で10,000ポイント（50万円達成時の2,500ポイントを含む）",
     "periodNote": "ゴールドカードの入会月基準の1年間",
     "excludedMethods": [],
     "excludedNote": "一部の支払いは集計対象外",
     "sourceUrl": SRC["epos_gold"], "checkedAt": V16_CHECKED, "confidence": "medium"},
    # ---- v1.8 追加：無料宿泊特典をポイント上限×1円で評価 ----
    {"id": "mbp_4m", "cardId": "marriott_premium", "thresholdYen": 4000000, "valueYen": 75000,
     "periodType": "joinMonth", "startOffsetMonths": 0,
     "description": "年間400万円利用＋カード継続で無料宿泊特典1泊（75,000ポイントまでのホテル）。75,000円相当として評価",
     "periodNote": "カード継続（入会月基準の1年ごと）。正確な集計期間は会員サイトで確認",
     "excludedMethods": [],
     "excludedNote": "年会費・電子マネーチャージ等は対象外。500万円利用のプラチナエリート資格は評価しない",
     "sourceUrl": SRC["mb_benefits"], "checkedAt": C926, "confidence": "high"},
    {"id": "mb_25m", "cardId": "marriott", "thresholdYen": 2500000, "valueYen": 50000,
     "periodType": "joinMonth", "startOffsetMonths": 0,
     "description": "年間250万円利用＋カード継続で無料宿泊特典1泊（50,000ポイントまでのホテル）。50,000円相当として評価",
     "periodNote": "カード継続（入会月基準の1年ごと）。正確な集計期間は会員サイトで確認",
     "excludedMethods": [],
     "excludedNote": "年会費・電子マネーチャージ等は対象外",
     "sourceUrl": SRC["mb_benefits"], "checkedAt": C926, "confidence": "high"},
]

categories = [
    {"id": "convenience", "name": "コンビニ"}, {"id": "supermarket", "name": "スーパー"},
    {"id": "drugstore", "name": "ドラッグストア"}, {"id": "restaurant", "name": "飲食チェーン"},
    {"id": "cafe", "name": "カフェ"}, {"id": "ec", "name": "EC"}, {"id": "transport", "name": "交通"},
    {"id": "vending", "name": "自販機"}, {"id": "other", "name": "その他"},
]
STORE_METHODS = ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "applepay_id", "paypay"]
WITH_MO = STORE_METHODS + ["online"]  # 店頭＋公式アプリのモバイルオーダー
# Suicaでの買い物は利用しない方針のため対象外（2026-09-22 決定）
for c in categories:
    c["defaultMethods"] = {"ec": ["online", "paypay"], "transport": ["mobile_suica_ride"]}.get(c["id"], STORE_METHODS)

def store(id, name, kana, cat, aliases=(), methods=None, points=(), note=None):
    s = {"id": id, "name": name, "kana": kana, "aliases": list(aliases), "categoryId": cat}
    if methods: s["acceptedMethods"] = methods
    if points: s["usablePoints"] = list(points)
    if note: s["note"] = note
    return s

stores = [
    # ---- コンビニ ----
    store("seven", "セブン-イレブン", "せぶんいれぶん", "convenience", ["セブン", "セブイレ", "7-11"]),
    store("lawson", "ローソン", "ろーそん", "convenience"),
    store("natural_lawson", "ナチュラルローソン", "なちゅらるろーそん", "convenience"),
    store("lawson100", "ローソンストア100", "ろーそんすとあひゃく", "convenience", ["ローソン100"]),
    store("lawson_threef", "ローソンスリーエフ", "ろーそんすりーえふ", "convenience", ["スリーエフ"]),
    store("familymart", "ファミリーマート", "ふぁみりーまーと", "convenience", ["ファミマ"], points=["rakuten_point"]),
    store("ministop", "ミニストップ", "みにすとっぷ", "convenience"),
    store("poplar", "ポプラ", "ぽぷら", "convenience"),
    store("seikatsu_saika", "生活彩家", "せいかつさいか", "convenience"),
    store("seicomart", "セイコーマート", "せいこーまーと", "convenience", ["セコマ"]),
    store("taiei", "タイエー", "たいえー", "convenience"),
    store("hamanasu_club", "ハマナスクラブ", "はまなすくらぶ", "convenience"),
    store("hasegawa_store", "ハセガワストア", "はせがわすとあ", "convenience", ["ハセスト"]),
    store("newdays", "NewDays", "にゅーでいず", "convenience", ["ニューデイズ"]),
    # ---- スーパー ----
    store("ok", "オーケー", "おーけー", "supermarket", ["OKストア", "オーケーストア"]),
    store("aoki_super", "アオキスーパー", "あおきすーぱー", "supermarket"),
    store("foodstore_aoki", "フードストアあおき", "ふーどすとああおき", "supermarket"),
    store("ozeki", "オオゼキ", "おおぜき", "supermarket"),
    store("sunlive", "サンリブ", "さんりぶ", "supermarket"),
    store("marushoku", "マルショク", "まるしょく", "supermarket"),
    store("livehall", "リブホール", "りぶほーる", "supermarket"),
    store("sank", "サンク", "さんく", "supermarket"),
    store("sunlive_buono", "サンリブBUONO", "さんりぶぼーの", "supermarket"),
    store("sanwa", "三和", "さんわ", "supermarket", ["スーパー三和"]),
    store("foodone", "フードワン", "ふーどわん", "supermarket"),
    store("uocho", "スーパー魚長", "すーぱーうおちょう", "supermarket", ["魚長"]),
    store("nogi_ichiba", "生鮮乃木市場", "せいせんのぎいちば", "supermarket"),
    store("genki_ichiba", "生鮮げんき市場", "せいせんげんきいちば", "supermarket"),
    store("kinsho", "近商ストア", "きんしょうすとあ", "supermarket"),
    store("harves", "ハーベス", "はーべす", "supermarket"),
    store("pochette", "Pochette", "ぽしぇっと", "supermarket", ["ポシェット"]),
    store("tokyu_store", "東急ストア", "とうきゅうすとあ", "supermarket"),
    store("presse", "プレッセ", "ぷれっせ", "supermarket"),
    store("food_station", "フードステーション", "ふーどすてーしょん", "supermarket"),
    store("tobu_store", "東武ストア", "とうぶすとあ", "supermarket"),
    store("domy", "ドミー", "どみー", "supermarket"),
    store("hanamasa", "肉のハナマサ", "にくのはなまさ", "supermarket", ["ハナマサ"]),
    store("japan_meat", "ジャパンミート", "じゃぱんみーと", "supermarket"),
    store("meatmeet", "MEATMeet", "みーとみーと", "supermarket", ["ミートミート"]),
    store("powermart", "パワーマート", "ぱわーまーと", "supermarket"),
    store("feel", "フィール", "ふぃーる", "supermarket"),
    store("yamanaka", "ヤマナカ", "やまなか", "supermarket"),
    store("frante", "フランテ", "ふらんて", "supermarket"),
    store("frante_rose", "フランテロゼ", "ふらんてろぜ", "supermarket"),
    store("aeon", "イオン", "いおん", "supermarket", ["イオンスタイル"]),
    store("itoyokado", "イトーヨーカドー", "いとーよーかどー", "supermarket", ["ヨーカドー"]),
    # ---- ドラッグストア ----
    store("welcia", "ウエルシア", "うえるしあ", "drugstore"),
    store("matsukiyo", "マツモトキヨシ", "まつもときよし", "drugstore", ["マツキヨ"]),
    store("tsuruha", "ツルハドラッグ", "つるはどらっぐ", "drugstore", ["ツルハ"]),
    store("sundrug", "サンドラッグ", "さんどらっぐ", "drugstore"),
    # ---- 飲食チェーン ----
    store("mcdonalds", "マクドナルド", "まくどなるど", "restaurant", ["マック", "マクド"], methods=WITH_MO, points=["rakuten_point"]),
    store("mos", "モスバーガー", "もすばーがー", "restaurant", ["モス", "モスバーガー＆カフェ"], methods=WITH_MO),
    store("kfc", "ケンタッキーフライドチキン", "けんたっきーふらいどちきん", "restaurant", ["ケンタッキー", "KFC"], methods=WITH_MO),
    store("freshness", "フレッシュネスバーガー", "ふれっしゅねすばーがー", "restaurant", ["フレッシュネス"]),
    store("zetteria", "ゼッテリア", "ぜってりあ", "restaurant", methods=WITH_MO),
    store("pizzahut", "ピザハット（オンライン注文）", "ぴざはっと", "restaurant", ["ピザハット"], methods=["online"]),
    store("yoshinoya", "吉野家", "よしのや", "restaurant", methods=WITH_MO),
    store("sukiya", "すき家", "すきや", "restaurant", methods=WITH_MO),
    store("matsuya", "松屋", "まつや", "restaurant", methods=WITH_MO),
    store("matsunoya", "松のや", "まつのや", "restaurant", methods=WITH_MO),
    store("mycurry", "マイカリー食堂", "まいかりーしょくどう", "restaurant", methods=WITH_MO),
    store("hamazushi", "はま寿司", "はまずし", "restaurant"),
    store("kurazushi", "くら寿司", "くらずし", "restaurant"),
    store("sushiro", "スシロー", "すしろー", "restaurant"),
    store("kappazushi", "かっぱ寿司", "かっぱずし", "restaurant"),
    store("saizeriya", "サイゼリヤ", "さいぜりや", "restaurant", ["サイゼ"]),
    store("cocos", "ココス", "ここす", "restaurant"),
    # すかいらーくグループ
    store("gusto", "ガスト", "がすと", "restaurant"),
    store("bamiyan", "バーミヤン", "ばーみやん", "restaurant"),
    store("shabuyo", "しゃぶ葉", "しゃぶよう", "restaurant"),
    store("jonathan", "ジョナサン", "じょなさん", "restaurant"),
    store("yumean", "夢庵", "ゆめあん", "restaurant"),
    store("steakgusto", "ステーキガスト", "すてーきがすと", "restaurant"),
    store("karayoshi", "から好し", "からよし", "restaurant"),
    store("musashinomori", "むさしの森珈琲", "むさしのもりこーひー", "cafe", ["むさしの森"]),
    store("aiya", "藍屋", "あいや", "restaurant"),
    store("grazie", "グラッチェガーデンズ", "ぐらっちぇがーでんず", "restaurant", ["グラッチェ"]),
    store("totoyamichi", "魚屋路", "ととやみち", "restaurant"),
    store("chawan", "chawan", "ちゃわん", "restaurant", ["チャワン"]),
    store("laohana", "La Ohana", "らおはな", "restaurant", ["ラ・オハナ"]),
    store("tonkaratei", "とんから亭", "とんからてい", "restaurant"),
    store("yumean_shokudo", "ゆめあん食堂", "ゆめあんしょくどう", "restaurant"),
    store("momona", "桃菜", "", "restaurant"),
    store("hachiro_soba", "八郎そば", "はちろうそば", "restaurant"),
    store("sanmarusan", "三〇三", "", "restaurant", ["303"]),
    # ---- カフェ ----
    store("doutor", "ドトールコーヒーショップ", "どとーるこーひーしょっぷ", "cafe", ["ドトール"]),
    store("excelsior", "エクセルシオール カフェ", "えくせるしおーるかふぇ", "cafe", ["エクセルシオール"]),
    store("starbucks", "スターバックス", "すたーばっくす", "cafe", ["スタバ"], methods=WITH_MO),
    store("ueshima", "上島珈琲店", "うえしまこーひーてん", "cafe", ["上島珈琲", "UCC Cafe Plaza"]),
    store("cafe_de_crie", "カフェ・ド・クリエ", "かふぇどくりえ", "cafe", ["クリエ"]),
    store("tullys", "タリーズコーヒー", "たりーずこーひー", "cafe", ["タリーズ"]),
    store("komeda", "コメダ珈琲店", "こめだこーひーてん", "cafe", ["コメダ"]),
    # ---- その他 ----
    store("cocacola_vm", "コカ・コーラ自販機", "こかこーらじはんき", "vending", ["Coke ON", "コークオン", "自販機"],
          methods=["card_physical", "smartphone_visa_touch", "applepay_quicpay", "applepay_id"]),
    store("akachan", "アカチャンホンポ", "あかちゃんほんぽ", "other", methods=STORE_METHODS + ["online"]),
    store("curves", "カーブス", "かーぶす", "other", methods=["card_physical"], note="入会金・月会費の支払い"),
    # ---- EC・交通 ----
    store("amazon", "Amazon", "あまぞん", "ec", ["アマゾン"], methods=["online", "paypay"]),
    store("rakuten_ichiba", "楽天市場", "らくてんいちば", "ec", ["楽天"], methods=["online"], points=["rakuten_point"]),
    store("yahoo_shopping", "Yahoo!ショッピング", "やふーしょっぴんぐ", "ec", ["ヤフショ"], methods=["online", "paypay"]),
    store("jr_east", "JR東日本（電車）", "じぇいあーるひがしにほん", "transport", ["JR", "電車"], methods=["mobile_suica_ride"]),
]

# ---- v1.7 追加店舗・ポイント利用可否 ----
stores += [
    store("maxvalu", "マックスバリュ", "まっくすばりゅ", "supermarket"),
    store("mybasket", "まいばすけっと", "まいばすけっと", "supermarket", ["まいばす"]),
    store("daiei", "ダイエー", "だいえー", "supermarket"),
    # v1.8：マリオット系ホテル（宿泊・レストラン。公式サイト予約または現地払い）
    store("marriott_hotels", "マリオット系ホテル（宿泊・レストラン）", "まりおっとけいほてる", "other",
          ["マリオット", "Marriott", "シェラトン", "ウェスティン", "リッツ・カールトン", "ルネッサンス", "コートヤード",
           "フェアフィールド", "Wホテル", "JWマリオット", "モクシー", "ACホテル", "アロフト"],
          methods=["card_physical", "smartphone_visa_touch", "applepay_quicpay", "applepay_id", "online"]),
]
EXTRA_POINTS = {
    "seven": ["nanaco_point"],
    "lawson": ["ponta_point", "d_point"], "natural_lawson": ["ponta_point", "d_point"], "lawson100": ["ponta_point", "d_point"],
    "familymart": ["d_point"],
    "mcdonalds": ["d_point", "ponta_point"],
    "aeon": ["waon_point"], "maxvalu": ["waon_point"], "mybasket": ["waon_point"], "daiei": ["waon_point"],
    "amazon": ["amazon_point"],
}
for _s in stores:
    for _p in EXTRA_POINTS.get(_s["id"], []):
        _s.setdefault("usablePoints", [])
        if _p not in _s["usablePoints"]: _s["usablePoints"].append(_p)

RULE_CHECKED = "2026-09-23"
rate_rules = []

def add_rule(rid, store_id, route_id, rate, src, conf, cond):
    rate_rules.append({"id": rid, "target": {"storeId": store_id}, "routeId": route_id, "rate": rate,
                       "validFrom": None, "validTo": None, "sourceUrl": src, "checkedAt": RULE_CHECKED,
                       "confidence": conf, "conditions": cond})

# 三井住友カード：対象のコンビニ・飲食店（店頭はスマホのVisaタッチ決済のみ）
SMBC_STORE = ["seicomart", "taiei", "hamanasu_club", "hasegawa_store", "seven", "poplar", "seikatsu_saika", "ministop",
              "lawson", "natural_lawson", "lawson100", "lawson_threef", "mcdonalds", "mos", "kfc", "yoshinoya",
              "freshness", "saizeriya", "gusto", "bamiyan", "shabuyo", "jonathan", "yumean",
              "steakgusto", "karayoshi", "musashinomori", "aiya", "grazie", "totoyamichi", "chawan", "laohana",
              "tonkaratei", "yumean_shokudo", "momona", "hachiro_soba", "sanmarusan",
              "sukiya", "hamazushi", "cocos", "doutor", "excelsior", "kappazushi"]
SMBC_COND = "店頭はスマホのタッチ決済（Visa・Mastercard）のみ（カード現物のタッチ・iD・挿し込みは対象外）。商業施設内など一部店舗は対象外"
for s in SMBC_STORE:
    add_rule(f"smbc7_{s}", s, "smbcg_touch", 0.07, SRC["smbc_7pct"], "high", SMBC_COND)
# 三井住友カード：モバイルオーダー（公式アプリ・Visa/Apple Pay/Google Pay）
SMBC_MO = {"mcdonalds": "", "mos": "モスバーガー＆カフェ・公式の配達も対象", "kfc": "公式の配達も対象",
           "yoshinoya": "", "sukiya": "", "starbucks": "アプリまたはApp Clip経由のApple Payのみ（店頭支払い・カードへのチャージは対象外）"}
for s, extra in SMBC_MO.items():
    add_rule(f"smbc7mo_{s}", s, "smbcg_online", 0.07, SRC["smbc_7pct"], "high",
             "公式アプリのモバイルオーダー（Visaカード・Apple Pay・Google Pay）" + (f"。{extra}" if extra else ""))

# 三菱UFJカード：対象店舗7%（対象店舗合計で月5万円まで・上限は計算に含めない）
MUFG_CAP = "対象店舗の合計で月5万円まで（上限は計算に含めない）"
MUFG_STD = "カード（挿し込み・カードのタッチ）またはApple Pay（QUICPay）。" + MUFG_CAP
MUFG = [
    # (店舗, 経路, 条件)
    *[(s, r, MUFG_STD + "。複合商業施設内・駅ビル内等の一部店舗、スマホレジ、ネット注文は対象外")
      for s in ("seven", "lawson", "natural_lawson", "lawson100") for r in ("mufg_card", "mufg_quicpay")],
    ("cocacola_vm", "mufg_card", "自販機でのカードのタッチ決済（Coke ON Payも対象、Apple Pay経由は対象外）。" + MUFG_CAP),
    *[(s, r, MUFG_STD + "。複合商業施設内の一部店舗は対象外")
      for s in ("ueshima", "cafe_de_crie", "kurazushi", "sushiro") for r in ("mufg_card", "mufg_quicpay")],
    ("starbucks", "mufg_online", "スターバックス カードへのオンライン入金のみ（店頭・Apple Pay・店頭入金は対象外）。" + MUFG_CAP),
    ("pizzahut", "mufg_online", "公式サイト・公式アプリでのオンライン注文のみ。" + MUFG_CAP),
    *[(s, r, "店舗の券売機・セルフレジ、Apple Pay（QUICPay）。高速道路SA・PA内の一部店舗は対象外。" + MUFG_CAP)
      for s in ("matsuya", "matsunoya", "mycurry") for r in ("mufg_card", "mufg_quicpay")],
    *[(s, "mufg_online", "松弁ネット・松屋モバイルオーダー・松弁デリバリー（公式オンラインショップは対象外）。" + MUFG_CAP)
      for s in ("matsuya", "matsunoya", "mycurry")],
    *[("zetteria", r, "店頭決済、公式アプリのモバイルオーダー。複合商業施設内の一部店舗は対象外。" + MUFG_CAP)
      for r in ("mufg_card", "mufg_quicpay", "mufg_online")],
    *[("akachan", r, "カード（QUICPayは対象外）とOnline Shop。複合商業施設内・フランチャイズの一部店舗は対象外。" + MUFG_CAP)
      for r in ("mufg_card", "mufg_online")],
    ("curves", "mufg_card", "入会金・月会費のみ。" + MUFG_CAP),
    *[(s, r, MUFG_STD + "。テナント・ネットスーパー等は対象外")
      for s in ("aoki_super", "foodstore_aoki", "ok", "ozeki", "sunlive", "marushoku", "livehall", "sank",
                "sunlive_buono", "sanwa", "foodone", "uocho", "nogi_ichiba", "genki_ichiba", "kinsho", "harves",
                "pochette", "tokyu_store", "presse", "food_station", "tobu_store", "domy", "hanamasa",
                "japan_meat", "meatmeet", "powermart", "feel", "yamanaka", "frante", "frante_rose")
      for r in ("mufg_card", "mufg_quicpay")],
]
for s, r, cond in MUFG:
    add_rule(f"mufg7_{s}_{r}", s, r, 0.07, SRC["mufg_7pct"], "high", cond)

# ---- v1.7：三井住友カード発行の他カードにも同じ7%特約（スマホのタッチ決済・モバイルオーダー） ----
# 2026-09-26：Olive（クレジットモード）は8%、Amazon Mastercard は施策の対象外（公式の対象カード一覧による）
for prefix, conf, rate_ in (("nl", "high", 0.07), ("olv", "high", 0.08), ("pp", "high", 0.07)):
    src = SRC["smbc_pp_7pct"] if prefix == "pp" else SRC["smbc_7pct"]
    for s_ in SMBC_STORE:
        add_rule(f"smbc7_{prefix}_{s_}", s_, f"{prefix}_touch", rate_, src, conf,
                 SMBC_COND + ("。Oliveフレキシブルペイのクレジットモードは8%（デビットモードは対象外）" if prefix == "olv" else ""))
    for s_, extra in SMBC_MO.items():
        add_rule(f"smbc7mo_{prefix}_{s_}", s_, f"{prefix}_online", rate_, src, conf,
                 "公式アプリのモバイルオーダー（Visa/Mastercard・Apple Pay・Google Pay）" + (f"。{extra}" if extra else ""))

# ---- v1.7：Amazon Mastercard ----
add_rule("amzmc_amazon", "amazon", "amzmc_online", 0.02, SRC["amazon_mc"], "high",
         "Amazonプライム会員の場合（非会員は1.5%）。Amazonでのカード払い")
add_rule("amzmc7_seven", "seven", "amzmc_touch", 0.07, SRC["amazon_mc_seven"], "medium",
         "セブン‐イレブンでスマホのMastercardタッチ決済（Apple Payのみ。Google Pay・カード現物・iDは対象外）。コンビニ1.5%＋5.5%")
for s_ in ("seven", "familymart", "lawson"):
    for r_ in ("amzmc_card", "amzmc_id", "amzmc_touch"):
        add_rule(f"amzmc15_{s_}_{r_}", s_, r_, 0.015, SRC["amazon_mc_rate"], "medium",
                 "コンビニ3社（セブン・ファミマ・ローソン）で1.5%。1回200円以上の利用")

# ---- v1.7：JCB CARD W（J-POINTパートナー。事前登録が必要なものを含む） ----
JCBW_STORE = ["jcbw_card", "jcbw_quicpay", "jcbw_touch"]
for r_ in JCBW_STORE:
    add_rule(f"jcbw_seven_{r_}", "seven", r_, 0.015, SRC["jcb_w"], "medium", "J-POINTパートナー（3倍）")
    add_rule(f"jcbw_mcd_{r_}", "mcdonalds", r_, 0.055, SRC["jcb_w"], "medium", "J-POINTパートナー（11倍）")
add_rule("jcbw_starbucks", "starbucks", "jcbw_online", 0.105, SRC["jcb_w"], "medium",
         "スターバックスカードへのオンライン入金・Starbucks eGift・モバイルオーダー（最大21倍・要事前登録）")
add_rule("jcbw_amazon", "amazon", "jcbw_online", 0.02, SRC["jcb_w"], "medium", "J-POINTパートナー（要事前登録）")

# ---- v1.7：セブンカード・プラス ----
for r_ in ("sp_card", "sp_quicpay"):
    add_rule(f"sp_seven_{r_}", "seven", r_, 0.10, SRC["seven_plus"], "medium",
             "7iDにカード登録のうえクレジット決済（nanacoポイント9.5%＋セブンマイル0.5%）。一部商品は対象外")

# ---- v1.7：イオンカードセレクト（イオングループ対象店舗で2倍） ----
for s_ in ("aeon", "maxvalu", "mybasket", "daiei"):
    for r_ in ("aeon_card", "aeon_touch", "aeon_quicpay"):
        add_rule(f"aeon2x_{s_}_{r_}", s_, r_, 0.01, SRC["aeon"], "high", "イオングループ対象店舗でWAON POINT2倍（200円＝2pt）")

# ---- v1.8：マリオット系ホテルでポイント2倍（宿泊実績のポイントは別途・含めない） ----
for r_ in ("card", "touch", "quicpay", "online"):
    add_rule(f"mbp_hotel_{r_}", "marriott_hotels", f"mbp_{r_}", 0.06, SRC["mb_premium_spec"], "high" if r_ in ("card", "online") else "medium",
             "マリオット ボンヴォイ参加ホテルでの宿泊・レストラン（100円＝6pt）。会員としての宿泊ポイントは別途付与のため含めない")
    add_rule(f"mb_hotel_{r_}", "marriott_hotels", f"mb_{r_}", 0.05, SRC["mb_standard"], "medium",
             "マリオット ボンヴォイ参加ホテルでの宿泊・レストラン（100円＝5pt）。会員としての宿泊ポイントは別途付与のため含めない")

# ---- 2026-09-25：近くのお店（F13）用の OSM ブランド識別子（出典を確認できたものから付与。残りは課題13） ----
OSM_BRAND = {"seven": ["Q259340"]}
for _s in stores:
    if _s["id"] in OSM_BRAND: _s["osmBrandWikidata"] = OSM_BRAND[_s["id"]]

rate_rules.append({"id": "rakuten_ichiba_card", "target": {"storeId": "rakuten_ichiba"}, "routeId": "rakuten_online",
                   "rate": 0.02, "validFrom": None, "validTo": None, "sourceUrl": SRC["rakuten_ichiba"], "checkedAt": CHECKED,
                   "confidence": "high",
                   "conditions": "カード通常1%＋楽天市場特典1%（特典分は期間限定・月1,000pt上限）。楽天市場自体の1%は全経路共通のため省略"})

# ==== 2026-09-26 カードラインナップ第1弾・第2弾（詳細設計 32.3・32.4） ====
# ANA VISAワイドゴールドはマイル数で持つ（200円＝2マイル。2マイルコースは移行手数料無料）
for _r in routes:
    if _r["cardId"] == "ana_wide_gold":
        _r["sourceUrl"] = SRC["ana_mile_course"]; _r["checkedAt"] = C926B
        _r["note"] = ((_r.get("note") + "。") if _r.get("note") else "") + "200円＝1pt＝2マイル（2マイルコース・移行手数料無料）。マイルは1マイル＝1円で評価"
_n_before = len(routes)
STD4 = ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "online"]
card_routes("anav", "ana_visa_general", SMBC_METHODS + ["paypay"], 0.005, 200, 1, "ana_mile", False, SRC["ana_visa_general"], conf="medium",
            notes={"card_physical": "200円＝1pt。手数料のかからない1pt＝1マイルで評価（2倍コースは年6,600円で1%）",
                   "paypay": "三井住友カード発行の個人向けカード（提携カードを含む）は2026/9以降もPayPay払い継続"})
card_routes("anaj", "ana_jcb_general", STD4, 0.005, 1000, 5, "ana_mile", False, SRC["ana_jcb_general"], conf="medium", scope="monthlyTotal",
            notes={"card_physical": "1,000円＝J-POINT 1pt。手数料のかからない5マイルコース（1pt＝5マイル）で評価。J-POINTパートナーの上乗せは含めない"})
card_routes("anajg", "ana_jcb_wide_gold", STD4, 0.01, 1000, 10, "ana_mile", False, SRC["ana_jcb_wide_gold"], conf="medium", scope="monthlyTotal",
            notes={"card_physical": "1,000円＝J-POINT 1pt＝10マイル（ゴールドは10マイルコースの移行手数料無料）"})
card_routes("jal", "jal_general", STD4, 0.005, 200, 1, "jal_mile", False, SRC["jal_mile"], conf="medium", scope="monthlyTotal",
            notes={"card_physical": "200円＝1マイル。ショッピングマイル・プレミアム（年4,950円・100円＝1マイル）は含めない"})
card_routes("jalg", "jal_club_a_gold", STD4, 0.01, 100, 1, "jal_mile", False, SRC["jal_gold"], conf="medium", scope="monthlyTotal",
            notes={"card_physical": "100円＝1マイル（ショッピングマイル・プレミアムに自動入会・年会費無料）"})
card_routes("rkg", "rakuten_gold", ["card_physical", "applepay_quicpay", "smartphone_visa_touch", "online"], 0.01, 100, 1,
            "rakuten_point", False, SRC["rakuten_gold"])
card_routes("mufgg", "mufg_gold", ["card_physical", "applepay_quicpay", "online"], 0.005, 1000, 1, "global_point", True,
            SRC["mufg_gold"], scope="monthlyTotal")
card_routes("aug", "aupay_gold", STD4, 0.01, 100, 1, "ponta_point", False, SRC["aupay_gold"])
card_routes("jcbg", "jcb_gold", STD4, 0.005, 200, 1, "j_point", True, SRC["jcb_gold"], conf="medium", scope="monthlyTotal")
card_routes("aeong", "aeon_gold", STD4, 0.005, 200, 1, "waon_point", False, SRC["aeon_gold"], conf="medium")
card_routes("olvg", "olive_gold", SMBC_METHODS + ["paypay"], 0.005, 200, 1, "vpoint", True, SRC["olive_gold"], conf="medium",
            scope="monthlyTotal", notes={"paypay": SMBC_PAYPAY_NOTE["paypay"], "card_physical": "クレジットモードでの利用"})
card_routes("olvpp", "olive_pp", SMBC_METHODS + ["paypay"], 0.01, 100, 1, "vpoint", True, SRC["olive_pp"], conf="medium",
            scope="monthlyTotal", notes={"paypay": SMBC_PAYPAY_NOTE["paypay"], "card_physical": "クレジットモードでの利用"})
card_routes("viewg", "view_gold", ["card_physical", "smartphone_visa_touch", "online"], 0.005, 1000, 5, "jre_point", True,
            SRC["view_gold"], conf="medium", scope="monthlyTotal")
routes.append(route("view_gold_suica_ride", "view_gold", "mobile_suica_ride", 0.035, 1000, 35, "jre_point", False, scope="monthlyTotal",
                    note="モバイルSuicaのチャージ元をビューカード ゴールドにした場合：乗車ポイント2%＋チャージ1.5%（いずれもJRE POINT）",
                    src=SRC["view_gold"], conf="medium"))
card_routes("spg", "seven_gold", ["card_physical", "applepay_quicpay", "online"], 0.005, 200, 1, "nanaco_point", False,
            SRC["seven_gold"], conf="medium")
card_routes("ssn", "saison_intl", STD4, 0.005, 1000, 1, "eikyu_point", False, SRC["saison_intl"], conf="medium", scope="monthlyTotal",
            notes={"card_physical": "1,000円＝永久不滅ポイント1pt（1pt＝5円で評価）"})
card_routes("ssng", "saison_gold_amex", STD4, 0.0075, 1000, 1.5, "eikyu_point", False, SRC["saison_gold"], conf="medium", scope="monthlyTotal",
            notes={"card_physical": "国内の利用は通常の1.5倍（1,000円＝1.5pt）。海外は2倍（含めない）"})
card_routes("amxg", "amex_green", STD4, 0.003, 100, 1, "amex_mr", False, SRC["amex_green"], conf="medium",
            notes={"card_physical": "100円＝1pt。メンバーシップ・リワード・プラス（1pt＝1円）は登録しない前提"})
card_routes("amxgp", "amex_gold_pref", STD4, 0.003, 100, 1, "amex_mr", False, SRC["amex_gold_pref"], conf="medium",
            notes={"card_physical": "100円＝1pt。フリー・ステイ・ギフト（年200万円で無料宿泊券）は評価に含めない"})
card_routes("epp", "epos_platinum", STD4, 0.005, 200, 1, "epos_point", True, SRC["epos_platinum"], conf="medium",
            notes={"card_physical": "選べるポイントアップショップは利用者ごとに異なるため含めない"})
card_routes("lpp", "lawson_ponta", ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "online"], 0.01, 100, 1,
            "ponta_point", False, SRC["lawson_ponta"], conf="medium",
            notes={"card_physical": "Mastercard加盟店で1%。ローソンでの最大6%（毎月10日・20日の時間限定・要エントリー）はキャンペーン扱いで含めない"})
routes.append(route("rkg_suica_ride", "rakuten_gold", "mobile_suica_ride", 0.025, 1000, 25, "jre_point", False, scope="monthlyTotal",
                    note="楽天ペイアプリから楽天カードでモバイルSuicaにチャージした場合：乗車ポイント2%＋チャージ0.5%（楽天カードと同じ）",
                    src=SRC["rakuten_pay_suica"], conf="medium"))
for _r in routes[_n_before:]:
    _r["checkedAt"] = C926B

def add_rule26(rid, store_id, route_id, rate, src, conf, cond):
    add_rule(rid, store_id, route_id, rate, src, conf, cond)
    rate_rules[-1]["checkedAt"] = C926B

# 楽天ゴールド：楽天市場2%（楽天カードと同じ）
add_rule26("rkg_ichiba", "rakuten_ichiba", "rkg_online", 0.02, SRC["rakuten_ichiba"], "high",
           "カード通常1%＋楽天市場特典1%（楽天カードと同じ。特典分は期間限定・月1,000pt上限）")
# 三菱UFJカード ゴールド：一般と同じ7%特約
for s_, r_, cond in MUFG:
    add_rule26(f"mufgg7_{s_}_{r_}", s_, r_.replace("mufg_", "mufgg_"), 0.07, SRC["mufg_gold"], "medium", cond)
# イオンゴールド：イオングループ2倍
for s_ in ("aeon", "maxvalu", "mybasket", "daiei"):
    for r_ in ("aeong_card", "aeong_touch", "aeong_quicpay"):
        add_rule26(f"aeong2x_{s_}_{r_}", s_, r_, 0.01, SRC["aeon_gold"], "medium", "イオングループ対象店舗でWAON POINT2倍（一般と同じ）")
# Oliveゴールド・Oliveプラチナプリファード：Oliveのクレジットモードは8%
for prefix in ("olvg", "olvpp"):
    for s_ in SMBC_STORE:
        add_rule26(f"smbc8_{prefix}_{s_}", s_, f"{prefix}_touch", 0.08, SRC["smbc_7pct"], "medium",
                   SMBC_COND + "。Oliveフレキシブルペイのクレジットモードは8%（一般と同じ扱い）")
    for s_, extra in SMBC_MO.items():
        add_rule26(f"smbc8mo_{prefix}_{s_}", s_, f"{prefix}_online", 0.08, SRC["smbc_7pct"], "medium",
                   "公式アプリのモバイルオーダー（Visa・Apple Pay・Google Pay）" + (f"。{extra}" if extra else ""))
# セブンカード・プラス（ゴールド）：セブン-イレブン10%（一般と同じ）
for r_ in ("spg_card", "spg_quicpay"):
    add_rule26(f"spg_seven_{r_}", "seven", r_, 0.10, SRC["seven_gold"], "medium", "7iDにカード登録のうえクレジット決済（一般と同じ）。一部商品は対象外")
# JCBゴールド：J-POINTパートナー（要ポイントアップ登録）
for r_ in ("jcbg_card", "jcbg_quicpay", "jcbg_touch"):
    add_rule26(f"jcbg_seven_{r_}", "seven", r_, 0.015, SRC["jcb_partner"], "medium", "J-POINTパートナー（3倍・要ポイントアップ登録）")
add_rule26("jcbg_amazon", "amazon", "jcbg_online", 0.015, SRC["jcb_partner"], "medium", "J-POINTパートナー（3倍・要ポイントアップ登録）")
add_rule26("jcbg_mcd", "mcdonalds", "jcbg_online", 0.10, SRC["jcb_partner"], "medium", "モバイルオーダー・マックデリバリー限定（20倍・要ポイントアップ登録）")
add_rule26("jcbg_starbucks", "starbucks", "jcbg_online", 0.10, SRC["jcb_partner"], "medium",
           "モバイルオーダー・スターバックス カードへのオンライン入金（20倍・要ポイントアップ登録）")
# JALカード特約店（イオングループ・ウエルシア）でマイル2倍
for s_ in ("aeon", "maxvalu", "mybasket", "daiei", "welcia"):
    src_ = SRC["jal_welcia"] if s_ == "welcia" else SRC["jal_aeon"]
    for r_ in ("card", "touch", "quicpay"):
        add_rule26(f"jal2x_{s_}_{r_}", s_, f"jal_{r_}", 0.01, src_, "medium", "JALカード特約店（200円＝2マイル）")
        add_rule26(f"jalg2x_{s_}_{r_}", s_, f"jalg_{r_}", 0.02, src_, "medium", "JALカード特約店（ショッピングマイル・プレミアム会員は100円＝2マイル）")
# ローソンPontaプラス：対象店舗5%（2026年6月16日以降。月3万円までの上限は計算に含めない）
LPP_COND = "基本1%＋対象店舗の上乗せ4%（2026年6月16日利用分から。対象店舗の合計で月3万円まで・上限は計算に含めない）"
for s_ in ("ok", "sushiro", "kurazushi", "matsuya", "matsunoya"):
    for r_ in ("lpp_card", "lpp_quicpay"):
        add_rule26(f"lpp5_{s_}_{r_}", s_, r_, 0.05, SRC["lawson_ponta"], "medium", LPP_COND)
add_rule26("lpp5_pizzahut", "pizzahut", "lpp_online", 0.05, SRC["lawson_ponta"], "medium", "公式サイト・アプリでのオンライン注文。" + LPP_COND)
add_rule26("lpp5_cocacola", "cocacola_vm", "lpp_card", 0.05, SRC["lawson_ponta"], "medium", "自販機でのカードのタッチ決済。" + LPP_COND)

bonuses += [
    {"id": "mufgg_1m", "cardId": "mufg_gold", "thresholdYen": 1000000, "valueYen": 11000,
     "periodType": "joinMonth", "startOffsetMonths": 0,
     "description": "年間100万円利用で2,200ポイント（11,000円相当・1pt＝5円）",
     "periodNote": "集計期間は入会月基準で近似。正確な期間は会員サイトで確認し、必要なら期限を手動設定",
     "excludedMethods": [], "sourceUrl": SRC["mufg_bonus"], "checkedAt": C926B, "confidence": "medium"},
    {"id": "jcbg_1m", "cardId": "jcb_gold", "thresholdYen": 1000000, "valueYen": 3000,
     "periodType": "fixed", "startOffsetMonths": 0, "fixedStartMonthDay": "12-16",
     "description": "J-POINTボーナス：年間100万円利用で3,000ポイント（50万円ごとの段階制。アプリは100万円時点で評価）",
     "periodNote": "毎年12月16日〜翌年12月15日の利用分（入会月によらない固定期間）",
     "excludedMethods": [], "sourceUrl": SRC["jcb_bonus"], "checkedAt": C926B, "confidence": "medium"},
    {"id": "olvg_1m", "cardId": "olive_gold", "thresholdYen": 1000000, "valueYen": 10000,
     "oneTimeValueYen": 5500, "oneTimeNote": "初回達成で翌年以降の年会費永年無料（5,500円）",
     "periodType": "joinMonth", "startOffsetMonths": 0,
     "description": "年間100万円利用で10,000ポイント（継続特典）＋初回達成で年会費永年無料",
     "periodNote": "入会月基準の1年間で近似",
     "excludedMethods": [], "sourceUrl": SRC["olive_gold_bonus"], "checkedAt": C926B, "confidence": "medium"},
    {"id": "olvpp_1m", "cardId": "olive_pp", "thresholdYen": 1000000, "valueYen": 10000,
     "periodType": "joinMonth", "startOffsetMonths": 0,
     "description": "年間100万円利用ごとに10,000ポイント（最大40,000ポイント・継続特典）",
     "periodNote": "入会月基準の1年間で近似。100万円を超えた分（200万・300万…）は計算に含めない",
     "excludedMethods": [], "sourceUrl": SRC["olive_pp"], "checkedAt": C926B, "confidence": "medium"},
    {"id": "viewg_3m", "cardId": "view_gold", "thresholdYen": 3000000, "valueYen": 12000,
     "periodType": "fixed", "startOffsetMonths": 0, "fixedStartMonthDay": "04-01",
     "description": "年間300万円利用で12,000ポイント（利用額に応じた段階制。アプリは300万円時点で評価）",
     "periodNote": "4月〜翌年3月の利用分で近似。Suicaへのチャージは対象外",
     "excludedMethods": ["mobile_suica_ride"], "oneTimeValueYen": 0,
     "sourceUrl": SRC["view_gold_bonus"], "checkedAt": C926B, "confidence": "low"},
    {"id": "epp_1m", "cardId": "epos_platinum", "thresholdYen": 1000000, "valueYen": 20000,
     "periodType": "joinMonth", "startOffsetMonths": 0,
     "description": "年間100万円以上200万円未満の利用で20,000ポイント（利用額に応じた段階制。アプリは100万円時点で評価）",
     "periodNote": "入会月基準の1年間で近似",
     "excludedMethods": [], "sourceUrl": SRC["epos_platinum"], "checkedAt": C926B, "confidence": "medium"},
]

master = {"schemaVersion": 1, "masterVersion": "2026.09.26-3", "checkedAt": RULE_CHECKED,
          "disclaimer": "公開情報をもとにした参考値。キャンペーンは含まない。実際の還元は各社の規約に従う。",
          "series": series, "cards": cards, "methods": methods, "points": points, "routes": routes, "bonuses": bonuses,
          "categories": categories, "stores": stores, "rateRules": rate_rules}

# ---- 検証 ----
errs = []
BY_STORE = {x['id']: x for x in stores}
BY_ROUTE = {x['id']: x for x in routes}
def ids(xs): return {x["id"] for x in xs}
for name in ("series", "cards", "methods", "points", "routes", "bonuses", "categories", "stores", "rateRules"):
    xs = master[name]
    if len(ids(xs)) != len(xs): errs.append(f"{name}: id重複")
C, M, P, R, S, K = ids(cards), ids(methods), ids(points), ids(routes), ids(stores), ids(categories)
for c in cards:
    if c["pointId"] not in P: errs.append(f"card {c['id']}: pointId不正")
    if not c.get("segments") or any(x not in ("popular", "enthusiast") for x in c["segments"]):
        errs.append(f"card {c['id']}: segments不正")
    if not c.get("shortName") or not c.get("kana"): errs.append(f"card {c['id']}: 略称/よみなし")
    if not c.get("company") or not c.get("companyKana"): errs.append(f"card {c['id']}: カード会社なし")
    if c.get("officialUrl") and not c["officialUrl"].startswith("https://"): errs.append(f"card {c['id']}: officialUrlがhttpsでない")
    if not any(r["cardId"] == c["id"] for r in routes): errs.append(f"card {c['id']}: 決済経路なし")
    if c.get("series") not in ids(series): errs.append(f"card {c['id']}: series不正")
    if c.get("tier") not in ("general", "gold", "platinum"): errs.append(f"card {c['id']}: tier不正")
for x in series:
    if not x.get("name") or not x.get("kana"): errs.append(f"series {x['id']}: 名前/よみなし")
    tiers = {c["tier"] for c in cards if c.get("series") == x["id"]}
    if not tiers: errs.append(f"series {x['id']}: カードなし")
    elif x["id"] not in SERIES_PAIR_EXEMPT | SERIES_PAIR_PENDING and not {"general", "gold"} <= tiers:
        errs.append(f"series {x['id']}: 一般とゴールドの組がない")
    elif x["id"] in SERIES_PAIR_PENDING and {"general", "gold"} <= tiers:
        errs.append(f"series {x['id']}: 組が揃ったので SERIES_PAIR_PENDING から外す")
for r in routes:
    if r["cardId"] is not None and r["cardId"] not in C: errs.append(f"route {r['id']}: cardId不正")
    if r["methodId"] not in M: errs.append(f"route {r['id']}: methodId不正")
    if r["pointId"] not in P: errs.append(f"route {r['id']}: pointId不正")
    if not r.get("sourceUrl"): errs.append(f"route {r['id']}: 出典なし")
    yen = {p["id"]: p["yenPerPoint"] for p in points}[r["pointId"]]
    if r["baseRate"] > 0 and abs(r["pointsPerUnit"] * yen / r["unitYen"] - r["baseRate"]) > 1e-9:
        errs.append(f"route {r['id']}: baseRateと付与単位が不整合")
for b in bonuses:
    if b["cardId"] not in C: errs.append(f"bonus {b['id']}: cardId不正")
    if b["periodType"] not in ("joinMonth", "fixed"): errs.append(f"bonus {b['id']}: periodType不正")
    if b["periodType"] == "fixed":
        import re as _re
        if not _re.fullmatch(r"(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])", b.get("fixedStartMonthDay", "")):
            errs.append(f"bonus {b['id']}: fixedStartMonthDay不正")
    if ("firstPeriodMonths" in b) != ("firstPeriodValueYen" in b) and "firstPeriodMonths" not in b:
        errs.append(f"bonus {b['id']}: firstPeriodValueYenだけの指定は不可")
    if b.get("firstPeriodMonths") is not None and not (12 <= b["firstPeriodMonths"] <= 24):
        errs.append(f"bonus {b['id']}: firstPeriodMonthsは12〜24")
for s in stores:
    if s["categoryId"] not in K: errs.append(f"store {s['id']}: categoryId不正")
    for q in s.get("osmBrandWikidata", []):
        if not re.fullmatch(r"Q[0-9]+", q): errs.append(f"store {s['id']}: osmBrandWikidata不正")
    for m in s.get("acceptedMethods", []):
        if m not in M: errs.append(f"store {s['id']}: method {m}不正")
    for p in s.get("usablePoints", []):
        if p not in P: errs.append(f"store {s['id']}: point {p}不正")
for k in categories:
    for m in k["defaultMethods"]:
        if m not in M: errs.append(f"category {k['id']}: method {m}不正")
for rr in rate_rules:
    if rr["target"].get("storeId") not in S: errs.append(f"rule {rr['id']}: storeId不正")
    if rr["routeId"] not in R: errs.append(f"rule {rr['id']}: routeId不正")
    st = BY_STORE.get(rr["target"].get("storeId"))
    if st and rr["routeId"] in R:
        acc = st.get("acceptedMethods") or next(k["defaultMethods"] for k in categories if k["id"] == st["categoryId"])
        if BY_ROUTE[rr["routeId"]]["methodId"] not in acc:
            errs.append(f"rule {rr['id']}: 店舗で使えない支払い方法への特約")
    if not rr.get("checkedAt") or not rr.get("sourceUrl"): errs.append(f"rule {rr['id']}: 出典/確認日なし")

if errs:
    print("\n".join(errs)); sys.exit(1)
json.dump(master, open("rules.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"OK cards={len(cards)} points={len(points)} bonuses={len(bonuses)} methods={len(methods)} routes={len(routes)} stores={len(stores)} rateRules={len(rate_rules)} "
      f"needsReview={sum(1 for x in routes + points if x.get('needsReview'))}")
