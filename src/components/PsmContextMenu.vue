<script setup lang="ts">
import { computed, watch, nextTick } from "vue";
import {
  state,
  addItem,
  startEdit,
  duplicateItem,
  startDeleteConfirm,
  subdivideGroup,
  canUseAiClassify,
  openMoveDialog,
  isItemLocked,
  isListLocked,
  toggleGroupHidden,
} from "../store";
import { PsmItem } from "../types";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const props = defineProps<{
  show: boolean;
  x: number;
  y: number;
  targetItem: PsmItem | null;
  parentChildren: PsmItem[]; // For adding items relative to current
}>();

const emit = defineEmits<{
  (e: "update:show", val: boolean): void;
}>();

const localShow = computed({
  get: () => props.show,
  set: (val) => emit("update:show", val),
});

/** AI分類が使えるか (OpenAI互換プロバイダ設定時のみ) */
const aiAvailable = computed(() => canUseAiClassify());

/** 対象アイテム自身（またはいずれかの祖先グループ）がロック中かどうか (グループロック機能) */
const targetLocked = computed(() => (props.targetItem ? isItemLocked(props.targetItem.id) : false));
/** 対象アイテムの親リストがロック中かどうか (兄弟としての追加・挿入の可否判定用) */
const parentLocked = computed(() => isListLocked(props.parentChildren));
/** 「下に追加」の実際の追加先 (対象がグループならその配下、そうでなければ親リスト) がロック中かどうか */
const belowTargetLocked = computed(() =>
  props.targetItem?.is_group ? targetLocked.value : parentLocked.value
);

/**
 * グループ直下のアイテムをサブ分類でグループ化する
 * @param useAI ルールで未分類だったタグをAIで補完するか
 */
const onSubdivide = async (useAI: boolean) => {
  const item = props.targetItem;
  if (!item?.is_group) return;
  emit("update:show", false);
  try {
    const created = await subdivideGroup(item, useAI);
    if (created === 0) {
      alert(t("subdivideNoResult"));
    }
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
};

/**
 * グループの非表示状態をトグルする (グループ非表示機能)
 */
const onToggleHidden = () => {
  if (!props.targetItem?.is_group) return;
  emit("update:show", false);
  toggleGroupHidden(props.targetItem);
};

/**
 * 移動先クイック選択ダイアログを開く
 * 移動先の収集・絞り込み・実行はダイアログ側 (PsmMoveDialog) が担当する
 */
const onOpenMoveDialog = () => {
  if (!props.targetItem) return;
  localShow.value = false;
  openMoveDialog(props.targetItem);
};

const menuStyle = computed(() => {
  const h = window.innerHeight;
  // シンプルな座標シフト: 画面下部ならY座標を上にずらす
  if (props.y > h - 350) {
    return {
      position: "fixed" as const,
      top: (props.y - 300) + "px",
      left: props.x + "px",
      zIndex: 20000000,
    };
  }
  return {
    position: "fixed" as const,
    top: props.y + "px",
    left: props.x + "px",
    zIndex: 20000000,
  };
});

watch(localShow, async (val) => {
  if (val) {
    await nextTick();
    // Default focus handling is sometimes tricky with Vuetify menus invoked by keyboard.
    // Force focus to the first item.
    setTimeout(() => {
      const menuContent = document.querySelector(".psm-context-menu-content");
      if (menuContent) {
        const firstItem = menuContent.querySelector(".v-list-item") as HTMLElement;
        if (firstItem) {
          firstItem.focus();
        }
      }
    }, 100);
  }
});
</script>



<template>
  <v-menu
    v-model="localShow"
    :style="menuStyle"
    target="cursor"
    :z-index="20000000"
    content-class="psm-context-menu-content"
  >
    <!-- 項目名が省略されないよう min-width で余裕を持たせる (固定widthだと日本語ラベルが切れる) -->
    <v-list density="compact" min-width="280" elevation="24">
      <!-- 新規追加 -->
      <v-list-item
        prepend-icon="mdi-file-plus"
        :title="t('newPromptBelow')"
        :disabled="belowTargetLocked"
        @click="
          addItem(
            targetItem!.is_group ? targetItem!.children! : parentChildren,
            false
          )
        "
      ></v-list-item>
      <v-list-item
        prepend-icon="mdi-folder-plus"
        :title="t('newGroupBelow')"
        :disabled="belowTargetLocked"
        @click="
          addItem(
            targetItem!.is_group ? targetItem!.children! : parentChildren,
            true
          )
        "
      ></v-list-item>
      <v-divider></v-divider>

      <!-- 上に挿入 -->
      <v-list-item
        prepend-icon="mdi-arrow-up"
        :title="t('insertUpPrompt')"
        :disabled="parentLocked"
        @click="
          addItem(
            parentChildren,
            false,
            parentChildren.indexOf(targetItem!)
          )
        "
      ></v-list-item>
      <v-list-item
        prepend-icon="mdi-arrow-up"
        :title="t('insertUpGroup')"
        :disabled="parentLocked"
        @click="
          addItem(
            parentChildren,
            true,
            parentChildren.indexOf(targetItem!)
          )
        "
      ></v-list-item>
      <v-divider></v-divider>

      <!-- サブ分類でグループ化 (グループのみ) -->
      <template v-if="targetItem?.is_group">
        <!-- 説明は subtitle ではなくツールチップに置き、メニュー幅を圧迫しない -->
        <v-list-item
          prepend-icon="mdi-file-tree"
          :disabled="targetLocked"
          @click="onSubdivide(false)"
          data-testid="ctx-subdivide"
        >
          <v-list-item-title :title="t('subdivideGroupHint')">{{ t('subdivideGroup') }}</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-if="aiAvailable"
          prepend-icon="mdi-robot-outline"
          :disabled="targetLocked"
          @click="onSubdivide(true)"
          data-testid="ctx-subdivide-ai"
        >
          <v-list-item-title :title="t('subdivideGroupAiHint')">{{ t('subdivideGroupAi') }}</v-list-item-title>
        </v-list-item>

        <!-- 非表示切り替え (グループ非表示機能) -->
        <v-list-item
          :prepend-icon="targetItem.isHidden ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
          :title="targetItem.isHidden ? t('showGroupAction') : t('hideGroupAction')"
          :disabled="targetLocked"
          @click="onToggleHidden"
          data-testid="ctx-toggle-hidden"
        ></v-list-item>
        <v-divider></v-divider>
      </template>

      <!-- 移動 (Move To): 検索付きダイアログを開く
           グループ数が多いとサブメニューから探すのが困難なため、ダイアログ方式に変更 -->
      <v-list-item
        prepend-icon="mdi-folder-move"
        :disabled="targetLocked"
        @click="onOpenMoveDialog"
        data-testid="ctx-move-to"
      >
        <v-list-item-title :title="t('moveToHint')">{{ t('moveTo') }}</v-list-item-title>
      </v-list-item>

      <v-divider></v-divider>

      <!-- 操作 (Operations) -->
      <v-list-item
        prepend-icon="mdi-pencil"
        :title="t('edit')"
        :disabled="targetLocked"
        @click="startEdit(targetItem!)"
      ></v-list-item>
      <v-list-item
        prepend-icon="mdi-content-duplicate"
        :title="t('duplicate')"
        :disabled="targetLocked"
        @click="duplicateItem(targetItem!, parentChildren)"
      ></v-list-item>
      <v-divider></v-divider>
      <v-list-item
        prepend-icon="mdi-delete"
        :title="t('delete')"
        base-color="error"
        :disabled="targetLocked"
        @click="startDeleteConfirm(targetItem!, parentChildren)"
      ></v-list-item>
    </v-list>
  </v-menu>
</template>

<style scoped>
/* Specific tweak for submenu arrow if needed */

/* 項目名を省略せず1行で表示する (日本語ラベルが途中で切れるのを防ぐ) */
:deep(.v-list-item-title) {
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
}
</style>
