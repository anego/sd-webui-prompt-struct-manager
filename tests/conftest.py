import os
import sys
from unittest.mock import MagicMock
import pytest

# -------------------------------------------------------------------------
# SD WebUI 内部モジュールのモック化
# -------------------------------------------------------------------------
# SD WebUI 環境外でユニットテストを実行する際、modules モジュールが存在しないため
# sys.modules にモック（ダミー）を注入して ImportError を防ぎます。
# -------------------------------------------------------------------------

from types import SimpleNamespace

from pathlib import Path
from typing import Generator

mock_modules = MagicMock()
mock_shared = MagicMock()
mock_shared.opts = SimpleNamespace()
mock_script_callbacks = MagicMock()

# from modules import shared, script_callbacks が正しくこれらを参照するように、
# 親モックの属性として明示的にセットします。
mock_modules.shared = mock_shared
mock_modules.script_callbacks = mock_script_callbacks

sys.modules["modules"] = mock_modules
sys.modules["modules.shared"] = mock_shared
sys.modules["modules.script_callbacks"] = mock_script_callbacks

# モックを注入した後に scripts.psm_extension を安全にインポートします
from scripts import psm_extension
from scripts.psm import config

@pytest.fixture
def temp_extension_env(tmp_path: Path) -> Generator[Path, None, None]:
    """
    拡張機能の動作環境（設定ファイルやデータディレクトリ）をテスト用の一時ディレクトリに偽装するフィクスチャ。
    実際のプロジェクト環境（config.json や psm_data フォルダ）への読み書きを防ぎ、
    完全に独立したテスト環境を構築します。
    """
    # テスト前の元の状態を保持
    original_extension_dir = config.EXTENSION_DIR
    original_default_dir = config.DEFAULT_DIR

    # 一時ディレクトリにパスを上書き
    config.EXTENSION_DIR = tmp_path
    config.DEFAULT_DIR = tmp_path / "psm_data"

    # shared.opts の設定を初期化（テスト間で legacy パスが漏洩するのを防止）
    if hasattr(mock_shared.opts, "psm_save_dir"):
        del mock_shared.opts.psm_save_dir

    yield tmp_path

    # テスト終了後に元の状態へクリーンアップ
    config.EXTENSION_DIR = original_extension_dir
    config.DEFAULT_DIR = original_default_dir
    
    if hasattr(mock_shared.opts, "psm_save_dir"):
        del mock_shared.opts.psm_save_dir

