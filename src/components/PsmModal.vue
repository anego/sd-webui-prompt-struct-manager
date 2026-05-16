<script setup lang="ts">

/**
 * Teleportを使用したカスタムモーダルコンポーネント
 * Vuetifyのv-dialogがz-indexやスタックコンテキスト干渉を起こす場合の代替として使用。
 * body直下にレンダリングされます。
 */

// Props定義
const props = defineProps<{
  /** モーダルの表示状態 (v-model) */
  modelValue: boolean;
  /** コンテンツの最大幅 (px) */
  maxWidth?: string | number;
  /** オーバーレイクリックで閉じるかどうか (デフォルトtrue) */
  clickOutsideToClose?: boolean;
}>();

// Emits定義
const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "click:outside"): void;
}>();

/**
 * モーダルを閉じる処理
 */
const close = () => {
  emit("update:modelValue", false);
  emit("click:outside");
};

import { onMounted, onUnmounted, watch } from "vue";

/**
 * Escapeキー押下時のハンドラ
 * モーダルが表示されている場合のみ閉じる処理を実行
 */
const handleKeydown = (e: KeyboardEvent) => {
  if (props.modelValue && e.key === "Escape") {
    // Avoid double closing if handled elsewhere, but PsmModal should own its close
    e.stopPropagation(); // Consume escape
    close();
  }
};

onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleKeydown));

</script>

<template>
  <Teleport to="#psm_vue_app_overlay">
    <div v-if="modelValue" class="psm-modal__overlay" @click.stop>
      <div class="psm-modal__backdrop" @click="clickOutsideToClose !== false && close()"></div>
      <div class="psm-modal__content" :style="{ maxWidth: maxWidth ? `${maxWidth}px` : '600px' }">
        <slot></slot>
      </div>
    </div>
  </Teleport>
</template>
