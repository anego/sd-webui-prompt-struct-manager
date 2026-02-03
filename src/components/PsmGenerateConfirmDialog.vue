<script setup lang="ts">
/**
 * 生成確認ダイアログ
 * 最終的なプロンプト生成と実行を行う前のワンクッション確認用。
 */
import { ref, watch, nextTick } from "vue";
import PsmModal from "./PsmModal.vue";

const props = defineProps<{
  /** ダイアログ表示状態 (v-model) */
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  /** 確定時に発火されるイベント */
  (e: "confirm"): void;
}>();

const confirmBtnRef = ref<HTMLElement | null>(null);

/**
 * ダイアログ表示時に実行ボタンにフォーカスを当てる
 * ユーザーが即座にEnterで確定できるようにするため
 */
watch(
  () => props.modelValue,
  async (val) => {
    if (val) {
      await nextTick();
      const el = (confirmBtnRef.value as any)?.$el || confirmBtnRef.value;
      if (el instanceof HTMLElement) {
        el.focus();
      }
    }
  }
);

const onConfirm = () => {
  emit("confirm");
  emit("update:modelValue", false);
};

const onCancel = () => {
  emit("update:modelValue", false);
};

import { useI18n } from "../composables/useI18n";
const { t } = useI18n();
</script>

<template>
  <PsmModal
    :model-value="modelValue"
    @update:model-value="onCancel"
    max-width="400"
  >
    <v-card @keydown.enter.prevent="onConfirm" data-testid="generate-confirm-dialog">
      <v-toolbar density="compact" color="primary">
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          <v-icon start>mdi-rocket-launch</v-icon>
          {{ t('generateConfirmTitle') }}
        </v-toolbar-title>
      </v-toolbar>

      <v-card-text class="py-6 text-center text-body-1">
        {{ t('generateConfirmMessage') }}
      </v-card-text>

      <v-card-actions class="pa-4 bg-grey-darken-4">
        <v-spacer></v-spacer>
        <v-btn variant="text" size="large" @click="onCancel">
          {{ t('cancelEsc') }}
        </v-btn>
        <v-btn
          ref="confirmBtnRef"
          color="primary"
          variant="elevated"
          size="large"
          class="px-6"
          @click="onConfirm"
          data-testid="confirm-generate-btn"
        >
          {{ t('executeEnter') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </PsmModal>
</template>
