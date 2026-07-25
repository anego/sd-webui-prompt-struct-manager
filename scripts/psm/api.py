import urllib.parse
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from typing import Dict, Union, Optional
import gradio as gr
from scripts.psm import config, storage, translate as translate_mod, tagdb

def register_api(demo: gr.Blocks, app: FastAPI) -> None:
    print("\n[PSM] Registering API endpoints (Ver2 Bulletproof API)...")

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        import traceback
        tb = traceback.format_exc()
        print(f"[PSM ERROR] Global Exception Caught:\n{tb}")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(exc), "traceback": tb}
        )

    @app.get("/psm/check-path")
    async def check_path(request: Request) -> JSONResponse:
        """
        指定されたパスの存在を確認します。
        ValidationError を防ぐため、Request から直接パラメータを抽出します。
        """
        try:
            params = request.query_params
            path: Optional[str] = params.get("path")
            if not path:
                return JSONResponse(content={"exists": False})
            
            from pathlib import Path
            p = Path(path)
            return JSONResponse(content={"exists": p.exists() and p.is_dir()})
        except Exception as e:
            print(f"[PSM ERROR] check-path failed: {e}")
            return JSONResponse(content={"exists": False})

    @app.get("/psm/pick-dir")
    async def pick_dir(request: Request) -> JSONResponse:
        """
        Tkinter ダイアログを表示してディレクトリを選択します。
        """
        try:
            import tkinter as tk
            from tkinter import filedialog
            
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            selected_path: str = filedialog.askdirectory(initialdir=str(config.get_psm_dir()))
            root.destroy()
            
            return JSONResponse(content={"path": selected_path if selected_path else None})
        except Exception as e:
            print(f"[PSM ERROR] pick-dir failed: {e}")
            return JSONResponse(content={"path": None})

    @app.get("/psm/get-config")
    async def get_config(request: Request) -> JSONResponse:
        """
        現在の設定データを返します。
        """
        try:
            data = config.get_config_data()
            return JSONResponse(content=data)
        except Exception as e:
            print(f"[PSM ERROR] get-config failed: {e}")
            return JSONResponse(content={"save_dir": "", "is_configured": False, "dev_mode": False})

    @app.post("/psm/set-config")
    async def set_config(request: Request) -> JSONResponse:
        """
        設定データを config.json に保存します。
        """
        try:
            body = await request.json()
            if not isinstance(body, dict):
                return JSONResponse(content={"status": "error", "message": "Invalid JSON body"})
            
            result = config.set_config_data(body)
            return JSONResponse(content=result)
        except Exception as e:
            print(f"[PSM ERROR] set-config failed: {e}")
            return JSONResponse(content={"status": "error", "message": str(e)})

    @app.get("/psm/list-files")
    async def list_files(request: Request) -> JSONResponse:
        """
        YAMLファイルの一覧を返します。
        """
        try:
            files = storage.list_yaml_files()
            return JSONResponse(content={"files": files})
        except Exception as e:
            print(f"[PSM ERROR] list-files failed: {e}")
            return JSONResponse(content={"files": []})

    @app.get("/psm/get-prompts")
    async def get_prompts(request: Request) -> JSONResponse:
        """
        指定された YAML ファイルからプロンプトをロードして返します。
        URLデコードを手動で安全に実行し、ValidationError / Unicode例外を 100% 回避します。
        """
        try:
            params = request.query_params
            raw_file: Optional[str] = params.get("file")
            print(f"[PSM Debug] get-prompts query parameter 'file': {repr(raw_file)}")
            
            if not raw_file:
                return JSONResponse(content={"positive": [], "negative": []})
                
            # 手動 URL デコード
            decoded_file = urllib.parse.unquote(raw_file)
            print(f"[PSM Debug] URL-decoded file name: {repr(decoded_file)}")
            
            data = storage.get_prompts_data(decoded_file)
            return JSONResponse(content=data)
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            print(f"[PSM ERROR] get-prompts failed:\n{tb}")
            return JSONResponse(content={"positive": [], "negative": []})

    @app.post("/psm/save-prompts")
    async def save_prompts(request: Request) -> JSONResponse:
        """
        プロンプトデータを YAML ファイルに書き込み保存します。
        """
        try:
            body = await request.json()
            if not isinstance(body, dict):
                return JSONResponse(content={"status": "error", "message": "Invalid JSON body"})
                
            file_name: Optional[str] = body.get("file")
            if not isinstance(file_name, str):
                return JSONResponse(content={"status": "error", "message": "Invalid file name"})
                
            # 手動 URL デコード（念のため）
            decoded_file = urllib.parse.unquote(file_name)
            
            positive_list = body.get("positive", [])
            negative_list = body.get("negative", [])
            profiles_list = body.get("profiles", [])
            model_mode = body.get("model_mode")

            result = storage.save_prompts_data(
                decoded_file,
                positive_list if isinstance(positive_list, list) else [],
                negative_list if isinstance(negative_list, list) else [],
                profiles_list if isinstance(profiles_list, list) else [],
                model_mode if isinstance(model_mode, str) else None
            )
            return JSONResponse(content=result)
        except Exception as e:
            print(f"[PSM ERROR] save-prompts failed: {e}")
            return JSONResponse(content={"status": "error", "message": str(e)})

    @app.post("/psm/translate")
    async def translate_prompt(request: Request) -> JSONResponse:
        """
        プロンプト原文を英語へ翻訳します (Phase 2.5)。
        バックエンドはステートレスな中継であり、翻訳設定 (config) は
        フロントエンド (localStorage) からリクエストごとに渡されます。
        """
        try:
            body = await request.json()
            if not isinstance(body, dict):
                return JSONResponse(content={"status": "error", "message": "Invalid JSON body"})

            text = body.get("text")
            cfg = body.get("config")

            if not isinstance(text, str) or not text.strip():
                return JSONResponse(content={"status": "error", "message": "翻訳する原文が空です。"})
            if not isinstance(cfg, dict):
                return JSONResponse(content={"status": "error", "message": "翻訳設定が不正です。"})

            result = translate_mod.translate(text, cfg)
            return JSONResponse(content={"status": "success", "text": result})
        except translate_mod.TranslateError as e:
            return JSONResponse(content={"status": "error", "message": str(e)})
        except Exception as e:
            print(f"[PSM ERROR] translate failed: {e}")
            return JSONResponse(content={"status": "error", "message": str(e)})

    @app.get("/psm/tagdb-status")
    async def tagdb_status(request: Request) -> JSONResponse:
        """
        タグDB (tagcomplete CSV) の利用可否を返します (Phase 5B)。
        初回呼び出しでロードがトリガーされます。
        """
        try:
            return JSONResponse(content=tagdb.get_status())
        except Exception as e:
            print(f"[PSM ERROR] tagdb-status failed: {e}")
            return JSONResponse(content={"available": False, "source": None, "entries": 0})

    @app.post("/psm/tag-categories")
    async def tag_categories(request: Request) -> JSONResponse:
        """
        タグのリストに対しPSMカテゴリを返します (Phase 5B)。
        """
        try:
            body = await request.json()
            if not isinstance(body, dict):
                return JSONResponse(content={"status": "error", "message": "Invalid JSON body"})
            tags = body.get("tags")
            if not isinstance(tags, list) or not tags:
                return JSONResponse(content={"status": "error", "message": "tags が空です。"})

            categories = tagdb.lookup(tags)
            # 一般タグのサブ分類 (取込時の細分化用。該当なしは null)
            subcategories = {t: tagdb.subcategory(t) for t in categories.keys()}
            return JSONResponse(content={
                "status": "success",
                "categories": categories,
                "subcategories": subcategories,
                "source": tagdb._source,
            })
        except RuntimeError as e:
            return JSONResponse(content={"status": "error", "message": str(e)})
        except Exception as e:
            print(f"[PSM ERROR] tag-categories failed: {e}")
            return JSONResponse(content={"status": "error", "message": str(e)})

    @app.post("/psm/duplicate-file")
    async def duplicate_file(request: Request) -> JSONResponse:
        """
        指定された YAML ファイルを複製します。
        """
        try:
            body = await request.json()
            if not isinstance(body, dict):
                return JSONResponse(content={"status": "error", "message": "Invalid JSON body"})
                
            src = body.get("src")
            dst = body.get("dst")
            if not isinstance(src, str) or not isinstance(dst, str):
                return JSONResponse(content={"status": "error", "message": "src or dst name is missing"})
                
            # 手動 URL デコード
            decoded_src = urllib.parse.unquote(src)
            decoded_dst = urllib.parse.unquote(dst)
            
            result = storage.duplicate_yaml_file(decoded_src, decoded_dst)
            return JSONResponse(content=result)
        except Exception as e:
            print(f"[PSM ERROR] duplicate-file failed: {e}")
            return JSONResponse(content={"status": "error", "message": str(e)})

    @app.post("/psm/rename-file")
    async def rename_file(request: Request) -> JSONResponse:
        """
        指定された YAML ファイルの名前を変更します。
        """
        try:
            body = await request.json()
            if not isinstance(body, dict):
                return JSONResponse(content={"status": "error", "message": "Invalid JSON body"})
                
            src = body.get("src")
            dst = body.get("dst")
            if not isinstance(src, str) or not isinstance(dst, str):
                return JSONResponse(content={"status": "error", "message": "src or dst name is missing"})
                
            # 手動 URL デコード
            decoded_src = urllib.parse.unquote(src)
            decoded_dst = urllib.parse.unquote(dst)
            
            result = storage.rename_yaml_file(decoded_src, decoded_dst)
            return JSONResponse(content=result)
        except Exception as e:
            print(f"[PSM ERROR] rename-file failed: {e}")
            return JSONResponse(content={"status": "error", "message": str(e)})

    @app.delete("/psm/delete-file")
    async def delete_file(request: Request) -> JSONResponse:
        """
        指定された YAML ファイルを削除します。
        """
        try:
            params = request.query_params
            raw_file: Optional[str] = params.get("file")
            if not raw_file:
                return JSONResponse(content={"status": "error", "message": "file parameter is missing"})
                
            # 手動 URL デコード
            decoded_file = urllib.parse.unquote(raw_file)
            
            result = storage.delete_yaml_file(decoded_file)
            return JSONResponse(content=result)
        except Exception as e:
            print(f"[PSM ERROR] delete-file failed: {e}")
            return JSONResponse(content={"status": "error", "message": str(e)})

    print("[PSM] API endpoints registered successfully.")
