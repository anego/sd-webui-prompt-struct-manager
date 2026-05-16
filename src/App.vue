<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, provide } from "vue";
import {
  state,
  loadPrompts,
  listFiles,
  getCompiledPrompts,
  savePrompts,
  addItem,
  deleteCurrentFile,
  loadConfig,
  saveConfig,
  pickDirectory,
  setAllGroupsOpen,
  startEdit,
  duplicateItem,
  startDeleteConfirm,
  findParentAndItem,
  detectDuplicates,
  clearDuplicateHighlight,
} from "./store";
import { PsmItem } from "./types";
import PsmEditModal from "./components/PsmEditModal.vue";
import PsmDeleteDialog from "./components/PsmDeleteDialog.vue";
import PsmTreePane from "./components/PsmTreePane.vue";
import PsmSideBar from "./components/PsmSideBar.vue";
import PsmFileDialogs from "./components/PsmFileDialogs.vue";
import PsmContextMenu from "./components/PsmContextMenu.vue";
import PsmGroupMap from "./components/PsmGroupMap.vue";
import PsmGenerateConfirmDialog from "./components/PsmGenerateConfirmDialog.vue";
import PsmDuplicateConfirmDialog from "./components/PsmDuplicateConfirmDialog.vue";
import PsmSetupWizard from "./components/PsmSetupWizard.vue";
import { useI18n } from "./composables/useI18n";

const { t } = useI18n();

const buildTimestamp = __BUILD_TIMESTAMP__;

// ダイアログの表示状態管理
const dialogs = ref({ new: false, copy: false, rename: false, import: false, generate: false });
const duplicateDialog = ref({ show: false, mode: "warn" as "warn" | "error" });
const menuState = ref({ visible: false, x: 0, y: 0, items: [] as any[] });

// 右クリックメニューの状態
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  targetItem: null as PsmItem | null,
  // 親配列は削除や並べ替え時に親配列が必要な操作で使用
  parentChildren: [] as PsmItem[],
});

/**
 * 右クリックメニューを開く (マウスイベント)
 * @param e MouseEvent
 * @param item 対象アイテム
 * @param parent 親リスト
 */
const openContextMenu = (e: MouseEvent, item: PsmItem, parent: PsmItem[]) => {
  e.preventDefault();
  e.stopPropagation();
  contextMenu.value.show = false;
  contextMenu.value.x = e.clientX;
  contextMenu.value.y = e.clientY;
  contextMenu.value.targetItem = item;
  contextMenu.value.parentChildren = parent;
  setTimeout(() => {
    contextMenu.value.show = true;
  }, 10);
};

// 子コンポーネント(PsmNode)へコンテキストメニュー関数を提供
provide("psm-context-menu", openContextMenu);

/**
 * 現在のプロンプト構成をWebUI (Automatic1111/Forge) のテキストエリアに反映する
 * 生成ボタンは押さない。
 */
const handleApply = () => {
  const posStr = getCompiledPrompts(state.positive);
  const negStr = getCompiledPrompts(state.negative);
  const prefix =
    document.getElementById("img2img_generate")?.offsetParent !== null
      ? "img2img"
      : "txt2img";
  const updateTextarea = (selector: string, text: string) => {
    const ta = document.querySelector(selector)?.querySelector("textarea");
    if (ta) {
      // React等のフレームワークがstate更新を検知できるようにフォーカスを当てる
      // 画面スクロールを防ぐため preventScroll: true を指定
      ta.focus({ preventScroll: true });

      // Native Setter Hack:
      // Reactはvalueプロパティのsetterを上書きしているため、
      // 直接 .value = ... としてもstateが更新されない場合がある。
      // 本来の(ネイティブの)setterを呼び出すことでこれを回避する。
      const proto = window.HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      
      if (nativeSetter) {
        nativeSetter.call(ta, text);
      } else {
        ta.value = text;
      }

      // イベント発行
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      ta.dispatchEvent(new Event("change", { bubbles: true }));
      
      // 編集終了を模倣
      ta.blur();
    }
  };
  updateTextarea(`#${prefix}_prompt`, posStr);
  updateTextarea(`#${prefix}_prompt`, posStr);
  updateTextarea(`#${prefix}_neg_prompt`, negStr);
};

/**
 * 反映処理の前に重複チェックを行うラッパー
 */
const handleApplyWithCheck = () => {
  if (state.duplicateCheckMode === "none") {
    clearDuplicateHighlight();
    handleApply();
    state.isVisible = false;
    return;
  }

  const duplicates = detectDuplicates();
  if (duplicates.size > 0) {
    state.duplicateTexts = duplicates;
    state.duplicateHighlightLevel = state.duplicateCheckMode;
    duplicateDialog.value.mode = state.duplicateCheckMode;
    duplicateDialog.value.show = true;
  } else {
    clearDuplicateHighlight();
    handleApply();
    state.isVisible = false;
  }
};

const forceApplyAndClose = () => {
  handleApply();
  state.isVisible = false;
};

/**
 * 生成確認ダイアログを表示する
 */
const handleGenerateFlow = () => {
  dialogs.value.generate = true;
};

/**
 * プロンプトを反映し、WebUIの「Generate」ボタンをクリックする
 * 実行後はパネルを閉じる
 */
const executeGenerate = async () => {
  try {
    handleApply();
    
    // GUIの更新を待つために少し待機 (GradIOの反映待ち)
    await new Promise(resolve => setTimeout(resolve, 500));

    const prefix =
      document.getElementById("img2img_generate")?.offsetParent !== null
        ? "img2img"
        : "txt2img";
    const generateBtn = document.getElementById(`${prefix}_generate`);
    if (generateBtn) {
      generateBtn.click();
      // スクロール処理は削除
    }
  } finally {
    state.isVisible = false;
  }
};

/**
 * 現在開いているファイルを削除する
 */
const handleDeleteFile = async () => {
  if (confirm("本当にファイルを削除しますか？")) {
    await deleteCurrentFile();
  }
};

import { useKeyboardNav } from "./composables/useKeyboardNav";

/**
 * キーボードショートカット (ContextMenu/Shift+F10) でメニューを表示する
 * 現在フォーカスされているアイテムの位置にメニューを出す
 */
const handleKeyboardContextMenu = async () => {
  if (!state.focusedItemId) return;
  
  // Find item logic
  let found = findParentAndItem(state.focusedItemId, state.positive, state.positive);
  if (!found) found = findParentAndItem(state.focusedItemId, state.negative, state.negative);
  
  if (!found) return;
  
  // DOM要素を取得してメニューを表示位置を決定
  // IDが付与されていないためクラス名で検索
  const focusedEl = document.querySelector("#psm_app_root_container .psm-node--focused");
  
  if (focusedEl) {
    const rect = focusedEl.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    // メニューを手動で開く
    contextMenu.value.show = false;
    contextMenu.value.x = x;
    contextMenu.value.y = y;
    contextMenu.value.targetItem = found.item;
    contextMenu.value.parentChildren = found.parent;
    
    // 再レンダリングを確実にするための微小遅延
    setTimeout(() => {
      contextMenu.value.show = true;
    }, 10);
  }
};

const { handleGlobalKeydown: handleNavKeydown } = useKeyboardNav({
  onContextMenu: handleKeyboardContextMenu
});

onMounted(async () => {
  window.addEventListener("keydown", handleGlobalKeydown, true);
  await loadConfig();
  if (state.isConfigured) {
    await listFiles();
    await loadPrompts();
  }
});

// v-show化に伴い、表示時にファイルリストを最新化する
watch(
  () => state.isVisible,
  async (visible) => {
    if (visible && state.isConfigured) {
      await listFiles();
    }
  }
);

onUnmounted(() =>
  window.removeEventListener("keydown", handleGlobalKeydown, true),
);

const matchShortcut = (e: KeyboardEvent, shortcut: string) => {
  if (!shortcut) return false;
  const parts = shortcut.toUpperCase().split('+');
  const keyStr = parts.pop(); // last part is key
  if (!keyStr) return false;

  const pressedCtrl = e.ctrlKey || e.metaKey; // Treat Meta as Ctrl on Mac? Or separate? 
  // For now let's be strict if recorded as Meta.
  // Actually, my recorder saves 'Meta' separately.
  // But Windows user might not use Meta.
  
  const wantCtrl = parts.includes('CTRL');
  const wantShift = parts.includes('SHIFT');
  const wantAlt = parts.includes('ALT');
  const wantMeta = parts.includes('META');

  if (e.ctrlKey !== wantCtrl) return false;
  if (e.shiftKey !== wantShift) return false;
  if (e.altKey !== wantAlt) return false;
  if (e.metaKey !== wantMeta) return false;

  let pressedKey = e.key.toUpperCase();
  if (pressedKey === ' ') pressedKey = 'SPACE';
  
  // Normalization for simple keys
  if (keyStr.length === 1 && pressedKey.length === 1) {
     return keyStr === pressedKey;
  }
  
  // For Function keys etc
  return keyStr === pressedKey;
};

const handleGlobalKeydown = (e: KeyboardEvent) => {
  // Configurable Toggle Shortcut
  if (state.toggleShortcut && matchShortcut(e, state.toggleShortcut)) {
    e.preventDefault();
    e.stopPropagation();
    state.isVisible = !state.isVisible;
    return;
  }

  // ショートカット (Ctrl+Shift+Enter): 反映して閉じる (生成は行わない)
  // WebUI標準やブラウザ拡張との競合を避けるため Ctrl+Shift+Enter に変更
  if (state.isVisible && !state.isEditing && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter")) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // アプライ＆チェック
    handleApplyWithCheck();
    return;
  }

  // パネル内のナビゲーションを優先
  if (state.isVisible) {
     // コンテキストメニューが開いている場合は、メインパネルのナビゲーションを無効化
     if (contextMenu.value.show) return;

     handleNavKeydown(e);
     if (e.defaultPrevented) return;
  }

  if (e.key === "Escape") {
    // コンテキストメニューが開いている場合
    if (contextMenu.value.show) {
      contextMenu.value.show = false;
      return;
    }
    if (menuState.value.visible) {
      menuState.value.visible = false;
      return;
    }

    // 各種ダイアログが開いている場合は、メインパネルを閉じない
    if (dialogs.value.new) {
      dialogs.value.new = false;
      return;
    }
    if (dialogs.value.copy) {
      dialogs.value.copy = false;
      return;
    }
    if (dialogs.value.rename) {
      dialogs.value.rename = false;
      return;
    }
    if (dialogs.value.import) {
      dialogs.value.import = false;
      return;
    }
    if (dialogs.value.generate) {
      dialogs.value.generate = false;
      return;
    }
    if (duplicateDialog.value.show) {
      duplicateDialog.value.show = false;
      // errorモードでエスケープした場合は何もしない、warnモードの場合はcancel扱いなので同様に閉じるだけ
      return;
    }

    // プロンプト編集モーダルが開いている場合もメインパネルを閉じない
    if (state.isEditing) return;

    // 削除確認モーダルが開いている場合もメインパネルを閉じない
    if (state.isDeleting) return;

    // どのモーダルも開いていない場合のみ、PSM本体を閉じる
    if (state.isVisible) state.isVisible = false;
  }
};
</script>

<template>
  <div
    v-show="state.isVisible"
    id="psm_app_root_container"
    class="psm-app-root"
    @click="menuState.visible = false"
  >
    <v-app theme="dark" class="psm-app-root__vuetify psm-scrollbar">
      <v-card class="d-flex flex-column h-100 w-100 rounded-0" elevation="0">
        <v-toolbar density="compact" color="surface" elevation="4">
          <v-toolbar-title class="text-subtitle-1 font-weight-bold text-orange">
            📂 {{ t('appName') }}
            <span v-if="state.isDevMode" class="text-caption ml-2 text-grey">
               ({{ buildTimestamp }})
            </span>
          </v-toolbar-title>
          <v-spacer></v-spacer>
          <div class="d-flex align-center ga-2 mr-2">
            <v-btn
              icon
              size="small"
              @click.stop="setAllGroupsOpen(true)"
              :title="t('expandAll')"
            >
              <v-icon>mdi-chevron-double-down</v-icon>
            </v-btn>
            <v-btn
              icon
              size="small"
              @click.stop="setAllGroupsOpen(false)"
              :title="t('collapseAll')"
            >
              <v-icon>mdi-chevron-double-up</v-icon>
            </v-btn>
            <v-btn
              v-if="state.isDevMode"
              icon
              size="small"
              @click.stop="dialogs.import = true"
              :title="t('import')"
              data-testid="open-import-btn"
            >
              <v-icon>mdi-import</v-icon>
            </v-btn>
          </div>
          <v-btn
            color="secondary"
            variant="elevated"
            size="small"
            class="ml-2"
            @click.stop="handleApplyWithCheck"
            :title="t('applyAndClose')"
          >
            <v-icon start size="small">mdi-check-all</v-icon>
            {{ t('applyAndClose') }}
          </v-btn>
          <v-btn icon size="small" @click.stop="state.isVisible = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-toolbar>

        <div class="d-flex flex-row flex-grow-1 overflow-hidden" style="padding-right: 30px;">
          <PsmSetupWizard v-if="!state.isConfigured" />

          <template v-else>
               <PsmSideBar
                 @open-dialog="(name) => (dialogs[name] = true)"
                 @delete-file="handleDeleteFile"
               />

               <PsmTreePane
                 :title="t('positive')"
                 icon="mdi-thumb-up"
                 color="blue"
                 v-model:items="state.positive"
                 v-model:isOpen="state.posOpen"
               />

               <PsmTreePane
                 :title="t('negative')"
                 icon="mdi-thumb-down"
                 color="red"
                 v-model:items="state.negative"
                 v-model:isOpen="state.negOpen"
               />
             </template>
        </div>
      </v-card>

      <PsmEditModal />
      <PsmDeleteDialog />

      <PsmContextMenu
        v-model:show="contextMenu.show"
        :x="contextMenu.x"
        :y="contextMenu.y"
        :targetItem="contextMenu.targetItem"
        :parentChildren="contextMenu.parentChildren"
      />
      
      <PsmGroupMap v-if="state.isVisible" />

      <PsmFileDialogs
        v-model:newDialog="dialogs.new"
        v-model:copyDialog="dialogs.copy"
        v-model:renameDialog="dialogs.rename"
        v-model:importDialog="dialogs.import"
      />
      
      <PsmDuplicateConfirmDialog
        v-model="duplicateDialog.show"
        :mode="duplicateDialog.mode"
        @confirm="forceApplyAndClose"
        @cancel="() => {}"
      />
      
      <PsmGenerateConfirmDialog
        v-model="dialogs.generate"
        @confirm="executeGenerate"
      />
    </v-app>
  </div>
</template>

<style scoped lang="scss">
@use "./styles/variables" as *;

.psm-app-root {
  position: fixed;
  inset: 0;
  z-index: $z-index-app;
  background: $color-overlay;

  &__vuetify.v-application {
    background: transparent;
    width: 100%;
    height: 100%;
  }
}
</style>
