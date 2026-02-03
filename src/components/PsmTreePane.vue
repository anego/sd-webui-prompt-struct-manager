<script setup lang="ts">
/**
 * ツリーペインコンポーネント
 * Positive/Negativeプロンプトのツリーを表示・操作するためのペイン領域です。
 * ヘッダー、開閉機能、およびルートアイテムへの追加ボタンを持ちます。
 */
import { computed } from "vue";
import draggable from "vuedraggable";
import PsmNode from "./PsmNode.vue";
import { PsmItem } from "../types";
import { addItem, savePrompts, state } from "../store";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const props = defineProps<{
  /** ペインタイトル (例: Positive) */
  title: string;
  /** ヘッダーアイコン (mdi name) */
  icon: string;
  /** カラーテーマ */
  color: string;
  /** ルートアイテムリスト (v-model:items) */
  items: PsmItem[]; // v-model equivalent but verify usage
  /** ペインの開閉状態 (v-model:isOpen) */
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "update:isOpen", value: boolean): void;
  (e: "update:items", value: PsmItem[]): void;
}>();

/**
 * ペインのスタイルクラス (開閉状態に応じて幅を制御)
 * CSS遷移によりスムーズに開閉します。
 */
const paneClass = computed(() => {
  return props.isOpen ? "psm-pane-open" : "psm-pane-collapsed";
});

/**
 * v-model:items 用のComputedプロパティ
 */
const writableItems = computed({
  get: () => props.items,
  set: (val) => emit("update:items", val),
});

const scaleClass = computed(() => {
  switch (state.uiScale) {
    case "small": return "scale-small";
    case "large": return "scale-large";
    default: return "scale-medium";
  }
});

const toggleOpen = () => emit("update:isOpen", !props.isOpen);
const closePane = () => emit("update:isOpen", false);
const openPane = () => emit("update:isOpen", true);
</script>

<template>
  <div
    class="psm-pane d-flex flex-column border-e border-grey-darken-2"
    :class="paneClass"
    :data-dragging="state.isDragging"
  >
    <template v-if="isOpen">
      <div
        class="d-flex align-center px-3 py-2 bg-grey-darken-3 border-b border-grey-darken-2 flex-shrink-0 cursor-pointer hover-header"
        @click="toggleOpen"
      >
        <v-icon :color="color" size="small" class="mr-2">{{ icon }}</v-icon>
        <span class="font-weight-bold text-subtitle-2 text-truncate">{{
          title
        }}</span>
        <v-spacer></v-spacer>
        <div class="d-flex ga-1">
          <v-btn
            size="x-small"
            variant="text"
            icon="mdi-file-plus"
            @click.stop="addItem(items, false)"
            :title="t('addPrompt')"
          ></v-btn>
          <v-btn
            size="x-small"
            variant="text"
            icon="mdi-folder-plus"
            @click.stop="addItem(items, true)"
            :title="t('addGroup')"
          ></v-btn>
          <v-btn
            size="x-small"
            variant="text"
            icon="mdi-close"
            @click.stop="closePane"
            :title="t('close')"
          ></v-btn>
        </div>
      </div>

      <div
        class="flex-grow-1 overflow-y-auto pa-2 bg-grey-darken-4 scroll-container"
        :class="scaleClass"
      >
        <draggable
          v-model="writableItems"
          item-key="id"
          group="psm-tree"
          handle=".drag-handle"
          :animation="200"
          class="d-flex flex-wrap align-center ga-1"
          @start="(e: any) => { state.isDragging = true; state.draggedItem = writableItems[e.oldIndex!]; }"
          @end="() => { state.isDragging = false; state.draggedItem = null; savePrompts(); }"
        >
          <template #item="{ element }">
            <PsmNode :item="element" :parentChildren="writableItems" />
          </template>
        </draggable>
        <div
          class="d-flex justify-center ga-2 mt-4 pt-2 border-t border-dashed"
          data-testid="root-add-area"
        >
          <v-btn
            size="x-small"
            variant="flat"
            color="primary"
            @click="addItem(items, false)"
            data-testid="root-add-prompt"
            >+Prompt</v-btn
          >
          <v-btn
            size="x-small"
            variant="flat"
            color="secondary"
            @click="addItem(items, true)"
            data-testid="root-add-group"
            >+Group</v-btn
          >
        </div>
      </div>
    </template>

    <div
      v-else
      class="h-100 d-flex flex-column align-center pt-4 bg-grey-darken-3 cursor-pointer hover-bright"
      @click="openPane"
      :title="t('clickToOpen')"
    >
      <v-icon :color="color" class="mb-2">{{ icon }}</v-icon>
      <div class="text-vertical text-subtitle-2 font-weight-bold text-grey">
        {{ title.toUpperCase() }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.psm-pane {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.psm-pane-open {
  flex: 1 1 0;
  min-width: 0;
}
.psm-pane-collapsed {
  flex: 0 0 40px;
}
.hover-header:hover {
  background-color: #424242 !important;
}
.text-vertical {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 2px;
  white-space: nowrap;
}
.hover-bright:hover {
  filter: brightness(1.2);
}

/* Scale font sizes */
.scale-small {
  font-size: 0.85rem;
}
.scale-medium {
  font-size: 1rem;
}
.scale-large {
  font-size: 1.2rem;
}

.scroll-container::-webkit-scrollbar {
  width: 1.5em; /* dynamically based on font-size */
}
.scroll-container::-webkit-scrollbar-track {
  background: #333;
}
.scroll-container::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 99px; /* rounded pill */
  border: 0.35em solid #333; /* border scales too */
}
.scroll-container::-webkit-scrollbar-thumb:hover {
  background: #777;
}

</style>
