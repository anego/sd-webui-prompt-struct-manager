<script setup lang="ts">
/**
 * 移動先クイック選択ダイアログ
 * グループ数が多い環境でも、数文字の入力で移動先を絞り込めるようにします。
 * 最近使った移動先を先頭に固定し、同名グループを区別するため親パスを併記します。
 */
import { computed, ref, watch, nextTick } from "vue";
import {
  state,
  collectMoveTargets,
  executeMoveTo,
  closeMoveDialog,
  MoveTarget,
} from "../store";
import PsmModal from "./PsmModal.vue";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const query = ref("");
const activeIndex = ref(0);
const searchInput = ref<{ focus: () => void } | null>(null);
const listRef = ref<HTMLElement | null>(null);

/** 全移動先候補 (自分自身と子孫は除外済み) */
const allTargets = computed<MoveTarget[]>(() => {
  if (!state.moveDialogItem) return [];
  return collectMoveTargets(state.moveDialogItem, {
    positive: t("positive"),
    negative: t("negative"),
  });
});

/**
 * 表示リスト: 最近使った移動先を先頭に置き、続いて残りを元の順序で並べる
 * 検索時は絞り込み結果のみ (パスとグループ名の部分一致・大文字小文字を無視)
 */
const displayTargets = computed<{ target: MoveTarget; isRecent: boolean }[]>(() => {
  const q = query.value.trim().toLowerCase();
  const matched = q
    ? allTargets.value.filter((tg) => tg.path.toLowerCase().includes(q) || tg.name.toLowerCase().includes(q))
    : allTargets.value;

  const recentIds = state.recentMoveTargets.map((r) => r.id);
  const recent = recentIds
    .map((id) => matched.find((tg) => tg.id === id))
    .filter((tg): tg is MoveTarget => !!tg)
    .map((tg) => ({ target: tg, isRecent: true }));
  const rest = matched
    .filter((tg) => !recentIds.includes(tg.id))
    .map((tg) => ({ target: tg, isRecent: false }));

  return [...recent, ...rest];
});

/** ダイアログを開いた際に入力欄へフォーカスし、状態をリセットする */
watch(
  () => state.isMoveDialogOpen,
  async (open) => {
    if (open) {
      query.value = "";
      activeIndex.value = 0;
      await nextTick();
      setTimeout(() => searchInput.value?.focus(), 50);
    }
  }
);

/** 絞り込み内容が変わったら選択位置を先頭へ戻す */
watch(query, () => {
  activeIndex.value = 0;
});

/** 選択中の項目が画面外ならスクロールして見えるようにする */
const scrollActiveIntoView = async () => {
  await nextTick();
  const el = listRef.value?.querySelector(".psm-move__item--active") as HTMLElement | null;
  el?.scrollIntoView({ block: "nearest" });
};

const moveSelection = async (delta: number) => {
  const len = displayTargets.value.length;
  if (!len) return;
  activeIndex.value = (activeIndex.value + delta + len) % len;
  await scrollActiveIntoView();
};

const confirmSelection = async () => {
  const entry = displayTargets.value[activeIndex.value];
  if (entry) await executeMoveTo(entry.target);
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveSelection(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moveSelection(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    confirmSelection();
  }
  // Escape は PsmModal 側で閉じる処理を行う
};

/** 移動対象アイテムの表示名 */
const itemLabel = computed(() => {
  const i = state.moveDialogItem;
  if (!i) return "";
  return i.name || i.content || "(No Name)";
});
</script>

<template>
  <PsmModal
    :model-value="state.isMoveDialogOpen"
    @update:model-value="(v) => !v && closeMoveDialog()"
    max-width="560"
  >
    <v-card data-testid="move-dialog">
      <v-toolbar density="compact" color="surface">
        <v-toolbar-title>{{ t('moveTo') }}</v-toolbar-title>
        <v-btn icon @click="closeMoveDialog"><v-icon>mdi-close</v-icon></v-btn>
      </v-toolbar>

      <v-card-text class="pb-2">
        <div class="text-caption text-grey mb-2 text-truncate">
          <v-icon size="14" class="mr-1">mdi-cursor-move</v-icon>{{ itemLabel }}
        </div>

        <v-text-field
          ref="searchInput"
          v-model="query"
          :placeholder="t('moveFilterPlaceholder')"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          hide-details
          autofocus
          clearable
          data-testid="move-filter"
          @keydown="onKeydown"
        ></v-text-field>
      </v-card-text>

      <v-divider></v-divider>

      <div ref="listRef" class="psm-move__list">
        <v-list density="compact" class="py-0">
          <template v-for="(entry, i) in displayTargets" :key="String(entry.target.id)">
            <!-- 「最近使った移動先」の見出し -->
            <v-list-subheader v-if="entry.isRecent && i === 0" class="text-caption">
              {{ t('moveRecent') }}
            </v-list-subheader>
            <v-list-subheader
              v-else-if="!entry.isRecent && displayTargets[i - 1]?.isRecent"
              class="text-caption"
            >
              {{ t('moveAllGroups') }}
            </v-list-subheader>

            <v-list-item
              :class="{ 'psm-move__item--active': i === activeIndex }"
              class="psm-move__item"
              @click="executeMoveTo(entry.target)"
              @mouseenter="activeIndex = i"
              :data-testid="`move-target-${entry.target.id}`"
            >
              <template #prepend>
                <v-icon size="small" :color="entry.isRecent ? 'amber' : 'grey-lighten-1'">
                  {{ entry.isRecent ? 'mdi-history' : (typeof entry.target.id === 'string' ? 'mdi-file-tree' : 'mdi-folder') }}
                </v-icon>
              </template>
              <v-list-item-title>{{ entry.target.name }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption">{{ entry.target.path }}</v-list-item-subtitle>
            </v-list-item>
          </template>

          <v-list-item v-if="!displayTargets.length" disabled>
            <v-list-item-title class="text-grey">{{ t('moveNoMatch') }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </div>

      <v-divider></v-divider>

      <v-card-actions class="pa-3 bg-surface">
        <span class="text-caption text-grey">{{ t('moveKeyHint') }}</span>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="closeMoveDialog">{{ t('cancel') }}</v-btn>
      </v-card-actions>
    </v-card>
  </PsmModal>
</template>

<style scoped lang="scss">
.psm-move__list {
  max-height: 45vh;
  overflow-y: auto;
}

.psm-move__item {
  cursor: pointer;

  &--active {
    background-color: rgba(255, 152, 0, 0.18);
    outline: 1px solid rgba(255, 152, 0, 0.6);
    outline-offset: -1px;
  }
}
</style>
