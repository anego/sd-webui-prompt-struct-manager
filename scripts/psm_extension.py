import sys
from pathlib import Path

# インポート解決のための防御壁：scripts ディレクトリと親ディレクトリを sys.path に確実に追加
SCRIPTS_DIR: str = str(Path(__file__).resolve().parent)
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

try:
    # 1. 最も標準的な WebUI での絶対インポートを試行
    from scripts.psm import api
except ImportError:
    try:
        # 2. scripts_dir が sys.path にある場合のインポートを試行
        from psm import api
    except ImportError as e:
        print(f"[PSM ERROR] Failed to import psm module: {e}")
        raise e

import gradio as gr
from fastapi import FastAPI
from modules import script_callbacks

# コールバック定義
def on_after_component(component: gr.components.Component, **kwargs: object) -> None:
    if component.elem_id in ["txt2img_styles_row", "img2img_styles_row"]:
        with gr.Row(elem_classes="psm-python-row-container"):
            psm_btn = gr.Button(
                "Prompt Struct Manager (PSM)", 
                elem_classes="psm-btn-python-native",
                variant="secondary"
            )
            psm_btn.click(fn=None, _js="() => { window.dispatchEvent(new CustomEvent('psm-toggle')); return []; }")

def psm_api(demo: gr.Blocks, app: FastAPI) -> None:
    # Ver2 の安全な API エンドポイント群を登録
    api.register_api(demo, app)

# コールバック登録
script_callbacks.on_after_component(on_after_component)
script_callbacks.on_app_started(psm_api)