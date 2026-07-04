<script setup lang="ts">
/**
 * プロンプト編集モーダルコンポーネント
 * グループおよびプロンプトの新規作成・編集を行います。
 */
import { computed, ref, watch, nextTick, onUnmounted } from "vue";
import { state, finishEdit, cancelEdit, startDeleteConfirm } from "../store";
import PsmModal from "./PsmModal.vue";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const nameInputRef = ref<{ focus: () => void } | null>(null);
const contentInputRef = ref<{ focus: () => void; $el: HTMLElement } | null>(null);

// 大辞典ポータル移動用の状態保持
let originalParent: HTMLElement | null = null;
let originalNextSibling: Node | null = null;
let movedPanel: HTMLElement | null = null;

/**
 * モーダル内にポータル移動させた大辞典パネルを元の親要素の正しい位置に復元する
 */
const restoreDictionaryPanel = () => {
  state.hasDictionary = false;
  if (movedPanel && originalParent) {
    try {
      console.debug("[PSM][EditModal/Portal] モーダル編集が終了したため、一時退避していたプロンプト大辞典パネルを元の親要素に戻します。");
      // 大辞典側の自動回収処理を再度有効化
      movedPanel.removeAttribute("data-psm-teleported");

      // 展開されていたら折りたたむ
      const head = movedPanel.querySelector(".pd-inline-head") as HTMLElement | null;
      if (head && head.getAttribute("aria-expanded") === "true") {
        head.click();
      }

      // 元の位置へ戻す
      if (originalNextSibling) {
        originalParent.insertBefore(movedPanel, originalNextSibling);
      } else {
        originalParent.appendChild(movedPanel);
      }
    } catch (e) {
      console.error("[PSM][EditModal/Portal] 大辞典パネルをモーダル内から元の親要素へ復帰マウントする際に例外が発生しました。", { error: e });
    }
  }
  originalParent = null;
  originalNextSibling = null;
  movedPanel = null;
};

const getWebUiRoot = (): Document | ShadowRoot => {
  const gradioApp = document.querySelector("gradio-app");
  return gradioApp?.shadowRoot || document;
};

/**
 * 大辞典パネルをモーダル内のプレースホルダーへポータル移動させる
 */
const moveDictionaryPanel = async () => {
  const item = state.editingItem;
  if (!item || item.is_group) return;

  const root = getWebUiRoot();

  // アクティブなタブ名を判定 (txt2img / img2img)
  const img2imgGen = root.getElementById("img2img_generate");
  const isImg2imgActive = img2imgGen && img2imgGen.offsetParent !== null;
  const tabname = isImg2imgActive ? "img2img" : "txt2img";

  const panel = root.getElementById(`pd_inline_panel_${tabname}`) as HTMLElement | null;
  if (!panel) {
    state.hasDictionary = false;
    return;
  }

  // すでに移動済みの場合は一旦戻す（安全策）
  // ※restoreDictionaryPanel()内で state.hasDictionary が false にリセットされるため、hasDictionary = true にする前に実行する必要がある。
  restoreDictionaryPanel();

  state.hasDictionary = true;

  // 元の位置を記憶
  originalParent = panel.parentElement;
  originalNextSibling = panel.nextSibling;
  movedPanel = panel;

  // DOMがマウントされるのを待つ
  await nextTick();
  const portal = root.getElementById("psm_dictionary_portal");
  if (portal) {
    // 大辞典側の自動マウント回収処理を一時的にスキップさせるための目印を付与
    panel.setAttribute("data-psm-teleported", "true");
    
    portal.appendChild(panel);
    console.debug(`[PSM][EditModal/Portal] 2カラム表示を構成するため、プロンプト大辞典パネル（アクティブタブ: ${tabname}）を編集モーダル内のポータルへ退避マウントしました。`);
    
    // 詳細情報をデバッグログとして折りたたんでグループ表示
    console.groupCollapsed(`[PSM][EditModal/Portal] ポータル移動が行われたDOM構造の詳細を展開します。`);
    console.debug("[PSM][EditModal/Portal] ポータル退避対象となった大辞典パネルのDOM要素構造です。");
    console.dir(panel);
    console.debug("[PSM][EditModal/Portal] 退避前に大辞典パネルがマウントされていた親DOM要素の構造です。");
    console.dir(originalParent);
    console.groupEnd();
    
    // パネルが閉じていれば自動展開する
    const head = panel.querySelector(".pd-inline-head") as HTMLElement | null;
    if (head && head.getAttribute("aria-expanded") !== "true") {
      head.click();
    }
  }
};

/**
 * 大辞典が環境内に存在し、利用可能であるかを事前検証する
 */
const checkDictionaryPresence = (): boolean => {
  const item = state.editingItem;
  if (!item || item.is_group) return false;

  const root = getWebUiRoot();
  const img2imgGen = root.getElementById("img2img_generate");
  const isImg2imgActive = img2imgGen && img2imgGen.offsetParent !== null;
  const tabname = isImg2imgActive ? "img2img" : "txt2img";
  const panel = root.getElementById(`pd_inline_panel_${tabname}`);
  return !!panel;
};

onUnmounted(() => {
  restoreDictionaryPanel();
});

/**
 * 編集モードが有効になった際、適切な入力フィールドにフォーカスを当てる
 */
watch(
  () => state.isEditing,
  async (val) => {
    if (val) {
      // モーダルが開く前に大辞典の存在を事前検知し、モーダルの初期幅を決定する
      if (checkDictionaryPresence()) {
        state.hasDictionary = true;
        console.debug("[PSM][EditModal/Layout] 編集対象がプロンプトであり、かつ大辞典パネルが存在するため、2カラムレイアウトでモーダルを起動します。");
      } else {
        state.hasDictionary = false;
      }

      await nextTick();
      // v-ifの反映待ち
      const item = state.editingItem;
      if (item) {
        if (item.is_group) {
          nameInputRef.value?.focus();
          restoreDictionaryPanel(); // グループ編集時は念のため復元
        } else {
          // テキスト入力が存在する場合
          if (contentInputRef.value) {
            contentInputRef.value.focus();
            
            // Try to attach a1111-sd-webui-tagcomplete
            setTimeout(() => {
              try {
                const textAreaEl = contentInputRef.value?.$el.querySelector('textarea');
                if (textAreaEl && window.addAutocompleteToArea) {
                  window.addAutocompleteToArea(textAreaEl);
                }
              } catch (e) {
                console.debug("[PSM][EditModal/Autocomplete] tag-completeの初期化に失敗、または該当要素がありません。自動補完のアタッチをスキップします。", { error: e });
              }
            }, 100);

            // ポータル移動をDOMマウント後に即座に実行する (遅延を排除)
            await moveDictionaryPanel();
          }
        }
      }
    } else {
      // モーダル閉鎖時は大辞典を元の位置に復元
      restoreDictionaryPanel();
    }
  }
);

/**
 * 保存可能かどうかを判定する (バリデーション)
 * グループなら名前、プロンプトなら内容が必須
 */
const isValid = computed(() => {
  const item = state.editingItem;
  if (!item) return false;
  const valid = item.is_group ? !!item.name?.trim() : !!item.content?.trim();
  return valid;
});

const onSave = async () => {
  if (isValid.value) {
    await finishEdit();
  }
};

/**
 * 編集画面からの削除リクエスト
 * 削除確認モーダルへ遷移する
 */
const onRequestDelete = () => {
  if (state.editingItem) {
    startDeleteConfirm(state.editingItem);
    state.isEditing = false;
  }
};

const modalTitle = computed(() => {
  return state.editingItem?.is_group ? t('editGroup') : t('editPrompt');
});
</script>

<template>
  <PsmModal
    v-model="state.isEditing"
    :max-width="state.hasDictionary ? '1100' : '600'"
    @click:outside="cancelEdit"
  >
    <v-card
      data-testid="edit-modal"
      @keydown.ctrl.enter.stop.prevent="onSave"
      @keydown.meta.enter.stop.prevent="onSave"
    >
      <v-toolbar
        density="compact"
        color="surface"
      >
        <v-toolbar-title>{{ modalTitle }}</v-toolbar-title>
        <v-btn icon @click="cancelEdit"><v-icon>mdi-close</v-icon></v-btn>
      </v-toolbar>

      <v-card-text v-if="state.editingItem" class="pa-0">
        <div class="d-flex flex-column flex-md-row fill-height" style="max-height: 70vh;">
          <!-- 左カラム: プロンプト編集フォーム -->
          <div 
            class="flex-grow-1 pa-4 overflow-y-auto d-flex flex-column ga-2"
            :style="state.hasDictionary ? 'max-width: 550px; width: 550px;' : 'width: 100%;'"
          >
            <v-text-field
              ref="nameInputRef"
              :label="t('name')"
              v-model="state.editingItem.name"
              variant="outlined"
              data-testid="edit-name-input"
              :hint="state.editingItem.is_group ? '必須' : '任意'"
              persistent-hint
              class="mb-1"
            ></v-text-field>

            <!-- Random Mode Switch for Groups -->
            <v-switch
              v-if="state.editingItem.is_group"
              v-model="state.editingItem.isRandom"
              color="purple-accent-2"
              :label="state.editingItem.isRandom ? t('randomModeOn') : t('randomModeOff')"
              density="compact"
              inset
              hide-details
              class="mb-1"
            ></v-switch>

            <v-textarea
              v-if="!state.editingItem.is_group"
              ref="contentInputRef"
              :label="t('promptContent')"
              v-model="state.editingItem.content"
              variant="outlined"
              auto-grow
              rows="3"
              max-rows="8"
              data-testid="edit-content-input"
              class="mb-1 psm-edit-modal__textarea--lifted"
            ></v-textarea>

            <div
              v-if="!state.editingItem.is_group"
              class="mb-1 border rounded pa-3 bg-grey-darken-3"
            >
              <div class="d-flex justify-space-between text-caption mb-1">
                <span>{{ t('weight') }}</span>
                <strong
                  class="text-orange text-subtitle-1"
                  data-testid="weight-display"
                  >{{ state.editingItem.weight }}</strong>
              </div>
              <div class="d-flex align-center">
                <v-btn
                  icon="mdi-minus"
                  size="small"
                  variant="tonal"
                  @click="
                    state.editingItem!.weight = Number(Math.max(
                      0,
                      Number((Number(state.editingItem!.weight) - 0.1).toFixed(1)),
                    ))
                  "
                  data-testid="weight-minus"
                ></v-btn>
                <v-slider
                  v-model="state.editingItem.weight"
                  min="0"
                  max="2"
                  step="0.1"
                  hide-details
                  color="orange"
                  class="mx-4 flex-grow-1"
                ></v-slider>
                <v-btn
                  icon="mdi-plus"
                  size="small"
                  variant="tonal"
                  @click="
                    state.editingItem!.weight = Number(Math.min(
                      2,
                      Number((Number(state.editingItem!.weight) + 0.1).toFixed(1)),
                    ))
                  "
                  data-testid="weight-plus"
                ></v-btn>
                <v-btn
                  icon="mdi-refresh"
                  size="small"
                  variant="tonal"
                  class="ml-2"
                  @click="state.editingItem!.weight = 1.0"
                  :title="t('reset')"
                ></v-btn>
              </div>
            </div>

            <v-textarea
              :label="t('memo')"
              v-model="state.editingItem.memo"
              variant="outlined"
              rows="2"
              hide-details
            ></v-textarea>
          </div>

          <!-- 右カラム: 大辞典ポータル -->
          <div 
            v-show="state.hasDictionary" 
            class="flex-grow-1 pa-4 border-s overflow-y-auto d-flex flex-column bg-grey-darken-4"
            style="max-width: 550px; width: 550px;"
          >
            <div class="text-subtitle-2 mb-2 text-grey-lighten-1 d-flex align-center ga-1">
              <v-icon size="small" color="primary">mdi-book-open-variant</v-icon>
              <span>プロンプト大辞典 (Portal)</span>
            </div>
            <!-- Portal Placeholder -->
            <div id="psm_dictionary_portal" v-pre class="psm-dictionary-portal flex-grow-1"></div>
          </div>
        </div>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions class="pa-4 bg-surface">
        <v-btn
          v-if="!state.isNewItem"
          color="error"
          variant="text"
          @click="onRequestDelete"
          data-testid="footer-delete-btn"
        >
          {{ t('delete') }}
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn variant="text" size="large" @click="cancelEdit" data-testid="edit-cancel-btn"
          >{{ t('cancel') }}</v-btn
        >
        <v-btn
          color="primary"
          variant="elevated"
          size="large"
          class="px-6"
          :disabled="!isValid"
          @click="onSave"
          data-testid="edit-save-btn"
        >
          {{ state.isNewItem ? t('add') : t('done') }}
        </v-btn>
      </v-card-actions>
</v-card>
  </PsmModal>
</template>

<style scoped lang="scss">
@use "../styles/variables" as *;

.psm-edit-modal {
  &__textarea--lifted {
    position: relative;
    z-index: $z-index-base;
  }
}

.psm-dictionary-portal {
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>

<style>
/* Ensure the input slot doesn't clip the overflow (Vuetify internal override) */
div.psm-edit-modal__textarea--lifted .v-field__input {
    overflow: visible;
}
</style>
