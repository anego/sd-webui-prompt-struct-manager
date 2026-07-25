"""
タグカテゴリデータベース (Phase 5B)

a1111-sd-webui-tagcomplete のタグCSV (tags/danbooru*.csv) を読み込み、
タグ → PSMカテゴリ (quality/subject/character/series/artist/general) の
参照辞書を提供します。

CSV形式: tag,category,post_count,"alias1,alias2,..."
Danbooruカテゴリ: 0=general, 1=artist, 3=copyright, 4=character, 5=meta
"""

import csv
from pathlib import Path
from typing import Dict, List, Optional

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
