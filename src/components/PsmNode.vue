<script setup lang="ts">
/**
 * ツリーノードコンポーネント (再帰的)
 * グループまたはプロンプトアイテムを表示し、ドラッグ&ドロップやコンテキストメニュー操作を提供します。
 */
import { computed, inject } from "vue";
import draggable from "vuedraggable";
import {
  state,
  savePrompts,
  startEdit,
  addItem,
  toggleGroupEnabled,
  teleportItem,
  setGroupChildrenEnabled,
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
}>();
const openContextMenu = inject<Function>("psm-context-menu");

/**
 * 検索クエリに基づいて表示可否を決定する
 * 自分自身または子孫のいずれかが一致すれば表示される (フィルタリング)
 */
const isVisible = computed(() => {
  if (!state.searchQuery) return true;
  const q = state.searchQuery.toLowerCase();
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
  () => [isVisible.value, state.searchQuery],
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
  props.item.enabled = !props.item.enabled;
  savePrompts();
};

const handleGroupToggle = () => {
  if (props.isParentDisabled) return;
  toggleGroupEnabled(props.item);
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
    class="psm-node-wrapper mb-1"
    :class="item.is_group ? 'w-100' : ''"
  >
    <div
      v-if="item.is_group"
      class="group-container rounded border pa-1"
      :class="[
        isEffectiveEnabled ? 'bg-grey-darken-4' : 'bg-grey-darken-4 opacity-50',
        item.isRandom ? 'random-mode-group' : ''
      ]"
    >
      <div class="top-add-zone d-flex justify-start ga-2 mb-1">
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
        class="d-flex align-center justify-start cursor-pointer py-1 node-header"
        :class="{ 'focused': state.focusedItemId === item.id }"
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
            class="cursor-pointer hover-scale"
            @click.stop="moveSelf('up')"
          >mdi-menu-up</v-icon>
          <v-icon
            size="24"
            :color="parentChildren.indexOf(item) === parentChildren.length - 1 ? 'grey-darken-3' : 'grey-lighten-1'"
            class="cursor-pointer hover-scale"
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

        <!-- Bulk Toggle Buttons (Show on Hover) -->
        <div class="action-buttons d-flex align-center ga-1 ml-4">
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
        class="drop-into-zone d-flex align-center justify-center text-caption text-grey"
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
          @start="(e: any) => { state.isDragging = true; state.draggedItem = item.children![e.oldIndex!]; }"
          @end="() => { state.isDragging = false; state.draggedItem = null; savePrompts(); }"
        >
          <template #item="{ element }">
            <PsmNode
              :item="element"
              :parentChildren="item.children!"
              :is-parent-disabled="childIsParentDisabled"
            />
          </template>
        </draggable>
        
        <!-- Explicit Drop Zone for Open Groups -->
        <div 
          v-if="state.isDragging"
          class="drop-into-zone d-flex align-center justify-center text-caption text-grey mb-1"
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

    <v-chip
      v-else
      :color="isEffectiveEnabled ? (isDynamicPrompt ? 'cyan-accent-2' : 'primary') : 'grey'"
      :variant="isEffectiveEnabled ? 'tonal' : 'outlined'"
      :label="!isDynamicPrompt"
      size="small"
      class="ma-0"
      :class="{ 'focused': state.focusedItemId === item.id }"
      @click.stop="handleClickLeaf"
      @dblclick.stop="startEdit(item)"
      @contextmenu.prevent.stop="
        openContextMenu?.($event, item, parentChildren)
      "
    >
      <v-icon start :size="iconSize" class="cursor-grab drag-handle"
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
      <!-- Dynamic Prompt Indicator (Icon already in start slot) -->
      <span
        v-if="item.weight !== 1.0"
        class="ml-1 text-caption text-orange font-weight-bold"
        >({{ item.weight }})</span
      >

      <v-icon
        end
        :size="iconSize"
        class="ml-2 opacity-50 hover-opacity-100"
        @click.stop="startEdit(item)"
        data-testid="edit-item-btn"
      >
        mdi-cog
      </v-icon>
    </v-chip>
  </div>
</template>

<style scoped>
.focused {
  outline: 2px solid #2196f3;
  outline-offset: -2px;
  background-color: rgba(33, 150, 243, 0.1);
}
.hover-opacity-100:hover {
  opacity: 1 !important;
}
.cursor-grab {
  cursor: grab;
}

.top-add-zone {
  /* 常時表示へ変更: 元々は height:0; opacity:0; だった */
  height: 28px;
  overflow: hidden;
  opacity: 1;
  margin-bottom: 4px;
}
/*.group-container:hover .top-add-zone {
   hoverでの制御を無効化 (常時表示のため)
}*/

.group-container .action-buttons {
  opacity: 0;
  transition: opacity 0.2s;
}
.group-container:hover .action-buttons {
  opacity: 1;
}

:deep(.v-selection-control__input i) {
  font-size: 18px;
}

.drop-into-zone {
  height: 24px;
  background-color: rgba(33, 150, 243, 0.2);
  border: 1px dashed #2196f3;
  border-radius: 4px;
  margin-top: 2px;
  transition: all 0.2s;
}
.drop-into-zone:hover {
  background-color: rgba(33, 150, 243, 0.4);
}


/* Update focused color to Orange to distinguish from Enabled (Blue) */
.focused {
  outline: 2px solid #FF9800 !important; /* Orange */
  outline-offset: -2px;
  background-color: rgba(255, 152, 0, 0.15) !important;
}

.random-mode-group {
  border: 1px dashed #E040FB !important; /* Purple Accent */
  background-color: rgba(224, 64, 251, 0.1) !important;
}

/* Scale Classes */
.text-scale-small {
  font-size: 0.85rem !important; /* ~13.6px -> Target 14pxish */
  line-height: 1.2;
}
.text-scale-medium {
  font-size: 1rem !important; /* ~16px */
  line-height: 1.3;
}
.text-scale-large {
  font-size: 1.2rem !important; /* ~19.2px */
  line-height: 1.4;
  font-weight: 500;
}


/* Switch Label Style */
:deep(.v-switch .v-label) {
  font-size: 0.75rem !important;
  opacity: 1 !important;
  color: #BDBDBD; /* Grey lighten-1 approx */
  white-space: nowrap;
}
:deep(.v-switch.v-input--is-label-active .v-label) {
  color: #E040FB !important; /* Purple Accent 2 */
  font-weight: bold;
}
</style>
