"""
タグカテゴリDB (scripts/psm/tagdb.py) のユニットテスト (Phase 5B)

tagcomplete形式のCSVを一時ディレクトリに作成し、実際のファイルI/Oで検証します。
"""

import pytest
from pathlib import Path
from unittest.mock import MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

# conftest.py で sys.modules へのモック注入が完了しているため安全にインポート可能
from scripts import psm_extension
from scripts.psm import config, tagdb


# tag,category,post_count,"aliases"
SAMPLE_CSV = '''1girl,0,6008644,"1girls,sole_female"
long_hair,0,4350743,"/lh,longhair"
highres,5,5256195,"high_res,hires"
oomuro_sakurako,4,3000,""
yuru_yuri,3,25000,""
nnn_yryr,1,500,""
solo,0,5000954,"female_solo"
'''


@pytest.fixture
def tagdb_env(tmp_path: Path):
    """
    extensions/ 配下に tagcomplete のタグCSVを持つ環境を偽装するフィクスチャ。
    tagdb はモジュールレベルでキャッシュを持つため、前後でリセットします。
    """
    original_dir = config.EXTENSION_DIR

    # tmp_path/extensions/<psm> を拡張ルートに見立てる (親が extensions/)
    ext_root = tmp_path / "extensions"
    psm_dir = ext_root / "sd-webui-prompt-struct-manager"
    tags_dir = ext_root / "a1111-sd-webui-tagcomplete" / "tags"
    tags_dir.mkdir(parents=True, exist_ok=True)
    (tags_dir / "danbooru.csv").write_text(SAMPLE_CSV, encoding="utf-8")

    config.EXTENSION_DIR = psm_dir
    tagdb._cache = None
    tagdb._source = None

    yield tmp_path

    config.EXTENSION_DIR = original_dir
    tagdb._cache = None
    tagdb._source = None


@pytest.fixture
def empty_env(tmp_path: Path):
    """タグCSVが存在しない環境を偽装するフィクスチャ。"""
    original_dir = config.EXTENSION_DIR
    config.EXTENSION_DIR = tmp_path / "extensions" / "sd-webui-prompt-struct-manager"
    tagdb._cache = None
    tagdb._source = None

    yield tmp_path

    config.EXTENSION_DIR = original_dir
    tagdb._cache = None
    tagdb._source = None


@pytest.fixture
def test_client() -> TestClient:
    app: FastAPI = FastAPI()
    psm_extension.psm_api(MagicMock(), app)
    return TestClient(app)


# -------------------------------------------------------------------------
# 正規化
# -------------------------------------------------------------------------

class TestNormalize:
    def test_space_to_underscore_and_lowercase(self) -> None:
        """PSM表記(スペース区切り)がDB表記(アンダースコア)に正規化されること"""
        assert tagdb.normalize("Long Hair") == "long_hair"
        assert tagdb.normalize("  1girl  ") == "1girl"


# -------------------------------------------------------------------------
# ロードとカテゴリマッピング
# -------------------------------------------------------------------------

class TestLoadAndLookup:
    def test_load_success(self, tagdb_env: Path) -> None:
        assert tagdb.load() is True
        status = tagdb.get_status()
        assert status["available"] is True
        assert status["source"] == "danbooru.csv"
        assert status["entries"] > 0

    def test_danbooru_category_mapping(self, tagdb_env: Path) -> None:
        """Danbooruカテゴリ番号がPSMカテゴリへ正しく変換されること"""
        result = tagdb.lookup([
            "long hair",         # 0 general
            "highres",           # 5 meta   -> quality
            "oomuro sakurako",   # 4 character
            "yuru yuri",         # 3 copyright -> series
            "nnn yryr",          # 1 artist
        ])
        assert result["long hair"] == "general"
        assert result["highres"] == "quality"
        assert result["oomuro sakurako"] == "character"
        assert result["yuru yuri"] == "series"
        assert result["nnn yryr"] == "artist"

    def test_subject_tags_override_general(self, tagdb_env: Path) -> None:
        """1girl / solo は Danbooru上general だが subject に振り分けられること"""
        result = tagdb.lookup(["1girl", "solo"])
        assert result["1girl"] == "subject"
        assert result["solo"] == "subject"

    def test_alias_resolution(self, tagdb_env: Path) -> None:
        """エイリアスからも本体タグのカテゴリが引けること"""
        result = tagdb.lookup(["longhair", "hires"])
        assert result["longhair"] == "general"
        assert result["hires"] == "quality"

    def test_unknown_tag(self, tagdb_env: Path) -> None:
        result = tagdb.lookup(["this_tag_does_not_exist_12345"])
        assert result["this_tag_does_not_exist_12345"] == "unknown"

    def test_cache_reused(self, tagdb_env: Path) -> None:
        """2回目のloadでキャッシュが再利用され、CSV削除後も引けること"""
        assert tagdb.load() is True
        csv_path = tagdb_env / "extensions" / "a1111-sd-webui-tagcomplete" / "tags" / "danbooru.csv"
        csv_path.unlink()
        assert tagdb.load() is True  # キャッシュ済み
        assert tagdb.lookup(["1girl"])["1girl"] == "subject"

    def test_missing_csv_returns_false(self, empty_env: Path) -> None:
        assert tagdb.load() is False
        assert tagdb.get_status()["available"] is False

    def test_lookup_raises_without_db(self, empty_env: Path) -> None:
        with pytest.raises(RuntimeError, match="タグDB"):
            tagdb.lookup(["1girl"])


# -------------------------------------------------------------------------
# APIエンドポイント
# -------------------------------------------------------------------------

class TestTagDbApi:
    def test_tag_categories_success(self, test_client: TestClient, tagdb_env: Path) -> None:
        response = test_client.post("/psm/tag-categories", json={
            "tags": ["1girl", "oomuro sakurako", "nonexistent_tag_xyz"]
        })
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["categories"]["1girl"] == "subject"
        assert data["categories"]["oomuro sakurako"] == "character"
        assert data["categories"]["nonexistent_tag_xyz"] == "unknown"

    def test_tag_categories_empty_tags(self, test_client: TestClient, tagdb_env: Path) -> None:
        response = test_client.post("/psm/tag-categories", json={"tags": []})
        assert response.json()["status"] == "error"

    def test_tag_categories_without_db(self, test_client: TestClient, empty_env: Path) -> None:
        response = test_client.post("/psm/tag-categories", json={"tags": ["1girl"]})
        data = response.json()
        assert data["status"] == "error"
        assert "タグDB" in data["message"]

    def test_tagdb_status_endpoint(self, test_client: TestClient, tagdb_env: Path) -> None:
        response = test_client.get("/psm/tagdb-status")
        assert response.status_code == 200
        assert response.json()["available"] is True


# -------------------------------------------------------------------------
# 一般タグのサブ分類 (subcategory)
# -------------------------------------------------------------------------

class TestSubcategory:
    """タグDBを必要としない純粋な文字列判定のため、フィクスチャ不要"""

    @pytest.mark.parametrize("tag,expected", [
        ("long hair", "hair"),
        ("blue eyes", "face"),
        ("smile", "face"),
        ("large breasts", "body"),
        ("school uniform", "clothing"),
        ("thighhighs", "clothing"),
        ("hair ornament", "accessory"),   # hairより先にaccessoryへ
        ("hairband", "accessory"),
        ("sitting", "pose"),
        ("from behind", "composition"),
        ("looking at viewer", "composition"),
        ("upper body", "composition"),
        ("outdoors", "background"),
        ("backlighting", "lighting"),
        ("watercolor (medium)", "style"),
        ("motion blur", "effect"),
        ("flower", "object"),
        ("speech bubble", "text"),
    ])
    def test_basic_classification(self, tag: str, expected: str) -> None:
        assert tagdb.subcategory(tag) == expected

    @pytest.mark.parametrize("tag", ["hearing", "1girl", "solo", "virtual youtuber"])
    def test_unclassified(self, tag: str) -> None:
        """該当しないタグは None を返すこと (人数タグ等は上位カテゴリで扱う)"""
        assert tagdb.subcategory(tag) is None

    def test_word_boundary(self) -> None:
        """部分語での誤一致を防ぐこと (chair -> hair とならない)"""
        assert tagdb.subcategory("armchair") != "hair"
        assert tagdb.subcategory("hearing") is None

    @pytest.mark.parametrize("tag,expected", [
        ("earrings", "accessory"),   # 複数形
        ("eyes", "face"),
        ("legs", "body"),
        ("clouds", "background"),
    ])
    def test_plural_forms(self, tag: str, expected: str) -> None:
        assert tagdb.subcategory(tag) == expected

    @pytest.mark.parametrize("tag", [":d", ";)", "^_^", ">_<", "@_@"])
    def test_emoticon_tags(self, tag: str) -> None:
        """顔文字タグは表情として扱うこと"""
        assert tagdb.subcategory(tag) == "face"

    def test_normalization(self) -> None:
        """大文字・アンダースコア・前後空白を正規化して判定すること"""
        assert tagdb.subcategory("Long_Hair") == "hair"
        assert tagdb.subcategory("  blue eyes  ") == "face"

    def test_invalid_input(self) -> None:
        assert tagdb.subcategory("") is None
        assert tagdb.subcategory(None) is None  # type: ignore[arg-type]

    def test_api_returns_subcategories(self, test_client: TestClient, tagdb_env: Path) -> None:
        """/psm/tag-categories がサブ分類も返すこと (既存フィールドは維持)"""
        response = test_client.post("/psm/tag-categories", json={
            "tags": ["long hair", "1girl", "unknown_tag_xyz"]
        })
        data = response.json()
        assert data["status"] == "success"
        assert data["categories"]["1girl"] == "subject"          # 既存フィールド
        assert data["subcategories"]["long hair"] == "hair"      # 追加フィールド
        assert data["subcategories"]["unknown_tag_xyz"] is None
