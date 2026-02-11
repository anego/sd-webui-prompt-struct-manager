<script setup lang="ts">
import { ref, onUnmounted } from "vue";
/**
 * サイドバーコンポーネント
 * ファイル選択、新規作成/編集/削除などのファイル操作ボタン、
 * 検索フィルター、UIスケール設定などを提供します。
 */
import {
  state,
  loadPrompts,
  setUiScale,
  setLang,
  toggleSidebar,

  setToggleShortcut,
  pickDirectory,
  saveConfig,
  listFiles,
} from "../store";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const emit = defineEmits<{
  (e: "openDialog", name: "new" | "copy" | "rename"): void;
  (e: "deleteFile"): void;
}>();

const isRecording = ref(false);

const localSearchQuery = ref(state.searchQuery);
let debounceTimer: number | null = null;

import { watch } from "vue";

watch(localSearchQuery, (newVal) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    state.searchQuery = newVal;
  }, 300);
});

// Update local if global changes externally (e.g. clear button elsewhere if any, or reset)
watch(() => state.searchQuery, (newVal) => {
  if (newVal !== localSearchQuery.value) {
    localSearchQuery.value = newVal;
  }
});

const handleRecordKey = (e: KeyboardEvent) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
  if (e.key === "Escape") {
    cleanupRecord();
    return;
  }

  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  if (e.metaKey) parts.push("Meta");

  let key = e.key.toUpperCase();
  if (key === " ") key = "Space";
  
  parts.push(key);
  setToggleShortcut(parts.join("+"));
  cleanupRecord();
};

const cleanupRecord = () => {
  isRecording.value = false;
  window.removeEventListener("keydown", handleRecordKey, true);
};

const startRecording = () => {
  isRecording.value = true;
  window.addEventListener("keydown", handleRecordKey, true);
};

const clearShortcut = () => {
  setToggleShortcut("");
};

onUnmounted(() => {
  window.removeEventListener("keydown", handleRecordKey, true);
});
</script>

<template>
  <div
    class="bg-grey-darken-4 border-e flex-shrink-0 d-flex flex-column sidebar-transition"
    :style="{ width: state.isSidebarOpen ? '250px' : '36px' }"
    data-testid="controls-bar"
  >
    <!-- Toggle Button Area -->
    <div class="d-flex align-center justify-center pa-1 border-b border-grey-darken-3">
      <v-btn
        icon
        size="x-small"
        variant="text"
        @click="toggleSidebar"
        :title="state.isSidebarOpen ? t('close') : t('open')"
      >
        <v-icon>{{ state.isSidebarOpen ? 'mdi-chevron-left' : 'mdi-menu' }}</v-icon>
      </v-btn>
    </div>

    <!-- Main Content -->
    <div
      class="pa-2 d-flex flex-column flex-grow-1 sidebar-content"
      style="min-width: 250px;"
      :class="{ 'content-hidden': !state.isSidebarOpen }"
    >
      <div class="flex-grow-0">
        <div class="text-caption text-grey mb-1">{{ t('fileOperations') }}</div>
        <div class="d-flex align-center mb-2">
        <v-select
          v-model="state.selectedFile"
          :items="state.yamlFiles"
          density="compact"
           hide-details
           variant="outlined"
           :menu-props="{ zIndex: 20000010 }"
           @update:model-value="loadPrompts"
           class="mb-2 flex-grow-1"
        ></v-select>
        <v-btn
          icon="mdi-refresh"
          size="small"
          variant="text"
          class="ml-1"
          @click="listFiles"
          :title="t('refresh')"
        ></v-btn>
        </div>

        <div class="d-flex flex-wrap ga-1 mb-4">
          <v-btn
            icon="mdi-plus"
            size="x-small"
            color="success"
            variant="tonal"
            @click="emit('openDialog', 'new')"
            data-testid="new-file-btn"
            :title="t('newFile')"
          ></v-btn>
          <v-btn
            icon="mdi-content-copy"
            size="x-small"
            variant="tonal"
            :disabled="!state.selectedFile"
            @click="emit('openDialog', 'copy')"
            :title="t('duplicate')"
          ></v-btn>
          <v-btn
            icon="mdi-pencil"
            size="x-small"
            variant="tonal"
            :disabled="!state.selectedFile"
            @click="emit('openDialog', 'rename')"
            :title="t('rename')"
          ></v-btn>
          <v-spacer></v-spacer>
          <v-btn
            icon="mdi-delete"
            size="x-small"
            color="error"
            variant="tonal"
            :disabled="!state.selectedFile"
            @click="emit('deleteFile')"
            :title="t('delete')"
          ></v-btn>
        </div>

        <v-divider class="mb-4"></v-divider>

        <div class="text-caption text-grey mb-1">{{ t('searchFilter') }}</div>
        <v-text-field
          v-model="localSearchQuery"
          density="compact"
          variant="outlined"
          :placeholder="t('searchPlaceholder')"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
          data-testid="search-input"
          class="mb-4"
        ></v-text-field>
        


        <div class="text-caption text-grey mb-1">{{ t('uiScale') }}</div>
        <v-btn-toggle
          v-model="state.uiScale"
          mandatory
          divided
          density="compact"
          color="primary"
          variant="outlined"
          class="w-100 mb-4"
          @update:model-value="(v) => setUiScale(v)"
        >
          <v-btn value="small" size="small" class="flex-grow-1">{{ t('small') }}</v-btn>
          <v-btn value="medium" size="small" class="flex-grow-1">{{ t('medium') }}</v-btn>
          <v-btn value="large" size="small" class="flex-grow-1">{{ t('large') }}</v-btn>
        </v-btn-toggle>

        <div class="text-caption text-grey mb-1">{{ t('language') }}</div>
        <v-btn-toggle
          v-model="state.lang"
          mandatory
          divided
          density="compact"
          color="secondary"
          variant="outlined"
          class="w-100"
          @update:model-value="(v) => setLang(v)"
        >
          <v-btn value="ja" size="small" class="flex-grow-1">JP</v-btn>
          <v-btn value="en" size="small" class="flex-grow-1">EN</v-btn>
        </v-btn-toggle>

        <div class="text-caption text-grey mb-1">{{ t('toggleShortcut') }}</div>
        <div class="d-flex align-center mb-4">
          <v-text-field
            :model-value="state.toggleShortcut || (isRecording ? '' : 'None')"
            readonly
            density="compact"
            variant="outlined"
            hide-details
            :label="isRecording ? t('recording') : ''"
            :placeholder="t('clickToRecord')"
            :append-inner-icon="isRecording ? 'mdi-record-circle' : 'mdi-keyboard'"
            class="flex-grow-1"
            @click="startRecording"
            :base-color="isRecording ? 'red' : ''"
          ></v-text-field>
          <v-btn
             v-if="state.toggleShortcut && !isRecording"
             icon="mdi-close"
             size="x-small"
             variant="text"
             class="ml-1"
             @click="clearShortcut"
             :title="t('clear')"
          ></v-btn>
        </div>
        
        <div class="text-caption text-grey mb-1">Storage</div>
        <div class="d-flex align-center mb-4">
          <v-text-field
            v-model="state.configDir"
            density="compact"
            variant="outlined"
            hide-details
            class="flex-grow-1"
            :placeholder="t('configDir')"
            @change="saveConfig(state.configDir)"
          ></v-text-field>
          <v-btn
            icon="mdi-folder-open"
            size="small"
            variant="text"
            class="ml-1"
            @click="pickDirectory"
            :title="t('selectDir')"
          ></v-btn>
        </div>
      </div>
      <v-spacer></v-spacer>
    </div>
  </div>
</template>

<style scoped>
.sidebar-transition {
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.sidebar-content {
  transition: opacity 0.2s;
  opacity: 1;
}

.content-hidden {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transition: opacity 0.2s, visibility 0s 0.2s; /* delay visibility hide */
}
</style>
