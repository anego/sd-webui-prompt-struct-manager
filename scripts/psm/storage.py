import json
import shutil
import yaml
from pathlib import Path
from typing import Dict, List, Optional
from . import cache, config


def write_yaml(path: Path, data: cache.PromptFileData) -> None:
    """cache.flush から呼ばれる、YAML形式での実際のディスク書き込み処理。"""
    with path.open('w', encoding='utf-8') as f:
        yaml.dump(data, f, allow_unicode=True, sort_keys=False)

def write_json(path: Path, data: cache.PromptFileData) -> None:
    """cache.flush から呼ばれる、JSON形式での実際のディスク書き込み処理。
    YAMLよりパース/シリアライズが高速なため、新規ファイルの既定フォーマットとして使用する。"""
    with path.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def writer_for(path: Path) -> cache.FlushWriter:
    """拡張子に応じて実際のディスク書き込み関数を選択する。"""
    return write_json if path.suffix == '.json' else write_yaml

def list_prompt_files() -> List[str]:
    """
    セーブ先ディレクトリ内のすべてのプロンプトファイル (.yaml / .json) を昇順でソートして取得します。
    generation_profiles.json (プロンプトとは無関係の固定ファイル) は除外します。
    """
    try:
        d: Path = config.get_psm_dir()
        if not d.exists() or not d.is_dir():
            return []
        excluded: Path = config.get_generation_profiles_path().resolve()
        return sorted([
            f.name for f in d.iterdir()
            if f.is_file() and f.suffix in ('.yaml', '.json') and f.resolve() != excluded
        ])
    except Exception as e:
        print(f"[PSM ERROR] list_prompt_files failed: {e}")
        return []

def _load_from_disk(path: Path) -> Dict[str, object]:
    """
    ファイルをディスクから読み込み、dict として返す (壊れている/存在しない場合は空dict)。
    キャッシュミス時にのみ呼ばれる。拡張子に応じて YAML / JSON を判定する。
    """
    if not path.exists() or not path.is_file():
        return {}
    try:
        with path.open('r', encoding='utf-8') as f:
            loaded = json.load(f) if path.suffix == '.json' else yaml.safe_load(f)
        return loaded if isinstance(loaded, dict) else {}
    except Exception:
        return {}  # 壊れたファイルは新規データで上書きされる想定

def get_prompts_data(file_name: str) -> Dict[str, List[Dict[str, object]]]:
    """
    指定された YAML ファイルからプロンプトデータ（positive/negative/profiles）をロードします。
    キャッシュヒット時はディスクI/Oを行いません。
    """
    empty_structure: Dict[str, object] = {"positive": [], "negative": [], "profiles": [], "model_mode": "sd"}
    if not file_name:
        return empty_structure

    try:
        target_dir: Path = config.get_psm_dir()
        path: Path = (target_dir / file_name).resolve()

        data = cache.get(path)
        if data is None:
            if not path.exists() or not path.is_file():
                print(f"[PSM] File not found in get_prompts_data: {path}")
                return empty_structure
            data = _load_from_disk(path)
            cache.seed(path, data)

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
    プロンプトデータ（positive/negative/profiles/model_mode）をキャッシュへ即座に反映し、
    実際のディスクへの書き込みはデバウンスして後で行います (write-behind)。
    将来バージョンで追加された未知のルートキーは、初回ロード時のキャッシュシードを通じて保持されます。
    """
    if not file_name:
        return {"status": "error", "message": "Invalid file name"}

    try:
        target_dir: Path = config.get_psm_dir()
        path: Path = (target_dir / file_name).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)

        # 未知キー保持のため、キャッシュに無ければ一度だけディスクから読んでシードする
        if cache.get(path) is None:
            cache.seed(path, _load_from_disk(path))

        patch: Dict[str, object] = {
            "positive": positive_list,
            "negative": negative_list,
            "profiles": profiles_list if profiles_list is not None else [],
        }
        if model_mode in ("sd", "anima"):
            patch["model_mode"] = model_mode
        elif "model_mode" not in (cache.get(path) or {}):
            patch["model_mode"] = "sd"

        cache.update_and_schedule_flush(path, patch, writer_for(path))

        return {"status": "success"}
    except Exception as e:
        print(f"[PSM ERROR] save_prompts_data failed for {file_name}: {e}")
        return {"status": "error", "message": str(e)}

def _with_extension(name: str, reference_path: Path) -> str:
    """
    name が .yaml/.json いずれの拡張子も持たない場合、reference_path と同じ拡張子を補う。
    (複製・リネーム先の拡張子を、複製・リネーム元と同じ形式に揃えるため)
    """
    if name.endswith('.yaml') or name.endswith('.json'):
        return name
    return name + reference_path.suffix

def duplicate_yaml_file(src_name: str, dst_name: str) -> Dict[str, str]:
    """
    プロンプトファイルを別名で複製します（拡張子省略時は複製元と同じ形式を補完します）。
    """
    if not src_name or not dst_name:
        return {"status": "error", "message": "src or dst name is missing"}

    try:
        target_dir: Path = config.get_psm_dir()
        src_path: Path = (target_dir / src_name).resolve()

        # 複製元に保留中のキャッシュ変更があれば、コピーが古い内容にならないよう先に反映する
        cache.flush(src_path, writer_for(src_path))

        dst_name = _with_extension(dst_name, src_path)
        dst_path: Path = (target_dir / dst_name).resolve()

        shutil.copy2(src_path, dst_path)
        return {"status": "success"}
    except Exception as e:
        print(f"[PSM ERROR] duplicate_yaml_file failed: {e}")
        return {"status": "error", "message": str(e)}

def rename_yaml_file(src_name: str, dst_name: str) -> Dict[str, str]:
    """
    プロンプトファイルの名前を変更します（拡張子省略時は変更元と同じ形式を補完します）。
    """
    if not src_name or not dst_name:
        return {"status": "error", "message": "src or dst name is missing"}

    try:
        target_dir: Path = config.get_psm_dir()
        src_path: Path = (target_dir / src_name).resolve()

        # 保留中の変更を確定させてから rename する。rename後は旧パスのキャッシュを破棄し、
        # 新しい名前は次回アクセス時に素直に読み直させる
        cache.flush(src_path, writer_for(src_path))

        dst_name = _with_extension(dst_name, src_path)
        dst_path: Path = (target_dir / dst_name).resolve()

        src_path.rename(dst_path)
        cache.invalidate(src_path)
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

        # 保留中の flush タスクが削除後に発火してファイルを復活させないよう、
        # 削除の前に必ずキャッシュを無効化する (書き込みは行わない)
        cache.invalidate(path)

        if path.exists() and path.is_file():
            path.unlink()
            return {"status": "success"}
        return {"status": "error", "message": "File not found"}
    except Exception as e:
        print(f"[PSM ERROR] delete_yaml_file failed for {file_name}: {e}")
        return {"status": "error", "message": str(e)}

def convert_yaml_to_json(src_name: str, dst_name: Optional[str] = None) -> Dict[str, str]:
    """
    既存の .yaml ファイルを読み込み、同内容の .json ファイルとして新規に書き出します。
    元の .yaml ファイルはそのまま残ります (バックアップとして機能します)。
    """
    if not src_name:
        return {"status": "error", "message": "Invalid file name"}
    if not src_name.endswith('.yaml'):
        return {"status": "error", "message": "変換元は.yamlファイルである必要があります"}

    try:
        target_dir: Path = config.get_psm_dir()
        src_path: Path = (target_dir / src_name).resolve()

        # 変換元に保留中のキャッシュ変更があれば、変換結果が古い内容にならないよう先に反映する
        cache.flush(src_path, write_yaml)

        if not src_path.exists() or not src_path.is_file():
            return {"status": "error", "message": "File not found"}

        data = cache.get(src_path)
        if data is None:
            data = _load_from_disk(src_path)

        base_name = dst_name if dst_name else src_path.stem + '.json'
        if not base_name.endswith('.json'):
            base_name += '.json'
        dst_path: Path = (target_dir / base_name).resolve()

        if dst_path.exists():
            return {"status": "error", "message": f"{base_name} は既に存在します"}

        write_json(dst_path, data)
        return {"status": "success", "file": base_name}
    except Exception as e:
        print(f"[PSM ERROR] convert_yaml_to_json failed: {e}")
        return {"status": "error", "message": str(e)}

def get_generation_profiles_data() -> Dict[str, List[object]]:
    """
    生成設定プロファイル (Checkpoint/VAE/Sampler等) の一覧を generation_profiles.json から読み込みます。
    プロンプトファイル群とは独立したファイルのため、list_prompt_files() の対象には含まれません。
    """
    empty_structure: Dict[str, List[object]] = {"profiles": []}
    try:
        path: Path = config.get_generation_profiles_path()
        if not path.exists() or not path.is_file():
            return empty_structure

        with path.open('r', encoding='utf-8') as f:
            data = json.load(f)

        if not isinstance(data, dict):
            return empty_structure

        profiles = data.get("profiles")
        return {"profiles": profiles if isinstance(profiles, list) else []}
    except Exception as e:
        print(f"[PSM ERROR] get_generation_profiles_data failed: {e}")
        return empty_structure

def save_generation_profiles_data(profiles_list: List[object]) -> Dict[str, str]:
    """
    生成設定プロファイルの一覧を generation_profiles.json へ丸ごと上書き保存します。
    """
    try:
        path: Path = config.get_generation_profiles_path()
        path.parent.mkdir(parents=True, exist_ok=True)

        with path.open('w', encoding='utf-8') as f:
            json.dump({"profiles": profiles_list}, f, ensure_ascii=False, indent=2)

        return {"status": "success"}
    except Exception as e:
        print(f"[PSM ERROR] save_generation_profiles_data failed: {e}")
        return {"status": "error", "message": str(e)}
