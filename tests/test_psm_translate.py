"""
翻訳モジュール (scripts/psm/translate.py) のユニットテスト (Phase 2.5)

外部HTTPは unittest.mock で完全にモックし、ネットワークアクセスなしで実行できます。
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi import FastAPI
from fastapi.testclient import TestClient

# conftest.py で sys.modules へのモック注入が完了しているため安全にインポート可能
from scripts import psm_extension
from scripts.psm import translate as T


@pytest.fixture
def test_app() -> FastAPI:
    """PSM APIエンドポイントを登録したテスト用 FastAPI アプリ"""
    app: FastAPI = FastAPI()
    psm_extension.psm_api(MagicMock(), app)
    return app


@pytest.fixture
def test_client(test_app: FastAPI) -> TestClient:
    return TestClient(test_app)


# -------------------------------------------------------------------------
# ヘルパー
# -------------------------------------------------------------------------

def make_resp(status_code=200, data=None):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = data or {}
    return resp


OPENAI_CFG = {
    "provider": "openai",
    "endpoint": "http://localhost:1234/v1",
    "model": "test-model",
    "api_key": "",
    "timeout_sec": 30,
    "system_prompt": "",
}

DEEPL_CFG = {
    "provider": "deepl",
    "endpoint": "https://api-free.deepl.com/v2",
    "api_key": "test-key",
    "timeout_sec": 30,
}


# -------------------------------------------------------------------------
# 応答サニタイズ
# -------------------------------------------------------------------------

class TestSanitizeResponse:
    def test_think_block_removed(self) -> None:
        """Qwen3系の <think> ブロックが除去されること"""
        assert T.sanitize_response("<think>reasoning</think>A cat.") == "A cat."

    def test_multiline_think_removed(self) -> None:
        assert T.sanitize_response("<THINK>\nfoo\nbar\n</THINK>\n Hello ") == "Hello"

    def test_surrounding_quotes_removed(self) -> None:
        assert T.sanitize_response('"A girl smiles."') == "A girl smiles."

    def test_inner_quotes_kept(self) -> None:
        assert T.sanitize_response('She said "hi" loudly') == 'She said "hi" loudly'

    def test_prefix_removed(self) -> None:
        assert T.sanitize_response("Translation: A cat.") == "A cat."

    def test_code_fence_removed(self) -> None:
        assert T.sanitize_response("```\nA cat.\n```") == "A cat."

    def test_empty_response_raises(self) -> None:
        with pytest.raises(T.TranslateError, match="空"):
            T.sanitize_response("<think>only thinking</think>")

    def test_identical_to_source_raises(self) -> None:
        with pytest.raises(T.TranslateError, match="同一"):
            T.sanitize_response("猫です", source_text="猫です")


# -------------------------------------------------------------------------
# エンドポイント検証 (SSRF対策)
# -------------------------------------------------------------------------

class TestValidateEndpoint:
    def test_http_ok(self) -> None:
        assert T.validate_endpoint("http://localhost:11434/v1") == "http://localhost:11434/v1"

    def test_trailing_slash_stripped(self) -> None:
        assert T.validate_endpoint("http://localhost:11434/v1/") == "http://localhost:11434/v1"

    def test_file_scheme_rejected(self) -> None:
        with pytest.raises(T.TranslateError):
            T.validate_endpoint("file:///etc/passwd")

    def test_empty_rejected(self) -> None:
        with pytest.raises(T.TranslateError):
            T.validate_endpoint("")


# -------------------------------------------------------------------------
# OpenAI互換プロバイダ
# -------------------------------------------------------------------------

class TestOpenAIProvider:
    @patch.object(T.requests, "post")
    def test_translate_success(self, mock_post: MagicMock) -> None:
        """正常系: chat/completions を正しいペイロードで呼び、応答をサニタイズして返すこと"""
        mock_post.return_value = make_resp(200, {
            "choices": [{"message": {"content": "<think>t</think>An anime girl."}}]
        })

        result = T.translate("アニメの女の子", OPENAI_CFG)

        assert result == "An anime girl."
        args, kwargs = mock_post.call_args
        assert args[0] == "http://localhost:1234/v1/chat/completions"
        assert kwargs["json"]["model"] == "test-model"
        assert kwargs["json"]["messages"][1]["content"] == "アニメの女の子"
        assert "Authorization" not in kwargs["headers"]  # キー空ならAuthヘッダなし
        assert kwargs["timeout"] == 30

    @patch.object(T.requests, "post")
    def test_bearer_header_with_api_key(self, mock_post: MagicMock) -> None:
        mock_post.return_value = make_resp(200, {"choices": [{"message": {"content": "ok output"}}]})
        T.translate("テスト", {**OPENAI_CFG, "api_key": "sk-test"})
        assert mock_post.call_args.kwargs["headers"]["Authorization"] == "Bearer sk-test"

    @patch.object(T.requests, "post")
    def test_custom_system_prompt(self, mock_post: MagicMock) -> None:
        mock_post.return_value = make_resp(200, {"choices": [{"message": {"content": "ok output"}}]})
        T.translate("テスト", {**OPENAI_CFG, "system_prompt": "Custom instruction"})
        assert mock_post.call_args.kwargs["json"]["messages"][0]["content"] == "Custom instruction"

    def test_missing_model_raises(self) -> None:
        with pytest.raises(T.TranslateError, match="モデル名"):
            T.translate("x", {**OPENAI_CFG, "model": ""})

    @patch.object(T.requests, "post")
    def test_malformed_response_raises(self, mock_post: MagicMock) -> None:
        mock_post.return_value = make_resp(200, {"unexpected": True})
        with pytest.raises(T.TranslateError, match="応答形式"):
            T.translate("x", OPENAI_CFG)


# -------------------------------------------------------------------------
# DeepLプロバイダ
# -------------------------------------------------------------------------

class TestDeepLProvider:
    @patch.object(T.requests, "post")
    def test_translate_success(self, mock_post: MagicMock) -> None:
        mock_post.return_value = make_resp(200, {"translations": [{"text": "A white cat."}]})

        result = T.translate("白い猫", DEEPL_CFG)

        assert result == "A white cat."
        args, kwargs = mock_post.call_args
        assert args[0] == "https://api-free.deepl.com/v2/translate"
        assert kwargs["headers"]["Authorization"] == "DeepL-Auth-Key test-key"
        assert kwargs["json"] == {"text": ["白い猫"], "target_lang": "EN"}

    def test_missing_api_key_raises(self) -> None:
        with pytest.raises(T.TranslateError, match="APIキー"):
            T.translate("x", {**DEEPL_CFG, "api_key": ""})


# -------------------------------------------------------------------------
# エラーマッピング
# -------------------------------------------------------------------------

class TestErrorMapping:
    @patch.object(T.requests, "post")
    def test_401_maps_to_auth_error(self, mock_post: MagicMock) -> None:
        mock_post.return_value = make_resp(401)
        with pytest.raises(T.TranslateError, match="認証"):
            T.translate("x", OPENAI_CFG)

    @patch.object(T.requests, "post")
    def test_500_maps_to_http_error(self, mock_post: MagicMock) -> None:
        mock_post.return_value = make_resp(500)
        with pytest.raises(T.TranslateError, match="HTTP 500"):
            T.translate("x", OPENAI_CFG)

    @patch.object(T.requests, "post")
    def test_connection_error_message(self, mock_post: MagicMock) -> None:
        mock_post.side_effect = T.requests.exceptions.ConnectionError()
        with pytest.raises(T.TranslateError, match="起動しているか"):
            T.translate("x", OPENAI_CFG)

    def test_unknown_provider_raises(self) -> None:
        with pytest.raises(T.TranslateError, match="未対応"):
            T.translate("x", {"provider": "unknown"})

    def test_empty_text_raises(self) -> None:
        with pytest.raises(T.TranslateError, match="原文が空"):
            T.translate("  ", OPENAI_CFG)

    def test_timeout_clamped(self) -> None:
        assert T._get_timeout({"timeout_sec": 9999}) == T.MAX_TIMEOUT_SEC
        assert T._get_timeout({"timeout_sec": 1}) == T.MIN_TIMEOUT_SEC
        assert T._get_timeout({}) == T.DEFAULT_TIMEOUT_SEC


# -------------------------------------------------------------------------
# APIエンドポイント (/psm/translate) の結合テスト
# -------------------------------------------------------------------------

def test_translate_endpoint(test_client, temp_extension_env) -> None:
    """
    /psm/translate がフロントから渡された config でステートレスに翻訳を実行し、
    結果を返すことを検証します (HTTP層はモック)。
    """
    with patch.object(T.requests, "post") as mock_post:
        mock_post.return_value = make_resp(200, {
            "choices": [{"message": {"content": "A cat on the beach."}}]
        })
        response = test_client.post("/psm/translate", json={
            "text": "浜辺の猫",
            "config": OPENAI_CFG,
        })

    assert response.status_code == 200
    assert response.json() == {"status": "success", "text": "A cat on the beach."}


def test_translate_endpoint_error(test_client, temp_extension_env) -> None:
    """設定不備時に status: error と日本語メッセージが返ること"""
    response = test_client.post("/psm/translate", json={
        "text": "浜辺の猫",
        "config": {**OPENAI_CFG, "endpoint": "file:///etc/passwd"},
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "error"
    assert "http://" in data["message"]


def test_translate_endpoint_empty_text(test_client, temp_extension_env) -> None:
    response = test_client.post("/psm/translate", json={"text": "", "config": OPENAI_CFG})
    assert response.json()["status"] == "error"
