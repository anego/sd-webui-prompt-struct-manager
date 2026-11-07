<script setup lang="ts">
/**
 * ツリーペインコンポーネント
 * Positive/Negativeプロンプトのツリーを表示・操作するためのペイン領域です。
 * ヘッダー、開閉機能、およびルートアイテムへの追加ボタンを持ちます。
 */
import { computed, provide, watch } from "vue";
import draggable from "vuedraggable";
import PsmNode from "./PsmNode.vue";
import { PaneName, PsmItem } from "../types";
import {
  addItem,
  savePrompts,
  state,
  estimateTokenCount,
  getCompiledPrompts,
  CLIP_CHUNK_SIZE,
  beginDrag,
  endDrag,
  finalizeCrossListMove,
  toggleShowHiddenGroups,
  snapshotGroupOpenState,
  restoreGroupOpenState,
  requestDisableAll,
  findParentAndItem,
  withGroupsOpen,
} from "../store";
import { DRAG_OPTIONS } from "../dragOptions";
import { buildEnabledView, isHiddenBySearch } from "../viewFilter";
import { toInputText } from "../inputValue";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const props = defineProps<{
  /** ペインの種類 (検索欄の入力をストアで持つためのキー) */
  pane: PaneName;
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

/** このペインの検索欄の入力 (キーボードの上下移動でも同じ絞り込みを使うため、ストアで持つ) */
const searchQuery = computed(() => state.paneSearchQuery[props.pane]);
provide("search-query", searchQuery);

/**
 * 検索欄の v-model 用
 * クリアボタンで null が入ると、表示フィルターの計算などで toLowerCase が失敗するため、空文字列に変換して保持する。
 */
const searchInput = computed({
  get: () => searchQuery.value,
  set: (value: string | null) => {
    state.paneSearchQuery[props.pane] = toInputText(value);
  },
});

/**
 * 表示フィルター (有効のみ / 有効(グループ付き)) で表示する項目
 * 検索欄の絞り込みも含めて計算する。フィルターが「すべて」の間は null。
 */
const filterView = computed(() => {
  if (state.viewFilterMode === "all") return null;
  return buildEnabledView(props.items, searchQuery.value);
});
provide("filter-view", filterView);

/** 「有効のみ」ではグループの枠を出さず、プロンプトだけを並べる */
const isFlatView = computed(() => state.viewFilterMode === "enabled");

/** 検索か表示フィルターのどちらかで絞り込み中か */
const isFiltering = computed(() => !!searchQuery.value || state.viewFilterMode !== "all");

/**
 * 検索・表示フィルターでグループが自動展開された際、解除後に元の開閉状態へ戻すためのスナップショット
 * 絞り込みの開始時に保存し、検索とフィルターの両方を解除した時に復元する
 */
let groupOpenSnapshot: Map<number, boolean> | null = null;
watch(isFiltering, (filtering, wasFiltering) => {
  if (filtering && !wasFiltering) {
    groupOpenSnapshot = snapshotGroupOpenState(props.items);
  } else if (!filtering && wasFiltering && groupOpenSnapshot) {
    restoreGroupOpenState(props.items, groupOpenSnapshot);
    groupOpenSnapshot = null;
  }
});

/**
 * 重複の一覧ダイアログの「場所を表示」で、このペインのアイテムが見えるようにする
 * (祖先グループとペインの展開、フォーカスはストア側で済ませている)
 * 検索・表示フィルターを解除したときの開閉状態の復元で、表示のために開いたグループが閉じないよう、スナップショットも「開」にする。
 * スナップショットの更新は検索の解除より先に行う (検索の解除で絞り込みが終わると、その場で復元されるため)。
 */
watch(
  () => state.revealRequest,
  (request) => {
    if (!request) return;
    const found = findParentAndItem(request.itemId, props.items, props.items);
    if (!found) return;
    if (groupOpenSnapshot) groupOpenSnapshot = withGroupsOpen(groupOpenSnapshot, request.groupIds);
    if (!isHiddenBySearch(props.items, found.item, { mode: state.viewFilterMode, query: searchQuery.value })) return;
    state.paneSearchQuery[props.pane] = "";
  }
);

const emit = defineEmits<{
  (e: "update:isOpen", value: boolean): void;
  (e: "update:items", value: PsmItem[]): void;
}>();

/**
 * ペインのスタイルクラス (開閉状態に応じて幅を制御)
 * CSS遷移によりスムーズに開閉します。
 */
const paneClass = computed(() => {
  return props.isOpen ? "psm-pane--open" : "psm-pane--collapsed";
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

/**
 * このペインのトークン数概算 (ツリー変更に追従してライブ更新)
 * animaモードではCLIPのチャンク概念がないため、チャンク表示は行わない
 */
const tokenEstimate = computed(() =>
  estimateTokenCount(getCompiledPrompts(props.items, ", ", true))
);

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
        class="psm-pane__header--hoverable d-flex align-center px-3 py-2 bg-grey-darken-3 border-b border-grey-darken-2 flex-shrink-0 cursor-pointer"
        @click="toggleOpen"
      >
        <v-icon :color="color" size="small" class="mr-2">{{ icon }}</v-icon>
        <span class="font-weight-bold text-subtitle-2 text-truncate mr-2" style="max-width: 80px;">{{
          title
        }}</span>

        <v-text-field
          v-model="searchInput"
          density="compact"
          variant="solo-filled"
          flat
          hide-details
          prepend-inner-icon="mdi-magnify"
          placeholder="Filter..."
          class="flex-grow-1 mx-2 psm-pane__search-input"
          style="max-width: 160px; min-width: 80px;"
          @click.stop
          @keydown.stop
          clearable
        ></v-text-field>

        <v-btn
          icon
          size="x-small"
          variant="text"
          :color="state.showHiddenGroups ? 'primary' : 'grey'"
          class="flex-shrink-0"
          @click.stop="toggleShowHiddenGroups"
          :title="t('showHiddenGroups')"
          data-testid="toggle-show-hidden-groups"
        >
          <v-icon>{{ state.showHiddenGroups ? 'mdi-eye' : 'mdi-eye-off' }}</v-icon>
        </v-btn>

        <v-btn
          icon
          size="x-small"
          variant="text"
          color="grey"
          class="flex-shrink-0"
          @click.stop="requestDisableAll(title, items)"
          :title="t('disableAllInPane')"
          data-testid="disable-all-in-pane"
        >
          <v-icon>mdi-close-box-multiple-outline</v-icon>
        </v-btn>

        <v-spacer></v-spacer>

        <!-- トークン数の概算 (ライブ更新) -->
        <span
          class="text-caption mr-2 flex-shrink-0 psm-pane__token-count"
          :class="(state.modelMode !== 'anima' && tokenEstimate.chunks > 1) ? 'text-warning' : 'text-grey'"
          :title="t('tokenHint')"
          data-testid="token-count"
        >
          ≈{{ tokenEstimate.tokens }}<template v-if="state.modelMode !== 'anima'">/{{ tokenEstimate.chunks * CLIP_CHUNK_SIZE }}</template>
        </span>

        <div class="d-flex ga-1">
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
        class="flex-grow-1 overflow-y-auto pa-2 bg-grey-darken-4 psm-scrollbar--dynamic"
        :class="scaleClass"
      >
        <!-- 「有効のみ」: グループの枠なしでプロンプトだけを並べる (並び順がツリーと対応しないため、ドラッグでの並べ替えはできない) -->
        <div
          v-if="isFlatView && filterView"
          class="psm-pane__flat-list d-flex flex-wrap align-center ga-1"
          data-testid="flat-filter-list"
        >
          <PsmNode
            v-for="entry in filterView.flatLeaves"
            :key="entry.item.id"
            :item="entry.item"
            :parentChildren="entry.parentChildren"
            :locked="entry.locked"
            :is-parent-hidden="entry.inHiddenGroup"
          />
        </div>
        <draggable
          v-else
          v-model="writableItems"
          item-key="id"
          v-bind="DRAG_OPTIONS"
          class="d-flex flex-wrap align-center ga-1"
          @start="(e: { oldIndex?: number }) => beginDrag(writableItems, e.oldIndex)"
          @end="() => { endDrag(); savePrompts(); }"
          @add="() => { finalizeCrossListMove(writableItems); savePrompts(); }"
        >
          <template #item="{ element }">
            <PsmNode :item="element" :parentChildren="writableItems" />
          </template>
        </draggable>
        <div
          v-if="filterView && filterView.visibleIds.size === 0"
          class="text-caption text-grey text-center py-4"
          data-testid="filter-empty"
        >
          {{ t('viewFilterEmpty') }}
        </div>
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
      class="psm-pane__placeholder--hoverable h-100 d-flex flex-column align-center pt-4 bg-grey-darken-3 cursor-pointer"
      @click="openPane"
      :title="t('clickToOpen')"
    >
      <v-icon :color="color" class="mb-2">{{ icon }}</v-icon>
      <div class="psm-pane__text-vertical text-subtitle-2 font-weight-bold text-grey">
        {{ title.toUpperCase() }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/variables" as *;

div.psm-pane {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  &--open {
    flex: 1 1 0;
    min-width: 0;
  }

  &--collapsed {
    flex: 0 0 40px;
  }

  div.psm-pane__header--hoverable:hover {
    background-color: $color-bg-hover;
  }

  div.psm-pane__placeholder--hoverable:hover {
    filter: brightness(1.2);
  }

  div.psm-pane__text-vertical {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    letter-spacing: 2px;
    white-space: nowrap;
  }

  /* 「有効のみ」の一覧ではドラッグで並べ替えられないため、つかむカーソルを出さない */
  div.psm-pane__flat-list :deep(.psm-node__drag-handle) {
    cursor: default;
  }
}

/* Scale font sizes */
.scale-small {
  font-size: $font-size-sm;
}
.scale-medium {
  font-size: $font-size-base;
}
.scale-large {
  font-size: $font-size-lg;
}
</style>
