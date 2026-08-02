import os
import json
from pathlib import Path
from typing import Dict, Union, Optional

# グローバルパス定数
EXTENSION_DIR: Path = Path(__file__).resolve().parent.parent.parent
DEFAULT_DIR: Path = EXTENSION_DIR / "psm_data"

def get_psm_dir() -> Path:
    """
    YAMLファイルが保存されているディレクトリの絶対パスを解決します。
    """
    config_path: Path = EXTENSION_DIR / "config.json"
    if config_path.exists() and config_path.is_file():
        try:
            with config_path.open('r', encoding='utf-8') as f:
                data: dict = json.load(f)
                path: Optional[str] = data.get("save_dir")
                if path and path.strip():
                    return Path(path.strip()).resolve()
        except Exception as e:
            print(f"[PSM ERROR] Failed to read config.json in get_psm_dir: {e}")

    # Fallback (legacy support, read-only)
    try:
        from modules import shared
        path_opt: Optional[str] = getattr(shared.opts, "psm_save_dir", "")
        if path_opt and path_opt.strip():
            return Path(path_opt.strip()).resolve()
    except Exception:
        pass

    return DEFAULT_DIR.resolve()

def get_generation_profiles_path() -> Path:
    """
    生成設定プロファイル (Checkpoint/VAE/Sampler等) の保存先パスを解決します。
    プロンプトYAML群とは独立して、保存先ディレクトリ直下の固定ファイル名で管理します。
    """
    return get_psm_dir() / "generation_profiles.json"

def get_config_data() -> Dict[str, Union[bool, str]]:
    """config.json から設定データを取得します。
    is_configured は config.json 自体の存在有無で決定します。"""
    config_path: Path = EXTENSION_DIR / "config.json"
    exists: bool = config_path.exists() and config_path.is_file()
    
    loaded_data: Dict[str, Union[bool, str]] = {
        "save_dir": str(get_psm_dir()), 
        "is_configured": exists, 
        "dev_mode": False
    }
    
    if not exists:
        return loaded_data
        
    try:
        with config_path.open('r', encoding='utf-8') as f:
            file_data: dict = json.load(f)
            loaded_data.update(file_data)
    except Exception as e:
        print(f"[PSM ERROR] Failed to read config.json: {e}")
        
    return loaded_data

def set_config_data(data: Dict[str, Union[bool, str]]) -> Dict[str, str]:
    """
    拡張設定を config.json に書き込み保存します。
    """
    config_path: Path = EXTENSION_DIR / "config.json"
    current_data: Dict[str, Union[bool, str]] = {}
    
    if config_path.exists() and config_path.is_file():
        try:
            with config_path.open('r', encoding='utf-8') as f:
                current_data = json.load(f)
        except Exception:
            pass
            
    current_data.update(data)
    
    try:
        with config_path.open('w', encoding='utf-8') as f:
            json.dump(current_data, f, indent=2)
    except Exception as e:
        print(f"[PSM ERROR] Failed to save config.json: {e}")
        return {"status": "error", "message": str(e)}
        
    return {"status": "success"}
