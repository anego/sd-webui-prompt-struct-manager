<script setup lang="ts">
/**
 * プロンプト編集モーダルコンポーネント
 * グループおよびプロンプトの新規作成・編集を行います。
 */
import { computed, ref, watch, nextTick } from "vue";
import { state, finishEdit, cancelEdit, startDeleteConfirm } from "../store";
import PsmModal from "./PsmModal.vue";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const nameInputRef = ref<any>(null);
const contentInputRef = ref<any>(null);

/**
 * 編集モードが有効になった際、適切な入力フィールドにフォーカスを当てる
 */
watch(
  () => state.isEditing,
  async (val) => {
    if (val) {
      await nextTick();
      // v-ifの反映待ち
      const item = state.editingItem;
      if (item) {
        if (item.is_group) {
          nameInputRef.value?.focus();
        } else {
          // テキスト入力が存在する場合
          if (contentInputRef.value) {
            contentInputRef.value.focus();
            
            // Try to attach a1111-sd-webui-tagcomplete
            setTimeout(() => {
              try {
                const textAreaEl = contentInputRef.value?.$el.querySelector('textarea');
                if (textAreaEl && (window as any).addAutocompleteToArea) {
                  (window as any).addAutocompleteToArea(textAreaEl);
                  // Debug logging
                  // console.debug("[PSM] Attempted to attach Tag Autocomplete.");
                }
              } catch (e) {
                console.debug("[PSM] Failed to attach tag autocomplete", e);
              }
            }, 100);
          }
        }
      }
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
    max-width="600"
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

      <v-card-text v-if="state.editingItem">
        <v-text-field
          ref="nameInputRef"
          :label="t('name')"
          v-model="state.editingItem.name"
          variant="outlined"
          data-testid="edit-name-input"
          :hint="state.editingItem.is_group ? '必須' : '任意'"
          persistent-hint
          class="mb-2"
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
          class="mb-2"
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
          class="mb-2 prompt-textarea-lifted"
        ></v-textarea>

        <div
          v-if="!state.editingItem.is_group"
          class="mb-4 border rounded pa-3 bg-grey-darken-3"
        >
          <div class="d-flex justify-space-between text-caption mb-1">
            <span>{{ t('weight') }}</span>
            <strong
              class="text-orange text-subtitle-1"
              data-testid="weight-display"
              >{{ state.editingItem.weight }}</strong
            >
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

<style>
/* Override Tag Autocomplete z-index to ensure it appears above Vuetify modal elements */
.autocompleteParent {
  z-index: 2500 !important;
}

/* 
  Lift the textarea container stacking context so its children (autocomplete popup) 
  appear above subsequent siblings (like the weight bar).
*/
.prompt-textarea-lifted {
  position: relative;
  z-index: 100;
}
/* Ensure the input slot doesn't clip the overflow */
.prompt-textarea-lifted .v-field__input {
    overflow: visible !important;
}
</style>
