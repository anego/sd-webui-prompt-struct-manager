"""
タグカテゴリデータベース (Phase 5B)

a1111-sd-webui-tagcomplete のタグCSV (tags/danbooru*.csv) を読み込み、
タグ → PSMカテゴリ (quality/subject/character/series/artist/general) の
参照辞書を提供します。

CSV形式: tag,category,post_count,"alias1,alias2,..."
Danbooruカテゴリ: 0=general, 1=artist, 3=copyright, 4=character, 5=meta
"""

import csv
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from . import config

# Danbooruカテゴリ番号 → PSMカテゴリ
CATEGORY_MAP: Dict[str, str] = {
    "0": "general",
    "1": "artist",
    "3": "series",     # copyright
    "4": "character",
    "5": "quality",    # meta
}

# Danbooru上はgeneralだがAnimaのタグ順序では「主体」に当たるタグ (アンダースコア表記)
SUBJECT_TAGS = {
    "1girl", "2girls", "3girls", "4girls", "5girls", "6+girls", "multiple_girls",
    "1boy", "2boys", "3boys", "4boys", "5boys", "6+boys", "multiple_boys",
    "1other", "2others", "3others", "multiple_others",
    "solo", "solo_focus", "no_humans", "male_focus", "female_focus",
}

# -------------------------------------------------------------------------
# 一般タグのサブ分類ルール (Phase 6)
#
# Danbooruのカテゴリはgeneralとひとまとめのため、取込時に「一般」グループが
# 巨大になる。そこでタグ文字列のキーワードで実務的なサブグループへ振り分ける。
# 上から順に評価するため、より限定的なルールを先に置くこと
# (例: "hair ornament" は accessory、その後に "hair" で hair を拾う)。
# -------------------------------------------------------------------------
SUBCATEGORY_RULES: List[Tuple[str, Tuple[str, ...]]] = [
    # 構図・視点 (from behind 等を pose より先に判定する)
    ("composition", (
        "from above", "from below", "from side", "from behind", "from outside",
        "close-up", "portrait", "upper body", "lower body", "full body", "cowboy shot",
        "dutch angle", "wide shot", "depth of field", "focus", "pov", "profile",
        "looking at viewer", "looking back", "looking away", "looking up", "looking down",
        "looking to the side", "facing viewer", "facing away", "cropped", "out of frame",
        "straight-on", "foreshortening", "perspective", "composition", "framed",
    )),
    # 装飾品・小物 (hair ornament 等を hair より先に判定する)
    ("accessory", (
        "hair ornament", "hairband", "hairclip", "hair clip", "hairpin", "hair bow",
        "hair ribbon", "hair flower", "headband", "headdress", "headwear", "headphones",
        "jewelry", "earring", "necklace", "pendant", "bracelet", "anklet", "ring",
        "choker", "collar", "glasses", "eyewear", "sunglasses", "goggles", "monocle",
        "piercing", "mask", "veil", "crown", "tiara", "bag", "backpack", "umbrella",
        "watch", "belt", "badge", "brooch",
    )),
    # 髪
    ("hair", (
        "hair", "bangs", "ponytail", "twintails", "twin tails", "braid", "ahoge",
        "sidelocks", "hair bun", "bun", "drill", "bob cut", "updo", "curly", "wavy hair",
        "straight hair", "messy hair",
    )),
    # 目・顔・表情
    ("face", (
        "eye", "eyes", "eyelashes", "pupil", "iris", "eyebrow", "eyelid",
        "smile", "grin", "smirk", "frown", "pout", "blush", "tears", "crying",
        "open mouth", "closed mouth", "parted lips", "teeth", "fang", "tongue",
        "expression", "wink", "sweat", "nose", "lips", "cheek", "freckles", "mole",
        "heterochromia", "half-closed", "wide-eyed", "empty eyes", "glowing eyes",
        "ear", "ears", "face",
    )),
    # 服装
    ("clothing", (
        "dress", "shirt", "blouse", "skirt", "uniform", "jacket", "coat", "cardigan",
        "sweater", "hoodie", "vest", "pants", "trousers", "shorts", "jeans", "leggings",
        "socks", "thighhighs", "pantyhose", "stockings", "shoes", "boots", "sandals",
        "sleeveless", "serafuku", "sailor", "school swimsuit", "gym uniform",
        "sneakers", "heels", "footwear", "hat", "cap", "beret", "helmet", "ribbon", "bow",
        "gloves", "mittens", "swimsuit", "bikini", "apron", "kimono", "yukata",
        "hakama", "armor", "cape", "capelet", "cloak", "scarf", "necktie", "tie",
        "bowtie", "sleeve", "sleeves", "clothes", "clothing",
        "costume", "outfit", "robe", "gown", "overalls", "romper", "leotard",
        "bodysuit", "fur trim", "frills", "lace", "buttons", "zipper", "pocket",
        "underwear", "bra", "panties", "lingerie", "corset", "garter",
        # 脱衣・着衣状態も服装に含める
        "nude", "naked", "topless", "bottomless", "undressing", "unbuttoned",
        "open clothes", "partially", "see-through", "wet clothes",
    )),
    # 体・体型
    ("body", (
        "breasts", "chest", "thigh", "thighs", "leg", "legs", "hip", "hips", "waist",
        "navel", "stomach", "abs", "skin", "muscular", "petite", "slender", "curvy",
        "tall", "short", "shoulder", "shoulders", "collarbone", "armpit", "arm", "arms",
        "hand", "hands", "finger", "fingers", "nail", "feet", "foot", "toes", "back",
        "neck", "body", "tail", "wings", "horn", "horns", "claws",
        "barefoot", "flat chest", "plump", "chubby",
        "cleavage", "nipple", "areola", "ass", "butt", "midriff", "groin",
        "pubic", "genitalia", "penis", "pussy", "anus", "thigh gap", "cameltoe",
    )),
    # ポーズ・動作
    ("pose", (
        "sitting", "standing", "lying", "kneeling", "squatting", "crouching",
        "jumping", "running", "walking", "dancing", "flying", "floating", "leaning",
        "holding", "hugging", "carrying", "grabbing", "reaching", "pointing",
        "arm up", "arms up", "hand on", "hands on", "crossed", "spread", "bent over",
        "on back", "on stomach", "on side", "all fours", "seiza", "wariza",
        "pose", "gesture", "salute", "waving", "stretching", "tiptoes",
    )),
    # 背景・場所
    ("background", (
        "background", "indoors", "outdoors", "sky", "cloud", "clouds", "night", "day",
        "sunset", "sunrise", "dusk", "dawn", "beach", "ocean", "sea", "lake", "river",
        "forest", "tree", "trees", "grass", "flower field", "city", "cityscape",
        "street", "road", "building", "room", "bedroom", "bed", "school", "classroom",
        "kitchen", "bathroom", "bath", "onsen", "pool", "garden", "park", "mountain",
        "field", "desert", "snow", "rain", "window", "wall", "floor", "ceiling",
        "door", "curtain", "shrine", "temple", "church", "cafe", "restaurant",
        "train", "car", "space", "underwater", "ruins", "scenery", "landscape",
    )),
    # 光・色
    ("lighting", (
        "light", "lighting", "shadow", "shading", "backlighting", "rim light",
        "glow", "glowing", "sunlight", "moonlight", "spotlight", "lens flare",
        "bloom", "monochrome", "greyscale", "grayscale", "sepia", "colorful",
        "pastel colors", "vivid colors", "gradient", "muted colors", "high contrast",
        "dark", "bright", "dim", "silhouette",
    )),
    # 画風・画材
    ("style", (
        "watercolor", "sketch", "lineart", "line art", "painting", "oil painting",
        "illustration", "anime", "manga", "chibi", "realistic", "photorealistic",
        "retro", "official art", "flat color", "cel shading", "outline", "traditional media",
        "digital media", "screentones", "halftone", "impasto", "art nouveau", "art deco",
        "concept art", "sketchbook", "doodle", "minimalist", "detailed", "style",
    )),
    # 効果・演出
    ("effect", (
        "blur", "motion blur", "motion lines", "speed lines", "emphasis lines",
        "particles", "petals", "sparkle", "sparkles", "aura", "magic", "fire",
        "flame", "smoke", "steam", "explosion", "lightning", "electricity",
        "bubbles", "splash", "wind", "feathers", "confetti", "chromatic aberration",
        "vignetting", "film grain", "glitch", "afterimage",
        "censor", "censored", "mosaic",
    )),
    # 小物・シンボル (人物以外のモチーフ。より限定的なルールの後に評価する)
    ("object", (
        "flower", "rose", "sakura", "leaf", "plant", "weapon", "sword", "katana",
        "gun", "rifle", "knife", "dagger", "spear", "staff", "wand", "shield",
        "food", "cake", "candy", "ice cream", "fruit", "apple", "drink", "cup",
        "mug", "bottle", "glass", "plate", "chopsticks", "book", "notebook",
        "phone", "smartphone", "camera", "instrument", "guitar", "piano",
        "table", "desk", "sofa", "chair", "stool", "plush", "stuffed animal",
        "toy", "doll", "balloon", "lantern", "candle", "key", "coin", "card",
        "letter", "paper", "pen", "pencil", "brush", "broom", "basket", "box",
        "animal", "cat", "dog", "bird", "fish", "butterfly", "horse", "rabbit",
        "heart", "star", "musical note", "cross", "sign", "banner",
    )),
    # 文字・注記 (Danbooru上generalだが構図要素として扱う)
    ("text", (
        "text", "speech bubble", "signature", "watermark", "artist name",
        "username", "logo", "border", "comic", "4koma", "translated",
        "character name", "dated", "subtitle",
    )),
]

# 顔文字系タグ (`:d` `;)` `^_^` など) は表情として扱う
EMOTICON_RE = re.compile(r"^[:;>=xX8^\-\+@0oO]{1,2}[3dDoOpPqQwW_\^<>\)\(\|]{1,3}$")

# サブグループを作るしきい値 (これ未満なら細分化しない)
SUBDIVIDE_THRESHOLD = 8

# プロセス内キャッシュ
_cache: Optional[Dict[str, str]] = None
_source: Optional[str] = None


def normalize(tag: str) -> str:
    """PSM内のタグ表記 (スペース区切り) をDB表記 (アンダースコア) に正規化します。"""
    return tag.strip().lower().replace(" ", "_")


def _candidate_files() -> List[Path]:
    """タグCSVの候補ファイルを優先順に返します。"""
    candidates: List[Path] = []
    try:
        ext_root = config.EXTENSION_DIR.parent  # extensions/
        primary = ext_root / "a1111-sd-webui-tagcomplete" / "tags" / "danbooru.csv"
        if primary.is_file():
            candidates.append(primary)
        for p in sorted(ext_root.glob("*/tags/danbooru*.csv")):
            if p.is_file() and p not in candidates:
                candidates.append(p)
    except Exception as e:
        print(f"[PSM ERROR] tagdb candidate scan failed: {e}")
    return candidates


def load(force: bool = False) -> bool:
    """
    タグCSVを読み込み、参照辞書を構築します (遅延ロード・プロセス内キャッシュ)。

    Returns:
        True: 利用可能 / False: タグCSVが見つからない
    """
    global _cache, _source
    if _cache is not None and not force:
        return True

    candidates = _candidate_files()
    if not candidates:
        _cache = None
        _source = None
        return False

    path = candidates[0]
    table: Dict[str, str] = {}
    try:
        with path.open("r", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) < 2:
                    continue
                tag = row[0].strip().lower()
                cat = CATEGORY_MAP.get(row[1].strip())
                if not tag or cat is None:
                    continue
                if cat == "general" and tag in SUBJECT_TAGS:
                    cat = "subject"
                # 本体タグを優先 (エイリアスによる上書きを防ぐため setdefault)
                table[tag] = cat
                # エイリアス列 (4列目, カンマ区切り)
                if len(row) >= 4 and row[3]:
                    for alias in row[3].split(","):
                        alias = alias.strip().lower()
                        if alias:
                            table.setdefault(alias, cat)
    except Exception as e:
        print(f"[PSM ERROR] tagdb load failed for {path}: {e}")
        _cache = None
        _source = None
        return False

    _cache = table
    _source = path.name
    print(f"[PSM] tagdb loaded: {path.name} ({len(table)} entries)")
    return True


def get_status() -> Dict[str, object]:
    """タグDBの利用可否・ソース・件数を返します (未ロードならロードを試行)。"""
    available = load()
    return {
        "available": available,
        "source": _source,
        "entries": len(_cache) if _cache else 0,
    }


def subcategory(tag: str) -> Optional[str]:
    """
    一般タグのサブ分類キーを返します (該当なしは None)。
    タグDBを必要としない純粋な文字列判定です。

    単語境界で照合するため、"hair" は "hair" / "long hair" に一致しますが
    "chair" には一致しません。
    """
    if not tag or not isinstance(tag, str):
        return None
    # 比較用に正規化 (アンダースコアはスペース扱い、記号は除去しない)
    raw = tag.strip()
    text = raw.lower().replace("_", " ")
    if not text:
        return None

    # 顔文字タグはアンダースコアを保持したまま判定する (^_^ など)
    if EMOTICON_RE.match(raw):
        return "face"

    for key, patterns in SUBCATEGORY_RULES:
        for pat in patterns:
            if pat in text:
                # 単語境界チェック (部分語での誤一致を防ぐ: chair -> hair を弾く)
                idx = text.find(pat)
                before_ok = idx == 0 or not text[idx - 1].isalnum()
                end = idx + len(pat)
                # 語尾の複数形 (earring -> earrings) は同一語として許容する
                if end < len(text) and text[end] == "s":
                    if end + 1 >= len(text) or not text[end + 1].isalnum():
                        end += 1
                after_ok = end >= len(text) or not text[end].isalnum()
                if before_ok and after_ok:
                    return key
    return None


def lookup(tags: List[str]) -> Dict[str, str]:
    """
    タグ (PSM表記) のリストに対し、PSMカテゴリを返します。
    DBに存在しないタグは "unknown" になります。

    Raises:
        RuntimeError: タグDBが見つからない場合
    """
    if not load():
        raise RuntimeError(
            "タグDBが見つかりません。a1111-sd-webui-tagcomplete を導入すると有効になります。"
        )
    assert _cache is not None
    result: Dict[str, str] = {}
    for tag in tags:
        if not isinstance(tag, str) or not tag.strip():
            continue
        result[tag] = _cache.get(normalize(tag), "unknown")
    return result
