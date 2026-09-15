import os
import json
import yaml
import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
from typing import Dict, List, Optional
from fastapi import FastAPI
from fastapi.testclient import TestClient

# conftest.py で sys.modules へのモック注入が完了しているため安全にインポート可能
from scripts import psm_extension
from scripts.psm import cache, config
from modules import shared

# -------------------------------------------------------------------------
# フィクスチャ定義
# -------------------------------------------------------------------------

@pytest.fixture
def test_app() -> FastAPI:
    """
    テスト用の FastAPI アプリケーションを構築し、PSM API エンドポイントを登録します。
    WebUI 本番環境の FastAPI インスタンスに影響を与えずに API のテストを可能にします。
    """
    # Arrange
    app: FastAPI = FastAPI()
    demo_mock: MagicMock = MagicMock()  # gr.Blocks のダミー
    
    # Act
    # psm_extension 内の API 登録関数を実行し、テスト用 app にルートを紐付け
    psm_extension.psm_api(demo_mock, app)
    
    # Assert (FastAPIインスタンスを返却)
    return app

@pytest.fixture
def test_client(test_app: FastAPI) -> TestClient:
    """
    FastAPI の TestClient を提供します。
    実 HTTP サーバーを起動することなく、メモリ上で高速にエンドポイントの検証が行えます。
    """
    # Act & Assert
    return TestClient(test_app)

# -------------------------------------------------------------------------
# パス解決ロジック (get_psm_dir) のテスト
# -------------------------------------------------------------------------

def test_get_psm_dir_default(temp_extension_env: Path) -> None:
    """
    何も設定がない（config.json も legacy設定もない）場合、
    デフォルトのディレクトリ（psm_data）が返されることを検証します。
    """
    # Arrange
    expected_path: str = str(config.EXTENSION_DIR / "psm_data")
    
    # Act
    actual_path: str = str(config.get_psm_dir())
    
    # Assert
    assert actual_path == expected_path

def test_get_psm_dir_from_config(temp_extension_env: Path) -> None:
    """
    config.json に save_dir が定義されている場合、
    その値が最優先で get_psm_dir に採用されることを検証します。
    """
    # Arrange
    config_data: Dict[str, str] = {"save_dir": "/custom/path/from/config"}
    config_path: str = str(config.EXTENSION_DIR / "config.json")
    
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_data, f)
        
    # Act
    actual_path: str = str(config.get_psm_dir())
    
    # Assert
    assert actual_path == str(Path("/custom/path/from/config").resolve())

def test_get_psm_dir_fallback_legacy(temp_extension_env: Path) -> None:
    """
    config.json は存在しないが、WebUI の既存設定（shared.opts.psm_save_dir）が存在する場合、
    セカンドフォールバックとして legacy パスが返されることを検証します。
    """
    # Arrange
    # shared.opts の挙動をモック化
    shared.opts.psm_save_dir = "/legacy/save/dir"
    
    # Act
    actual_path: str = str(config.get_psm_dir())
    
    # Assert
    assert actual_path == str(Path("/legacy/save/dir").resolve())

# -------------------------------------------------------------------------
# API エンドポイントのテスト
# -------------------------------------------------------------------------

def test_check_path(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    /psm/check-path エンドポイントが、指定されたパスの存在有無を
    正しく判定して結果を返すか検証します。
    """
    # --- 1. 存在するディレクトリの場合 ---
    # Arrange
    exist_dir: str = str(temp_extension_env)
    
    # Act
    response = test_client.get(f"/psm/check-path?path={exist_dir}")
    
    # Assert
    assert response.status_code == 200
    assert response.json() == {"exists": True}

    # --- 2. 存在しないディレクトリの場合 ---
    # Arrange
    non_exist_dir: str = os.path.join(exist_dir, "non-existent-folder-xyz")
    
    # Act
    response = test_client.get(f"/psm/check-path?path={non_exist_dir}")
    
    # Assert
    assert response.status_code == 200
    assert response.json() == {"exists": False}

@patch("tkinter.filedialog.askdirectory")
@patch("tkinter.Tk")
def test_pick_dir(mock_tk: MagicMock, mock_askdirectory: MagicMock, test_client: TestClient) -> None:
    """
    /psm/pick-dir エンドポイントのテスト。
    Tkinter の GUI ダイアログを表示するとテスト環境（ヘッドレス等）でハングするため、
    Tk および filedialog をモック化して安全に処理結果の返却のみを検証します。
    """
    # --- 1. ディレクトリ選択時 ---
    # Arrange
    mock_askdirectory.return_value = "/selected/mock/directory"
    
    # Act
    response = test_client.get("/psm/pick-dir")
    
    # Assert
    assert response.status_code == 200
    assert response.json() == {"path": "/selected/mock/directory"}
    
    # --- 2. キャンセル時 ---
    # Arrange
    mock_askdirectory.return_value = ""
    
    # Act
    response = test_client.get("/psm/pick-dir")
    
    # Assert
    assert response.status_code == 200
    assert response.json() == {"path": None}

def test_get_config_not_configured(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    config.json が存在しない初期状態で /psm/get-config を呼び出した場合、
    is_configured が False であり、デフォルトパスが返ることを検証します。
    """
    # Act
    response = test_client.get("/psm/get-config")
    
    # Assert
    assert response.status_code == 200
    data: Dict[str, Union[str, bool, None]] = response.json()
    assert data["is_configured"] is False
    assert data["save_dir"] == str(config.get_psm_dir())
    assert data["dev_mode"] is False

def test_set_and_get_config(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    /psm/set-config で設定を書き込み、その後 /psm/get-config で
    書き込んだ設定が正しく取得でき、is_configured が True になることを一連の流れで検証します。
    """
    # --- 1. 設定の書き込み ---
    # Arrange
    new_config: Dict[str, Union[str, bool]] = {
        "save_dir": "/my/custom/save/path",
        "dev_mode": True,
        "custom_option": "hello_world"
    }
    
    # Act
    set_response = test_client.post("/psm/set-config", json=new_config)
    
    # Assert
    assert set_response.status_code == 200
    assert set_response.json() == {"status": "success"}
    
    # --- 2. 設定の読み込みと内容一致の検証 ---
    # Act
    get_response = test_client.get("/psm/get-config")
    
    # Assert
    assert get_response.status_code == 200
    config_data: Dict[str, Union[str, bool, None]] = get_response.json()
    assert config_data["is_configured"] is True
    assert config_data["save_dir"] == "/my/custom/save/path"
    assert config_data["dev_mode"] is True
    assert config_data["custom_option"] == "hello_world"

def test_list_files(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    /psm/list-files エンドポイントが、設定されたセーブディレクトリ内の
    .yaml ファイルのみをソートして列挙するか検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    
    # テスト用ファイルの作成（.yaml 以外の拡張子も混ぜる）
    test_files: List[str] = ["beta.yaml", "alpha.yaml", "readme.txt", "charlie.yaml"]
    for file_name in test_files:
        with open(os.path.join(save_dir, file_name), "w", encoding="utf-8") as f:
            f.write("")
            
    # Act
    response = test_client.get("/psm/list-files")
    
    # Assert
    assert response.status_code == 200
    
    # yamlファイルだけがアルファベット昇順で返されること
    expected_files: List[str] = ["alpha.yaml", "beta.yaml", "charlie.yaml"]
    assert response.json() == {"files": expected_files}

def test_save_and_get_prompts(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    プロンプトデータの保存（/psm/save-prompts）と
    保存したプロンプトデータの取得（/psm/get-prompts）が
    YAMLフォーマットで正しく行えることを検証します。
    """
    # Arrange
    prompt_payload: Dict[str, object] = {
        "file": "test_prompt.yaml",
        "positive": [{"id": 1, "text": "masterpiece"}, {"id": 2, "text": "1girl"}],
        "negative": [{"id": 3, "text": "low quality"}]
    }
    
    # --- 1. 保存の実行 ---
    # Act
    save_response = test_client.post("/psm/save-prompts", json=prompt_payload)
    
    # Assert
    assert save_response.status_code == 200
    assert save_response.json() == {"status": "success"}
    
    # --- 2. 取得の実行と内容一致の検証 ---
    # Act
    get_response = test_client.get("/psm/get-prompts?file=test_prompt.yaml")
    
    # Assert
    assert get_response.status_code == 200
    retrieved_data: Dict[str, List[Dict[str, object]]] = get_response.json()
    assert retrieved_data["positive"] == prompt_payload["positive"]
    assert retrieved_data["negative"] == prompt_payload["negative"]

def test_save_and_get_prompts_japanese(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    日本語ファイル名（例: メイン.yaml）を指定した場合でも、
    プロンプトデータの保存と取得が正しく行えるかを検証します。
    """
    # Arrange
    prompt_payload: Dict[str, object] = {
        "file": "メイン.yaml",
        "positive": [{"id": 1, "text": "傑作"}, {"id": 2, "text": "1人の女の子"}],
        "negative": [{"id": 3, "text": "低品質"}]
    }
    
    # --- 1. 保存の実行 ---
    # Act
    save_response = test_client.post("/psm/save-prompts", json=prompt_payload)
    
    # Assert
    assert save_response.status_code == 200
    assert save_response.json() == {"status": "success"}
    
    # --- 2. 取得の実行と内容一致の検証 ---
    # Act
    # %E3%83%A1%E3%82%A4%E3%83%B3.yaml is the URL-encoded form of メイン.yaml
    get_response = test_client.get("/psm/get-prompts?file=%E3%83%A1%E3%82%A4%E3%83%B3.yaml")
    
    # Assert
    assert get_response.status_code == 200
    retrieved_data: Dict[str, List[Dict[str, object]]] = get_response.json()
    assert retrieved_data["positive"] == prompt_payload["positive"]
    assert retrieved_data["negative"] == prompt_payload["negative"]

def test_get_prompts_not_found(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    存在しないYAMLファイルを指定してプロンプト取得を試みた場合、
    エラーにならずに空の構造が返されることを検証します。
    """
    # Act
    response = test_client.get("/psm/get-prompts?file=non_existent_file_999.yaml")
    
    # Assert
    assert response.status_code == 200
    assert response.json() == {"positive": [], "negative": [], "profiles": []}

def test_duplicate_file(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    /psm/duplicate-file エンドポイントが、
    指定した YAML ファイルを別名で正常に複製できるかを検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    
    src_file: str = "original.yaml"
    with open(os.path.join(save_dir, src_file), "w", encoding="utf-8") as f:
        yaml.dump({"positive": ["test"]}, f)
        
    payload: Dict[str, str] = {
        "src": src_file,
        "dst": "copy_file"  # 拡張子なしで送り、自動付与されるかどうかも確認
    }
    
    # Act
    response = test_client.post("/psm/duplicate-file", json=payload)
    
    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    
    # 複製先ファイルが存在し、中身が正しいこと
    dst_full_path: str = os.path.join(save_dir, "copy_file.yaml")
    assert os.path.exists(dst_full_path)
    with open(dst_full_path, "r", encoding="utf-8") as f:
        content: Optional[Dict[str, List[str]]] = yaml.safe_load(f)
        assert content == {"positive": ["test"]}

def test_rename_file(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    /psm/rename-file エンドポイントが、
    ファイルを別名に変更し、元ファイルが削除されることを検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    
    src_file: str = "old_name.yaml"
    src_path: str = os.path.join(save_dir, src_file)
    with open(src_path, "w", encoding="utf-8") as f:
        f.write("content")
        
    payload: Dict[str, str] = {
        "src": src_file,
        "dst": "new_name.yaml"
    }
    
    # Act
    response = test_client.post("/psm/rename-file", json=payload)
    
    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    
    # 元ファイルがなくなり、新ファイルが存在すること
    assert not os.path.exists(src_path)
    assert os.path.exists(os.path.join(save_dir, "new_name.yaml"))

def test_delete_file(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    /psm/delete-file エンドポイントが、
    指定した YAML ファイルを正しく削除できるか検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    
    target_file: str = "to_be_deleted.yaml"
    target_path: str = os.path.join(save_dir, target_file)
    with open(target_path, "w", encoding="utf-8") as f:
        f.write("delete me")
        
    assert os.path.exists(target_path)
    
    # Act
    response = test_client.delete(f"/psm/delete-file?file={target_file}")
    
    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    
    # ファイルが物理的に削除されていること
    assert not os.path.exists(target_path)

def test_delete_file_not_found(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    存在しないファイルを削除しようとした場合、
    ステータス error が返されることを検証します。
    """
    # Act
    response = test_client.delete("/psm/delete-file?file=no_such_file_ever.yaml")
    
    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "error", "message": "File not found"}

def test_save_and_get_prompts_with_profiles(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    profiles 状態スナップショットデータを含むプロンプトデータの保存と取得が
    YAMLフォーマットで正しく行えることを検証します。
    """
    # Arrange
    prompt_payload: Dict[str, object] = {
        "file": "test_profile_prompt.yaml",
        "positive": [{"id": 1, "text": "masterpiece"}],
        "negative": [{"id": 2, "text": "low quality"}],
        "profiles": [
            {
                "name": "Profile1",
                "states": [{"id": 1, "enabled": True, "weight": 1.2}]
            }
        ]
    }
    
    # Act: 保存の実行
    save_response = test_client.post("/psm/save-prompts", json=prompt_payload)
    
    # Assert: 保存成功の確認
    assert save_response.status_code == 200
    assert save_response.json() == {"status": "success"}
    
    # Act: 取得の実行
    get_response = test_client.get("/psm/get-prompts?file=test_profile_prompt.yaml")
    
    # Assert: 取得結果が一致することの確認
    assert get_response.status_code == 200
    retrieved_data: Dict[str, object] = get_response.json()
    assert retrieved_data["positive"] == prompt_payload["positive"]
    assert retrieved_data["negative"] == prompt_payload["negative"]
    assert retrieved_data["profiles"] == prompt_payload["profiles"]

def test_save_and_get_prompts_with_model_mode(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    model_mode ("anima") を含むプロンプトデータの保存と取得が正しく行えることを検証します。
    """
    # Arrange
    prompt_payload: Dict[str, object] = {
        "file": "test_anima.yaml",
        "positive": [{"id": 1, "text": "score_7"}],
        "negative": [],
        "model_mode": "anima"
    }

    # Act: 保存の実行
    save_response = test_client.post("/psm/save-prompts", json=prompt_payload)

    # Assert: 保存成功の確認
    assert save_response.status_code == 200
    assert save_response.json() == {"status": "success"}

    # Act: 取得の実行
    get_response = test_client.get("/psm/get-prompts?file=test_anima.yaml")

    # Assert: model_mode が保持されていること
    assert get_response.status_code == 200
    assert get_response.json()["model_mode"] == "anima"

def test_get_prompts_model_mode_fallback(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    model_mode キーを持たない旧形式の YAML ファイルをロードした場合に
    "sd" にフォールバックすること（後方互換性）を検証します。
    """
    # Arrange: model_mode なしの旧形式ファイルを直接作成
    target_dir: Path = config.get_psm_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    legacy_file: Path = target_dir / "legacy.yaml"
    with legacy_file.open("w", encoding="utf-8") as f:
        yaml.dump({"positive": [], "negative": []}, f)

    # Act
    get_response = test_client.get("/psm/get-prompts?file=legacy.yaml")

    # Assert
    assert get_response.status_code == 200
    assert get_response.json()["model_mode"] == "sd"

def test_save_prompts_invalid_model_mode_ignored(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    不正な model_mode 値が送信された場合は無視され、"sd" として保存されることを検証します。
    """
    # Arrange
    prompt_payload: Dict[str, object] = {
        "file": "test_invalid_mode.yaml",
        "positive": [],
        "negative": [],
        "model_mode": "flux9999"  # 不正な値
    }

    # Act
    save_response = test_client.post("/psm/save-prompts", json=prompt_payload)
    assert save_response.status_code == 200

    get_response = test_client.get("/psm/get-prompts?file=test_invalid_mode.yaml")

    # Assert: 不正値は "sd" へフォールバック
    assert get_response.json()["model_mode"] == "sd"

def test_save_prompts_preserves_unknown_keys(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    将来バージョンで追加された未知のルートキーが、保存時に消えずに保持されることを検証します。
    """
    # Arrange: 未知キー付きのファイルを直接作成
    target_dir: Path = config.get_psm_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    future_file: Path = target_dir / "future.yaml"
    with future_file.open("w", encoding="utf-8") as f:
        yaml.dump({
            "positive": [], "negative": [],
            "future_feature_key": {"some": "data"}
        }, f)

    # Act: 通常の保存を実行（未知キーは送信されない）
    save_response = test_client.post("/psm/save-prompts", json={
        "file": "future.yaml",
        "positive": [{"id": 1, "text": "1girl"}],
        "negative": []
    })
    assert save_response.status_code == 200

    # 保存はキャッシュへのデバウンス書き込みのため、ディスク上のファイルを
    # 直接検証する前に明示的にflushさせる
    flush_response = test_client.post("/psm/flush-prompts", json={"file": "future.yaml"})
    assert flush_response.status_code == 200

    # Assert: ファイル内に未知キーが残っていること
    with future_file.open("r", encoding="utf-8") as f:
        saved = yaml.safe_load(f)
    assert saved["future_feature_key"] == {"some": "data"}
    assert saved["positive"] == [{"id": 1, "text": "1girl"}]

# -------------------------------------------------------------------------
# 生成設定プロファイル (/psm/generation-profiles) のテスト (Phase 6)
# -------------------------------------------------------------------------

def test_get_generation_profiles_empty(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    generation_profiles.json が未作成の場合、空のプロファイル一覧が返ることを検証します。
    """
    # Act
    response = test_client.get("/psm/generation-profiles")

    # Assert
    assert response.status_code == 200
    assert response.json() == {"profiles": []}

def test_save_and_get_generation_profiles(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    生成設定プロファイルの保存（/psm/generation-profiles POST）と
    取得（/psm/generation-profiles GET）が正しく行えるかを検証します。
    """
    # Arrange
    profiles_payload: Dict[str, List[object]] = {
        "profiles": [
            {
                "name": "Anime Standard",
                "fields": ["checkpoint", "steps", "cfg_scale"],
                "settings": {"checkpoint": "animagineXL.safetensors", "steps": 28, "cfg_scale": 6.0},
                "updatedAt": "2026-08-01T12:00:00+09:00",
            }
        ]
    }

    # Act
    save_response = test_client.post("/psm/generation-profiles", json=profiles_payload)

    # Assert
    assert save_response.status_code == 200
    assert save_response.json() == {"status": "success"}

    get_response = test_client.get("/psm/generation-profiles")
    assert get_response.status_code == 200
    assert get_response.json() == profiles_payload

def test_save_generation_profiles_overwrites_previous(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    保存は配列を丸ごと上書きする方式であり、前回保存分が完全に置き換わることを検証します。
    """
    # Arrange
    first_payload: Dict[str, List[object]] = {
        "profiles": [{"name": "A", "fields": ["steps"], "settings": {"steps": 20}, "updatedAt": "2026-08-01T00:00:00Z"}]
    }
    second_payload: Dict[str, List[object]] = {
        "profiles": [{"name": "B", "fields": ["seed"], "settings": {"seed": 42}, "updatedAt": "2026-08-01T01:00:00Z"}]
    }

    # Act
    test_client.post("/psm/generation-profiles", json=first_payload)
    test_client.post("/psm/generation-profiles", json=second_payload)
    get_response = test_client.get("/psm/generation-profiles")

    # Assert
    assert get_response.json() == second_payload

def test_generation_profiles_file_excluded_from_list_files(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    generation_profiles.json はプロンプトYAML一覧 (/psm/list-files) の対象に
    含まれないことを検証します（.json 拡張子のため .yaml グロブの対象外）。
    """
    # Arrange
    test_client.post("/psm/generation-profiles", json={"profiles": []})
    save_dir: str = str(config.get_psm_dir())
    with open(os.path.join(save_dir, "prompt.yaml"), "w", encoding="utf-8") as f:
        f.write("")

    # Act
    response = test_client.get("/psm/list-files")

    # Assert
    assert response.json() == {"files": ["prompt.yaml"]}

def test_generation_profiles_stored_separately_from_prompt_yaml(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    生成設定プロファイルの保存が、同名のプロンプトYAMLファイルの内容に一切影響しないことを検証します。
    """
    # Arrange
    test_client.post("/psm/save-prompts", json={
        "file": "my_prompts.yaml",
        "positive": [{"id": 1, "text": "1girl"}],
        "negative": [],
    })

    # Act
    test_client.post("/psm/generation-profiles", json={
        "profiles": [{"name": "P", "fields": ["checkpoint"], "settings": {"checkpoint": "x.safetensors"}, "updatedAt": "2026-08-01T00:00:00Z"}]
    })
    get_response = test_client.get("/psm/get-prompts?file=my_prompts.yaml")

    # Assert: プロンプトYAML側は変化しない
    assert get_response.json()["positive"] == [{"id": 1, "text": "1girl"}]

# -------------------------------------------------------------------------
# 保存高速化 (書き込みキャッシュ/デバウンスflush) のテスト
# -------------------------------------------------------------------------

def test_save_prompts_does_not_write_disk_immediately(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    /psm/save-prompts はディスクへの書き込みをデバウンスするため、
    レスポンスが返った直後の時点ではまだファイルへ反映されていないことを検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    target_path: str = os.path.join(save_dir, "debounced.yaml")

    # Act
    save_response = test_client.post("/psm/save-prompts", json={
        "file": "debounced.yaml",
        "positive": [{"id": 1, "text": "1girl"}],
        "negative": [],
    })

    # Assert: 応答は成功するが、ディスク上のファイルはまだ作成されていない
    assert save_response.status_code == 200
    assert save_response.json() == {"status": "success"}
    assert not os.path.exists(target_path)

def test_save_prompts_flush_prompts_endpoint_writes_disk(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    /psm/flush-prompts を呼ぶと、保留中のキャッシュ内容が即座にディスクへ書き込まれることを検証します。
    (ブラウザタブを閉じる直前の beforeunload + sendBeacon から使われる想定のエンドポイント)
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    target_path: str = os.path.join(save_dir, "flush_me.yaml")
    test_client.post("/psm/save-prompts", json={
        "file": "flush_me.yaml",
        "positive": [{"id": 1, "text": "1girl"}],
        "negative": [],
    })
    assert not os.path.exists(target_path)  # 前提: まだ書き込まれていない

    # Act
    flush_response = test_client.post("/psm/flush-prompts", json={"file": "flush_me.yaml"})

    # Assert
    assert flush_response.status_code == 200
    assert flush_response.json() == {"status": "success"}
    assert os.path.exists(target_path)
    with open(target_path, "r", encoding="utf-8") as f:
        saved = yaml.safe_load(f)
    assert saved["positive"] == [{"id": 1, "text": "1girl"}]

def test_get_prompts_reads_own_pending_write_from_cache(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    save-prompts 直後、ディスクへのflush前であっても /psm/get-prompts は
    キャッシュ経由で最新の内容を返すこと (read-your-own-writes) を検証します。
    """
    # Act
    test_client.post("/psm/save-prompts", json={
        "file": "readback.yaml",
        "positive": [{"id": 1, "text": "1girl"}],
        "negative": [],
    })
    get_response = test_client.get("/psm/get-prompts?file=readback.yaml")

    # Assert
    assert get_response.json()["positive"] == [{"id": 1, "text": "1girl"}]

def test_duplicate_file_copies_pending_unflushed_changes(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    複製元ファイルに保留中(未flush)のキャッシュ変更がある場合でも、
    複製先には最新の内容がコピーされることを検証します (古い内容のコピー事故を防止)。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    src_file: str = "src_pending.yaml"
    with open(os.path.join(save_dir, src_file), "w", encoding="utf-8") as f:
        yaml.dump({"positive": ["old"]}, f)

    # 保存はするがまだディスクへflushしない (キャッシュ上にのみ最新値がある状態)
    test_client.post("/psm/save-prompts", json={
        "file": src_file,
        "positive": ["new"],
        "negative": [],
    })

    # Act
    response = test_client.post("/psm/duplicate-file", json={"src": src_file, "dst": "copy_pending.yaml"})

    # Assert: 複製先には古い内容ではなく最新の内容が反映されている
    assert response.status_code == 200
    with open(os.path.join(save_dir, "copy_pending.yaml"), "r", encoding="utf-8") as f:
        copied = yaml.safe_load(f)
    assert copied["positive"] == ["new"]

def test_delete_file_pending_save_does_not_resurrect_file(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    ファイル作成直後(まだディスクへflushされていない)に削除しても、
    保留中だったflushタスクが後からファイルを復活させないことを検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    target_path: str = os.path.join(save_dir, "created_then_deleted.yaml")
    test_client.post("/psm/save-prompts", json={
        "file": "created_then_deleted.yaml",
        "positive": [{"id": 1, "text": "1girl"}],
        "negative": [],
    })
    assert not os.path.exists(target_path)  # 前提: まだディスクには存在しない

    # Act
    delete_response = test_client.delete("/psm/delete-file?file=created_then_deleted.yaml")

    # Assert: 削除は「ファイルが無い」ため失敗するが、以降も一切ファイルは作成されない
    assert delete_response.status_code == 200
    assert cache.get(Path(target_path).resolve()) is None
    assert not os.path.exists(target_path)

def test_shutdown_event_flushes_all_pending_caches(test_app: FastAPI, temp_extension_env: Path) -> None:
    """
    FastAPIのシャットダウンイベントで、保留中のキャッシュ変更が
    すべてディスクへ書き込まれることを検証します (WebUI通常終了・再起動時の保護)。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    target_path: str = os.path.join(save_dir, "shutdown_test.yaml")

    with TestClient(test_app) as client:
        client.post("/psm/save-prompts", json={
            "file": "shutdown_test.yaml",
            "positive": [{"id": 1, "text": "1girl"}],
            "negative": [],
        })
        # with ブロックを抜ける際に shutdown イベントが発火する
        assert not os.path.exists(target_path)

    # Assert: shutdownイベントの発火後はディスクへ書き込まれている
    assert os.path.exists(target_path)

# -------------------------------------------------------------------------
# 保存高速化フェーズC: YAML→JSON移行 のテスト
# -------------------------------------------------------------------------

def test_save_and_get_prompts_json_format(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    .json ファイルへの保存・取得が YAML と同様に正しく行えることを検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    prompt_payload: Dict[str, object] = {
        "file": "test_prompt.json",
        "positive": [{"id": 1, "text": "masterpiece"}],
        "negative": [{"id": 2, "text": "low quality"}],
    }

    # Act: 保存してflush
    test_client.post("/psm/save-prompts", json=prompt_payload)
    test_client.post("/psm/flush-prompts", json={"file": "test_prompt.json"})

    # Assert: ディスク上に実際にJSON形式で書き込まれていること
    target_path = os.path.join(save_dir, "test_prompt.json")
    assert os.path.exists(target_path)
    with open(target_path, "r", encoding="utf-8") as f:
        saved = json.load(f)
    assert saved["positive"] == prompt_payload["positive"]

    # Assert: get-prompts でも正しく取得できること
    get_response = test_client.get("/psm/get-prompts?file=test_prompt.json")
    assert get_response.json()["positive"] == prompt_payload["positive"]

def test_list_files_includes_both_yaml_and_json(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    /psm/list-files が .yaml と .json の両方を対象に含み、
    generation_profiles.json は除外することを検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    with open(os.path.join(save_dir, "old.yaml"), "w", encoding="utf-8") as f:
        f.write("positive: []\n")
    with open(os.path.join(save_dir, "new.json"), "w", encoding="utf-8") as f:
        json.dump({"positive": []}, f)
    test_client.post("/psm/generation-profiles", json={"profiles": []})

    # Act
    response = test_client.get("/psm/list-files")

    # Assert
    assert response.json() == {"files": ["new.json", "old.yaml"]}

def test_convert_to_json_creates_json_and_keeps_original_yaml(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    /psm/convert-to-json が既存の .yaml と同内容の .json を新規作成し、
    元の .yaml ファイルはそのまま残すことを検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    src_path = os.path.join(save_dir, "legacy.yaml")
    with open(src_path, "w", encoding="utf-8") as f:
        yaml.dump({"positive": [{"id": 1, "text": "1girl"}], "negative": []}, f)

    # Act
    response = test_client.post("/psm/convert-to-json", json={"src": "legacy.yaml"})

    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "success", "file": "legacy.json"}

    # 元のYAMLファイルは変更されずそのまま残る
    assert os.path.exists(src_path)

    # 新しいJSONファイルが同内容で作成されている
    dst_path = os.path.join(save_dir, "legacy.json")
    assert os.path.exists(dst_path)
    with open(dst_path, "r", encoding="utf-8") as f:
        converted = json.load(f)
    assert converted["positive"] == [{"id": 1, "text": "1girl"}]

def test_convert_to_json_reflects_unflushed_pending_changes(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    変換元に保留中(未flush)のキャッシュ変更がある場合でも、
    変換結果には最新の内容が反映されることを検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    with open(os.path.join(save_dir, "pending.yaml"), "w", encoding="utf-8") as f:
        yaml.dump({"positive": ["old"]}, f)

    # 保存はするがまだディスクへflushしない
    test_client.post("/psm/save-prompts", json={
        "file": "pending.yaml",
        "positive": ["new"],
        "negative": [],
    })

    # Act
    response = test_client.post("/psm/convert-to-json", json={"src": "pending.yaml"})

    # Assert
    assert response.status_code == 200
    with open(os.path.join(save_dir, "pending.json"), "r", encoding="utf-8") as f:
        converted = json.load(f)
    assert converted["positive"] == ["new"]

def test_convert_to_json_rejects_non_yaml_source(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    変換元が .yaml でない場合はエラーを返すことを検証します。
    """
    # Act
    response = test_client.post("/psm/convert-to-json", json={"src": "already.json"})

    # Assert
    assert response.status_code == 200
    assert response.json()["status"] == "error"

def test_convert_to_json_refuses_to_overwrite_existing_destination(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    変換先の .json が既に存在する場合は上書きせずエラーを返すことを検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    with open(os.path.join(save_dir, "dup.yaml"), "w", encoding="utf-8") as f:
        yaml.dump({"positive": []}, f)
    with open(os.path.join(save_dir, "dup.json"), "w", encoding="utf-8") as f:
        json.dump({"positive": ["existing"]}, f)

    # Act
    response = test_client.post("/psm/convert-to-json", json={"src": "dup.yaml"})

    # Assert: 既存のJSONは上書きされない
    assert response.json()["status"] == "error"
    with open(os.path.join(save_dir, "dup.json"), "r", encoding="utf-8") as f:
        untouched = json.load(f)
    assert untouched["positive"] == ["existing"]

def test_duplicate_file_defaults_to_source_extension_when_dst_has_none(test_client: TestClient, temp_extension_env: Path) -> None:
    """
    複製先の拡張子が省略された場合、.yaml固定ではなく複製元と同じ拡張子
    (.json) が補完されることを検証します。
    """
    # Arrange
    save_dir: str = str(config.get_psm_dir())
    os.makedirs(save_dir, exist_ok=True)
    with open(os.path.join(save_dir, "src.json"), "w", encoding="utf-8") as f:
        json.dump({"positive": ["x"]}, f)

    # Act
    response = test_client.post("/psm/duplicate-file", json={"src": "src.json", "dst": "copy_no_ext"})

    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    assert os.path.exists(os.path.join(save_dir, "copy_no_ext.json"))
    assert not os.path.exists(os.path.join(save_dir, "copy_no_ext.yaml"))
