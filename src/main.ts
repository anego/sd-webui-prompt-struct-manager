// process is not defined エラーの完全防止ポリフィル (Vite 8対策)
if (typeof (window as any).process === "undefined") {
  (window as any).process = { env: { NODE_ENV: "production" } };
}

declare const __BUILD_TIMESTAMP__: string;
console.info(`[PSM] メインスクリプト (main.ts) が正常に読み込まれました。ビルド日時: ${__BUILD_TIMESTAMP__}`);

import { createApp } from "vue";
import App from "./App.vue";
import { state, listFiles, loadPrompts, loadConfig } from "./store";
import { Logger } from "./log";

// Vuetify
import "vuetify/styles";
import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/iconsets/mdi";
import "./mdi-embedded.css"; // Base64 Embedded Font
import "./styles/main.scss"; // Common PSM styles

const vuetify = createVuetify({
  icons: {
    defaultSet: "mdi",
    aliases,
    sets: { mdi },
  },
  theme: {
    defaultTheme: "dark",
  },
});

/**
 * Prompt Struct Manager (PSM) アプリケーションの初期化とマウントを行う
 * WebUI (Automatic1111/Forge) の onUiLoaded フックから呼び出されます。
 * 
 * - Vueアプリの作成とマウント
 * - Vuetify設定
 * - グローバルイベントリスナーの登録 (開閉トグル、外部クリック監視など)
 * - 初期設定の読み込み
 */
const mountPsmApp = async () => {
  Logger.info("[Initialize] Vueアプリケーションの初期化とマウント処理 (mountPsmApp) が開始されました。");
  try {
    const rootId = "psm_vue_app_overlay";
    if (document.getElementById(rootId)) {
        Logger.info("[Initialize] 重複マウントを防ぐため、既にマウント済みのルート要素が存在することを検出し、初期化処理をスキップしました。");
        return;
    }
    Logger.info("[Initialize] Vueアプリケーションをマウントするためのルート要素を作成し、マウントを開始します。");

    const mountTarget = document.createElement("div");
    mountTarget.id = rootId;
    
    // Find gradio-app to mount inside it (required for a1111-sd-webui-tagcomplete integration)
    const gradioApp = document.querySelector("gradio-app");
    const targetRoot = gradioApp?.shadowRoot || gradioApp || document.body;
    targetRoot.appendChild(mountTarget);

    const app = createApp(App);
    app.use(vuetify);
    app.mount(`#${rootId}`);
    Logger.info("[Initialize] Vueアプリケーションが正常にDOMへマウントされ、初期化が完了しました。");

    // Python側からのトグルイベント受信
    window.addEventListener("psm-toggle", () => {
      state.isVisible = !state.isVisible;
    });

    await loadConfig();
    if (state.isConfigured) {
      await listFiles();
      await loadPrompts();
    }
  } catch (e) {
    Logger.error("[Initialize] アプリケーションの初期化処理中に致命的なエラーが発生しました。", e);
  }

  // 外部クリックで閉じる制御 (パネル外クリック時の自動クローズ)

  // 外部クリックで閉じる制御 (パネル外クリック時の自動クローズ)
  window.addEventListener(
    "mousedown",
    (e) => {
      // 編集・移動・削除モード中は閉じない (誤操作防止)
      if (state.isEditing || state.isMoving || state.isDeleting) return;

      const target = e.target as HTMLElement;

      // PSM本体、またはVuetifyのオーバーレイ、あるいは独自のテレポートモーダル内なら閉じない
      const isInside =
        target.closest("#psm_app_root_container") ||
        target.closest(".v-overlay-container") || // Vuetify 3 のオーバーレイコンテナ
        target.closest(".v-overlay") || // 念のため
        target.closest(".psm-modal__overlay") || // 独自のテレポートモーダル (PsmModal.vue)
        target.closest(".psm-custom-modal-overlay"); // 独自のテレポートモーダル

      const isToggleButton =
        target.closest(".psm-btn-python-native") ||
        target.closest(".psm-btn-close");

      // 表示中かつ、パネル外かつ、トグルボタン以外をクリックした場合に非表示にする
      if (state.isVisible && !isInside && !isToggleButton) {
        state.isVisible = false;
      }
    },
    true, // captureフェーズで確実にイベントを捕捉する
  );
};

window.onUiLoaded?.(mountPsmApp);

