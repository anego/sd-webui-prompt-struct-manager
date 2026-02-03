<script setup lang="ts">
import { computed, watch, nextTick, ref } from "vue";
import {
  state,
  addItem,
  startEdit,
  duplicateItem,
  startDeleteConfirm,
  teleportItem,
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

/**
 * 「移動先」の候補となる全てのグループ（およびルート）を再帰的に収集する。
 * 循環参照を防ぐため、自分自身とその子孫は除外する。
 */
const moveTargets = computed(() => {
  if (!props.targetItem) return [];

  const targets: { id: number | string; name: string; list: PsmItem[]; level: number }[] = [];

  // ルート (Roots) - level 0
  targets.push({ id: "root-pos", name: t("positive"), list: state.positive, level: 0 });
  targets.push({ id: "root-neg", name: t("negative"), list: state.negative, level: 0 });

  // 再帰的な収集を行う関数
  const collect = (nodes: PsmItem[], level: number) => {
    for (const node of nodes) {
      // 自分自身はスキップ
      if (node.id === props.targetItem?.id) continue;

      if (node.is_group) {
        // グループをターゲットとして追加
        targets.push({
          id: node.id,
          name: node.name || "(No Name)",
          list: node.children || [], // null防止
          level: level,
        });

        // 子が存在する場合は再帰探索
        if (node.children) {
          collect(node.children, level + 1);
        }
      }
    }
  };

  collect(state.positive, 0);
  collect(state.negative, 0);

  // ターゲットリストが現在の親と同じ場合は除外する処理を入れることも可能だが、
  // 現状はユーザー操作に任せる（同じ場所への移動は何もしないのと同義）。

  return targets;
});

const handleMove = async (targetList: PsmItem[]) => {
  if (props.targetItem) {
    await teleportItem(props.targetItem, targetList, "move-menu");
    localShow.value = false;
  }
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

const submenuOpen = ref(false);
const moveToActivator = ref<any>(null); // Ref for focus management

const activatorId = "psm-dummy-activator"; // Unique ID for positioning
let hoverTimeout: any = null;

const onMouseEnter = () => {
  if (hoverTimeout) clearTimeout(hoverTimeout);
  submenuOpen.value = true;
};

const onMouseLeave = () => {
  hoverTimeout = setTimeout(() => {
    submenuOpen.value = false;
    // Don't force focus back on mouse leave automatically, as user might just be moving mouse away
  }, 200);
};

const onSubmenuLeft = () => {
  submenuOpen.value = false;
  nextTick(() => {
    if (moveToActivator.value?.$el) {
       moveToActivator.value.$el.focus();
    } else if (moveToActivator.value?.focus) {
       moveToActivator.value.focus();
    }
  });
};

// Open and focus logic for keyboard
const openSubmenuAndFocus = () => {
  submenuOpen.value = true;
  nextTick(() => {
    setTimeout(() => {
      const subMenus = document.querySelectorAll(".psm-submenu-content");
      const subMenu = subMenus[subMenus.length - 1]; 
      if (subMenu) {
         const firstItem = subMenu.querySelector(".v-list-item") as HTMLElement;
         if (firstItem) firstItem.focus();
      }
    }, 50);
  });
};



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
    <v-list density="compact" width="220" elevation="24">
      <!-- 新規追加 -->
      <v-list-item
        prepend-icon="mdi-file-plus"
        :title="t('newPromptBelow')"
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
        @click="
          addItem(
            parentChildren,
            true,
            parentChildren.indexOf(targetItem!)
          )
        "
      ></v-list-item>
      <v-divider></v-divider>

      <!-- 移動 (Move To) -->
      <!-- Activator Item (Placed directly in list) -->
      <v-list-item
        ref="moveToActivator"
        prepend-icon="mdi-folder-move"
        :title="t('moveTo')"
        append-icon="mdi-chevron-right"
        @click.stop
        @mouseenter="onMouseEnter"
        @mouseleave="onMouseLeave"
        @keydown.right.stop.prevent="openSubmenuAndFocus"
        style="position: relative;"
      >
         <!-- Dummy Activator: Invisble, non-interactive overlay for positioning -->
         <!-- Vuetify attaches listeners here, but pointer-events: none prevents them from firing -->
         <div :id="activatorId" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; visibility: hidden;"></div>
      </v-list-item>

      <!-- Submenu (Decoupled, positioned by ID) -->
      <v-menu
        v-model="submenuOpen"
        :activator="`#${activatorId}`"
        location="end"
        :open-delay="0"
        :close-delay="0"
        :open-on-click="false"
        :open-on-hover="false"
        :open-on-focus="false"
        :z-index="20000005"
        content-class="psm-submenu-content"
      >
        <!-- ターゲット一覧 -->
        <v-list 
          density="compact" 
          max-height="300" 
          width="250" 
          class="overflow-y-auto"
          @mouseenter="onMouseEnter"
          @mouseleave="onMouseLeave"
        >
           <!-- ルート (Roots) -->
           <v-list-subheader>{{ t('roots') }}</v-list-subheader>
           <v-list-item
             v-for="target in moveTargets.filter(t => t.id === 'root-pos' || t.id === 'root-neg')"
             :key="target.id"
             :title="target.name"
             @click="handleMove(target.list)"
             prepend-icon="mdi-folder-home"
             @keydown.left.stop.prevent="onSubmenuLeft"
           ></v-list-item>
           
           <v-divider class="my-1"></v-divider>
           
           <!-- グループ (Groups) -->
           <v-list-subheader>{{ t('groups') }}</v-list-subheader>
           <template v-for="target in moveTargets.filter(t => t.id !== 'root-pos' && t.id !== 'root-neg')" :key="target.id">
             <!-- 循環参照防止ロジックはcomputed側で処理済み -->
             <v-list-item
               :title="target.name"
               @click="handleMove(target.list)"
               prepend-icon="mdi-folder-open-outline"
               :style="{ 'padding-left': (16 + target.level * 20) + 'px' }"
               @keydown.left.stop.prevent="onSubmenuLeft"
             ></v-list-item>
           </template>
           
           <v-list-item v-if="moveTargets.length <= 2" disabled>
             <span class="text-caption text-grey">{{ t('noGroups') }}</span>
           </v-list-item>
        </v-list>
      </v-menu>

      <v-divider></v-divider>

      <!-- 操作 (Operations) -->
      <v-list-item
        prepend-icon="mdi-pencil"
        :title="t('edit')"
        @click="startEdit(targetItem!)"
      ></v-list-item>
      <v-list-item
        prepend-icon="mdi-content-duplicate"
        :title="t('duplicate')"
        @click="duplicateItem(targetItem!, parentChildren)"
      ></v-list-item>
      <v-divider></v-divider>
      <v-list-item
        prepend-icon="mdi-delete"
        :title="t('delete')"
        base-color="error"
        @click="startDeleteConfirm(targetItem!, parentChildren)"
      ></v-list-item>
    </v-list>
  </v-menu>
</template>

<style scoped>
/* Specific tweak for submenu arrow if needed */
</style>
