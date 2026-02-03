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
    <div v-if="modelValue" class="psm-custom-modal-overlay" @click.stop>
      <div class="psm-custom-modal-backdrop" @click="clickOutsideToClose !== false && close()"></div>
      <div class="psm-custom-modal-content" :style="{ maxWidth: maxWidth ? `${maxWidth}px` : '600px' }">
        <slot></slot>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* Global styles to ensure these bypass any scoping */
.psm-custom-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 2000000000 !important; /* Extremely high z-index */
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.psm-custom-modal-backdrop {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  z-index: -1;
}

.psm-custom-modal-content {
  position: relative;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  z-index: 1;
  /* Reset Vuetify theme context slightly if needed, though usually inherited from app */
}

/* Ensure Vuetify components inside look correct */
.psm-custom-modal-content .v-card {
  width: 100%;
}
</style>
