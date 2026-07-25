<script setup lang="ts">
/**
 * プロンプト編集モーダルコンポーネント
 * グループおよびプロンプトの新規作成・編集を行います。
 */
import { computed, ref, watch, nextTick, onUnmounted } from "vue";
import { state, finishEdit, cancelEdit, startDeleteConfirm, translateText, suggestCategoryForGroup } from "../store";
import PsmModal from "./PsmModal.vue";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

/** 翻訳エラーメッセージ (インライン表示用) */
const translateError = ref("");

/**
 * グループヘッダ背景色のプリセット (ダークテーマに馴染む低明度8色)
 */
const HEADER_COLOR_PRESETS = [
  "#7f1d1d", // 赤
  "#78350f", // 琥珀
  "#14532d", // 緑
  "#134e4a", // ティール
  "#1e3a8a", // 青
  "#312e81", // 藍
  "#581c87", // 紫
  "#831843", // ピンク
];

/** カスタム色入力 (input type="color") のハンドラ */
const onCustomColor = (e: Event) => {
  const v = (e.target as HTMLInputElement).value;
  if (state.editingItem) state.editingItem.headerColor = v;
};

// ---- カテゴリ自動判定 (Phase 5B) ----

const isAutoCat = ref(false);
const autoCatHint = ref("");

/** カテゴリ値 → 短縮表示名のi18nキー */
const CAT_SHORT_KEY: Record<string, string> = {
  quality: "catShortQuality",
  subject: "catShortSubject",
  character: "catShortCharacter",
  series: "catShortSeries",
  artist: "catShortArtist",
  general: "catShortGeneral",
};

/**
 * グループ配下のタグをタグDBで判定し、多数決でカテゴリを提案する
 * (完了ボタンを押すまで保存はされない)
 */
const onAutoDetectCategory = async () => {
  const item = state.editingItem;
  if (!item || !item.is_group || isAutoCat.value) return;
  isAutoCat.value = true;
  autoCatHint.value = "";
  try {
    const s = await suggestCategoryForGroup(item);
    if (!s.total) {
      autoCatHint.value = t("autoCatEmpty");
      return;
    }
    if (s.suggested) {
      item.category = s.suggested;
    }
    const parts = Object.entries(s.counts)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${t(CAT_SHORT_KEY[c] || "catShortGeneral")}${n}`);
    if (s.unknown > 0) {
      parts.push(`${t("autoCatUnknown")}${s.unknown}`);
    }
    autoCatHint.value = t("autoCatBreakdown", { total: String(s.total), parts: parts.join(" / ") });
  } catch (e) {
    autoCatHint.value = e instanceof Error ? e.message : String(e);
  } finally {
    isAutoCat.value = false;
  }
};

/**
 * 原文 (sourceText) を英訳し、結果を content へ反映する
 * 既存の content がある場合は上書き確認を行う
 */
const onTranslate = async () => {
  const item = state.editingItem;
  if (!item || !item.sourceText?.trim() || state.isTranslating) return;

  if (item.content?.trim()) {
    if (!confirm(t("translateOverwriteConfirm"))) return;
  }

  translateError.value = "";
  try {
    item.content = await translateText(item.sourceText);
  } catch (e) {
    translateError.value = e instanceof Error ? e.message : String(e);
  }
};

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
  if (movedPanel && originalParent) {
    state.hasDictionary = false;
    try {
      // 大辞典のIDを元に戻す (txt2img_teleported -> txt2img)
      const tabname = movedPanel.id.includes("img2img") ? "img2img" : "txt2img";
      const originalId = `pd_inline_panel_${tabname}`;
      movedPanel.id = originalId;

      // 大辞典の JS が onUiUpdate で新しく生成してマウントしてしまった「偽物パネル」を削除する
      const root = getWebUiRoot();
      const fakePanel = root.getElementById(originalId);
      if (fakePanel && fakePanel !== movedPanel) {
        fakePanel.remove();
      }

      // 大辞典側の自動回収処理を再度有効化
      movedPanel.removeAttribute("data-psm-teleported");

      // 元の位置へ戻す
      if (originalNextSibling) {
        originalParent.insertBefore(movedPanel, originalNextSibling);
      } else {
        originalParent.appendChild(movedPanel);
      }

      // 元の位置に戻った後（Svelte管理下に戻った段階）で、展開されていたら折りたたむ
      const head = movedPanel.querySelector(".pd-inline-head") as HTMLElement | null;
      if (head && head.getAttribute("aria-expanded") === "true") {
        head.click();
      }
    } catch (e) {
      console.error("[PSM] restoreDictionaryPanel: Exception occurred during restore", { error: e });
    }
  }

  // ポータルコンテナのクリーンアップ
  try {
    const root = getWebUiRoot();
    const portal = root.getElementById("psm_dictionary_portal");
    if (portal) {
      portal.className = "psm-dictionary-portal flex-grow-1";
      // コピーされたdata-属性を削除
      Array.from(portal.attributes).forEach(attr => {
        if (attr.name.startsWith("data-") && attr.name !== "data-testid") {
          portal.removeAttribute(attr.name);
        }
      });
    }
  } catch (e) {
    console.error("[PSM] restoreDictionaryPanel: portal cleanup failed", e);
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
  if (movedPanel) {
    restoreDictionaryPanel();
  }

  // 大辞典のIDを一時的に書き換え、onUiUpdateによる自動引き戻しを回避する
  const teleportedId = `pd_inline_panel_${tabname}_teleported`;
  panel.id = teleportedId;

  state.hasDictionary = true;

  // 元の位置を記憶
  originalParent = panel.parentElement;
  originalNextSibling = panel.nextSibling;
  movedPanel = panel;

  // DOMがマウントされるのを待つ
  await nextTick();
  let portal = root.getElementById("psm_dictionary_portal");
  if (!portal) {
    // Vuetifyのモーダル展開ラグに配慮した最大500msのリトライ検出
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      portal = root.getElementById("psm_dictionary_portal");
      if (portal) break;
    }
  }

  if (portal) {
    portal.innerHTML = ""; // ポータル内のゴミ要素を完全クリア

    // 元の親のクラス名、データ属性をポータルコンテナに動的にコピーする
    // (大辞典やWebUIのCSSが特定の親ハッシュクラスやID依存で定義されている場合の崩れを防ぐ)
    if (originalParent) {
      portal.className = `psm-dictionary-portal flex-grow-1 ${originalParent.className || ""}`;
      Array.from(originalParent.attributes).forEach(attr => {
        if (attr.name.startsWith("data-") && attr.name !== "data-v-") {
          portal.setAttribute(attr.name, attr.value);
        }
      });
      if (originalParent.id) {
        portal.setAttribute("data-psm-original-parent-id", originalParent.id);
      }
    }

    // 大辞典側の自動マウント回収処理を一時的にスキップさせるための目印を付与
    panel.setAttribute("data-psm-teleported", "true");
    
    portal.appendChild(panel);

    // ブラウザのレイアウト計算（Reflow）と露出状態の確定を待ってから展開・ロードを開始する (50ms待機)
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 大辞典側の露出検知（IntersectionObserverやスクロール監視）を強制起動させるためのダミーイベントをディスパッチ
    try {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("scroll"));
      portal.dispatchEvent(new Event("scroll", { bubbles: true }));
      panel.dispatchEvent(new Event("scroll", { bubbles: true }));
    } catch (e) {
      console.error("[PSM] moveDictionaryPanel: Failed to dispatch dummy events", e);
    }

    // 移動後の露出状態で、大辞典のアコーディオンが閉じていたら展開をクリックする
    const head = panel.querySelector(".pd-inline-head") as HTMLElement | null;
    const isExpanded = head && head.getAttribute("aria-expanded") === "true";
    if (head && !isExpanded) {
      head.click();
    }

    // アタッチされたポータル内で、APIからのデータロード完了を監視して待機する
    let loaded = false;
    for (let i = 0; i < 60; i++) { // 最大3秒 (50ms * 60)
      const viewType = panel.getAttribute("data-pd-view-type");
      const isBusy = panel.getAttribute("aria-busy") === "true";
      // 読み込み中 (loading) でなく、かつ busy 状態でない場合にロード完了とみなす
      if (viewType && viewType !== "loading" && !isBusy) {
        loaded = true;
        break;
      }
      // 定期的にスクロールイベントを再送して露出判定を刺激する (500msごと)
      if (i > 0 && i % 10 === 0) {
        window.dispatchEvent(new Event("scroll"));
        portal.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
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
      // 前回のインライン表示をリセット
      autoCatHint.value = "";
      translateError.value = "";

      // モーダルが開く前に大辞典の存在を事前検知し、モーダルの初期幅を決定する
      state.hasDictionary = checkDictionaryPresence();

      await nextTick();
      const item = state.editingItem;
      if (item) {
        if (item.is_group) {
          nameInputRef.value?.focus();
          restoreDictionaryPanel(); // グループ編集時は念のため復元
        } else {
          if (contentInputRef.value) {
            contentInputRef.value.focus();
          }
          
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

          // ポータル移動をDOMマウント後に即座に実行する (遅延を排除、テキストエリアの有無に関わらず実行)
          await moveDictionaryPanel();
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

            <!-- Category Selector for Groups (Phase 3: animaモード時の出力整列に使用)
                 zIndexはPsmModalの $z-index-modal (2000000000) より上にする必要がある -->
            <v-select
              v-if="state.editingItem.is_group"
              :model-value="state.editingItem.category || 'general'"
              :items="[
                { title: t('catQuality'), value: 'quality' },
                { title: t('catSubject'), value: 'subject' },
                { title: t('catCharacter'), value: 'character' },
                { title: t('catSeries'), value: 'series' },
                { title: t('catArtist'), value: 'artist' },
                { title: t('catGeneral'), value: 'general' },
              ]"
              :label="t('categoryLabel')"
              :hint="t('categoryHint')"
              persistent-hint
              density="compact"
              variant="outlined"
              :menu-props="{ zIndex: 2000000010 }"
              class="mb-1"
              data-testid="edit-category-select"
              @update:model-value="(v) => state.editingItem!.category = v"
            ></v-select>

            <!-- Auto Category Detection (Phase 5B) -->
            <div v-if="state.editingItem.is_group" class="d-flex align-center ga-2 mb-2 flex-wrap">
              <v-btn
                size="small"
                variant="tonal"
                color="teal"
                prepend-icon="mdi-auto-fix"
                :loading="isAutoCat"
                @click="onAutoDetectCategory"
                data-testid="auto-category-btn"
              >{{ t('autoCatBtn') }}</v-btn>
              <span v-if="autoCatHint" class="text-caption text-grey">{{ autoCatHint }}</span>
            </div>

            <!-- Header Color Picker for Groups -->
            <div v-if="state.editingItem.is_group" class="mb-2">
              <div class="text-caption text-grey mb-1">{{ t('headerColorLabel') }}</div>
              <div class="d-flex align-center ga-2 flex-wrap">
                <button
                  v-for="c in HEADER_COLOR_PRESETS"
                  :key="c"
                  type="button"
                  class="psm-color-swatch"
                  :class="{ 'psm-color-swatch--selected': state.editingItem.headerColor === c }"
                  :style="{ backgroundColor: c }"
                  :title="c"
                  @click="state.editingItem!.headerColor = c"
                ></button>
                <label class="psm-color-swatch psm-color-swatch--custom" :title="t('headerColorCustom')">
                  <v-icon size="14">mdi-palette</v-icon>
                  <input
                    type="color"
                    :value="state.editingItem.headerColor || '#37474f'"
                    @input="onCustomColor"
                  />
                </label>
                <v-btn
                  size="x-small"
                  variant="text"
                  prepend-icon="mdi-water-off"
                  :disabled="!state.editingItem.headerColor"
                  @click="state.editingItem!.headerColor = undefined"
                >{{ t('headerColorClear') }}</v-btn>
              </div>
            </div>

            <!-- Natural Language Switch for Prompts -->
            <v-switch
              v-if="!state.editingItem.is_group"
              v-model="state.editingItem.isNatural"
              color="teal-accent-3"
              :label="state.editingItem.isNatural ? t('naturalModeOn') : t('naturalModeOff')"
              density="compact"
              inset
              hide-details
              class="mb-1"
              data-testid="natural-mode-switch"
            ></v-switch>

            <!-- Translation Source (Natural Language items only) -->
            <template v-if="!state.editingItem.is_group && state.editingItem.isNatural">
              <v-textarea
                :label="t('translateSource')"
                v-model="state.editingItem.sourceText"
                variant="outlined"
                auto-grow
                rows="2"
                max-rows="6"
                hide-details
                data-testid="edit-source-input"
                class="mb-1"
              ></v-textarea>
              <div class="d-flex align-center mb-1">
                <v-btn
                  size="small"
                  color="teal"
                  variant="tonal"
                  prepend-icon="mdi-translate"
                  :loading="state.isTranslating"
                  :disabled="!state.editingItem.sourceText?.trim()"
                  @click="onTranslate"
                  data-testid="translate-btn"
                >
                  {{ t('translateBtn') }}
                </v-btn>
                <span v-if="translateError" class="text-error text-caption ml-2">{{ translateError }}</span>
              </div>
            </template>

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
            class="flex-grow-1 overflow-hidden d-flex flex-column"
            :class="{ 'pa-4 border-s bg-grey-darken-4': state.hasDictionary }"
            :style="state.hasDictionary ? 'max-width: 550px; width: 550px;' : 'max-width: 0; width: 0; padding: 0 !important; border: none !important;'"
          >
            <div class="text-subtitle-2 mb-2 text-grey-lighten-1 d-flex align-center ga-1">
              <v-icon size="small" color="primary">mdi-book-open-variant</v-icon>
              <span>プロンプト大辞典 (Portal)</span>
            </div>
            <!-- Portal Placeholder -->
            <div id="psm_dictionary_portal" v-pre class="psm-dictionary-portal flex-grow-1" style="min-height: 0;"></div>
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

/* グループヘッダ背景色のスウォッチ */
.psm-color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s, border-color 0.15s;

  &:hover {
    transform: scale(1.15);
  }

  &--selected {
    border: 2px solid #fff;
    transform: scale(1.1);
  }

  &--custom {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #e66465, #9198e5);
    position: relative;

    input[type="color"] {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
  }
}

.psm-dictionary-portal {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>

<style>
/* Ensure the input slot doesn't clip the overflow (Vuetify internal override) */
div.psm-edit-modal__textarea--lifted .v-field__input {
    overflow: visible;
}

/* ポータル移動された大辞典のグローバルスタイル (Vuetifyのv-dialogテレポートによるScopedハッシュ無効化への完全対応) */
.psm-dictionary-portal {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#pd_inline_panel_txt2img_teleported,
#pd_inline_panel_img2img_teleported {
  height: 100% !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  flex-grow: 1 !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
}

#pd_inline_panel_txt2img_teleported .pd-inline-head,
#pd_inline_panel_img2img_teleported .pd-inline-head {
  flex-shrink: 0 !important;
  min-height: 38px !important;
  height: 38px !important;
  color: var(--body-text-color, #f0f0f0) !important;
  background: var(--button-secondary-background-fill, rgba(255, 255, 255, 0.08)) !important;
  border: 1px solid var(--border-color-primary, rgba(255, 255, 255, 0.15)) !important;
  border-radius: 6px !important;
  padding: 0 12px !important;
  margin: 0 0 8px 0 !important;
  display: grid !important;
  align-items: center !important;
  visibility: visible !important;
  opacity: 1 !important;
  box-sizing: border-box !important;
}

#pd_inline_panel_txt2img_teleported .pd-inline-head .pd-inline-label,
#pd_inline_panel_txt2img_teleported .pd-inline-head .pd-inline-status,
#pd_inline_panel_txt2img_teleported .pd-inline-head .pd-inline-chevron,
#pd_inline_panel_img2img_teleported .pd-inline-head .pd-inline-label,
#pd_inline_panel_img2img_teleported .pd-inline-head .pd-inline-status,
#pd_inline_panel_img2img_teleported .pd-inline-head .pd-inline-chevron {
  color: var(--body-text-color, #f0f0f0) !important;
}

#pd_inline_panel_txt2img_teleported .pd-inline-body,
#pd_inline_panel_img2img_teleported .pd-inline-body {
  position: static !important; /* ドロップダウン用の absolute 配置を強制解除 */
  top: auto !important;        /* はみ出し位置指定を完全リセット */
  display: flex !important;
  flex-direction: column !important;
  flex-grow: 1 !important;
  min-height: 0 !important;
  overflow: hidden !important;
  margin: 0 !important;
  padding: 0 !important;
}

#pd_inline_panel_txt2img_teleported .pd-inline-query-row,
#pd_inline_panel_img2img_teleported .pd-inline-query-row {
  flex-shrink: 0 !important;
}

#pd_inline_panel_txt2img_teleported .pd-inline-results,
#pd_inline_panel_img2img_teleported .pd-inline-results {
  display: block !important;
  height: auto !important;
  overflow-y: auto !important;
  flex-grow: 1 !important;
  min-height: 0 !important;
}
</style>
