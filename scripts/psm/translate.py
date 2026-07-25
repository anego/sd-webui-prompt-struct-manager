"""
プロンプト翻訳モジュール (Phase 2.5)

provider抽象化により、OpenAI互換API (Ollama / LM Studio / llama.cpp server /
OpenAI / OpenRouter 等) と DeepL API を同一インターフェースで扱います。
バックエンドはステートレスであり、翻訳設定はリクエストごとにフロントエンド
(localStorage) から渡されます。

新しいプロバイダを追加する場合は `_translate_<name>(text, cfg)` を実装し、
`PROVIDERS` に登録するだけで済みます。
"""

import re
from typing import Callable, Dict, Optional

import requests

# 内蔵デフォルトのシステムプロンプト (設定側で上書き可能)
DEFAULT_SYSTEM_PROMPT = (
    "You are a translator for image-generation prompts. "
    "Translate the user's text into natural English suitable as a text-to-image prompt. "
    "Output ONLY the translation. No explanations, no quotes. Keep proper nouns as-is."
)

DEFAULT_TIMEOUT_SEC = 30
MIN_TIMEOUT_SEC = 5
MAX_TIMEOUT_SEC = 120


class TranslateError(Exception):
    """翻訳処理の失敗を表す例外。message はそのままUIに表示されます。"""


# -------------------------------------------------------------------------
# バリデーション
# -------------------------------------------------------------------------

def validate_endpoint(endpoint: Optional[str]) -> str:
    """
    エンドポイントURLを検証します。
    SSRF対策として http/https 以外のスキームは拒否します。
    """
    if not endpoint or not isinstance(endpoint, str):
        raise TranslateError("エンドポイントURLが設定されていません。")
    endpoint = endpoint.strip().rstrip("/")
    if not re.match(r"^https?://", endpoint):
        raise TranslateError("エンドポイントURLは http:// または https:// で始まる必要があります。")
    return endpoint


def _get_timeout(cfg: Dict) -> int:
    try:
        timeout = int(cfg.get("timeout_sec", DEFAULT_TIMEOUT_SEC))
    except (TypeError, ValueError):
        timeout = DEFAULT_TIMEOUT_SEC
    return max(MIN_TIMEOUT_SEC, min(MAX_TIMEOUT_SEC, timeout))


# -------------------------------------------------------------------------
# 応答サニタイズ
# -------------------------------------------------------------------------

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_FENCE_RE = re.compile(r"^```[a-zA-Z]*\s*|```\s*$")
_PREFIX_RE = re.compile(r"^(translation|translated text|english|訳文|翻訳)\s*[:：]\s*", re.IGNORECASE)


def sanitize_response(text: str, source_text: Optional[str] = None) -> str:
    """
    LLM応答から翻訳文のみを取り出します。

    - <think>...</think> ブロックの除去 (Qwen3系のthinking出力対策)
    - コードフェンス・「Translation:」等の前置きの除去
    - 前後の引用符の除去
    - 空応答・原文と同一の応答はエラー
    """
    if text is None:
        raise TranslateError("翻訳サービスから空の応答が返されました。")

    result = _THINK_RE.sub("", text).strip()
    result = _FENCE_RE.sub("", result).strip()
    result = _PREFIX_RE.sub("", result).strip()

    # 前後が対になった引用符のみ除去 (文中の引用符は保持)
    for quote in ('"', "'", "“”", "「」"):
        if len(quote) == 1:
            open_q = close_q = quote
        else:
            open_q, close_q = quote[0], quote[1]
        if len(result) >= 2 and result.startswith(open_q) and result.endswith(close_q):
            result = result[1:-1].strip()

    if not result:
        raise TranslateError("翻訳結果が空でした。モデルやプロンプト設定を確認してください。")

    if source_text is not None and result.strip() == source_text.strip():
        raise TranslateError("翻訳結果が原文と同一でした。モデルが翻訳に対応しているか確認してください。")

    return result


# -------------------------------------------------------------------------
# プロバイダ実装
# -------------------------------------------------------------------------

def _translate_openai(text: str, cfg: Dict) -> str:
    """
    OpenAI互換API (chat/completions) による翻訳。
    Ollama / LM Studio / llama.cpp server / OpenAI / OpenRouter 等で共通。
    """
    endpoint = validate_endpoint(cfg.get("endpoint"))
    model = (cfg.get("model") or "").strip()
    if not model:
        raise TranslateError("モデル名が設定されていません。")

    system_prompt = (cfg.get("system_prompt") or "").strip() or DEFAULT_SYSTEM_PROMPT

    headers = {"Content-Type": "application/json"}
    api_key = (cfg.get("api_key") or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text},
        ],
        "temperature": 0.2,
        "stream": False,
    }

    resp = requests.post(
        f"{endpoint}/chat/completions",
        json=payload,
        headers=headers,
        timeout=_get_timeout(cfg),
    )
    _raise_for_status(resp)

    try:
        content = resp.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError):
        raise TranslateError("翻訳サービスの応答形式が不正です。エンドポイントがOpenAI互換か確認してください。")

    return sanitize_response(content, source_text=text)


def _translate_deepl(text: str, cfg: Dict) -> str:
    """
    DeepL API (v2/translate) による翻訳。model / system_prompt は使用しません。
    翻訳先言語は cfg["target_lang"] で指定できます (既定: EN)。
    """
    endpoint = validate_endpoint(cfg.get("endpoint"))
    api_key = (cfg.get("api_key") or "").strip()
    if not api_key:
        raise TranslateError("DeepLのAPIキーが設定されていません。")

    target_lang = (cfg.get("target_lang") or "EN").strip().upper()
    if not re.match(r"^[A-Z]{2}(-[A-Z]{2})?$", target_lang):
        raise TranslateError(f"翻訳先言語の指定が不正です: {target_lang}")

    resp = requests.post(
        f"{endpoint}/translate",
        json={"text": [text], "target_lang": target_lang},
        headers={
            "Content-Type": "application/json",
            "Authorization": f"DeepL-Auth-Key {api_key}",
        },
        timeout=_get_timeout(cfg),
    )
    _raise_for_status(resp)

    try:
        translated = resp.json()["translations"][0]["text"]
    except (KeyError, IndexError, TypeError, ValueError):
        raise TranslateError("DeepLの応答形式が不正です。")

    return sanitize_response(translated, source_text=text)


def _extract_error_detail(resp) -> str:
    """サーバー応答ボディからエラー詳細を取り出します (OpenAI互換の error 形式に対応)。"""
    try:
        data = resp.json()
        err = data.get("error")
        if isinstance(err, dict):
            return str(err.get("message") or "")
        if isinstance(err, str):
            return err
        if isinstance(data.get("message"), str):
            return data["message"]
    except Exception:
        pass
    return ""


def _raise_for_status(resp) -> None:
    """HTTPステータスをユーザー向けメッセージ付きの例外へ変換します。"""
    if resp.status_code < 400:
        return
    detail = _extract_error_detail(resp)
    suffix = f" 詳細: {detail}" if detail else ""
    if resp.status_code in (401, 403):
        raise TranslateError(f"認証に失敗しました。APIキーが正しいか確認してください。{suffix}")
    if resp.status_code == 404:
        raise TranslateError(f"モデルまたはエンドポイントが見つかりません (404)。URLとモデル名を確認してください。{suffix}")
    if resp.status_code == 429:
        raise TranslateError(f"レート制限に達しました。しばらく待ってから再試行してください。{suffix}")
    raise TranslateError(f"翻訳サービスがエラーを返しました (HTTP {resp.status_code})。{suffix}")


PROVIDERS: Dict[str, Callable[[str, Dict], str]] = {
    "openai": _translate_openai,
    "deepl": _translate_deepl,
    # 将来拡張: "mcp": _translate_mcp (Streamable HTTP限定を想定)
}


# -------------------------------------------------------------------------
# 公開インターフェース
# -------------------------------------------------------------------------

def translate(text: str, cfg: Dict) -> str:
    """
    設定 cfg に従って text を英語へ翻訳します。

    Raises:
        TranslateError: 設定不備・接続失敗・応答不正のとき (messageはUI表示用)
    """
    if not text or not isinstance(text, str) or not text.strip():
        raise TranslateError("翻訳する原文が空です。")
    if not isinstance(cfg, dict):
        raise TranslateError("翻訳設定が不正です。")

    provider = (cfg.get("provider") or "openai").strip().lower()
    handler = PROVIDERS.get(provider)
    if handler is None:
        raise TranslateError(f"未対応のプロバイダです: {provider}")

    try:
        return handler(text.strip(), cfg)
    except TranslateError:
        raise
    except requests.exceptions.ConnectTimeout:
        raise TranslateError("翻訳サーバーへの接続がタイムアウトしました。")
    except requests.exceptions.ReadTimeout:
        raise TranslateError("翻訳サーバーの応答がタイムアウトしました。モデルのロード状況を確認してください。")
    except requests.exceptions.ConnectionError:
        raise TranslateError("翻訳サーバーに接続できません。Ollama / LM Studio が起動しているか確認してください。")
    except Exception as e:
        raise TranslateError(f"翻訳中に予期しないエラーが発生しました: {e}")
