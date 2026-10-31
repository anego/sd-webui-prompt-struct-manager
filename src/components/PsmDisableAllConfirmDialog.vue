<script setup lang="ts">
/**
 * ペイン一括無効化の確認ダイアログ
 * 表示状態は store の state.disableAllConfirm (null 以外で表示) で管理する。
 */
import { computed, ref, watch, nextTick } from "vue";
import PsmModal from "./PsmModal.vue";
import { state, cancelDisableAll, confirmDisableAll } from "../store";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const isOpen = computed(() => state.disableAllConfirm !== null);
const paneTitle = computed(() => state.disableAllConfirm?.title ?? "");

const confirmBtnRef = ref<{ $el?: HTMLElement } | null>(null);

/**
 * ダイアログ表示時に実行ボタンへフォーカスを当て、Enterで確定できるようにする
 */
watch(isOpen, async (open) => {
  if (!open) return;
  await nextTick();
  const el = confirmBtnRef.value?.$el || confirmBtnRef.value;
  if (el instanceof HTMLElement) {
    el.focus();
  }
});
</script>

<template>
  <PsmModal
    :model-value="isOpen"
    @update:model-value="cancelDisableAll"
    max-width="420"
  >
    <v-card @keydown.enter.prevent="confirmDisableAll" data-testid="disable-all-confirm-dialog">
      <v-toolbar density="compact" color="warning">
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          <v-icon start>mdi-close-box-multiple-outline</v-icon>
          {{ t('disableAllConfirmTitle') }}
        </v-toolbar-title>
      </v-toolbar>

      <v-card-text class="py-6 text-center text-body-1">
        {{ t('disableAllConfirmMessage', { name: paneTitle }) }}
      </v-card-text>

      <v-card-actions class="pa-4 bg-grey-darken-4">
        <v-spacer></v-spacer>
        <v-btn
          variant="text"
          size="large"
          @click="cancelDisableAll"
          data-testid="disable-all-cancel-btn"
        >
          {{ t('cancelEsc') }}
        </v-btn>
        <v-btn
          ref="confirmBtnRef"
          color="warning"
          variant="elevated"
          size="large"
          class="px-6"
          @click="confirmDisableAll"
          data-testid="disable-all-confirm-btn"
        >
          {{ t('executeEnter') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </PsmModal>
</template>
