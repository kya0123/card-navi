"""推奨エンジンの参照実装（詳細設計の検証用）。TypeScript実装はこの結果と一致させる。
python3 ref_engine.py で golden_cases.json を生成する。"""
import json, math, copy
from datetime import date, timedelta

M = json.load(open("rules.json", encoding="utf-8"))
BY = {k: {x["id"]: x for x in M[k]} for k in ("cards", "methods", "points", "routes", "bonuses", "categories", "stores")}
BONUS_BY_CARD = {b["cardId"]: b for b in M["bonuses"]}
EPS = 1e-9


# ---------- 期間計算（4.3.1） ----------
def add_months(y, m, n):
    t = y * 12 + (m - 1) + n
    return t // 12, t % 12 + 1


def bonus_period(join_ym, offset, today):
    y, m = map(int, join_ym.split("-"))
    sy, sm = add_months(y, m, offset)
    # today を含む直近の開始月まで12か月ずつ進める
    while True:
        ny, nm = add_months(sy, sm, 12)
        if date(ny, nm, 1) <= today:
            sy, sm = ny, nm
        else:
            break
    ey, em = add_months(sy, sm, 12)
    return date(sy, sm, 1), date(ey, em, 1) - timedelta(days=1)


def period_for(b, join_ym, today):
    """ボーナスの種類ごとの集計期間（詳細設計 5.1）。(start, end, first) を返す。"""
    if b["periodType"] == "fixed":
        mm, dd = map(int, b["fixedStartMonthDay"].split("-"))
        start = date(today.year, mm, dd)
        if today < start:
            start = date(today.year - 1, mm, dd)
        return start, date(start.year + 1, mm, dd) - timedelta(days=1), False
    if not join_ym:
        return None
    if b.get("firstPeriodMonths"):
        y, m = map(int, join_ym.split("-"))
        ey, em = add_months(y, m, b["firstPeriodMonths"])
        first_end = date(ey, em, 1) - timedelta(days=1)
        if today <= first_end:
            return date(y, m, 1), first_end, True
    s, e = bonus_period(join_ym, b["startOffsetMonths"], today)
    return s, e, False


def goal_status(goal, card_setting, today):
    b = BY["bonuses"][goal["bonusId"]]
    first = False
    if goal.get("deadlineOverride"):
        deadline = date.fromisoformat(goal["deadlineOverride"])
        start = None
    else:
        start, deadline, first = period_for(b, card_setting.get("joinYm"), today)
    threshold = goal.get("thresholdYen", b["thresholdYen"])
    progress = goal.get("progressYen", 0) or 0
    if goal.get("achieved") or progress >= threshold:
        state = "achieved"
    elif today > deadline:
        state = "expired"
    else:
        state = "active"
    remaining = max(threshold - progress, 0)
    months_left = (deadline.year - today.year) * 12 + (deadline.month - today.month) + 1
    monthly = math.ceil(remaining / months_left) if state == "active" and months_left > 0 else 0
    return {"state": state, "start": start and start.isoformat(), "deadline": deadline.isoformat(),
            "remainingYen": remaining, "monthsLeft": max(months_left, 0), "requiredMonthlyYen": monthly,
            "firstPeriod": first}


# ---------- 推奨（4.2） ----------
# ---------- その他のカード（詳細設計 32.8） ----------
CUSTOM_METHODS = ["card_physical", "smartphone_visa_touch", "online"]


def custom_parts(user):
    """その他のカードを、持っているカードとして使う経路とカードにする（特約・ボーナスなし、月間合計）"""
    cards, routes = {}, []
    for i, c in enumerate(user.get("customCards", [])):
        cards[c["id"]] = {"id": c["id"], "pointId": c["pointId"], "annualFee": 0, "series": "custom", "tier": "general",
                          "name": c["name"].strip() or f"その他のカード{i + 1}", "userDefined": True}
        yen = BY["points"][c["pointId"]]["yenPerPoint"]
        for m in CUSTOM_METHODS:
            routes.append({"id": f"{c['id']}_{m}", "cardId": c["id"], "methodId": m, "pointId": c["pointId"],
                           "baseRate": c["baseRate"], "unitYen": 100, "pointsPerUnit": c["baseRate"] * 100 / yen,
                           "unitScope": "monthlyTotal", "countsTowardBonus": False, "userDefined": True})
    return cards, routes


TIER_RANK = {"general": 0, "gold": 1, "platinum": 2}
CARD_ORDER = {c["id"]: i for i, c in enumerate(M["cards"])}


def merge_same_series(groups, owned, cards):
    """全カードで比べるとき、同じシリーズ・同じ率の持っていないカードを代表の枠にまとめる（詳細設計 32.7）"""
    def key(g):
        c = cards.get(g["cardId"]) if g["cardId"] else None
        return f"{c['series']}|{g['effectiveRate']}" if c and c["series"] != "custom" else None

    def rank(g):
        c = cards[g["cardId"]]
        return (0 if c["id"] in owned else 1, c["annualFee"], TIER_RANK[c["tier"]], CARD_ORDER.get(c["id"], 0))

    clusters = {}
    for g in groups:
        k = key(g)
        if k: clusters.setdefault(k, []).append(g)
    rep_of = {}
    for k, members in clusters.items():
        rep = min(members, key=rank)
        absorbed = sorted([m for m in members if m is not rep and m["cardId"] not in owned], key=rank)
        if absorbed: rep["sameRateCardIds"] = [m["cardId"] for m in absorbed]
        rep_of[k] = rep
    out, placed = [], set()
    for g in groups:
        k = key(g)
        target = g if (not k or g["cardId"] in owned) else rep_of[k]
        if id(target) not in placed:
            out.append(target); placed.add(id(target))
    return out


def resolve_rate(route_id, store, category_id, today, route=None):
    def valid(r):
        return (r.get("validFrom") is None or date.fromisoformat(r["validFrom"]) <= today) and \
               (r.get("validTo") is None or today <= date.fromisoformat(r["validTo"]))
    rules = [r for r in M["rateRules"] if r["routeId"] == route_id and valid(r)]
    if store:
        hit = [r for r in rules if r["target"].get("storeId") == store["id"]]
        if hit: return max(r["rate"] for r in hit), "store"
    hit = [r for r in rules if r["target"].get("categoryId") == category_id]
    if hit: return max(r["rate"] for r in hit), "category"
    return (route or BY["routes"][route_id])["baseRate"], "base"


def earned_points(route, rate, amount):
    """付与ポイント（円換算）。perTransactionは付与単位で切り捨ててから率を掛け、円未満を切り捨て。"""
    if amount is None: return None, False
    if route["unitScope"] == "monthlyTotal":
        return math.floor(amount * rate), True  # 概算
    base = math.floor(amount / route["unitYen"]) * route["unitYen"]
    return math.floor(base * rate + EPS), False


def recommend(user, store_id=None, category_id=None, amount=None, today=date(2026, 9, 22), top_n=3, scope="owned"):
    store = BY["stores"].get(store_id) if store_id else None
    cat_id = store["categoryId"] if store else category_id
    # 現金のみの店は acceptedMethods が空（詳細設計 32.11）。空リストも店舗の指定として扱う
    accepted = set(store["acceptedMethods"] if "acceptedMethods" in store else BY["categories"][cat_id]["defaultMethods"]) if store \
        else set(BY["categories"][cat_id]["defaultMethods"])

    owned = {c["cardId"]: c for c in user["ownedCards"]}
    goals = {g["bonusId"]: g for g in user.get("bonusGoals", [])}
    custom_cards, custom_routes = custom_parts(user)
    cards = {**BY["cards"], **custom_cards}
    cands = []
    for r in M["routes"] + custom_routes:
        if r["methodId"] not in accepted: continue
        if r["cardId"] is None:
            if r["id"] not in user.get("enabledNonCardRoutes", []): continue
            prio = 99
        else:
            c = owned.get(r["cardId"])
            if c:
                if r["methodId"] not in c["enabledMethods"]: continue
                prio = c["priority"]
            else:
                # 全カードで比べるときだけ、持っていないカードを定義順で後ろに加える（詳細設計 30.2）
                if scope != "all": continue
                prio = 1000 + CARD_ORDER.get(r["cardId"], 0)
        rate, src = resolve_rate(r["id"], store, cat_id, today, r)
        bonus_rate = 0.0
        b = BONUS_BY_CARD.get(r["cardId"])
        # ボーナスは持っているカードだけ加算する
        if b and r["cardId"] in owned and b["id"] in goals and goals[b["id"]].get("target") and r["countsTowardBonus"] \
                and r["methodId"] not in b.get("excludedMethods", []):
            g = goals[b["id"]]
            st = goal_status(g, owned[r["cardId"]], today)
            if st["state"] == "active":
                base = b["firstPeriodValueYen"] if st["firstPeriod"] and b.get("firstPeriodValueYen") is not None else b["valueYen"]
                # 年会費無料になる初回特典（oneTimeValueYen）は含めない（詳細設計 31.2.4）
                bonus_rate = base / g.get("thresholdYen", b["thresholdYen"])
        pts, approx = earned_points(r, rate, amount)
        cands.append({"routeId": r["id"], "cardId": r["cardId"], "methodId": r["methodId"],
                      "rate": round(rate, 6), "rateSource": src, "bonusRate": round(bonus_rate, 6),
                      "effectiveRate": round(rate + bonus_rate, 6), "earnedYen": pts, "earnedApprox": approx,
                      "_prio": prio})
    cands.sort(key=lambda x: (-x["effectiveRate"], -(x["bonusRate"] > 0), x["_prio"], x["routeId"]))
    # 1カード1枠（詳細設計 31.2.3）：カードごとにいちばん高い実質還元率の経路をまとめる。
    # 同じカードの低い率は枠にしない。カードなし経路は経路単位
    groups, index = [], {}
    for c in cands:
        key = c["cardId"] or c["routeId"]
        if key in index:
            g = index[key]
            if c["effectiveRate"] == g["effectiveRate"]:
                g["methodIds"].append(c["methodId"]); g["routeIds"].append(c["routeId"])
            continue
        g = {k: v for k, v in c.items() if k not in ("_prio", "methodId", "routeId")}
        g["methodIds"], g["routeIds"] = [c["methodId"]], [c["routeId"]]
        index[key] = g; groups.append(g)
    if scope == "all":
        groups = merge_same_series(groups, owned, cards)
    top = groups[:top_n]

    # ポイント払い推奨（4.4）
    point_pay = None
    if scope == "all":
        # ポイント払いは持っているカードの1位で判定する
        point_pay = recommend(user, store_id, category_id, None, today, 1)["pointPay"]
    elif top:
        t = top[0]
        if t["rateSource"] == "base" and t["bonusRate"] == 0:
            held = {cards[cid]["pointId"] for cid in owned} | \
                   {BY["routes"][rid]["pointId"] for rid in user.get("enabledNonCardRoutes", [])}
            usable = set(store.get("usablePoints", [])) if store else set()
            for p in M["points"]:
                sc = p["usableScope"]
                if (sc == "visaMerchants" and accepted & {"smartphone_visa_touch", "online"}) or \
                   (sc == "paypayMerchants" and "paypay" in accepted):
                    usable.add(p["id"])
            usable &= held
            if usable:
                point_pay = sorted(usable)
    return {"storeId": store_id, "categoryId": cat_id, "top": top, "pointPay": point_pay}


# ---------- ゴールデンケース ----------
ALL = ["card_physical", "smartphone_visa_touch", "applepay_quicpay", "applepay_id", "online", "paypay"]
BASE_USER = {
    "ownedCards": [
        {"cardId": "smbc_gold_nl", "joinYm": "2024-04", "enabledMethods": ALL, "priority": 1},
        {"cardId": "rakuten", "joinYm": "2018-01", "enabledMethods": ALL, "priority": 2},
        {"cardId": "ana_wide_gold", "joinYm": "2015-06", "enabledMethods": ALL, "priority": 3},
        {"cardId": "mufg", "joinYm": "2020-10", "enabledMethods": ALL, "priority": 4},
    ],
    "enabledNonCardRoutes": ["paypay_balance", "suica_ride"],
    "bonusGoals": [{"bonusId": "smbcg_1m", "target": False, "progressYen": 300000}],
}


def user(**kw):
    u = copy.deepcopy(BASE_USER)
    g = u["bonusGoals"][0]
    for k, v in kw.items():
        if k in ("target", "progressYen", "achieved", "oneTimeAchieved", "deadlineOverride"): g[k] = v
        elif k == "owned": u["ownedCards"] = [c for c in u["ownedCards"] if c["cardId"] in v]
        elif k == "disable":
            for c in u["ownedCards"]:
                if c["cardId"] == v[0]: c["enabledMethods"] = [m for m in c["enabledMethods"] if m != v[1]]
        elif k == "nonCard": u["enabledNonCardRoutes"] = v
        elif k == "ppg":
            u["ownedCards"].append({"cardId": "paypay_gold", "joinYm": "2023-05", "enabledMethods": ALL, "priority": 5})
            u["bonusGoals"].append({"bonusId": "ppg_1m", "target": v.get("target", False), "progressYen": v.get("progress", 0)})
    return u


def owned_user(card_ids, goals=None, non_card=("paypay_balance", "suica_ride"), join="2024-04"):
    """カード一覧から選んだカードだけを保有している利用者（入会年月は既定2024-04で統一。None で未設定）"""
    oc = [{"cardId": c, "priority": i + 1,
           "enabledMethods": [r["methodId"] for r in M["routes"] if r["cardId"] == c]}
          for i, c in enumerate(card_ids)]
    for c in oc:
        if join: c["joinYm"] = join
    return {"ownedCards": oc, "enabledNonCardRoutes": list(non_card), "bonusGoals": goals or []}


def custom_user(card_ids, customs, non_card=()):
    """その他のカードを登録した利用者（その他のカードは持っているカードの末尾）"""
    u = owned_user(card_ids, non_card=non_card)
    for c in customs:
        u["ownedCards"].append({"cardId": c["id"], "priority": len(u["ownedCards"]) + 1, "enabledMethods": list(CUSTOM_METHODS)})
    u["customCards"] = customs
    return u


CASES = [
    ("G01", "セブン・ボーナスOFF：三井住友スマホVisaタッチ7%が1位（同率の三菱UFJより優先順で上）", user(), {"store_id": "seven"}),
    ("G02", "セブン・ボーナスON：7%+1%（初回特典は含めない）", user(target=True), {"store_id": "seven"}),
    ("G03", "ファミマ・ボーナスOFF：楽天1%、ポイント払い推奨あり", user(), {"store_id": "familymart"}),
    ("G04", "ファミマ・ボーナスON：三井住友0.5%+1%が1位、ポイント払い推奨なし", user(target=True), {"store_id": "familymart"}),
    ("G05", "ファミマ・ボーナスON・年会費無料は達成済み：0.5%+1.0%", user(target=True, oneTimeAchieved=True), {"store_id": "familymart"}),
    ("G06", "ボーナスON・今期達成済み：ボーナス加算なし", user(target=True, achieved=True), {"store_id": "familymart"}),
    ("G07", "ボーナスON・累計が条件額以上：加算なし", user(target=True, progressYen=1000000), {"store_id": "familymart"}),
    ("G08", "ボーナスON・手動期限切れ：加算なし", user(target=True, deadlineOverride="2026-09-21"), {"store_id": "familymart"}),
    ("G09", "オーケー：三菱UFJ 7%", user(), {"store_id": "ok"}),
    ("G10", "Amazon：オンライン楽天1%", user(), {"store_id": "amazon"}),
    ("G11", "楽天市場：楽天2%", user(), {"store_id": "rakuten_ichiba"}),
    ("G12", "JR東日本：モバイルSuica乗車2%", user(), {"store_id": "jr_east"}),
    ("G13", "マスタ未登録→カテゴリ（飲食）：楽天1%", user(), {"category_id": "restaurant"}),
    ("G14", "セブン850円：7%で付与単位切り捨て（800円×7%=56）、三菱UFJは概算59", user(), {"store_id": "seven", "amount": 850}),
    ("G15", "ファミマ199円：楽天100円単位で1pt", user(), {"store_id": "familymart", "amount": 199}),
    ("G16", "楽天・三菱UFJのみ保有でセブン：三菱UFJ 7%", user(owned=["rakuten", "mufg"]), {"store_id": "seven"}),
    ("G17", "三井住友のスマホタッチOFFでセブン：三菱UFJ 7%が1位", user(disable=("smbc_gold_nl", "smartphone_visa_touch")), {"store_id": "seven"}),
    ("G18", "三井住友のみ・ボーナスOFFでファミマ：0.5%、Vポイント払い推奨", user(owned=["smbc_gold_nl"], nonCard=[]), {"store_id": "familymart"}),
    ("G19", "スタバ・ボーナスON：三井住友モバイルオーダー7%+1%（店頭は対象外）", user(target=True), {"store_id": "starbucks"}),
    ("G20", "マクドナルド・ボーナスOFF：三井住友7%、ポイント払い推奨なし", user(), {"store_id": "mcdonalds"}),
    ("G22", "ナチュラルローソン：三井住友スマホタッチ7%と三菱UFJ 7%", user(), {"store_id": "natural_lawson"}),
    ("G23", "ローソンスリーエフ：三井住友のみ7%（三菱UFJは対象外）", user(), {"store_id": "lawson_threef"}),
    ("G24", "ピザハット（オンライン）：三菱UFJ 7%", user(), {"store_id": "pizzahut"}),
    ("G25", "コカ・コーラ自販機：三菱UFJカードのタッチ7%", user(), {"store_id": "cocacola_vm"}),
    ("G26", "むさしの森珈琲（すかいらーく）：三井住友7%", user(), {"store_id": "musashinomori"}),
    ("G27", "松屋：三菱UFJ（カード/QUICPay/モバイルオーダー）7%", user(), {"store_id": "matsuya"}),
    ("G28", "PayPayゴールド追加・ボーナスOFF・ファミマ：楽天とPayPayゴールドが同率1%（優先順で楽天が上）", user(ppg={}), {"store_id": "familymart"}),
    ("G29", "PayPayゴールドのボーナスON（累計20万）・ファミマ：1%+1.1%=2.1%", user(ppg={"target": True, "progress": 200000}), {"store_id": "familymart"}),
    ("G30", "両方のボーナスON・ファミマ：PayPayゴールド2.1% > 三井住友1.5%", user(target=True, ppg={"target": True}), {"store_id": "familymart"}),
    ("G31", "PayPayゴールドのボーナスON・セブン：三井住友スマホタッチ7%が1位のまま", user(ppg={"target": True}), {"store_id": "seven"}),
    ("G21", "Yahoo!ショッピング・ボーナスON：三井住友（オンライン/PayPay）1.5%", user(target=True), {"store_id": "yahoo_shopping"}),
    # ---- v1.7：カード一覧から選んだ保有カードのみで推奨 ----
    ("G32", "Amazon：Amazon MC 2%とJCB W 2%が同率（優先順でAmazon MCが上）",
     owned_user(["amazon_mc", "jcb_w", "rakuten"]), {"store_id": "amazon"}),
    ("G33", "ファミマ3,000円：リクルート1.2%（月間合計・概算36円）が1位",
     owned_user(["recruit", "rakuten", "epos"]), {"store_id": "familymart", "amount": 3000}),
    ("G34", "セブン：セブンカード・プラス10%が三井住友（NL）7%より上",
     owned_user(["smbc_nl", "seven_plus"]), {"store_id": "seven"}),
    ("G35", "まいばすけっと：イオンカード1%（イオングループ2倍）",
     owned_user(["aeon_select", "epos"]), {"store_id": "mybasket"}),
    ("G36", "プラチナプリファードのボーナスON・ファミマ：1%+1%=2%",
     owned_user(["smbc_pp", "rakuten"], goals=[{"bonusId": "pp_1m", "target": True, "progressYen": 500000}]),
     {"store_id": "familymart"}),
    ("G37", "マクドナルド：JCB W 5.5%は保有していなければ出ない（NLの7%のみ）",
     owned_user(["smbc_nl"], non_card=[]), {"store_id": "mcdonalds"}),
    ("G38", "マクドナルド：JCB W保有ならNL 7%の次にJCB W 5.5%",
     owned_user(["smbc_nl", "jcb_w"], non_card=[]), {"store_id": "mcdonalds"}),
    ("G39", "ローソン：dポイント・Pontaポイント払い推奨（1位が通常還元のとき）",
     owned_user(["aupay_card", "dcard", "epos"], non_card=[]), {"store_id": "lawson"}),
    # ---- v1.8：マリオット ボンヴォイ アメックス（1pt＝1円で評価） ----
    ("G40", "ファミマ：マリオット・プレミアム3%が楽天1%より上",
     owned_user(["rakuten", "marriott_premium"], non_card=[]), {"store_id": "familymart", "amount": 1050}),
    ("G41", "セブン：三井住友ゴールド7%がマリオット・プレミアム3%より上",
     owned_user(["smbc_gold_nl", "marriott_premium"], non_card=[]), {"store_id": "seven"}),
    ("G42", "マリオット・プレミアムのボーナスON（累計100万）・ファミマ：3%+1.875%",
     owned_user(["marriott_premium", "rakuten"], non_card=[], goals=[{"bonusId": "mbp_4m", "target": True, "progressYen": 1000000}]),
     {"store_id": "familymart"}),
    ("G43", "マリオット系ホテル：プレミアム6%・スタンダード5%",
     owned_user(["marriott", "marriott_premium", "rakuten"], non_card=[]), {"store_id": "marriott_hotels"}),
    # ---- 2026-09-25：初年度・固定期間のボーナス、ビューカード、三井住友の月間合計 ----
    ("G44", "PayPayゴールド入会初年度（2026-03入会）のボーナスON・ファミマ：1%+0.6%（初年度6,000pt）",
     owned_user(["paypay_gold", "rakuten"], non_card=[], goals=[{"bonusId": "ppg_1m", "target": True, "progressYen": 0}],
                join="2026-03"), {"store_id": "familymart"}),
    ("G45", "PayPayゴールド2年目（2025-08入会）のボーナスON・ファミマ：1%+1.1%",
     owned_user(["paypay_gold", "rakuten"], non_card=[], goals=[{"bonusId": "ppg_1m", "target": True, "progressYen": 0}],
                join="2025-08"), {"store_id": "familymart"}),
    ("G46", "dカード GOLDのボーナスON・入会年月なしでも固定期間で加算・ファミマ：1%+1%",
     owned_user(["dcard_gold", "rakuten"], non_card=[], goals=[{"bonusId": "dg_1m", "target": True, "progressYen": 0}],
                join=None), {"store_id": "familymart"}),
    ("G47", "JR東日本：ビューカードをチャージ元にしたモバイルSuica乗車3.5%がSuica乗車2%より上",
     owned_user(["view_std", "rakuten"]), {"store_id": "jr_east", "amount": 1000}),
    ("G48", "ファミマ1,050円：三井住友ゴールド（NL）0.5%は月間合計で概算5円",
     owned_user(["smbc_gold_nl"], non_card=[]), {"store_id": "familymart", "amount": 1050}),
    # ---- v1.20：その他のカード（32.8）・全カードで比べるときのシリーズまとめ（32.7） ----
    ("G49", "その他のカード（楽天ポイント1.2%）がファミマで楽天カード1%より上（月間合計・概算12円）",
     custom_user(["rakuten"], [{"id": "custom_1", "name": "〇〇銀行カード", "pointId": "rakuten_point", "baseRate": 0.012}]),
     {"store_id": "familymart", "amount": 1000}),
    ("G50", "その他のカードに特約はない：セブンで三井住友（NL）7%の下",
     custom_user(["smbc_nl"], [{"id": "custom_1", "name": "", "pointId": "global_point", "baseRate": 0.01}]), {"store_id": "seven"}),
    ("G51", "全カード・持っているカードなし：セブンで三井住友（NL）シリーズは（NL）の1枠（ゴールド・プラチナプリファードを添える）",
     owned_user([], non_card=[]), {"store_id": "seven", "scope": "all", "top_n": 10}),
    ("G52", "全カード・プラチナプリファードを持っている：セブンで（NL）・ゴールド（NL）はプラチナプリファードの枠",
     owned_user(["smbc_pp"], non_card=[]), {"store_id": "seven", "scope": "all", "top_n": 10}),
    # ---- 2026-09-26：カードラインナップ第1弾・第2弾（32.3・32.4） ----
    ("G53", "イオン：JALカード CLUB-Aゴールド2%（特約店）がイオンゴールド1%・JAL普通1%より上",
     owned_user(["jal_club_a_gold", "aeon_gold", "jal_general"], non_card=[]), {"store_id": "aeon"}),
    ("G54", "ファミマ1,000円：セゾンゴールド・アメックス0.75%（永久不滅1pt＝5円・概算7円）＞セゾンインターナショナル0.5%＞アメックス・グリーン0.3%",
     owned_user(["saison_gold_amex", "saison_intl", "amex_green"], non_card=[]), {"store_id": "familymart", "amount": 1000}),
    ("G55", "オーケー：三菱UFJカード ゴールド7%＞ローソンPontaプラス5%",
     owned_user(["lawson_ponta", "mufg_gold"], non_card=[]), {"store_id": "ok"}),
    ("G56", "マクドナルド：JCBゴールドのモバイルオーダー10%＞三井住友（NL）7%",
     owned_user(["smbc_nl", "jcb_gold"], non_card=[]), {"store_id": "mcdonalds"}),
    ("G57", "ファミマ：ANA JCBワイドゴールド1%（マイル1円）＞ANA VISA一般0.5%・ANA JCB一般0.5%",
     owned_user(["ana_visa_general", "ana_jcb_general", "ana_jcb_wide_gold"], non_card=[]), {"store_id": "familymart", "amount": 3000}),
    ("G58", "エポスプラチナのボーナスON・ファミマ：0.5%＋2%（年100万円で20,000pt）",
     owned_user(["epos_platinum", "epos_gold"], non_card=[], goals=[{"bonusId": "epp_1m", "target": True, "progressYen": 0}]),
     {"store_id": "familymart"}),
    ("G59", "セブン：Oliveゴールド・Oliveプラチナプリファードも8%。同率は優先順",
     owned_user(["olive_pp", "olive_gold", "smbc_nl"], non_card=[]), {"store_id": "seven"}),
    # ---- 2026-09-26 段階4：カード以外の支払い（32.11） ----
    ("G60", "カードなし・d払いとPayPay残高を使う：ファミマでどちらも0.5%（経路ごとに1枠）",
     owned_user([], non_card=["paypay_balance", "dbarai_balance"]), {"store_id": "familymart"}),
    ("G61", "楽天ペイ（楽天キャッシュ）1%はリクルートカード1.2%に負ける：ローソン",
     owned_user(["recruit"], non_card=["rpay_cash"]), {"store_id": "lawson"}),
    ("G62", "イオン：WAONは2倍で1%。イオンカードセレクト1%と同率ならカードが先",
     owned_user(["aeon_select"], non_card=["waon_emoney", "nanaco_emoney"]), {"store_id": "aeon"}),
    ("G63", "セブン：nanacoはセブンで使える（0.5%）。WAONは使えない",
     owned_user([], non_card=["waon_emoney", "nanaco_emoney"]), {"store_id": "seven"}),
]

PERIOD_CASES = [
    ("P01", "2024-04", 0, "2026-09-22"), ("P02", "2024-04", 0, "2027-03-31"), ("P03", "2024-04", 0, "2027-04-01"),
    ("P04", "2025-12", 0, "2026-09-22"), ("P05", "2026-09", 0, "2026-09-22"), ("P06", "2024-04", 1, "2026-09-22"),
    ("P07", "2023-05", 1, "2026-09-22"),
]

PERIOD_FOR_CASES = [
    # (id, bonusId, joinYm, today)
    ("Q01", "ppg_1m", "2026-03", "2026-09-22"),   # 初年度：2026-03-01〜2027-03-31
    ("Q02", "ppg_1m", "2026-03", "2027-03-31"),   # 初年度の最終日
    ("Q03", "ppg_1m", "2026-03", "2027-04-01"),   # 2年目：2027-04-01〜2028-03-31
    ("Q04", "ppg_1m", "2023-05", "2026-09-22"),   # 既存会員：年会費更新月（6月）基準
    ("Q05", "dg_1m", None, "2026-09-22"),         # 固定：2025-12-16〜2026-12-15
    ("Q06", "dg_1m", None, "2026-12-15"),
    ("Q07", "dg_1m", None, "2026-12-16"),         # 固定：2026-12-16〜2027-12-15
    ("Q08", "dg_1m", "2024-04", "2027-01-05"),    # 入会年月があっても固定期間
    ("Q09", "smbcg_1m", "2024-04", "2026-09-22"), # 従来の入会月基準
]

if __name__ == "__main__":
    out = {"masterVersion": M["masterVersion"], "today": "2026-09-22", "cases": [], "periodCases": []}
    for cid, desc, u, args in CASES:
        res = recommend(u, **args)
        out["cases"].append({"id": cid, "desc": desc, "input": {"user": u, **args}, "expected": res})
        t = res["top"]
        print(cid, desc)
        for x in t:
            print(f"    {x['cardId'] or x['routeIds'][0]:14} {'/'.join(x['methodIds']):45} rate={x['rate']:.4f} bonus={x['bonusRate']:.4f} eff={x['effectiveRate']:.4f}"
                  f" src={x['rateSource']} earned={x['earnedYen']}{'(概算)' if x['earnedApprox'] else ''}"
                  f"{' same=' + '/'.join(x['sameRateCardIds']) if x.get('sameRateCardIds') else ''}")
        print("    pointPay:", res["pointPay"])
    for pid, jym, off, today in PERIOD_CASES:
        s, e = bonus_period(jym, off, date.fromisoformat(today))
        out["periodCases"].append({"id": pid, "joinYm": jym, "offset": off, "today": today,
                                   "expectedStart": s.isoformat(), "expectedEnd": e.isoformat()})
        print(pid, jym, off, today, "->", s, e)
    out["periodForCases"] = []
    for qid, bid, jym, today in PERIOD_FOR_CASES:
        s, e, first = period_for(BY["bonuses"][bid], jym, date.fromisoformat(today))
        out["periodForCases"].append({"id": qid, "bonusId": bid, "joinYm": jym, "today": today,
                                      "expectedStart": s.isoformat(), "expectedEnd": e.isoformat(), "expectedFirst": first})
        print(qid, bid, jym, today, "->", s, e, "初年度" if first else "")
    st = goal_status({"bonusId": "smbcg_1m", "progressYen": 300000}, {"joinYm": "2024-04"}, date(2026, 9, 22))
    print("goal_status sample:", st)
    out["goalStatusCase"] = {"input": {"progressYen": 300000, "joinYm": "2024-04", "today": "2026-09-22"}, "expected": st}
    json.dump(out, open("golden_cases.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
