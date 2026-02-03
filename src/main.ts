import { createApp } from "vue";
import App from "./App.vue";
import { state, listFiles, loadPrompts, loadConfig } from "./store";
import { Logger } from "./log";

// Vuetify
import "vuetify/styles";
import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/iconsets/mdi";
import "./mdi-embedded.css"; // Base64 Embedded Font

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
  Logger.info("Initialize: mountPsmApp called");
  try {
    const rootId = "psm_vue_app_overlay";
    if (document.getElementById(rootId)) {
        Logger.info("Initialize: Root element already exists, skipping.");
        return;
    }
    Logger.info("Initialize: Creating root element and mounting Vue app...");

    const mountTarget = document.createElement("div");
    mountTarget.id = rootId;
    
    // Find gradio-app to mount inside it (required for a1111-sd-webui-tagcomplete integration)
    const gradioApp = document.querySelector("gradio-app");
    const targetRoot = gradioApp?.shadowRoot || gradioApp || document.body;
    targetRoot.appendChild(mountTarget);

    const app = createApp(App);
    app.use(vuetify);
    app.mount(`#${rootId}`);
    Logger.info("Initialize: Vue app mounted successfully.");

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
    Logger.error("Fatal Error during initialization:", e);
  }

  // 外部クリックで閉じる制御 (パネル外クリック時の自動クローズ)

  // 外部クリックで閉じる制御 (パネル外クリック時の自動クローズ)
  window.addEventListener(
    "mousedown",
    (e) => {
      // 編集・移動モード中は閉じない (誤操作防止)
      if (state.isEditing || state.isMoving) return;

      const target = e.target as HTMLElement;

      // PSM本体、またはVuetifyのオーバーレイ(メニュー、ダイアログ、プルダウン等)内なら閉じない
      const isInside =
        target.closest("#psm_app_root_container") ||
        target.closest(".v-overlay-container") || // Vuetify 3 のオーバーレイコンテナ
        target.closest(".v-overlay") || // 念のため
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

(window as any).onUiLoaded(mountPsmApp);
