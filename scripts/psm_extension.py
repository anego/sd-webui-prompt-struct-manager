import os
import yaml
import shutil
import tkinter as tk
from tkinter import filedialog
from fastapi import FastAPI, Body, Query
import gradio as gr
from modules import shared, script_callbacks

# パス設定
EXTENSION_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEFAULT_DIR = os.path.join(EXTENSION_DIR, "psm_data")

def get_psm_dir():
    # 1. Try config.json
    config_path = os.path.join(EXTENSION_DIR, "config.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                import json
                data = json.load(f)
                path = data.get("save_dir")
                if path and path.strip():
                    return path
        except:
            pass

    # 2. Fallback to shared.opts (legacy support, read-only)
    path = getattr(shared.opts, "psm_save_dir", "")
    if path and path.strip():
        return path

    # 3. Default
    return DEFAULT_DIR

# def on_ui_settings():
#     section = ("psm", "Prompt Struct Manager")
#     shared.opts.add_option(
#         "psm_save_dir",
#         shared.OptionInfo("", "PSM: Save directory for YAML files (Absolute Path)", section=section)
#     )

def on_after_component(component, **kwargs):
    if component.elem_id in ["txt2img_styles_row", "img2img_styles_row"]:
        with gr.Row(elem_classes="psm-python-row-container"):
            psm_btn = gr.Button(
                "Prompt Struct Manager (PSM)", 
                elem_classes="psm-btn-python-native",
                variant="secondary"
            )
            psm_btn.click(fn=None, _js="() => { window.dispatchEvent(new CustomEvent('psm-toggle')); return []; }")

def psm_api(demo: gr.Blocks, app: FastAPI):
    print("\n[PSM] Registering API endpoints...") # 起動時にログを表示

    @app.get("/psm/check-path")
    async def check_path(path: str = Query(...)):
        return {"exists": os.path.exists(path) and os.path.isdir(path)}

    @app.get("/psm/pick-dir")
    async def pick_dir():
        root = tk.Tk(); root.withdraw(); root.attributes('-topmost', True)
        selected_path = filedialog.askdirectory(initialdir=get_psm_dir())
        root.destroy()
        return {"path": selected_path if selected_path else None}

    @app.get("/psm/get-config")
    async def get_config():
        config_path = os.path.join(EXTENSION_DIR, "config.json")
        
        # is_configured is determined by the existence of config.json
        exists = os.path.exists(config_path)
        
        # save_dir attempts to resolve legacy path for pre-filling, but is_configured remains False if config.json is missing
        loaded_data = {
            "save_dir": get_psm_dir(), 
            "is_configured": exists, 
            "dev_mode": False
        }
        
        if exists:
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    import json
                    file_data = json.load(f)
                    # merge file data
                    loaded_data.update(file_data)
            except:
                pass
        return loaded_data

    @app.post("/psm/set-config")
    async def set_config(data: dict = Body(...)):
        # Save extended config to config.json
        config_path = os.path.join(EXTENSION_DIR, "config.json")
        current_data = {}
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    import json
                    current_data = json.load(f)
            except:
                pass
        
        current_data.update(data)
        
        try:
            with open(config_path, 'w', encoding='utf-8') as f:
                import json
                json.dump(current_data, f, indent=2)
        except Exception as e:
            print(f"[PSM] Failed to save config.json: {e}")
            return {"status": "error", "message": str(e)}
            
        return {"status": "success"}

    @app.get("/psm/list-files")
    async def list_files():
        d = get_psm_dir()
        if not os.path.exists(d): return {"files": []}
        return {"files": sorted([f for f in os.listdir(d) if f.endswith('.yaml')])}

    @app.get("/psm/get-prompts")
    async def get_prompts(file: str):
        path = os.path.join(get_psm_dir(), file)
        if not os.path.exists(path): return {"positive": [], "negative": []}
        with open(path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f) or {"positive": [], "negative": []}

    @app.post("/psm/save-prompts")
    async def save_prompts(data: dict = Body(...)):
        path = os.path.join(get_psm_dir(), data.get("file"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            with open(path, 'w', encoding='utf-8') as f:
                yaml.dump({"positive": data.get("positive", []), "negative": data.get("negative", [])}, f, allow_unicode=True, sort_keys=False)
            return {"status": "success"}
        except Exception as e: return {"status": "error", "message": str(e)}

    @app.post("/psm/duplicate-file")
    async def duplicate_file(data: dict = Body(...)):
        target_dir = get_psm_dir()
        src_path = os.path.join(target_dir, data.get("src"))
        dst_name = data.get("dst")
        if not dst_name.endswith('.yaml'): dst_name += '.yaml'
        shutil.copy2(src_path, os.path.join(target_dir, dst_name))
        return {"status": "success"}

    @app.post("/psm/rename-file")
    async def rename_file(data: dict = Body(...)):
        target_dir = get_psm_dir()
        src_path = os.path.join(target_dir, data.get("src"))
        dst_name = data.get("dst")
        if not dst_name.endswith('.yaml'): dst_name += '.yaml'
        os.rename(src_path, os.path.join(target_dir, dst_name))
        return {"status": "success"}

    @app.delete("/psm/delete-file")
    async def delete_file(file: str = Query(...)):
        path = os.path.join(get_psm_dir(), file)
        if os.path.exists(path): os.remove(path); return {"status": "success"}
        return {"status": "error"}

    print("[PSM] API endpoints registered successfully.")

# コールバック登録
# script_callbacks.on_ui_settings(on_ui_settings) # Removed as per user request
script_callbacks.on_after_component(on_after_component)
script_callbacks.on_app_started(psm_api)