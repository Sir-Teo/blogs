#!/usr/bin/env python3
"""Parse Google Takeout archives into one privacy-stripped JSON file for the blog figures.

Self-contained: reads ONLY the local Google Takeout files (never committed) and writes
assets/data/google/overview.json. Emails, phone numbers, raw IP addresses, Gaia IDs,
birthday, DUSI tokens, ad tracking query parameters, and exact home-suburb names are
never written to the output.
"""
from __future__ import annotations

import argparse
import bisect
import csv
import html as htmllib
import json
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SRC = Path(
    "/Users/teo/.gemini/antigravity/brain/4c4c4b01-6316-43b8-adfc-2176effcf1c7/scratch/takeout/Takeout"
)
OUT = ROOT / "assets" / "data" / "google" / "overview.json"

NY = ZoneInfo("America/New_York")
EST_FIXED = timezone(timedelta(hours=-5))
TS_RE = re.compile(r"([A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2} [AP]M [A-Z]+)")


def has_han(s: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", s or ""))


def script_of(title: str, ch: str) -> str:
    s = f"{title} {ch}"
    if re.search(r"[\u3040-\u30ff]", s):
        return "jp"
    if re.search(r"[\uac00-\ud7af]", s):
        return "ko"
    if has_han(s):
        return "zh"
    return "en"


def parse_yt_html(path: Path) -> list[dict]:
    raw = path.read_text(errors="replace")
    blocks = raw.split('<div class="outer-cell mdl-cell mdl-cell--12-col mdl-shadow--2dp">')[1:]
    rows = []
    for b in blocks:
        hdr_m = re.search(r'<p class="mdl-typography--title">(.*?)<br></p>', b, re.S)
        hdr = htmllib.unescape(hdr_m.group(1)).strip() if hdr_m else ""
        cells = re.findall(
            r'<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">(.*?)</div>',
            b,
            re.S,
        )
        main = cells[0] if cells else ""
        cap_m = re.search(
            r'<div class="content-cell mdl-cell mdl-cell--12-col mdl-typography--caption">(.*?)</div>',
            b,
            re.S,
        )
        cap = (
            htmllib.unescape(re.sub(r"<[^>]+>", " ", cap_m.group(1)))
            .replace("\xa0", " ")
            .replace("\u2003", " ")
            .strip()
            if cap_m
            else ""
        )
        links = [
            (u, htmllib.unescape(t).strip())
            for u, t in re.findall(r'<a href="([^"]+)">(.*?)</a>', main, re.S)
        ]
        parts = [
            htmllib.unescape(re.sub(r"<[^>]+>", "", p))
            .replace("\xa0", " ")
            .replace("\u202f", " ")
            .strip()
            for p in re.split(r"<br\s*/?>", main)
        ]
        parts = [p for p in parts if p]
        ts_str = None
        for p in parts:
            m = TS_RE.search(p)
            if m:
                ts_str = m.group(1)
                break
        if not ts_str:
            continue
        dt_est_naive = datetime.strptime(" ".join(ts_str.split()[:-1]), "%b %d, %Y, %I:%M:%S %p")
        # Verified against embedded "Watched at HH:MM" UTC strings across summer and winter:
        # Takeout emits fixed UTC-5 ("EST") year-round without DST adjustment.
        dt_utc = dt_est_naive.replace(tzinfo=EST_FIXED).astimezone(timezone.utc)
        dt_ny = dt_utc.astimezone(NY)

        is_ad = "From Google Ads" in cap
        p0 = parts[0] if parts else ""
        verb = p0.split(" ", 1)[0] if p0 else ""
        title = links[0][1] if links else p0
        url = links[0][0] if links else ""
        vid = ""
        vm = re.search(r"(?:watch\?v=|shorts/|post/)([A-Za-z0-9_-]+)", url)
        if vm:
            vid = vm.group(1)
        ch = ""
        for u, t in links[1:]:
            if "/channel/" in u or "/@" in u or "/c/" in u:
                ch = t
                break
        removed = (
            "video that has been removed" in p0.lower()
            or title.startswith("https://www.youtube.com/watch")
        )
        rows.append(
            {
                "hdr": hdr,
                "verb": verb,
                "title": title,
                "url": url,
                "vid": vid,
                "ch": ch,
                "dt": dt_ny,
                "dt_raw_est": dt_est_naive,
                "utc": dt_utc,
                "is_ad": is_ad,
                "removed": removed,
                "parts": parts,
            }
        )
    return rows


# 8 clean, mutually exclusive topic buckets for organic YouTube + YouTube Music
TOPICS = [
    {"id": "variety", "name": "Chinese variety & food", "short": "ZH variety & food"},
    {"id": "mandopop", "name": "Mandopop & live stages", "short": "Mandopop"},
    {"id": "hiphop", "name": "Hip-hop, R&B & Western music", "short": "Hip-hop & R&B"},
    {"id": "nba", "name": "NBA & sports", "short": "NBA & sports"},
    {"id": "self", "name": "My own channel", "short": "My own channel"},
    {"id": "comedy", "name": "Late-night & comedy", "short": "Comedy & TV"},
    {"id": "tech", "name": "Tech, games, AI & finance", "short": "Tech & games"},
    {"id": "other", "name": "Shorts, vlogs & long tail", "short": "Other / long tail"},
]
TOPIC_IDX = {t["id"]: i for i, t in enumerate(TOPICS)}

MANDOPOP_CH = (
    "芒果tv音乐", "mangotv music", "jj lin", "林俊傑", "林俊杰", "jay chou", "周杰倫", "周杰伦",
    "david tao", "陶喆", "wang leehom", "王力宏", "eason chan", "陈奕迅", "陳奕迅", "g.e.m.",
    "hebe tien", "田馥甄", "beyond", "kris wu", "吴亦凡", "liu yu ning", "刘宇宁", "余佳运",
    "smg音乐", "浙江卫视音乐", "sing!china", "中国好声音", "我是歌手", "歌手", "王菲", "faye wong",
    "mike tsang", "harlem yu", "容祖儿", "毛不易", "薛之谦", "李荣浩", "李榮浩", "窦靖童", "那英",
    "王杰", "張學友", "张学友", "張信哲", "任賢齊", "单依纯", "周深", "华晨宇", "邓紫棋", "林宥嘉",
    "莫文蔚", "孫燕姿", "孙燕姿", "梁静茹", "五月天", "mayday", "告五人", "揽佬", "skai isyourgod",
    "披荆斩棘", "call me by fire", "乘风破浪", "声生不息", "天赐的声音", "梦想的声音",
)
VARIETY_CH = (
    "丹牛食", "元气八眉菌", "毛雪汪", "mao xue woof", "芒果tv慢生活", "芒果tv热播综艺",
    "湖南卫视", "hunantv", "蜜拉士愷", "胖虎yvette", "欧阳马丁", "乐视视频", "letv",
    "煮家男人", "bob's your uncle", "子文又饿了", "smg上海电视台", "老苑的美东生活",
    "山步五時", "一起看综艺", "心动的信号", "iqiyi", "爱奇艺", "腾讯视频", "wetv",
    "神祕園", "jian jian", "一只吐槽圆", "懶散日記", "lazy tv", "笑翻天综艺社",
    "综艺show", "coco&caca", "瑪茲一", "盗月社", "叭叭一下", "紫雨趣旅行", "金魚腦",
    "hola小测", "小小白到此一吃", "花儿与少年", "向往的生活", "奔跑吧", "极限挑战",
    "大侦探", "明星大侦探", "脱口秀", "喜剧大赛", "奇葩说", "王雷", "探店", "美食", "吃播",
    "顺德", "shunde", "大哥小助理",
)
HIPHOP_CH = (
    "the weeknd", "ice cube", "jay-z", "jaÿ-z", "notorious b.i.g", "kanye", "ye - topic",
    "sza", "2pac", "travis scott", "metro boomin", "drake", "frank ocean", "wu-tang",
    "kendrick lamar", "eminem", "fetty wap", "n.w.a", "swedish house mafia", "coldplay",
    "zcored", "wave mashup", "rap cloud", "musicreliqueoz", "sean kingston", "bruno mars",
    "aurora", "stella lefty", "masaaki kishibe", "vevo", " - topic", "records", "music",
    "dr. dre", "snoop dogg", "warren g", "nas -", "50 cent", "lil wayne", "future -",
    "playboi carti", "a$ap", "tyler, the creator", "post malone", "ed sheeran", "taylor swift",
    "michael jackson", "queen official", "hans zimmer", "liszt", "chopin", "beethoven",
    "howard stern", "tiny desk", "npr music", "colors",
)
NBA_CH = (
    "nba", "bleacher report", "chaz nba", "mind the game", "house of highlights", "espn",
    "d'vontay friga", "jaylen brown", "hoops", "ballislife", "gametime highlights",
    "basketball", "lakers", "warriors", "celtics", "lebron", "curry", "kobe", "jordan",
    "wade", "durant", "jokic", "luka", "wembanyama", "shaq", "inside the nba", "tnt",
    "nfl", "ufc", "mma", "mcgregor", "formula 1", "f1", "messi", "ronaldo", "fifa",
    "tennis", "djokovic", "federer", "golf", "crushers gc", "olympics", "sport", "athletic",
    "thinking basketball", "jxmyhighroller", "kenny for real", "secret base", "jj redick",
    "gil's arena", "club shay shay", "all the smoke", "shannon sharpe", "stephen a",
)
COMEDY_CH = (
    "team coco", "conan", "tbs", "trutv", "kitchen nightmares", "gordon ramsay",
    "jimmy kimmel", "jimmy fallon", "stephen colbert", "seth meyers", "daily show",
    "last week tonight", "john oliver", "saturday night live", "snl", "comedy central",
    "nathan fielder", "nathanfielder", "the office", "happy night live", "jon lajoie",
    "key & peele", "dave chappelle", "bill burr", "norm macdonald", "ricky gervais",
    "south park", "simpsons", "family guy", "seinfeld", "curb your enthusiasm",
    "impractical jokers", "hot ones", "first we feast", "mrbeast", "ishowspeed", "ray live",
    "kai cenat", "sidemen", "outdoor boys", "big hero 6", "disney", "pixar", "marvel",
    "movieclips", "netflix", "hbo", "a24",
)
TECH_CH = (
    "farecompare", "laurie garrow", "marques brownlee", "mkbhd", "极客湾", "geekerwan",
    "ai engineer", "claude", "anthropic", "openai", "google deepmind", "nvidia", "apple",
    "linus tech", "dave2d", "alex ziskind", "bridgemind", "stanford online", "mit ",
    "3blue1brown", "veritasium", "numberphile", "computerphile", "two minute papers",
    "fireship", "theo -", "primeagen", "andrej karpathy", "lex fridman", "dwarkesh",
    "bloomberg", "cnbc", "wall street journal", "financial times", "patrick boyle",
    "plain bagel", "ben felix", "quant", "options", "derivatives", "airline",
    "dream", "mkiceandfire", "gamevalue", "ign", "gamespot", "playstation", "xbox",
    "nintendo", "rockstar", "gta", "minecraft", "elden ring", "chess", "gothamchess",
    "hikaru", "agadmator", "柯洁", "go ", "rog ally", "legion go", "steam deck",
    "raspberry pi", "macbook", "local llm", "llm", "python", "rust", "linux",
)


def classify_watch(r: dict) -> str:
    ch = (r["ch"] or "").lower()
    t = (r["title"] or "").lower()
    comb = f"{ch} {t}"

    if r["ch"] == "Teo Zeng":
        return "self"
    if r["hdr"] == "YouTube Music":
        if has_han(r["title"]) or has_han(r["ch"]) or any(k in comb for k in MANDOPOP_CH):
            return "mandopop"
        return "hiphop"
    if any(k in comb for k in NBA_CH):
        return "nba"
    if any(k in comb for k in MANDOPOP_CH):
        return "mandopop"
    if any(k in comb for k in VARIETY_CH):
        return "variety"
    if any(k in comb for k in COMEDY_CH):
        return "comedy"
    if any(k in comb for k in TECH_CH):
        return "tech"
    if any(k in comb for k in HIPHOP_CH) or "official music video" in t or "official audio" in t or "lyrics" in t or "live performance" in t:
        if has_han(r["title"]) or has_han(r["ch"]):
            return "mandopop"
        return "hiphop"
    if has_han(r["title"]) or has_han(r["ch"]):
        if any(w in t for w in ("演唱", "歌曲", "纯享", "现场", "翻唱", "弹唱", "音乐", "mv", "live", "情歌")):
            return "mandopop"
        return "variety"
    return "other"


AD_CATS = [
    ("AI & dev tools", r"\b(cursor|gemini|google ai studio|grok|n8n|render|base44|claude|openai|chatgpt|copilot|vercel|supabase|replit|lovable|windsurf|figma|linear|notion|github|aws|cloud|datadog|snowflake|databricks|anthropic|perplexity|devin|manus|midjourney|elevenlabs|runway|heygen|canva|framer|webflow|airtable|zapier|postman|docker|sentry|cloudflare|mongodb|langchain|hugging|aikido|pentest|docdatabase|apps and infrastructure|ai agent|agentic|prompt to production|managed agents|vibecod|vibe cod|code|developer|api|llm|gpu|model)\b"),
    ("B2B SaaS & work", r"\b(loom|atlassian|slack|monday\.com|asana|jira|confluence|hubspot|salesforce|zendesk|intercom|miro|dropbox|docusign|zoom|grammarly|clickup|workday|servicenow|oracle|adobe|acrobat|shopify|wix|squarespace|mailchimp|klaviyo|semrush|rippling|gusto|okta|crowdstrike|cisco|ibm|dell|lenovo|intel|nvidia|amd|gotowebsite|gotawebsite|sigmaaldrich|b2b|team forward|revenue and morale|enterprise|workspace)\b"),
    ("Fintech & cards", r"\b(bilt|points on rent|amex|american express|platinum|chase|sapphire|capital one|marcus|robinhood|sofi|wealthfront|betterment|coinbase|stripe|brex|ramp|mercury|fidelity|schwab|vanguard|paypal|venmo|credit card|no ding|experian|bank|invest|mortgage|turbotax|intuit|quickbooks|wise|revolut|chime|affirm|klarna|discover|citi|wells fargo|bofa|hsbc|trading|broker|savings|apr|fhr|subscription cancellation)\b"),
    ("Travel & auto", r"\b(ihg|marriott|hilton|hyatt|airbnb|expedia|booking\.com|kayak|delta|united|american airlines|jetblue|southwest|emirates|qatar|uber|lyft|waymo|hertz|enterprise|avis|turo|hotel|resort|flight|airline|travel|cruise|virgin|getyourguide|get in and get away|carmax|toyota|honda|cr-v|ridgeline|passport|ford|bmw|mercedes|lexus|tesla|rivian|porsche|subaru|hyundai|kia|chevy|jeep|volvo|nissan|mazda|audi|acura|van member pricing)\b"),
    ("Health, beauty & insurance", r"\b(liberty mutual|limu|geico|progressive|state farm|allstate|lemonade|insurance|naturalcycles|natural cycles|kerastase|l'oreal|loreal|cerave|neutrogena|dove|olay|estee|clinique|sephora|gloss absolu|effaclar|colgate|lip gloss|haircare|hims|hers|betterhelp|ozempic|wegovy|zepbound|sleepcentric|eight sleep|ojai|calm|headspace|peloton|equinox|ag1|liquid i\.v|ritual|therabody|fsarender|functionprecision|health|skin|hair|sleep|dental|dermatologist)\b"),
    ("Food, retail & apparel", r"\b(heinz|ketchup|kool-aid|harmless harvest|dunkin|starbucks|mcdonald|chipotle|domino|pizza|uber eats|doordash|instacart|pepsi|coca-cola|red bull|heineken|budweiser|nike|adidas|under armour|velociti|sneaker|tshirt|lululemon|uniqlo|zara|amazon|target|walmart|costco|ikea|wayfair|best buy|home depot|dining options|chewy|etsy|allbirds|hoka|new balance|brooks|claw)\b"),
    ("Media, films & games", r"\b(bleecker street|a24|netflix|hulu|disney|max|hbo|apple tv|paramount|peacock|prime video|spotify|audible|nytimes|wsj|economist|bloomberg|masterclass|coursera|udemy|duolingo|playstation|xbox|nintendo|steam|epic games|ea sports|2k|gta|call of duty|fortnite|genshin|honkai|valorant|league of legends|clash|now playing|in theaters|cutdown|trailer|wwe|espn|nba|nfl|sport|waterland|blizzard beach|movie|cinema)\b"),
    ("Telecom & hardware", r"\b(t-mobile|verizon|fios|mint mobile|at&t|xfinity|comcast|spectrum|visible|apple|iphone|macbook|samsung|galaxy|pixel|bose|sony|asus|rog|garmin|whoop|oura|dyson|sonos|lg|tcl|hisense|starlink|wireless|phone race|5g|fiber|internet)\b"),
    ("Opaque / agency-coded", r".*"),
]


def classify_ad(title: str) -> str:
    tl = title.lower()
    for name, pat in AD_CATS:
        if re.search(pat, tl):
            return name
    return "Opaque / agency-coded"


BRAND_DEFS = [
    ("Google AI / Gemini", "tech", r"\b(google ai studio|gemini api|google cloud|gemini)\b", False),
    ("Cursor", "tech", r"\bcursor\b", True),
    ("Loom / Atlassian", "tech", r"\b(loom|atlassian)\b", True),
    ("Bilt", "fintech", r"\b(bilt|points on rent)\b", True),
    ("Liberty Mutual", "consumer", r"\b(liberty mutual|limu emu)\b", False),
    ("Grok Bot", "tech", r"\bgrok bot\b", False),
    ("YouTube Homepage", "other", r"viewed ads on youtube homepage", False),
    ("T-Mobile", "consumer", r"\bt-mobile\b", False),
    ("Mint Mobile", "consumer", r"\bmint mobile\b", False),
    ("IHG Hotels", "consumer", r"\bihg\b", False),
    ("Kérastase", "consumer", r"\bkerastase\b", False),
    ("Disney", "consumer", r"\bdisney\b", False),
    ("American Express", "fintech", r"\b(american express|amex|travel fhr)\b", False),
    ("n8n", "tech", r"\bn8n\b", False),
    ("Slack", "tech", r"\bslack\b", False),
    ("Aikido Security", "tech", r"\baikido\b", False),
    ("Colgate", "consumer", r"\bcolgate\b", False),
    ("Base44", "tech", r"\bbase44\b", False),
    ("Render", "tech", r"\brender\b", False),
    ("Natural Cycles", "consumer", r"\bnaturalcycles\b", False),
    ("Waymo", "tech", r"\bwaymo\b", False),
]


def match_ad_brand(title: str) -> tuple[str, str, bool] | None:
    tl = title.lower()
    for brand, grp, pat, clicked in BRAND_DEFS:
        if re.search(pat, tl):
            return brand, grp, clicked
    return None


# Metro grouping for privacy: exact home suburbs never appear; grouped cleanly by metro.
METRO_MAP = {
    "US,Massachusetts,Medford": ("Greater Boston, MA", 42.360, -71.059, True),
    "US,Massachusetts,Boston": ("Greater Boston, MA", 42.360, -71.059, True),
    "US,Massachusetts": ("Greater Boston, MA", 42.360, -71.059, True),
    "US,Massachusetts,Malden": ("Greater Boston, MA", 42.360, -71.059, True),
    "US,Massachusetts,Somerville": ("Greater Boston, MA", 42.360, -71.059, True),
    "US,Massachusetts,Cambridge": ("Greater Boston, MA", 42.360, -71.059, True),
    "US,Massachusetts,Melrose": ("Greater Boston, MA", 42.360, -71.059, True),
    "US,Massachusetts,Plymouth": ("Greater Boston, MA", 42.360, -71.059, True),
    "US,Massachusetts,Watertown": ("Greater Boston, MA", 42.360, -71.059, True),
    "US,California,Los Angeles": ("Los Angeles, CA", 34.052, -118.244, False),
    "US,California,Inglewood": ("Los Angeles, CA", 34.052, -118.244, False),
    "US,California,San Francisco": ("SF Bay Area, CA", 37.775, -122.419, False),
    "US,California,San Jose": ("SF Bay Area, CA", 37.775, -122.419, False),
    "US,California,Mountain View": ("SF Bay Area, CA", 37.775, -122.419, False),
    "US,California,South Lake Tahoe": ("Lake Tahoe, CA/NV", 38.940, -119.977, False),
    "US,Nevada,Zephyr Cove": ("Lake Tahoe, CA/NV", 38.940, -119.977, False),
    "US,Nevada,Sparks": ("Lake Tahoe, CA/NV", 38.940, -119.977, False),
    "US,California,San Diego": ("San Diego, CA", 32.716, -117.161, False),
    "US,New York,New York": ("New York City, NY", 40.713, -74.006, False),
    "US,New Jersey": ("New York City, NY", 40.713, -74.006, False),
    "CA,Ontario,Richmond Hill": ("Greater Toronto, ON", 43.653, -79.383, False),
    "CA,Ontario,Mississauga": ("Greater Toronto, ON", 43.653, -79.383, False),
    "CA,Ontario,Markham": ("Greater Toronto, ON", 43.653, -79.383, False),
    "US,Minnesota,Minneapolis": ("Minneapolis, MN", 44.978, -93.265, False),
    "US,Minnesota": ("Minneapolis, MN", 44.978, -93.265, False),
    "US,Texas,Austin": ("Austin, TX", 30.267, -97.743, False),
    "US,Texas,Dallas": ("Dallas–Fort Worth, TX", 32.777, -96.797, False),
    "US,Texas,Houston": ("Houston, TX", 29.760, -95.370, False),
    "US,Texas": ("Texas (unspecified)", 31.0, -98.5, False),
    "US,Maine,Portland": ("Portland, ME", 43.659, -70.257, False),
    "US,New Hampshire,Bethlehem": ("White Mountains, NH", 44.280, -71.689, False),
    "US,New Hampshire": ("White Mountains, NH", 44.280, -71.689, False),
    "US,South Dakota,Keystone": ("Black Hills, SD/WY/NE", 43.896, -103.418, False),
    "US,Wyoming,Gillette": ("Black Hills, SD/WY/NE", 43.896, -103.418, False),
    "US,Nebraska,Gering": ("Black Hills, SD/WY/NE", 43.896, -103.418, False),
    "US,Colorado,Denver": ("Denver, CO", 39.739, -104.990, False),
    "US,Hawaii,Honolulu": ("Honolulu, HI", 21.307, -157.858, False),
    "US,Pennsylvania,Pittsburgh": ("Pittsburgh, PA", 40.441, -79.996, False),
    "US,Pennsylvania,Philadelphia": ("Philadelphia, PA", 39.953, -75.165, False),
    "US,Maryland,Washington": ("Washington, DC area", 38.907, -77.037, False),
    "US,Virginia,Washington": ("Washington, DC area", 38.907, -77.037, False),
    "US,Washington,Seattle": ("Seattle, WA", 47.606, -122.332, False),
    "US,Arkansas": ("Arkansas (carrier IP)", 34.746, -92.290, False),
    "US,Georgia,Atlanta": ("Atlanta, GA (hub)", 33.749, -84.388, False),
    "US,Georgia,College Park": ("Atlanta, GA (hub)", 33.749, -84.388, False),
    "US,Wisconsin,Chicago": ("Chicago / Milwaukee", 41.878, -87.630, False),
    "US,Wisconsin,Milwaukee": ("Chicago / Milwaukee", 41.878, -87.630, False),
    "US,Michigan,Detroit": ("Detroit, MI", 42.331, -83.046, False),
    "US,Tennessee,Nashville": ("Nashville, TN", 36.163, -86.782, False),
    "US,Iowa,Omaha": ("Omaha, NE/IA", 41.257, -95.935, False),
    "CN,Guangdong Province,Shenzhen": ("Guangdong, CN (Linux remote)", 22.543, 114.058, False),
    "CN,Guangdong Province,Guangzhou": ("Guangdong, CN (Linux remote)", 22.543, 114.058, False),
}


def ua_login_app(ua: str) -> str:
    if not ua:
        return "Web / blank UA"
    if "com.google.Maps" in ua:
        return "Google Maps (iOS)"
    if "com.google.ios.youtube" in ua:
        return "YouTube (iOS)"
    if "CriOS" in ua:
        return "Chrome (iOS)"
    if "Chrome/" in ua and "Macintosh" in ua:
        return "Chrome (Mac)"
    if "Chrome/" in ua and "Linux" in ua:
        return "Chrome (Linux)"
    if "Safari/" in ua and "Macintosh" in ua:
        return "Safari (Mac)"
    if "Safari/" in ua and "iPhone" in ua:
        return "Safari (iOS)"
    if "iPhone" in ua:
        return "Other iOS webview"
    if "com.google.gemini" in ua or "GoogleMobile" in ua:
        return "Gemini / Google App (iOS)"
    return "Other"


def ua_access_fam(ua: str) -> str:
    if not ua:
        return "blank"
    if "LINUX_OS" in ua:
        return "linux"
    if "MAC_OS" in ua:
        return "mac"
    if "TV." in ua:
        return "tv"
    if "IOS_OS" in ua:
        return "ios"
    return "other"


def build(src: Path) -> dict:
    yt_dir = src / "YouTube and YouTube Music" / "history"
    watch = parse_yt_html(yt_dir / "watch-history.html")
    search = parse_yt_html(yt_dir / "search-history.html")

    w_ads = [r for r in watch if r["is_ad"]]
    w_org = [r for r in watch if not r["is_ad"]]
    org_w = sorted([r for r in w_org if r["verb"] == "Watched"], key=lambda r: r["dt"])
    org_yt = [r for r in org_w if r["hdr"] == "YouTube"]
    org_ytm = [r for r in org_w if r["hdr"] == "YouTube Music"]
    w_viewed = [r for r in w_org if r["verb"] == "Viewed"]
    w_surveys = [r for r in w_org if r["verb"] == "Answered"]

    s_ads = [r for r in search if r["is_ad"]]
    s_org = [r for r in search if not r["is_ad"]]
    org_s = sorted([r for r in s_org if r["verb"] == "Searched"], key=lambda r: r["dt"])
    ask_music = [r for r in s_org if r["verb"] == "Prompted"]

    w_ad_keys = Counter((r["utc"], r["title"]) for r in w_ads)
    s_ad_keys = Counter((r["utc"], r["title"]) for r in s_ads)
    ad_overlap = sum((w_ad_keys & s_ad_keys).values())

    clicked_ads = []
    brand_from_url = [
        ("Bilt Card", "bilt.com"),
        ("Atlassian Loom", "atlassian.com/software/loom"),
        ("Cursor", "cursor.com"),
        ("Udemy (AWS)", "udemy.com"),
        ("TeamWater", "teamwater.org"),
        ("DoubleClick display ad", "ad.doubleclick.net"),
    ]
    for r in sorted([x for x in watch if x["verb"] == "Visited" and x["is_ad"]], key=lambda x: x["dt"]):
        label = "Sponsor link"
        for bname, needle in brand_from_url:
            if needle in r["url"].lower():
                label = bname
                break
        clicked_ads.append({"date": r["dt"].strftime("%Y-%m-%d"), "brand": label})

    for r in org_w:
        r["topic"] = classify_watch(r)
        r["script"] = script_of(r["title"], r["ch"])

    # Monthly series (18 months: 2025-06 .. 2026-11)
    all_months = sorted({r["dt"].strftime("%Y-%m") for r in watch + search})
    m_bucket = {
        m: {
            "m": m,
            "yt": 0,
            "ytm": 0,
            "wAds": 0,
            "sAds": 0,
            "searches": 0,
            "en": 0,
            "zh": 0,
            "jp": 0,
            "ko": 0,
            "teo": 0,
            "zhExTeo": 0,
            "ytExTeo": 0,
            "topics": [0] * len(TOPICS),
        }
        for m in all_months
    }
    for r in org_w:
        mb = m_bucket[r["dt"].strftime("%Y-%m")]
        if r["hdr"] == "YouTube":
            mb["yt"] += 1
            mb[r["script"]] += 1
            if r["ch"] == "Teo Zeng":
                mb["teo"] += 1
            else:
                mb["ytExTeo"] += 1
                if r["script"] == "zh":
                    mb["zhExTeo"] += 1
        else:
            mb["ytm"] += 1
        mb["topics"][TOPIC_IDX[r["topic"]]] += 1
    for r in w_ads:
        m_bucket[r["dt"].strftime("%Y-%m")]["wAds"] += 1
    for r in s_ads:
        m_bucket[r["dt"].strftime("%Y-%m")]["sAds"] += 1
    for r in org_s:
        m_bucket[r["dt"].strftime("%Y-%m")]["searches"] += 1

    months_list = []
    for m in all_months:
        mb = m_bucket[m]
        org_tot = mb["yt"] + mb["ytm"]
        mb["adRatio"] = round(mb["wAds"] / mb["yt"], 2) if mb["yt"] else 0.0
        mb["adShare"] = round(mb["wAds"] / (mb["wAds"] + org_tot), 4) if (mb["wAds"] + org_tot) else 0.0
        mb["zhShare"] = round(mb["zh"] / mb["yt"], 4) if mb["yt"] else 0.0
        months_list.append(mb)

    # October–November switch (daily Oct 1 – Nov 23, 2026)
    oct_days = []
    d0 = date(2026, 10, 1)
    d1 = date(2026, 11, 23)
    by_day_yt = Counter(r["dt"].strftime("%Y-%m-%d") for r in org_yt)
    by_day_ytm = Counter(r["dt"].strftime("%Y-%m-%d") for r in org_ytm)
    by_day_ads = Counter(r["dt"].strftime("%Y-%m-%d") for r in w_ads)
    by_day_sq = Counter(r["dt"].strftime("%Y-%m-%d") for r in org_s)
    cur_d = d0
    while cur_d <= d1:
        ds = cur_d.isoformat()
        oct_days.append({"d": ds, "yt": by_day_yt[ds], "ytm": by_day_ytm[ds], "ads": by_day_ads[ds], "sq": by_day_sq[ds]})
        cur_d += timedelta(days=1)

    # Exact Oct 23 evening lapse & 39-second final ad burst for interactive replay
    w_ads_sorted = sorted(w_ads, key=lambda r: r["utc"])
    oct23_ads = [r for r in w_ads_sorted if r["dt"].strftime("%Y-%m-%d") == "2026-10-23"]
    oct_burst = []
    t_burst0 = datetime(2026, 10, 23, 23, 48, 0, tzinfo=NY)
    for r in oct23_ads:
        if r["dt"] >= t_burst0:
            sec = int((r["dt"] - t_burst0).total_seconds())
            short_t = r["title"].split("|")[0].strip()[:44]
            oct_burst.append({"sec": sec, "time": r["dt"].strftime("%H:%M:%S"), "title": short_t})

    # Ad profile + brand bubble constellation (top 18 named brands)
    ad_cat_ctr = Counter(classify_ad(r["title"]) for r in w_ads)
    brand_counts = Counter()
    brand_meta = {}
    brand_sample = {}
    for r in w_ads:
        m = match_ad_brand(r["title"])
        if m:
            bname, grp, clicked = m
            brand_counts[bname] += 1
            brand_meta[bname] = (grp, clicked)
            brand_sample.setdefault(bname, Counter())[r["title"][:60]] += 1
    top_brands = []
    for bname, n in brand_counts.most_common(18):
        grp, clicked = brand_meta[bname]
        top_c = brand_sample[bname].most_common(1)[0][0]
        top_brands.append({"brand": bname, "n": n, "grp": grp, "clicked": clicked, "sample": top_c})

    ad_gaps = [(w_ads_sorted[i]["utc"] - w_ads_sorted[i - 1]["utc"]).total_seconds() for i in range(1, len(w_ads_sorted))]

    # Pre vs Post Oct 19 organic pace
    cut_dt = datetime(2026, 10, 19, 0, 0, tzinfo=NY)
    pre_org = [r for r in org_w if r["dt"] < cut_dt]
    post_org = [r for r in org_w if r["dt"] >= cut_dt]
    pre_days = (cut_dt.date() - org_w[0]["dt"].date()).days
    post_days = (org_w[-1]["dt"].date() - cut_dt.date()).days + 1
    post_yt_ex_teo = sum(1 for r in post_org if r["hdr"] == "YouTube" and r["ch"] != "Teo Zeng")

    # Topic details & channels
    topic_counts = Counter(r["topic"] for r in org_w)
    topic_ch = defaultdict(Counter)
    topic_zh = Counter()
    topic_ytm = Counter()
    for r in org_w:
        if r["ch"]:
            topic_ch[r["topic"]][r["ch"]] += 1
        if r["script"] == "zh":
            topic_zh[r["topic"]] += 1
        if r["hdr"] == "YouTube Music":
            topic_ytm[r["topic"]] += 1

    ch_all = Counter(r["ch"] for r in org_yt if r["ch"])
    top_channels = [
        {"name": ch, "n": n, "topic": classify_watch({"ch": ch, "title": "", "hdr": "YouTube"})}
        for ch, n in ch_all.most_common(22)
    ]
    ytm_songs = Counter((r["ch"].replace(" - Topic", "").strip(), r["title"]) for r in org_ytm)
    ytm_artists = Counter(r["ch"].replace(" - Topic", "").strip() for r in org_ytm if r["ch"])

    topics_out = []
    for t in TOPICS:
        tid = t["id"]
        n = topic_counts[tid]
        topics_out.append(
            {
                "id": tid,
                "name": t["name"],
                "short": t["short"],
                "n": n,
                "share": round(n / len(org_w), 4),
                "zhShare": round(topic_zh[tid] / max(1, n), 3),
                "ytmShare": round(topic_ytm[tid] / max(1, n), 3),
                "topChannels": [[ch, c] for ch, c in topic_ch[tid].most_common(4)],
            }
        )

    # 531-day Circadian Starfield: flat [dayIdx, minuteOfDay] arrays for canvas rendering!
    # Plus day summary map for hover tooltips.
    base_day = org_w[0]["dt"].date()  # 2025-06-11 NY
    last_day = org_w[-1]["dt"].date()  # 2026-11-23 NY
    span_days = (last_day - base_day).days + 1

    sf_yt, sf_yt_raw, sf_ytm, sf_ads = [], [], [], []
    for r in org_yt:
        sf_yt.extend([(r["dt"].date() - base_day).days, r["dt"].hour * 60 + r["dt"].minute])
        sf_yt_raw.extend([(r["dt_raw_est"].date() - base_day).days, r["dt_raw_est"].hour * 60 + r["dt_raw_est"].minute])
    for r in org_ytm:
        sf_ytm.extend([(r["dt"].date() - base_day).days, r["dt"].hour * 60 + r["dt"].minute])
    for r in w_ads_sorted:
        d_idx = (r["dt"].date() - base_day).days
        if 0 <= d_idx < span_days:
            sf_ads.extend([d_idx, r["dt"].hour * 60 + r["dt"].minute])

    active_dates = sorted({r["dt"].strftime("%Y-%m-%d") for r in org_w})
    ds_objs = [date.fromisoformat(d) for d in active_dates]
    best_s = cur_s_len = 1
    bs = be = cs = ds_objs[0]
    for a, b in zip(ds_objs, ds_objs[1:]):
        if (b - a).days == 1:
            cur_s_len += 1
        else:
            cur_s_len = 1
            cs = b
        if cur_s_len > best_s:
            best_s, bs, be = cur_s_len, cs, b

    day_totals = {}
    for ds in active_dates:
        day_totals[ds] = [by_day_yt[ds], by_day_ytm[ds], by_day_ads[ds], by_day_sq[ds]]

    # Sessions & pacing
    sessions_tmp = []
    cur_s = [org_w[0]]
    for r in org_w[1:]:
        if (r["utc"] - cur_s[-1]["utc"]).total_seconds() <= 1800:
            cur_s.append(r)
        else:
            sessions_tmp.append(cur_s)
            cur_s = [r]
    sessions_tmp.append(cur_s)

    # Fine 18-bin log-time histogram (from 2s to 1800s) for silky smooth format-fingerprint density curves!
    fine_edges = [5, 10, 15, 22, 30, 45, 60, 90, 120, 150, 180, 225, 270, 330, 450, 600, 900, 1350, 1800]
    fine_yt = [0] * (len(fine_edges) - 1)
    fine_ytm = [0] * (len(fine_edges) - 1)
    yt_gaps_all, ytm_gaps_all = [], []
    for s in sessions_tmp:
        for i in range(1, len(s)):
            g = max(5.0, (s[i]["utc"] - s[i - 1]["utc"]).total_seconds())
            if g > 1800:
                continue
            raw_g = (s[i]["utc"] - s[i - 1]["utc"]).total_seconds()
            if s[i]["hdr"] == "YouTube Music":
                ytm_gaps_all.append(raw_g)
                arr = fine_ytm
            else:
                yt_gaps_all.append(raw_g)
                arr = fine_yt
            for bi in range(len(fine_edges) - 1):
                if (bi == 0 and g <= fine_edges[1]) or (fine_edges[bi] < g <= fine_edges[bi + 1]):
                    arr[bi] += 1
                    break
    yt_gaps_all.sort()
    ytm_gaps_all.sort()

    sq_utcs = [r["utc"] for r in org_s]
    sess_search_lens, sess_feed_lens = [], []
    near_search_10m = 0
    for r in org_w:
        idx = bisect.bisect_right(sq_utcs, r["utc"])
        if idx > 0 and (r["utc"] - sq_utcs[idx - 1]).total_seconds() <= 600:
            near_search_10m += 1

    sess_records = []
    for s in sessions_tmp:
        t0 = s[0]["utc"] - timedelta(minutes=5)
        t1 = s[-1]["utc"]
        idx = bisect.bisect_left(sq_utcs, t0)
        qs = []
        while idx < len(sq_utcs) and sq_utcs[idx] <= t1:
            qs.append({"t": round((org_s[idx]["utc"] - s[0]["utc"]).total_seconds() / 60, 1), "q": org_s[idx]["title"]})
            idx += 1
        if qs:
            sess_search_lens.append(len(s))
        else:
            sess_feed_lens.append(len(s))
        sess_records.append((s, qs))

    survival = []
    for k in range(1, 16):
        s_sr = sum(1 for x in sess_search_lens if x >= k) / len(sess_search_lens)
        s_fd = sum(1 for x in sess_feed_lens if x >= k) / len(sess_feed_lens)
        s_all = sum(1 for x in (sess_search_lens + sess_feed_lens) if x >= k) / len(sessions_tmp)
        survival.append({"k": k, "search": round(s_sr, 4), "feed": round(s_fd, 4), "all": round(s_all, 4)})

    target_starts = [
        ("2026-11-12 23:01", "Midnight cross-topic drift", "NBA → Nathan Fielder → PS6/GTA 6 → The Weeknd"),
        ("2025-09-08 21:28", "42-video basketball binge", "2 searches · 42 NBA clips in 37m"),
        ("2026-02-27 14:49", "48 Japanese Shorts in 2 minutes", "mimi kiddy Shorts burst · 2.5s median gap"),
        ("2026-11-13 13:56", "Auditing my own uploads", "30 plays of my own channel in 9m"),
        ("2026-11-09 18:31", "130-minute evening marathon", "The Weeknd → Nathan Fielder → MangoTV"),
        ("2026-11-15 15:50", "Mandopop afternoon soundtrack", "34 YouTube Music tracks in 87m"),
    ]
    xrays = []
    for stamp_prefix, label, subtitle in target_starts:
        found = None
        for s, qs in sess_records:
            if s[0]["dt"].strftime("%Y-%m-%d %H:%M") == stamp_prefix:
                found = (s, qs)
                break
        if not found:
            raise RuntimeError(f"Could not find curated session {stamp_prefix}")
        s, qs = found
        dur_min = round((s[-1]["utc"] - s[0]["utc"]).total_seconds() / 60, 1)
        items_compact = []
        for r in s:
            t_min = round((r["utc"] - s[0]["utc"]).total_seconds() / 60, 2)
            items_compact.append(
                {
                    "t": t_min,
                    "ch": (r["ch"] or "Removed")[:28],
                    "title": r["title"][:58],
                    "topic": r["topic"],
                    "ytm": 1 if r["hdr"] == "YouTube Music" else 0,
                }
            )
        xrays.append(
            {
                "label": label,
                "sub": subtitle,
                "date": s[0]["dt"].strftime("%Y-%m-%d"),
                "start": s[0]["dt"].strftime("%H:%M"),
                "durMin": dur_min,
                "n": len(s),
                "queries": qs[:6],
                "items": items_compact,
            }
        )

    sq_counts = Counter(r["title"].strip().lower() for r in org_s if r["title"].strip())
    top_queries = [{"q": q, "n": n} for q, n in sq_counts.most_common(12)]

    # ---------- SUBSCRIBER INFO & TIMELINE SETTINGS ----------
    tl_settings = json.loads((src / "Timeline" / "Settings.json").read_text())
    sub_txt = (src / "Google Account" / "zengwc.teo2016@outlook.com.SubscriberInfo.html").read_text(
        errors="replace"
    )
    tables = re.findall(r"<table>(.*?)</table>", sub_txt, re.S)
    trs = re.findall(r"<tr>(.*?)</tr>", tables[1], re.S)
    logins = []
    for tr in trs[1:]:
        cells = [
            htmllib.unescape(re.sub(r"<[^>]+>", "", c)).strip()
            for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S)
        ]
        if len(cells) >= 7:
            dt_utc = datetime.strptime(cells[0], "%Y-%m-%d %H:%M:%S Z").replace(tzinfo=timezone.utc)
            dt_ny = dt_utc.astimezone(NY)
            geo = cells[5]
            metro_info = METRO_MAP.get(geo)
            metro = metro_info[0] if metro_info else ("United States (coarse)" if geo == "US" else "Other")
            lat = metro_info[1] if metro_info else None
            lon = metro_info[2] if metro_info else None
            is_home = metro_info[3] if metro_info else False
            app = ua_login_app(cells[6])
            logins.append(
                {
                    "dt": dt_ny,
                    "utc": dt_utc,
                    "inter": cells[3] == "true",
                    "metro": metro,
                    "lat": lat,
                    "lon": lon,
                    "is_home": is_home,
                    "app": app,
                    "raw_geo": geo,
                }
            )
    logins.sort(key=lambda x: x["utc"])

    hub_agg = {}
    for x in logins:
        if x["lat"] is None:
            continue
        m = x["metro"]
        if m not in hub_agg:
            hub_agg[m] = {
                "name": m,
                "lat": x["lat"],
                "lon": x["lon"],
                "home": x["is_home"],
                "remote": "Linux remote" in m,
                "carrier": "carrier IP" in m,
                "n": 0,
                "bg": 0,
                "inter": 0,
                "days": set(),
                "first": x["dt"].strftime("%Y-%m-%d"),
                "last": x["dt"].strftime("%Y-%m-%d"),
                "apps": Counter(),
            }
        h = hub_agg[m]
        h["n"] += 1
        if x["inter"]:
            h["inter"] += 1
        else:
            h["bg"] += 1
        d_str = x["dt"].strftime("%Y-%m-%d")
        h["days"].add(d_str)
        h["last"] = d_str
        h["apps"][x["app"]] += 1

    hubs_out = []
    for h in sorted(hub_agg.values(), key=lambda z: -z["n"]):
        hubs_out.append(
            {
                "name": h["name"],
                "lat": h["lat"],
                "lon": h["lon"],
                "home": h["home"],
                "remote": h["remote"],
                "carrier": h["carrier"],
                "n": h["n"],
                "bg": h["bg"],
                "inter": h["inter"],
                "days": len(h["days"]),
                "first": h["first"],
                "last": h["last"],
                "topApp": h["apps"].most_common(1)[0][0],
            }
        )

    away = [x for x in logins if not x["is_home"] and x["lat"] is not None]
    by_metro_spans = defaultdict(list)
    for x in away:
        m = x["metro"]
        lst = by_metro_spans[m]
        if lst and (x["utc"] - lst[-1]["end_u"]).total_seconds() <= 3 * 86400:
            sp = lst[-1]
            sp["end_u"] = x["utc"]
            sp["end"] = x["dt"].strftime("%Y-%m-%d")
            sp["n"] += 1
            sp["bg"] += 0 if x["inter"] else 1
            sp["apps"][x["app"]] += 1
        else:
            lst.append(
                {
                    "metro": m,
                    "start": x["dt"].strftime("%Y-%m-%d"),
                    "end": x["dt"].strftime("%Y-%m-%d"),
                    "start_u": x["utc"],
                    "end_u": x["utc"],
                    "n": 1,
                    "bg": 0 if x["inter"] else 1,
                    "remote": "Linux remote" in m,
                    "carrier": "carrier IP" in m,
                    "apps": Counter({x["app"]: 1}),
                }
            )
    merged_spans = sorted((sp for lst in by_metro_spans.values() for sp in lst), key=lambda sp: sp["start_u"])
    trips_out = []
    for sp in merged_spans:
        if sp["carrier"]:
            continue
        if sp["n"] >= 4 or sp["remote"] or sp["metro"] in ("Denver, CO", "Black Hills, SD/WY/NE"):
            trips_out.append(
                {
                    "metro": sp["metro"],
                    "start": sp["start"],
                    "end": sp["end"],
                    "n": sp["n"],
                    "bg": sp["bg"],
                    "remote": sp["remote"],
                    "topApp": sp["apps"].most_common(1)[0][0],
                }
            )

    app_bg = Counter()
    app_in = Counter()
    for x in logins:
        if x["inter"]:
            app_in[x["app"]] += 1
        else:
            app_bg[x["app"]] += 1
    apps_out = []
    for app, tot in Counter({k: app_bg[k] + app_in[k] for k in set(app_bg) | set(app_in)}).most_common():
        apps_out.append({"app": app, "total": tot, "bg": app_bg[app], "inter": app_in[app]})

    # ---------- ACCESS LOG ACTIVITY (212,345 rows, 28 days, 672-hour grid!) ----------
    act_path = (
        src
        / "Access Log Activity"
        / "Activities - A list of Google services accessed by your devices (for example every time your phone synchronizes with your Gmail).csv"
    )
    act_daily = defaultdict(lambda: Counter())
    act_grid = defaultdict(lambda: [[0, 0, 0, 0, 0] for _ in range(24)])  # [tot, blank, linux, mac, iosTv]
    act_hr_prod = defaultdict(lambda: [0] * 24)
    act_hr_fam = defaultdict(lambda: [0] * 24)
    act_wd_human = [[0] * 24 for _ in range(7)]
    act_prods = Counter()
    act_subprods = Counter()
    act_fams = Counter()
    act_sec = Counter()
    act_ips = set()
    act_total = 0

    with act_path.open() as f:
        for row in csv.DictReader(f):
            act_total += 1
            ts = row["Activity Timestamp"]
            dt_utc = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S UTC").replace(tzinfo=timezone.utc)
            dt_ny = dt_utc.astimezone(NY)
            d_ny = dt_ny.strftime("%Y-%m-%d")
            hr = dt_ny.hour
            wd = dt_ny.weekday()
            prod = row["Product Name"] or "Other"
            subp = row["Sub-Product Name"] or "Other"
            ua = row["User Agent String"]
            fam = ua_access_fam(ua)

            act_ips.add(row["IP Address"])
            act_prods[prod] += 1
            act_subprods[subp] += 1
            act_fams[fam] += 1
            act_daily[d_ny][fam] += 1
            act_daily[d_ny]["total"] += 1
            cell = act_grid[d_ny][hr]
            cell[0] += 1
            if fam == "blank":
                cell[1] += 1
            elif fam == "linux":
                cell[2] += 1
            elif fam == "mac":
                cell[3] += 1
            else:
                cell[4] += 1
            act_hr_prod[prod][hr] += 1
            act_hr_fam[fam][hr] += 1
            if prod in ("YouTube", "Chrome Sync", "Maps", "Search"):
                act_wd_human[wd][hr] += 1
            act_sec[ts] += 1

    sec64 = {ts for ts, c in act_sec.items() if c == 64}
    burst_bins = [
        ("1", 1, 1), ("2", 2, 2), ("3–4", 3, 4), ("5–8", 5, 8),
        ("9–16", 9, 16), ("17–32", 17, 32), ("33–63", 33, 63), ("64 (cap)", 64, 64),
    ]
    burst_hist = [{"label": lbl, "secs": sum(1 for v in act_sec.values() if lo <= v <= hi), "lo": lo, "hi": hi} for lbl, lo, hi in burst_bins]

    act_days_sorted = sorted(act_daily.keys())
    act_daily_list = []
    grid_rows = []
    for d_ny in act_days_sorted:
        c = act_daily[d_ny]
        act_daily_list.append({"d": d_ny, "total": c["total"], "blank": c["blank"], "linux": c["linux"], "mac": c["mac"], "ios": c["ios"], "tv": c["tv"], "other": c["other"]})
        grid_rows.append(act_grid[d_ny])

    human_access_hr = [
        act_hr_prod["YouTube"][h] + act_hr_prod["Chrome Sync"][h] + act_hr_prod["Maps"][h] + act_hr_prod["Search"][h]
        for h in range(24)
    ]
    machine_access_hr = [act_hr_fam["blank"][h] + act_hr_fam["linux"][h] for h in range(24)]

    # ---------- GOOGLE-ONLY 24-HOUR CLOCKS & WEEKDAY×HOUR MATRICES ----------
    clock_yt, clock_yt_raw_est, clock_ytm, clock_sq, clock_ads = [0]*24, [0]*24, [0]*24, [0]*24, [0]*24
    wd_yt = [[0]*24 for _ in range(7)]
    wd_ytm = [[0]*24 for _ in range(7)]
    for r in org_yt:
        clock_yt[r["dt"].hour] += 1
        clock_yt_raw_est[r["dt_raw_est"].hour] += 1
        wd_yt[r["dt"].weekday()][r["dt"].hour] += 1
    for r in org_ytm:
        clock_ytm[r["dt"].hour] += 1
        wd_ytm[r["dt"].weekday()][r["dt"].hour] += 1
    for r in org_s:
        clock_sq[r["dt"].hour] += 1
    for r in w_ads:
        clock_ads[r["dt"].hour] += 1

    # ---------- ACCOUNT CHANGE HISTORY & DEVICES ----------
    ch_txt = (src / "Google Account" / "zengwc.teo2016@outlook.com.ChangeHistory.html").read_text(errors="replace")
    ch_rows = re.findall(r"<tr>(.*?)</tr>", ch_txt, re.S)[1:]
    services_events = []
    for tr in ch_rows:
        cells = [htmllib.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", tr, re.S)]
        if len(cells) >= 5:
            ts_z = cells[0]
            action = "added" if cells[2] == "SERVICE_ADDED" else "removed"
            svc = cells[4] if action == "added" else cells[3]
            if svc == "Is Ams Half Created":
                continue
            services_events.append({"date": ts_z[:10], "utc": ts_z, "action": action, "service": svc.replace("Has Google One Membership Information", "Google One")})
    services_events.sort(key=lambda e: e["utc"])

    dev_path = src / "Access Log Activity" / "Devices - A list of devices (i.e. Nest, Pixel, iPhone, Galaxy, etc) which have accessed your Google account over the last 270 days.csv"
    dev_rows = list(csv.DictReader(dev_path.open()))
    dev_buckets = Counter()
    for r in dev_rows:
        dt_t, os_s, mkt = r["Device Type"] or "UNKNOWN", r["OS"] or "", r["Marketing Name"] or ""
        if "iPhone" in mkt or (dt_t == "MOBILE" and os_s == "iOS"):
            dev_buckets["iPhone / iOS tokens"] += 1
        elif dt_t == "TABLET":
            dev_buckets["iPad Pro (12.9-inch)"] += 1
        elif os_s == "Mac":
            dev_buckets["Mac browser tokens"] += 1
        elif os_s == "Linux":
            dev_buckets["Linux PC / remote"] += 1
        elif os_s == "Windows":
            dev_buckets["Windows PC"] += 1
        elif dt_t == "TV":
            dev_buckets["Android / Smart TV"] += 1
        else:
            dev_buckets["Unknown / unspecified"] += 1

    total_archive_rows = act_total + len(logins) + len(watch) + len(search) + len(services_events)

    return {
        "generated": "2026-11-24",
        "exportDate": "2026-11-23",
        "accountCreated": "2018-05-09",
        "ytFirstDate": base_day.isoformat(),
        "ytLastDate": last_day.isoformat(),
        "totals": {
            "files": 7,
            "watchRows": len(watch),
            "organicWatched": len(org_w),
            "organicYT": len(org_yt),
            "organicYTM": len(org_ytm),
            "watchAds": len(w_ads),
            "watchAdShare": round(len(w_ads) / len(watch), 4),
            "searchRows": len(search),
            "realSearches": len(org_s),
            "searchAds": len(s_ads),
            "searchAdShare": round(len(s_ads) / len(search), 4),
            "adOverlap": ad_overlap,
            "adClicks": len(clicked_ads),
            "adCtr": round(len(clicked_ads) / len(w_ads), 5),
            "communityPosts": len(w_viewed),
            "surveys": len(w_surveys),
            "askMusic": len(ask_music),
            "removedOrganic": sum(1 for r in org_w if not r["ch"] or r["removed"]),
            "uniqueVideos": len({r["vid"] or r["title"] for r in org_w}),
            "uniqueYTVideos": len({r["vid"] or r["title"] for r in org_yt}),
            "uniqueYTMTracks": len({r["vid"] or r["title"] for r in org_ytm}),
            "uniqueChannels": len(ch_all),
            "oneOffChannels": sum(1 for c in ch_all.values() if c == 1),
            "selfViews": ch_all["Teo Zeng"],
            "selfViewsNov": sum(1 for r in org_yt if r["ch"] == "Teo Zeng" and r["dt"].strftime("%Y-%m") == "2026-11"),
            "activeDays": len(active_dates),
            "spanDays": span_days,
            "longestStreak": best_s,
            "longestStreakSpan": [bs.isoformat(), be.isoformat()],
            "sessions": len(sessions_tmp),
            "searchSessions": len(sess_search_lens),
            "feedSessions": len(sess_feed_lens),
            "nearSearchWatches": near_search_10m,
            "preOct19Rate": round(len(pre_org) / pre_days, 2),
            "postOct19Rate": round(len(post_org) / post_days, 2),
            "postOct19YtExTeoRate": round(post_yt_ex_teo / post_days, 2),
            "logins": len(logins),
            "bgLogins": sum(1 for x in logins if not x["inter"]),
            "mapsBgLogins": sum(1 for x in logins if x["app"] == "Google Maps (iOS)" and not x["inter"]),
            "distinctRawGeos": len({x["raw_geo"] for x in logins if x["raw_geo"]}),
            "accessRows": act_total,
            "accessDays": 28,
            "accessPerDay": round(act_total / 28, 1),
            "accessOtherShare": round(act_prods["Other"] / act_total, 4),
            "accessRowShareAll": round(act_total / total_archive_rows, 4),
            "accessUniqueIps": len(act_ips),
            "accessMaxPerSec": max(act_sec.values()),
            "accessSec64Count": len(sec64),
            "devicesRows": len(dev_rows),
        },
        "months": months_list,
        "octSwitch": {
            "days": oct_days,
            "burst": oct_burst,
            "lastAdNY": "2026-10-23 23:48:49 EDT",
            "googleOneRemovedNY": "2026-10-23 20:10:17 EDT",
            "googleOneAddedNY": "2026-10-23 23:51:18 EDT",
            "gapAfterLastAdSec": 149,
            "ytmFirstDate": "2026-10-19",
            "peakAdDay": {"d": "2026-10-11", "ads": 106, "yt": 11},
        },
        "adProfile": {
            "categories": [{"name": k, "n": v, "share": round(v / len(w_ads), 4)} for k, v in ad_cat_ctr.most_common()],
            "topBrands": top_brands,
            "clicked": clicked_ads,
            "within10s": sum(1 for g in ad_gaps if g <= 10),
            "within60s": sum(1 for g in ad_gaps if g <= 60),
        },
        "topics": topics_out,
        "topChannels": top_channels,
        "topYtmSongs": [{"artist": a, "song": s, "n": n} for (a, s), n in ytm_songs.most_common(12)],
        "topYtmArtists": [{"artist": a, "n": n} for a, n in ytm_artists.most_common(10)],
        "rhythm": {
            "baseDate": base_day.isoformat(),
            "spanDays": span_days,
            "starfield": {"yt": sf_yt, "ytRaw": sf_yt_raw, "ytm": sf_ytm, "ads": sf_ads},
            "dayTotals": day_totals,
            "clocks": {
                "yt": clock_yt,
                "ytRawEst": clock_yt_raw_est,
                "ytm": clock_ytm,
                "search": clock_sq,
                "ads": clock_ads,
                "tv": act_hr_fam["tv"],
                "humanAccess": human_access_hr,
                "machineAccess": machine_access_hr,
            },
            "wdHour": {"yt": wd_yt, "ytm": wd_ytm, "humanAccess": act_wd_human},
        },
        "sessions": {
            "fineEdges": fine_edges,
            "fineYt": fine_yt,
            "fineYtm": fine_ytm,
            "ytMedianSec": int(yt_gaps_all[len(yt_gaps_all) // 2]),
            "ytmMedianSec": int(ytm_gaps_all[len(ytm_gaps_all) // 2]),
            "ytUnder60Share": round(sum(1 for g in yt_gaps_all if g <= 60) / len(yt_gaps_all), 4),
            "ytmSongWindowShare": round(sum(1 for g in ytm_gaps_all if 120 <= g <= 300) / len(ytm_gaps_all), 4),
            "survival": survival,
            "searchAvgLen": round(sum(sess_search_lens) / len(sess_search_lens), 2),
            "feedAvgLen": round(sum(sess_feed_lens) / len(sess_feed_lens), 2),
            "topQueries": top_queries,
            "xrays": xrays,
        },
        "geo": {
            "timelineEnabled": bool(tl_settings.get("timelineEnabled", False)),
            "historyEnabled": bool(tl_settings.get("historyEnabled", False)),
            "deletedDate": tl_settings.get("timelineDeletionTime", "")[:10],
            "firstLogin": logins[0]["dt"].strftime("%Y-%m-%d"),
            "lastLogin": logins[-1]["dt"].strftime("%Y-%m-%d"),
            "hubs": hubs_out,
            "trips": trips_out,
            "apps": apps_out,
        },
        "accessLog": {
            "firstDate": act_days_sorted[0],
            "lastDate": act_days_sorted[-1],
            "daily": act_daily_list,
            "grid": grid_rows,
            "hourly": {
                "human": human_access_hr,
                "machine": machine_access_hr,
                "tv": act_hr_fam["tv"],
            },
            "products": [{"name": k, "n": v} for k, v in act_prods.most_common()],
            "burstHist": burst_hist,
        },
        "account": {
            "created": "2018-05-09",
            "services": services_events,
            "devices": [{"group": k, "n": v} for k, v in dev_buckets.most_common()],
            "horizons": [
                {"name": "Access Log Activity", "days": 28, "rows": act_total, "span": "Oct 27 – Nov 23, 2026", "note": "0.9% of account age · 94.2% of all Takeout rows"},
                {"name": "Devices & Login IP Geos", "days": 270, "rows": len(logins), "span": "Feb 27 – Nov 23, 2026", "note": "Rolling 270-day security login table"},
                {"name": "YouTube Watch & Search", "days": span_days, "rows": len(watch) + len(search), "span": "Jun 10, 2025 – Nov 23, 2026", "note": "18-month rolling watch and search log"},
                {"name": "Account Change History", "days": (date(2026, 11, 23) - date(2018, 5, 9)).days, "rows": len(services_events), "span": "May 9, 2018 – Nov 23, 2026", "note": "Full 8.5-year service ledger"},
            ],
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    data = build(args.src)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    print(f"Wrote {args.out} ({args.out.stat().st_size / 1024:.1f} KB)")
    print("Oct 23 final burst:", data["octSwitch"]["burst"])
    print("Access row share of entire archive:", data["totals"]["accessRowShareAll"])


if __name__ == "__main__":
    main()
