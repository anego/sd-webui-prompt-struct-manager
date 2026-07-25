import shutil
import yaml
from pathlib import Path
from typing import Dict, List, Optional
from . import config

def list_yaml_files() -> List[str]:
    """
    セーブ先ディレクトリ内のすべての .yaml ファイルを昇順でソートして取得します。
    """
    try:
        d: Path = config.get_psm_dir()
        if not d.exists() or not d.is_dir():
            return []
        return sorted([f.name for f in d.iterdir() if f.is_file() and f.suffix == '.yaml'])
    except Exception as e:
        print(f"[PSM ERROR] list_yaml_files failed: {e}")
        return []

def get_prompts_data(file_name: str) -> Dict[str, List[Dict[str, object]]]:
    """
    指定された YAML ファイルからプロンプトデータ（positive/negative/profiles）をロードします。
    """
    empty_structure: Dict[str, object] = {"positive": [], "negative": [], "profiles": [], "model_mode": "sd"}
    if not file_name:
        return empty_structure

    try:
        target_dir: Path = config.get_psm_dir()
        path: Path = (target_dir / file_name).resolve()

        if not path.exists() or not path.is_file():
            print(f"[PSM] File not found in get_prompts_data: {path}")
            return empty_structure

        with path.open('r', encoding='utf-8') as f:
            data = yaml.safe_load(f)

        if not isinstance(data, dict):
            return empty_structure

        pos = data.get("positive")
        neg = data.get("negative")
        profiles = data.get("profiles")
        model_mode = data.get("model_mode")

        return {
            "positive": pos if isinstance(pos, list) else [],
            "negative": neg if isinstance(neg, list) else [],
            "profiles": profiles if isinstance(profiles, list) else [],
            # 未定義・不正値は "sd" にフォールバック (後方互換)
            "model_mode": model_mode if model_mode in ("sd", "anima") else "sd"
        }
    except Exception as e:
        print(f"[PSM ERROR] get_prompts_data failed for {file_name}: {e}")
        return empty_structure

def save_prompts_data(file_name: str, positive_list: List[object], negative_list: List[object], profiles_list: Optional[List[object]] = None, model_mode: Optional[str] = None) -> Dict[str, str]:
    """
    プロンプトデータ（positive/negative/profiles/model_mode）を YAML 形式で保存します。
    将来バージョンで追加された未知のルートキーは既存ファイルから引き継いで保持します。
    """
    if not file_name:
        return {"status": "error", "message": "Invalid file name"}

    try:
        target_dir: Path = config.get_psm_dir()
        path: Path = (target_dir / file_name).resolve()

        # ディレクトリの安全な作成
        path.parent.mkdir(parents=True, exist_ok=True)

        # 既存ファイルの未知キーを保持する (旧バージョンとの相互運用性のため)
        existing: Dict[str, object] = {}
        if path.exists() and path.is_file():
            try:
                with path.open('r', encoding='utf-8') as f:
                    loaded = yaml.safe_load(f)
                if isinstance(loaded, dict):
                    existing = loaded
            except Exception:
                pass  # 壊れたファイルは新規データで上書き

        existing.update({
            "positive": positive_list,
            "negative": negative_list,
            "profiles": profiles_list if profiles_list is not None else [],
        })
        if model_mode in ("sd", "anima"):
            existing["model_mode"] = model_mode
        elif "model_mode" not in existing:
            existing["model_mode"] = "sd"

        with path.open('w', encoding='utf-8') as f:
            yaml.dump(existing, f, allow_unicode=True, sort_keys=False)

        return {"status": "success"}
    except Exception as e:
        print(f"[PSM ERROR] save_prompts_data failed for {file_name}: {e}")
        return {"status": "error", "message": str(e)}

def duplicate_yaml_file(src_name: str, dst_name: str) -> Dict[str, str]:
    """
    YAML ファイルを別名で複製します（.yaml 拡張子の補完を行います）。
    """
    if not src_name or not dst_name:
        return {"status": "error", "message": "src or dst name is missing"}

    try:
        target_dir: Path = config.get_psm_dir()
        src_path: Path = (target_dir / src_name).resolve()
        
        if not dst_name.endswith('.yaml'):
            dst_name += '.yaml'
        dst_path: Path = (target_dir / dst_name).resolve()
        
        shutil.copy2(src_path, dst_path)
        return {"status": "success"}
    except Exception as e:
        print(f"[PSM ERROR] duplicate_yaml_file failed: {e}")
        return {"status": "error", "message": str(e)}

def rename_yaml_file(src_name: str, dst_name: str) -> Dict[str, str]:
    """
    YAML ファイルの名前を変更します（.yaml 拡張子の補完を行います）。
    """
    if not src_name or not dst_name:
        return {"status": "error", "message": "src or dst name is missing"}

    try:
        target_dir: Path = config.get_psm_dir()
        src_path: Path = (target_dir / src_name).resolve()
        
        if not dst_name.endswith('.yaml'):
            dst_name += '.yaml'
        dst_path: Path = (target_dir / dst_name).resolve()
        
        src_path.rename(dst_path)
        return {"status": "success"}
    except Exception as e:
        print(f"[PSM ERROR] rename_yaml_file failed: {e}")
        return {"status": "error", "message": str(e)}

def delete_yaml_file(file_name: str) -> Dict[str, str]:
    """
    YAML ファイルを削除します。
    """
    if not file_name:
        return {"status": "error", "message": "file_name is missing"}

    try:
        target_dir: Path = config.get_psm_dir()
        path: Path = (target_dir / file_name).resolve()
        
        if path.exists() and path.is_file():
            path.unlink()
            return {"status": "success"}
        return {"status": "error", "message": "File not found"}
    except Exception as e:
        print(f"[PSM ERROR] delete_yaml_file failed for {file_name}: {e}")
        return {"status": "error", "message": str(e)}
