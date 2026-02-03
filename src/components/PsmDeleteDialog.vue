<script setup lang="ts">
/**
 * 削除確認ダイアログコンポーネント
 * アイテム削除時の確認と、削除モード（全体削除/枠のみ削除）の選択を行います。
 */
import { computed, ref, watch, nextTick } from "vue";
import { state, deleteItemFromTree, cancelDelete } from "../store";
import PsmModal from "./PsmModal.vue";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const item = computed(() => state.deletingItem);

const btnGroupOnly = ref<any>(null);
const btnDeleteAll = ref<any>(null);
const btnCancel = ref<any>(null);

/**
 * ダイアログ表示時にキャンセルボタンに初期フォーカスを当てる（誤操作防止）
 */
watch(
  () => state.isDeleting,
  async (val) => {
    if (val) {
      await nextTick();
      // 安全のためデフォルトでキャンセルにフォーカス
      const el = btnCancel.value?.$el || btnCancel.value;
      if (el && el.focus) el.focus();
    }
  }
);

/**
 * 矢印キーによるボタン間のフォーカス移動
 * @param dir "next" (下/右) or "prev" (上/左)
 */
const moveFocus = (dir: "next" | "prev") => {
  const buttons: any[] = [];
  if (btnGroupOnly.value) buttons.push(btnGroupOnly.value);
  if (btnDeleteAll.value) buttons.push(btnDeleteAll.value);
  if (btnCancel.value) buttons.push(btnCancel.value);

  if (buttons.length === 0) return;

  // 現在フォーカスされているインデックスを検索
  const currentIdx = buttons.findIndex(b => {
    const el = b.$el || b;
    return el === document.activeElement || el.contains(document.activeElement);
  });

  let nextIdx = 0;
  if (currentIdx === -1) {
    nextIdx = dir === "next" ? 0 : buttons.length - 1;
  } else {
    if (dir === "next") {
      nextIdx = (currentIdx + 1) % buttons.length;
    } else {
      nextIdx = (currentIdx - 1 + buttons.length) % buttons.length;
    }
  }

  const target = buttons[nextIdx];
  const el = target.$el || target;
  if (el && el.focus) el.focus();
};

/**
 * 削除を実行する
 * @param mode "all": 全削除, "only": グループ枠のみ削除
 */
const executeDelete = async (mode: "all" | "only") => {
  if (state.deletingItem) await deleteItemFromTree(state.deletingItem, mode);
};
</script>

<template>
  <PsmModal
    v-model="state.isDeleting"
    max-width="500"
    @click:outside="cancelDelete"
  >
      <v-card 
        class="elevation-24" 
        data-testid="delete-confirm-modal"
        @keydown.down.prevent="moveFocus('next')"
        @keydown.up.prevent="moveFocus('prev')"
      >
        <v-toolbar color="error" density="compact">
          <v-toolbar-title class="text-subtitle-1 font-weight-bold">
            {{ t('deleteConfirmTitle') }}
          </v-toolbar-title>
          <v-btn icon @click="cancelDelete"><v-icon>mdi-close</v-icon></v-btn>
        </v-toolbar>

        <v-card-text class="pt-6 pb-2 text-center">
          <v-icon size="64" color="warning" class="mb-4">mdi-alert-circle</v-icon>
          <h3 class="text-h6 mb-2">{{ t('reallyDelete') }}</h3>
          <div 
            v-if="item" 
            class="text-body-1 mb-6 bg-grey-darken-4 pa-3 rounded font-weight-bold"
          >
            {{ item.name || item.content }}
          </div>

          <div class="d-flex flex-column gap-3">
            <v-btn
              v-if="item?.is_group"
              ref="btnGroupOnly"
              block
              variant="outlined"
              size="large"
              color="warning"
              @click="executeDelete('only')"
              class="focusable-btn"
            >
              {{ t('deleteGroupOnly') }}
            </v-btn>
            <v-btn
              ref="btnDeleteAll"
              block
              color="error"
              size="large"
              @click="executeDelete('all')"
              data-testid="confirm-delete-btn"
              class="focusable-btn"
            >
              {{ t('delete') }}
            </v-btn>
          </div>
          
          <v-btn
            ref="btnCancel"
            variant="text"
            class="mt-4 focusable-btn"
            @click="cancelDelete"
          >
            {{ t('cancel') }}
          </v-btn>
      </v-card-text>
    </v-card>
  </PsmModal>
</template>

<style scoped>
.gap-3 {
  gap: 12px;
}
</style>
