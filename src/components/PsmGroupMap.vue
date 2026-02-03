<script setup lang="ts">
/**
 * PsmGroupMap.vue
 * 画面右端に表示されるグループ一覧マップ。
 * マウスホバーで表示され、クリックで該当グループへスクロールします。
 */
import { computed, ref } from "vue";
import { state } from "../store";
import { PsmItem } from "../types";

const isHovered = ref(false);

// グループのみを再帰的に抽出する型
type GroupMapItem = {
  id: number;
  name: string;
  depth: number;
  enabled: boolean;
  activeCount: number;
};

const countActivePrompts = (node: PsmItem): number => {
  if (!node.enabled) return 0; // 親が無効なら子も無効とみなす
  if (!node.is_group) return 1; // プロンプトなら1カウント
  if (!node.children) return 0;
  
  return node.children.reduce((sum, child) => sum + countActivePrompts(child), 0);
};

const extractGroups = (nodes: PsmItem[], depth = 0): GroupMapItem[] => {
  let result: GroupMapItem[] = [];
  for (const node of nodes) {
    if (!node) continue;
    if (node.is_group) {
      // グループ自体の有効数をカウント (自分以下の子孫プロンプト数)
      // 注意: countActivePromptsは自分自身がGroupの場合、再帰的に子を見る
      // ただし countActivePrompts の実装上、Group自身はカウントせず子だけ見る必要があるが
      // 上記の実装では is_group なら children を走査しているのでOK
      const count = countActivePrompts(node);
      
      result.push({
        id: node.id,
        name: node.name || "(No Name)",
        depth,
        enabled: node.enabled,
        activeCount: count,
      });
      if (node.children) {
        result = result.concat(extractGroups(node.children, depth + 1));
      }
    }
  }
  return result;
};

// Positive / Negative 両方のツリーを結合して表示
// ただし表示中のステート(isOpen)などを考慮する？
// ここではシンプルに現在存在するグループを全て羅列する
// あるいはセクション分けする
const groupList = computed(() => {
  return [
    { type: 'header', label: 'Positive' },
    ...extractGroups(state.positive),
    { type: 'header', label: 'Negative' },
    ...extractGroups(state.negative),
  ];
});

const scrollToNode = (id: number) => {
  const el = document.getElementById(`node-${id}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // 少しハイライトさせると分かりやすいかもしれないが、今回はスクロールのみ
  }
};
</script>

<template>
  <div
    class="psm-group-map-container"
    :class="{ 'is-active': isHovered }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Trigger Area (Always visible transparent strip) -->
    <div class="trigger-strip d-flex align-center justify-center flex-column">
      <span class="trigger-label text-caption font-weight-bold text-grey-lighten-2">
        Positive Prompt Group Map
      </span>
      <v-icon size="small" class="mt-1 text-grey-lighten-2">mdi-chevron-left</v-icon>
    </div>

    <!-- Content Area -->
    <div class="map-content bg-grey-darken-3 elevation-4 rounded-s-lg border-s border-grey-darken-1">
      <div v-if="groupList.length === 2" class="pa-4 text-caption text-grey text-center">
        No Groups
      </div>
      <div v-else class="py-2 overflow-y-auto" style="max-height: 80vh;">
        <template v-for="(item, i) in groupList" :key="i">
          <!-- Header -->
          <div v-if="'type' in item" class="px-3 py-1 text-caption font-weight-bold text-grey-lighten-1 bg-grey-darken-4">
            {{ item.label }}
          </div>
          <!-- Group Item -->
          <div
            v-else
            class="py-1 map-item cursor-pointer d-flex align-center"
            @click="scrollToNode(item.id)"
            :title="item.name"
            :class="!item.enabled ? 'text-grey text-decoration-line-through' : ''"
            style="padding-left: 8px;"
          >
            <!-- Indent Guides -->
            <!-- Using a loop to create visual vertical lines for each depth level -->
            <div class="d-flex align-center" style="height: 100%;">
              <div 
                v-for="n in item.depth" 
                :key="n" 
                style="width: 16px; border-left: 1px solid rgba(255, 255, 255, 0.15); height: 100%; margin-right: 0px;"
              ></div>
            </div>

            <!-- Icon -->
            <v-icon size="x-small" class="mr-1 ml-1" :color="item.enabled ? 'amber' : 'grey'">
              {{ item.depth > 0 ? 'mdi-subdirectory-arrow-right' : 'mdi-folder' }}
            </v-icon>
            
            <!-- Text -->
            <span class="text-caption text-truncate flex-grow-1">{{ item.name }}</span>
            
            <!-- Count -->
            <span v-if="item.enabled && item.activeCount > 0" class="text-caption text-grey ml-1 mr-2">
              ({{ item.activeCount }})
            </span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.psm-group-map-container {
  position: fixed;
  top: 100px;
  right: 0;
  bottom: 50px;
  z-index: 20000; /* Ensure it is above other overlays */
  display: flex;
  pointer-events: none;
  pointer-events: auto;
}

.trigger-strip {
  width: 24px; /* Increased width for label */
  height: 100%;
  background: rgba(0, 0, 0, 0.4); /* Darker initial background */
  border-left: 1px solid rgba(255, 255, 255, 0.2);
  transition: all 0.2s;
  backdrop-filter: blur(4px);
  cursor: pointer;
}
.trigger-strip:hover {
  background: rgba(33, 150, 243, 0.3); /* Blue hint on hover */
  width: 28px; /* Slight expansion */
}

.trigger-label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  letter-spacing: 2px;
  user-select: none;
  opacity: 0.8;
}

/* Container for the sliding pane */
.map-content {
  width: 260px;
  height: auto;
  align-self: flex-start;
  margin-right: -260px;
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  /* Solid background to prevent see-through */
  background-color: #1E1E1E !important; 
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.5); /* Stronger shadow */
  border-left: 1px solid #444;
}

/* Actions on hover state */
.psm-group-map-container.is-active .map-content {
  margin-right: 0;
  opacity: 1;
}

.map-item:hover {
  background-color: rgba(33, 150, 243, 0.2); /* Use primary color hint */
  color: white !important;
}
</style>
