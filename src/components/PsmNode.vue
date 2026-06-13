<script setup lang="ts">
/**
 * ツリーノードコンポーネント (再帰的)
 * グループまたはプロンプトアイテムを表示し、ドラッグ&ドロップやコンテキストメニュー操作を提供します。
 */
import { computed, inject, ref, Ref } from "vue";
import draggable from "vuedraggable";
import {
  state,
  savePrompts,
  startEdit,
  addItem,
  toggleGroupEnabled,
  teleportItem,
  setGroupChildrenEnabled,
  toggleItemEnabled,
  toggleGroupExclusive,
  resetWeight,
} from "../store";
import { PsmItem } from "../types";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

defineOptions({ name: "PsmNode" });
const props = defineProps<{
  item: PsmItem;
  depth?: number;
  parentChildren: PsmItem[];
  isParentDisabled?: boolean;
  parentGroup?: PsmItem;
}>();
const openContextMenu = inject<Function>("psm-context-menu");
const searchQuery = inject<Ref<string>>("search-query", ref(""));

/**
 * 検索クエリに基づいて表示可否を決定する
 * 自分自身または子孫のいずれかが一致すれば表示される (フィルタリング)
 */
const isVisible = computed(() => {
  if (!searchQuery.value) return true;
  const q = searchQuery.value.toLowerCase();
  // Safe match function handling null/undefined
  const match = (s: string | undefined | null) => {
    if (!s) return false;
    return s.toLowerCase().includes(q);
  };
  
  const self =
    match(props.item.name) ||
    match(props.item.content) ||
    match(props.item.memo);
    
  if (self) return true;
  
  if (props.item.is_group && props.item.children) {
    // Recursive check helper
    const check = (nodes: PsmItem[]): boolean => {
      for (const n of nodes) {
        if (!n) continue; // Safety guard
        if (
          match(n.name) ||
          match(n.content) ||
          match(n.memo)
        ) {
          return true;
        }
        // Deep recursion
        if (n.is_group && n.children && check(n.children)) {
           return true; 
        }
      }
      return false;
    };
    return check(props.item.children);
  }
  return false;
});

/**
 * 親が無効化されている場合、子も実質的に無効とみなす
 */
const isEffectiveEnabled = computed(() => {
  return props.item.enabled && !props.isParentDisabled;
});

// Auto-expand on search match
import { watch } from "vue";
watch(
  () => [isVisible.value, searchQuery.value],
  ([visible, query]) => {
    if (visible && query && props.item.is_group && !props.item.isOpen) {
      props.item.isOpen = true;
    }
  },
  { immediate: true }
);

/**
 * 子要素に渡す「親が無効化されている」フラグ
 * 自身が無効 または 親から無効継承されている場合 true
 */
const childIsParentDisabled = computed(() => {
  return !props.item.enabled || props.isParentDisabled;
});

const handleToggle = () => {
  if (props.isParentDisabled) return;
  toggleItemEnabled(props.item, props.parentChildren, props.parentGroup);
};

const handleGroupToggle = () => {
  if (props.isParentDisabled) return;
  toggleGroupEnabled(props.item);
};

const handleGroupExclusiveToggle = (val: unknown) => {
  if (props.isParentDisabled) return;
  toggleGroupExclusive(props.item, typeof val === "boolean" ? val : undefined);
};



const addBefore = (is_group: boolean) => {
  const idx = props.parentChildren.indexOf(props.item);
  addItem(props.parentChildren, is_group, idx);
};

let hoverTimer: number | null = null;

// ドラッグ中にグループの上にホバーした際、自動で開く処理
const handleGroupMouseOver = () => {
  if (state.isDragging && !props.item.isOpen) {
    if (!hoverTimer) {
      hoverTimer = window.setTimeout(() => {
        props.item.isOpen = true;
        hoverTimer = null;
      }, 500);
    }
  }
};

const handleGroupMouseLeave = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
};

/**
 * アイテムがグループにドロップされた時の処理
 * グループの中（子要素）に追加し、グループを開く
 */
const handleDropIntoGroup = async () => {
  if (state.draggedItem && state.draggedItem.id !== props.item.id) {
    // 循環ドロップ防止 (親を子にドロップしない)
    // 簡易的なチェック: ターゲットがドロップアイテムの子孫でないか確認
    
    // ターゲットグループの子要素に追加
    if (!props.item.children) props.item.children = [];
    await teleportItem(state.draggedItem, props.item.children, "child");
    props.item.isOpen = true; // ドロップ時にグループを開く
  }
};

const scaleTextClass = computed(() => {
  switch (state.uiScale) {
    case "small": return "text-scale-small";
    case "large": return "text-scale-large";
    default: return "text-scale-medium";
  }
});

const iconSize = computed(() => {
  switch (state.uiScale) {
    case "small": return "x-small";
    case "large": return "default";
    default: return "small";
  }
});
const handleClickHeader = () => {
  state.focusedItemId = props.item.id;
  props.item.isOpen = !props.item.isOpen;
};

const handleClickLeaf = () => {
  state.focusedItemId = props.item.id;
  handleToggle();
};

const counts = computed(() => {
  if (!props.item.is_group) return { active: 0, total: 0 };
  
  const calc = (nodes: PsmItem[]): { active: number; total: number } => {
    let a = 0;
    let t = 0;
    for (const n of nodes) {
      if (!n) continue;
      if (n.is_group && n.children) {
        const c = calc(n.children);
        t += c.total;
        // Count active only if group itself is enabled
        if (n.enabled) {
          a += c.active;
        }
      } else {
        t++;
        if (n.enabled) a++;
      }
    }
    return { active: a, total: t };
  };
  
  return calc(props.item.children || []);
});

const isDynamicPrompt = computed(() => {
  if (props.item.is_group) return false;
  const content = props.item.content || "";
  // Check for __name__ format
  return /^__.+__$/.test(content.trim());
});

const isDuplicate = computed(() => {
  if (props.item.is_group) return false;
  if (!isEffectiveEnabled.value) return false;
  const text = (props.item.content || "").trim();
  return !!text && state.duplicateTexts.has(text);
});

const chipColor = computed(() => {
  if (!isEffectiveEnabled.value) return 'grey';
  if (isDuplicate.value && state.duplicateHighlightLevel) {
    return state.duplicateHighlightLevel === "warn" ? "warning" : "error";
  }
  return isDynamicPrompt.value ? 'cyan-accent-2' : 'primary';
});

const moveSelf = (dir: 'up' | 'down') => {
  const idx = props.parentChildren.findIndex(n => n.id === props.item.id);
  if (idx === -1) return;
  
  if (dir === 'up') {
    if (idx > 0) {
      const temp = props.parentChildren[idx];
      props.parentChildren[idx] = props.parentChildren[idx - 1];
      props.parentChildren[idx - 1] = temp;
      savePrompts();
    }
  } else {
    if (idx < props.parentChildren.length - 1) {
      const temp = props.parentChildren[idx];
      props.parentChildren[idx] = props.parentChildren[idx + 1];
      props.parentChildren[idx + 1] = temp;
      savePrompts();
    }
  }
};
</script>

<template>
  <div
    v-if="isVisible"
    :id="'node-' + item.id"
    class="psm-node mb-1"
    :class="item.is_group ? 'w-100' : ''"
  >
    <div
      v-if="item.is_group"
      class="psm-node__group rounded border pa-1"
      :class="[
        isEffectiveEnabled ? 'bg-grey-darken-4' : 'bg-grey-darken-4 opacity-50',
        item.isRandom ? 'psm-node__group--random' : ''
      ]"
    >
      <div class="psm-node__add-zone d-flex justify-start ga-2 mb-1">
        <v-btn
          size="x-small"
          variant="flat"
          color="primary"
          @click.stop="addBefore(false)"
          data-testid="top-add-prompt"
          >⬆️Prompt</v-btn
        >
        <v-btn
          size="x-small"
          variant="flat"
          color="secondary"
          @click.stop="addBefore(true)"
          data-testid="top-add-group"
          >⬆️Group</v-btn
        >
      </div>

      <div
        class="psm-node__header d-flex align-center justify-start cursor-pointer py-1"
        :class="{ 'psm-node--focused': state.focusedItemId === item.id }"
        @click.stop="handleClickHeader"
        @dblclick.stop="startEdit(item)"
        @contextmenu.prevent.stop="
          openContextMenu?.($event, item, parentChildren)
        "
      >
        <div class="d-flex mr-2 align-center ga-1">
          <v-icon
            size="24"
            :color="parentChildren.indexOf(item) === 0 ? 'grey-darken-3' : 'grey-lighten-1'"
            class="psm-cursor-pointer psm-node__hover-scale"
            @click.stop="moveSelf('up')"
          >mdi-menu-up</v-icon>
          <v-icon
            size="24"
            :color="parentChildren.indexOf(item) === parentChildren.length - 1 ? 'grey-darken-3' : 'grey-lighten-1'"
            class="psm-cursor-pointer psm-node__hover-scale"
            @click.stop="moveSelf('down')"
          >mdi-menu-down</v-icon>
        </div>

        <v-checkbox-btn
          :model-value="item.enabled"
          :disabled="isParentDisabled"
          density="compact"
          class="mr-2 flex-grow-0"
          color="primary"
          @click.stop="handleGroupToggle"
          hide-details
        ></v-checkbox-btn>

        <v-icon
          size="small"
          class="mr-2 flex-grow-0"
          :color="isEffectiveEnabled ? 'amber' : 'grey'"
        >
          {{ item.isOpen ? "mdi-folder-open" : "mdi-folder" }}
        </v-icon>

        <span
          class="text-subtitle-2 font-weight-bold ml-0 text-truncate text-left"
          :class="{ 'text-grey': !isEffectiveEnabled }"
          data-testid="group-label"
          style="max-width: 40%"
          @dragenter="handleGroupMouseOver"
          @dragleave="handleGroupMouseLeave"
          @dragover.prevent
        >
          {{ item.name }}
        </span>

        <!-- Inline Random Switch -->
        <v-switch
          v-model="item.isRandom"
          color="purple-accent-2"
          density="compact"
          hide-details
          inset
          :label="t('randomReflection')"
          @update:modelValue="savePrompts"
          @click.stop
          class="ml-4"
          style="min-width: 150px"
        ></v-switch>

        <!-- Inline Exclusive Switch -->
        <v-switch
          v-model="item.isExclusive"
          color="teal-accent-4"
          density="compact"
          hide-details
          inset
          :label="t('exclusiveReflection')"
          @update:modelValue="handleGroupExclusiveToggle"
          @click.stop
          class="ml-4"
          style="min-width: 150px"
        ></v-switch>


        <!-- Bulk Toggle Buttons (Show on Hover) -->
        <div class="psm-node__action-buttons d-flex align-center ga-1 ml-4">
          <v-btn
            icon
            size="x-small"
            variant="text"
            color="primary"
            @click.stop="setGroupChildrenEnabled(item, true)"
            :title="t('enableAll')"
          >
            <v-icon>mdi-check-all</v-icon>
          </v-btn>
          <v-btn
            icon
            size="x-small"
            variant="text"
            color="grey"
            style="opacity: 0.7;"
            @click.stop="setGroupChildrenEnabled(item, false)"
            :title="t('disableAll')"
          >
            <v-icon>mdi-close-box-multiple-outline</v-icon>
          </v-btn>
        </div>

        <v-spacer></v-spacer>

        <span 
          class="text-caption mr-2 flex-grow-0 flex-shrink-0"
          :class="counts.active > 0 ? 'text-primary font-weight-bold' : 'text-grey font-weight-regular'"
        >
          ({{ counts.active }}/{{ counts.total }})
        </span>
      </div>
      
      <!-- Explicit Drop Zone for Closed Groups -->
      <div 
        v-if="state.isDragging && !item.isOpen"
        class="psm-node__drop-zone d-flex align-center justify-center text-caption text-grey"
        @dragenter.stop="handleGroupMouseOver"
        @dragover.prevent
        @drop.stop="handleDropIntoGroup"
      >
        <v-icon size="small" class="mr-1">mdi-arrow-down-bold-box-outline</v-icon>
        {{ t('openAndDrop') }}
      </div>

      <div
        v-if="item.isOpen"
        class="pl-4 mt-1 border-s border-opacity-25"
        :class="{ 'border-grey': !isEffectiveEnabled }"
      >
        <draggable
          v-model="item.children"
          item-key="id"
          group="psm-tree"
          handle=".drag-handle"
          :animation="200"
          class="d-flex flex-wrap align-center ga-1"
          @start="(e: { oldIndex?: number }) => { state.isDragging = true; state.draggedItem = item.children![e.oldIndex!]; }"
          @end="() => { state.isDragging = false; state.draggedItem = null; savePrompts(); }"
        >
          <template #item="{ element }">
            <PsmNode
              :item="element"
              :parentChildren="item.children!"
              :is-parent-disabled="childIsParentDisabled"
              :parent-group="item"
            />

          </template>
        </draggable>
        
        <!-- Explicit Drop Zone for Open Groups -->
        <div 
          v-if="state.isDragging"
          class="psm-node__drop-zone d-flex align-center justify-center text-caption text-grey mb-1"
          @dragover.prevent
          @drop.stop="handleDropIntoGroup"
        >
          <v-icon size="small" class="mr-1">mdi-arrow-down-bold-box-outline</v-icon>
          {{ t('addTo', { name: item.name }) }}
        </div>

        <div class="d-flex ga-1 mt-1">
          <v-btn
            size="x-small"
            variant="flat"
            color="primary"
            @click.stop="addItem(item.children!, false)"
            data-testid="inline-add-prompt"
            >+Prompt</v-btn
          >
          <v-btn
            size="x-small"
            variant="flat"
            color="secondary"
            @click.stop="addItem(item.children!, true)"
            data-testid="inline-add-group"
            >+Group</v-btn
          >
        </div>
      </div>
    </div>

    <div v-else class="d-inline-flex flex-column align-center ga-0 psm-node__leaf-container">
      <v-chip
        :color="chipColor"
        :variant="isEffectiveEnabled && !isDuplicate ? 'tonal' : 'elevated'"
        :label="!isDynamicPrompt"
        size="small"
        class="ma-0"
        :class="{ 'psm-node--focused': state.focusedItemId === item.id }"
        :title="t('doubleClickToEdit')"
        @click.stop="handleClickLeaf"
        @dblclick.stop="startEdit(item)"
        @contextmenu.prevent.stop="
          openContextMenu?.($event, item, parentChildren)
        "
      >
        <v-icon start :size="iconSize" class="psm-cursor-grab psm-node__drag-handle"
          >{{ isDynamicPrompt ? 'mdi-auto-fix' : 'mdi-drag-vertical' }}</v-icon
        >
        <span
          class="text-truncate"
          style="max-width: 150px"
          :class="[
            { 
              'text-decoration-line-through text-disabled': !isEffectiveEnabled,
              'font-italic': isDynamicPrompt && isEffectiveEnabled
            },
            scaleTextClass
          ]"
          data-testid="leaf-label"
        >
          {{ item.name || item.memo || item.content }}
        </span>
        <!-- Dynamic Prompt Indicator -->
        <span
          v-if="item.weight !== 1.0"
          class="ml-1 text-caption text-orange font-weight-bold"
          >({{ item.weight }})</span
        >

        <v-icon
          end
          :size="iconSize"
          class="ml-2 psm-node__hover-opacity"
          @click.stop="startEdit(item)"
          data-testid="edit-item-btn"
          :title="t('edit')"
        >
          mdi-pencil
        </v-icon>
      </v-chip>

      <!-- Inline weight slider (Under the chip) -->
      <div 
        v-if="state.showWeightSlider && isEffectiveEnabled" 
        class="d-flex align-center w-100 mt-1 px-1 psm-node__weight-container"
      >
        <v-slider
          v-model="item.weight"
          min="0.1"
          max="2.0"
          step="0.05"
          density="compact"
          hide-details
          color="orange"
          track-color="grey"
          class="psm-node__weight-slider flex-grow-1"
          @update:modelValue="savePrompts"
          @click.stop
        ></v-slider>
        
        <!-- Reset Button -->
        <v-btn
          icon
          size="x-small"
          variant="text"
          color="grey"
          class="ml-1 flex-shrink-0 psm-node__weight-reset"
          style="width: 16px; height: 16px; min-width: 16px; font-size: 8px;"
          @click.stop="resetWeight(item)"
          title="Reset to 1.0"
        >
          <v-icon size="10">mdi-refresh</v-icon>
        </v-btn>
      </div>
    </div>

  </div>
</template>

<style scoped lang="scss">
@use "../styles/variables" as *;

.psm-node--focused {
  outline: 2px solid $color-warning !important;
  outline-offset: -2px !important;
  background-color: $color-warning-light !important;
}

div.psm-node {
  i.psm-node__hover-opacity {
    opacity: 0.6 !important; /* デフォルトで常時表示して見落としを防ぐ */
    transition: all 0.2s;
    &:hover {
      opacity: 1 !important;
      color: #ff5722 !important; /* テーマのオレンジカラー */
    }
  }

  /* チップにホバーした時に中の鉛筆アイコンをさらに際立たせる */
  .v-chip:hover .psm-node__hover-opacity {
    opacity: 1 !important;
  }

  i.psm-node__hover-scale {
    transition: transform 0.2s;
    &:hover {
      transform: scale(1.1);
    }
  }

  &__add-zone {
    height: $size-add-zone;
    overflow: hidden;
    opacity: 1;
    margin-bottom: $spacing-xs;
  }

  div.psm-node__group {
    .psm-node__action-buttons {
      opacity: 0;
      transition: opacity 0.2s;
    }
    &:hover .psm-node__action-buttons {
      opacity: 1;
    }

    &--random {
      border: 1px dashed $color-accent !important;
      background-color: $color-accent-light !important;
    }
  }

  &__drop-zone {
    height: $size-drop-zone;
    background-color: $color-primary-light-1;
    border: 1px dashed $color-primary;
    border-radius: $radius-sm;
    margin-top: 2px;
    transition: all 0.2s;
    &:hover {
      background-color: $color-primary-light-3;
    }
  }

  /* Scale Classes */
  .v-chip.text-scale-small, .text-scale-small {
    font-size: $font-size-sm;
    line-height: 1.2;
  }
  .v-chip.text-scale-medium, .text-scale-medium {
    font-size: $font-size-base;
    line-height: 1.3;
  }
  .v-chip.text-scale-large, .text-scale-large {
    font-size: $font-size-lg;
    line-height: 1.4;
    font-weight: 500;
  }

  /* Switch Label Style */
  :deep(.v-switch .v-label) {
    font-size: $font-size-xs;
    opacity: 1;
    color: $color-text-grey;
    white-space: nowrap;
  }
  :deep(.v-switch.v-input--is-label-active .v-label) {
    color: $color-accent;
    font-weight: bold;
  }

  &__leaf-container {
    vertical-align: top;
    max-width: 180px; /* 横並びが崩れないための制限 */
  }

  &__weight-container {
    height: 18px;
  }

  &__weight-reset {
    opacity: 0.5;
    transition: opacity 0.2s;
    &:hover {
      opacity: 1 !important;
      color: orange !important;
    }
  }

  &__weight-slider {
    margin-top: 0 !important;
    margin-bottom: 0 !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    
    :deep(.v-input__control) {
      min-height: unset !important;
      height: 16px !important;
    }
    
    :deep(.v-slider-thumb) {
      width: 10px !important;
      height: 10px !important;
    }
    
    :deep(.v-slider-track) {
      height: 2px !important;
    }
  }
}


:deep(.v-selection-control__input i) {
  font-size: $font-size-icon;
}
</style>
