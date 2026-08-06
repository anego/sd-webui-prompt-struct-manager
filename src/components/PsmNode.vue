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
  setGroupChildrenEnabled,
  toggleItemEnabled,
  toggleGroupExclusive,
  toggleGroupLock,
  toggleGroupHidden,
  resetWeight,
  beginDrag,
  endDrag,
  finalizeCrossListMove,
} from "../store";
import { DRAG_OPTIONS } from "../dragOptions";
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
  /** 祖先グループがロック中かどうか (グループロック機能。再帰的に子へ伝播する) */
  locked?: boolean;
}>();
const openContextMenu = inject<Function>("psm-context-menu");
const searchQuery = inject<Ref<string>>("search-query", ref(""));

/**
 * 検索クエリに基づいて表示可否を決定する
 * 自分自身または子孫のいずれかが一致すれば表示される (フィルタリング)
 */
const matchesSearchQuery = computed(() => {
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
 * 非表示グループ機能 (Phase 8): 自身が非表示グループで、
 * かつ「非表示グループの表示」がOFFの場合にtrueを返す
 */
const isHiddenByGroupSetting = computed(() => {
  return !!props.item.is_group && !!props.item.isHidden && !state.showHiddenGroups;
});

const isVisible = computed(() => {
  // 検索中は非表示フラグを無視し、検索マッチのみで可視性を決定する
  // (非表示にした場所の中身が検索で見つからなくなる事故を防ぐ)
  if (searchQuery.value) return matchesSearchQuery.value;
  if (isHiddenByGroupSetting.value) return false;
  return true;
});

/**
 * 親が無効化されている場合、子も実質的に無効とみなす
 */
const isEffectiveEnabled = computed(() => {
  return props.item.enabled && !props.isParentDisabled;
});

/**
 * 自身またはいずれかの祖先グループがロック中かどうか (グループロック機能)
 * true の間は、有効/無効の切り替えを含め一切の編集ができない
 */
const effectiveLocked = computed(() => {
  return !!props.locked || !!props.item.isLocked;
});

const handleGroupLockToggle = (val: unknown) => {
  toggleGroupLock(props.item, typeof val === "boolean" ? val : undefined);
};

const handleGroupHiddenToggle = () => {
  toggleGroupHidden(props.item);
};

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
  if (props.isParentDisabled || effectiveLocked.value) return;
  toggleItemEnabled(props.item, props.parentChildren, props.parentGroup);
};

const handleGroupToggle = () => {
  if (props.isParentDisabled || effectiveLocked.value) return;
  toggleGroupEnabled(props.item);
};

const handleGroupExclusiveToggle = (val: unknown) => {
  if (props.isParentDisabled || effectiveLocked.value) return;
  toggleGroupExclusive(props.item, typeof val === "boolean" ? val : undefined);
};



const addBefore = (is_group: boolean) => {
  const idx = props.parentChildren.indexOf(props.item);
  addItem(props.parentChildren, is_group, idx);
};

// -------------------------------------------------------------------------
// ドラッグ&ドロップ (SortableJSに統一。ネイティブDnDハンドラは使用しない)
// -------------------------------------------------------------------------

let hoverTimer: number | null = null;

/**
 * ドラッグ中にグループ名へホバーしたら、少し待って自動展開する
 * SortableJSのフォールバックモードではネイティブのdragenterが発火しないため、
 * mouseenter + isDragging で判定する
 */
const onHoverWhileDragging = () => {
  if (!state.isDragging || props.item.isOpen || hoverTimer) return;
  hoverTimer = window.setTimeout(() => {
    props.item.isOpen = true;
    hoverTimer = null;
  }, 400);
};

const cancelHoverExpand = () => {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
};

/** ドラッグ開始: 対象アイテムと元のリストを記録する */
const onDragStart = (list: PsmItem[], e: { oldIndex?: number }) => {
  beginDrag(list, e.oldIndex);
};

/** ドラッグ終了: 状態をリセットして保存する */
const onDragEnd = () => {
  endDrag();
  savePrompts();
};

/**
 * 別のリストからドロップされた時の処理
 * クローン方式のため、移動元から元のアイテムを削除して移動を確定する
 */
const onDragAdd = () => {
  finalizeCrossListMove(props.item.children!);
  savePrompts();
};

/**
 * ドラッグ移動中: ドロップ先のグループをハイライトする
 * (SortableJSのonMoveはfalseを返すと移動を禁止できるが、ここでは常に許可する)
 */
const onDragMove = () => {
  state.dropTargetId = props.item.id;
  return true;
};

/**
 * 閉じたグループのドロップゾーンへ入った時の処理
 * SortableJSが item.children へ追加済みなので、グループを開いて保存するだけでよい
 */
const onDropIntoClosedGroup = () => {
  finalizeCrossListMove(props.item.children!);
  props.item.isOpen = true;
  state.dropTargetId = null;
  savePrompts();
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

/**
 * BREAK区切りアイテムかどうか (末尾カンマ・大文字小文字を許容)
 * 該当する場合は <hr> のような横幅いっぱいの区切り線として表示する
 */
const isBreak = computed(() => {
  if (props.item.is_group) return false;
  return /^break,?$/i.test((props.item.content || "").trim());
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

/**
 * カテゴリバッジの定義 (「一般」と未設定は表示しない)
 */
const CATEGORY_BADGE: Record<string, { key: string; color: string }> = {
  quality: { key: "catShortQuality", color: "amber-darken-2" },
  subject: { key: "catShortSubject", color: "cyan-darken-2" },
  character: { key: "catShortCharacter", color: "pink-darken-2" },
  series: { key: "catShortSeries", color: "indigo-darken-1" },
  artist: { key: "catShortArtist", color: "purple-darken-2" },
};

const categoryBadge = computed(() => {
  if (!props.item.is_group || !props.item.category || props.item.category === "general") {
    return null;
  }
  return CATEGORY_BADGE[props.item.category] || null;
});

/** ヘッダ背景色 (headerColor設定時のみ適用) */
const headerStyle = computed(() => {
  if (!props.item.headerColor) return undefined;
  return { backgroundColor: props.item.headerColor, borderRadius: "4px" };
});

const moveSelf = (dir: 'up' | 'down') => {
  if (effectiveLocked.value) return;
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
    :class="(item.is_group || isBreak) ? 'w-100' : ''"
  >
    <div
      v-if="item.is_group"
      class="psm-node__group rounded border pa-1"
      :class="[
        isEffectiveEnabled ? 'bg-grey-darken-4' : 'bg-grey-darken-4 opacity-50',
        item.isRandom ? 'psm-node__group--random' : '',
        effectiveLocked ? 'psm-node__group--locked' : '',
        item.isHidden ? 'psm-node__group--hidden' : ''
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
        :style="headerStyle"
        @click.stop="handleClickHeader"
        @dblclick.stop="startEdit(item)"
        @contextmenu.prevent.stop="
          openContextMenu?.($event, item, parentChildren)
        "
      >
        <div class="d-flex mr-2 align-center ga-1">
          <v-icon
            v-if="!effectiveLocked"
            size="20"
            class="psm-cursor-grab psm-node__drag-handle"
            color="grey-lighten-1"
          >mdi-drag-vertical</v-icon>
          <v-icon
            v-else
            size="20"
            color="red-lighten-1"
            :title="t('groupLocked')"
          >mdi-lock</v-icon>
          <v-icon
            v-if="!effectiveLocked"
            size="24"
            :color="parentChildren.indexOf(item) === 0 ? 'grey-darken-3' : 'grey-lighten-1'"
            class="psm-cursor-pointer psm-node__hover-scale"
            @click.stop="moveSelf('up')"
          >mdi-menu-up</v-icon>
          <v-icon
            v-if="!effectiveLocked"
            size="24"
            :color="parentChildren.indexOf(item) === parentChildren.length - 1 ? 'grey-darken-3' : 'grey-lighten-1'"
            class="psm-cursor-pointer psm-node__hover-scale"
            @click.stop="moveSelf('down')"
          >mdi-menu-down</v-icon>
        </div>

        <v-checkbox-btn
          :model-value="item.enabled"
          :disabled="isParentDisabled || effectiveLocked"
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

        <!-- ドラッグ中のホバーで自動展開する (SortableJSはネイティブdragイベントを出さないためmouseenterで判定) -->
        <span
          class="text-subtitle-2 font-weight-bold ml-0 text-truncate text-left"
          :class="{ 'text-grey': !isEffectiveEnabled }"
          data-testid="group-label"
          style="max-width: 40%"
          @mouseenter="onHoverWhileDragging"
          @mouseleave="cancelHoverExpand"
        >
          {{ item.name }}
        </span>

        <!-- 非表示グループが「非表示グループの表示」により再表示されている際の目印 -->
        <v-icon
          v-if="item.isHidden"
          size="small"
          color="grey"
          class="ml-1 flex-shrink-0"
          :title="t('showHiddenGroups')"
          data-testid="hidden-group-badge"
        >mdi-eye-off-outline</v-icon>

        <!-- Category Badge (「一般」は非表示) -->
        <v-chip
          v-if="categoryBadge"
          size="small"
          :color="categoryBadge.color"
          variant="flat"
          label
          class="ml-2 flex-shrink-0 psm-node__category-badge"
          data-testid="group-category-badge"
        >{{ t(categoryBadge.key) }}</v-chip>

        <!-- Inline Random Switch -->
        <v-switch
          v-model="item.isRandom"
          color="purple-accent-2"
          density="compact"
          hide-details
          inset
          :disabled="effectiveLocked"
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
          :disabled="effectiveLocked"
          :label="t('exclusiveReflection')"
          @update:modelValue="handleGroupExclusiveToggle"
          @click.stop
          class="ml-4"
          style="min-width: 150px"
        ></v-switch>

        <!-- Inline Lock Switch (グループロック機能) -->
        <v-switch
          v-model="item.isLocked"
          color="red-accent-2"
          density="compact"
          hide-details
          inset
          :disabled="locked"
          :label="t('groupLocked')"
          @update:modelValue="handleGroupLockToggle"
          @click.stop
          class="ml-4"
          style="min-width: 110px"
        ></v-switch>


        <!-- Bulk Toggle Buttons (Show on Hover) -->
        <div v-if="!effectiveLocked" class="psm-node__action-buttons d-flex align-center ga-1 ml-4">
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
          <v-btn
            icon
            size="x-small"
            variant="text"
            color="grey"
            @click.stop="handleGroupHiddenToggle"
            :title="item.isHidden ? t('showGroupAction') : t('hideGroupAction')"
            data-testid="toggle-hidden-btn"
          >
            <v-icon>{{ item.isHidden ? 'mdi-eye-outline' : 'mdi-eye-off-outline' }}</v-icon>
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
      
      <!-- 閉じたグループ用のドロップゾーン
           SortableJSのリスト (item.children を対象) として実装することで、
           forceFallbackモードでも確実にドロップを受け付けられる -->
      <draggable
        v-show="state.isDragging && !item.isOpen"
        v-model="item.children"
        item-key="id"
        v-bind="DRAG_OPTIONS"
        :group="{ ...DRAG_OPTIONS.group, put: !effectiveLocked }"
        :sort="!effectiveLocked"
        class="psm-node__drop-zone d-flex align-center justify-center text-caption text-grey"
        :class="{ 'psm-node__drop-zone--hover': state.dropTargetId === item.id }"
        @start="onDragStart(item.children!, $event)"
        @end="onDragEnd"
        @add="onDropIntoClosedGroup"
      >
        <template #header>
          <div class="d-flex align-center justify-center w-100 psm-node__drop-zone-label">
            <v-icon size="small" class="mr-1">mdi-arrow-down-bold-box-outline</v-icon>
            {{ t('openAndDrop') }}
          </div>
        </template>
        <template #item="{ element }">
          <!-- SortableJSはリストの各要素に対応するDOMを必要とするが、
               ここで内容を描画するとゾーンが配下のプロンプト全件分に膨らんでしまう。
               要素は生成しつつCSSで非表示にし、ゾーンの高さを一定に保つ -->
          <span class="psm-node__drop-zone-item" :data-id="element.id"></span>
        </template>
      </draggable>

      <div
        v-if="item.isOpen"
        class="pl-4 mt-1 border-s border-opacity-25"
        :class="{ 'border-grey': !isEffectiveEnabled }"
      >
        <!-- ドラッグ中は子コンテナに最小高さを与える。
             空のグループは通常時ほぼ高さ0のため、そのままではドロップ位置を狙えない -->
        <draggable
          v-model="item.children"
          item-key="id"
          v-bind="DRAG_OPTIONS"
          :group="{ ...DRAG_OPTIONS.group, put: !effectiveLocked }"
          :sort="!effectiveLocked"
          class="d-flex flex-wrap align-center ga-1 psm-node__children"
          :class="{
            'psm-node__children--drop-target': state.dropTargetId === item.id,
            'psm-node__children--dragging': state.isDragging,
            'psm-node__children--empty': state.isDragging && !item.children?.length,
          }"
          @start="onDragStart(item.children!, $event)"
          @end="onDragEnd"
          @add="onDragAdd"
          @move="onDragMove"
        >
          <!-- 空グループ時の誘導ラベル (SortableJSの判定を妨げないよう pointer-events: none) -->
          <template #header>
            <div
              v-if="state.isDragging && !item.children?.length"
              class="psm-node__children-hint text-caption text-grey d-flex align-center justify-center w-100"
            >
              <v-icon size="small" class="mr-1">mdi-tray-arrow-down</v-icon>
              {{ t('addTo', { name: item.name }) }}
            </div>
          </template>

          <template #item="{ element }">
            <PsmNode
              :item="element"
              :parentChildren="item.children!"
              :is-parent-disabled="childIsParentDisabled"
              :parent-group="item"
              :locked="effectiveLocked"
            />

          </template>
        </draggable>

        <div v-if="!effectiveLocked" class="d-flex ga-1 mt-1">
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

    <!-- BREAK Divider (横幅いっぱいの区切り線) -->
    <div
      v-else-if="isBreak"
      class="psm-node__break d-flex align-center w-100"
      :class="{
        'psm-node__break--disabled': !isEffectiveEnabled,
        'psm-node--focused': state.focusedItemId === item.id
      }"
      :title="t('doubleClickToEdit')"
      @click.stop="handleClickLeaf"
      @dblclick.stop="startEdit(item)"
      @contextmenu.prevent.stop="openContextMenu?.($event, item, parentChildren)"
      data-testid="break-divider"
    >
      <v-icon
        v-if="!effectiveLocked"
        size="16"
        class="psm-cursor-grab psm-node__drag-handle flex-shrink-0 mr-1"
        color="grey-lighten-1"
      >mdi-drag-vertical</v-icon>

      <span class="psm-node__break-line"></span>

      <span class="psm-node__break-label flex-shrink-0 px-2">
        <v-icon size="14" class="mr-1">mdi-format-page-break</v-icon>BREAK
      </span>

      <span class="psm-node__break-line"></span>

      <v-icon
        v-if="!effectiveLocked"
        size="16"
        class="ml-1 flex-shrink-0 psm-node__hover-opacity"
        @click.stop="startEdit(item)"
        :title="t('edit')"
        data-testid="edit-item-btn"
      >mdi-pencil</v-icon>
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
        <v-icon
          v-if="!effectiveLocked"
          start
          :size="iconSize"
          class="psm-cursor-grab psm-node__drag-handle flex-shrink-0"
          >{{ isDynamicPrompt ? 'mdi-auto-fix' : 'mdi-drag-vertical' }}</v-icon
        >
        <span
          class="text-truncate flex-shrink-1"
          style="max-width: 110px"
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
          class="ml-1 text-caption text-orange font-weight-bold flex-shrink-0"
          >({{ item.weight }})</span
        >

        <v-icon
          v-if="!effectiveLocked"
          end
          :size="iconSize"
          class="ml-2 psm-node__hover-opacity flex-shrink-0"
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
          :disabled="effectiveLocked"
          class="psm-node__weight-slider flex-grow-1"
          @update:modelValue="savePrompts"
          @click.stop
        ></v-slider>

        <!-- Reset Button -->
        <v-btn
          v-if="!effectiveLocked"
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

  /* カテゴリバッジ: 濃色背景でも読めるよう白抜き+太字で強調 */
  .psm-node__category-badge {
    color: #fff !important;
    font-weight: bold;
    letter-spacing: 0.02em;
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

    /* グループロック機能: 編集不可であることを一目で分かるようにする */
    &--locked {
      border: 1px dashed rgba(239, 83, 80, 0.7) !important;
      background-image: repeating-linear-gradient(
        45deg,
        rgba(239, 83, 80, 0.06),
        rgba(239, 83, 80, 0.06) 10px,
        transparent 10px,
        transparent 20px
      );
    }

    /* グループ非表示機能: 「非表示グループの表示」により再表示中であることを控えめに示す */
    &--hidden {
      opacity: 0.6;
      border-style: dotted !important;
    }
  }

  &__drop-zone {
    min-height: $size-drop-zone;
    /* 配下の要素数に関わらずゾーンの高さを一定に保つ (レイアウト崩れの保険) */
    max-height: $size-drop-zone + 12px;
    overflow: hidden;
    background-color: $color-primary-light-1;
    border: 1px dashed $color-primary;
    border-radius: $radius-sm;
    margin-top: 2px;
    transition: all 0.2s;
    &:hover {
      background-color: $color-primary-light-3;
    }

    /* ドロップ先として選択されている状態 */
    &--hover {
      background-color: $color-primary-light-3;
      border-style: solid;
      border-width: 2px;
    }
  }

  &__drop-zone-label {
    pointer-events: none; /* SortableJSの判定を妨げない */
  }

  /* 閉じたグループのドロップゾーン内に描画される各アイテム。
     内容は表示せず、ゾーンが配下の件数で膨らまないようにする */
  &__drop-zone-item {
    display: none;
  }

  /* ドロップ先のグループを枠線で明示する */
  &__children--drop-target {
    outline: 2px dashed rgba(33, 150, 243, 0.55);
    outline-offset: 2px;
    border-radius: $radius-sm;
  }

  /* ドラッグ中は子コンテナに最小高さを確保し、狭いグループでも狙えるようにする */
  &__children--dragging {
    min-height: $size-drop-zone + 8px;
    align-content: center;
    border-radius: $radius-sm;
    transition: background-color 0.2s;
  }

  /* 空グループはドロップ領域として明示する */
  &__children--empty {
    min-height: $size-add-zone + 6px;
    background-color: $color-primary-light-1;
    border: 1px dashed $color-primary;

    &:hover {
      background-color: $color-primary-light-3;
    }
  }

  &__children-hint {
    pointer-events: none; /* SortableJSの当たり判定を妨げない */
    height: 100%;
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

  /* BREAK区切り (<hr>のように横幅いっぱい)
     ※ &__xxx は親セレクタ(div.psm-node)と結合して div.psm-node__xxx になるため、
        span要素にも当たるようクラスのみのセレクタで指定する */
  .psm-node__break {
    cursor: pointer;
    padding: 4px 2px;
    border-radius: $radius-sm;
    background-color: rgba(255, 152, 0, 0.06);
    transition: background-color 0.2s;
    user-select: none;

    &:hover {
      background-color: rgba(255, 152, 0, 0.14);
    }
  }

  .psm-node__break-line {
    flex: 1 1 auto;
    min-width: 12px;
    align-self: center;
    border-top: 2px dashed rgba(255, 152, 0, 0.7); /* オレンジの破線で区切りを明示 */
    font-size: 0;
    line-height: 0;
  }

  .psm-node__break-label {
    font-size: $font-size-xs;
    font-weight: bold;
    letter-spacing: 0.18em;
    color: #ffb74d;
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    text-shadow: 0 0 4px rgba(255, 152, 0, 0.35);
  }

  .psm-node__break--disabled {
    background-color: rgba(255, 255, 255, 0.02);

    &:hover {
      background-color: rgba(255, 255, 255, 0.05);
    }

    .psm-node__break-line {
      border-top-color: rgba(158, 158, 158, 0.45);
      border-top-style: dotted;
    }
    .psm-node__break-label {
      color: $color-text-grey;
      text-decoration: line-through;
      text-shadow: none;
    }
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
