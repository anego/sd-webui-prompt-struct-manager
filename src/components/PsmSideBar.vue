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
  clearDuplicateHighlight,
  setDuplicateCheckMode,
  saveSettingsLocal,
  setModelMode,
  loadTranslateSettings,
  saveTranslateSettings,
  translateText,
  TRANSLATE_PRESETS,
} from "../store";
import { useI18n } from "../composables/useI18n";
import { computed } from "vue";

const { t } = useI18n();

// ---- 翻訳設定 (Phase 2.5) ----

if (!state.translateSettings) loadTranslateSettings();

/** 選択中 (アクティブ) の翻訳プロファイル */
const activeProfile = computed(() => {
  const s = state.translateSettings!;
  return s[s.active];
});

/** ローカル/クラウドの切替 */
const setTranslateActive = (v: "local" | "cloud") => {
  state.translateSettings!.active = v;
  saveTranslateSettings();
};

/** プリセット適用 (選択中プロファイルの該当項目のみ上書き) */
const selectedPreset = ref<string | null>(null);
const applyPreset = (key: string | null) => {
  if (!key || !(key in TRANSLATE_PRESETS)) return;
  Object.assign(activeProfile.value, TRANSLATE_PRESETS[key]);
  saveTranslateSettings();
};

/** 接続テスト */
const testResult = ref<{ ok: boolean; text: string } | null>(null);
const onTestTranslate = async () => {
  testResult.value = null;
  try {
    const text = await translateText("こんにちは、世界");
    testResult.value = { ok: true, text };
  } catch (e) {
    testResult.value = { ok: false, text: e instanceof Error ? e.message : String(e) };
  }
};

const emit = defineEmits<{
  (e: "openDialog", name: "new" | "copy" | "rename"): void;
  (e: "deleteFile"): void;
}>();

const isRecording = ref(false);

import { watch } from "vue";

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
    class="bg-grey-darken-4 border-e flex-shrink-0 d-flex flex-column psm-sidebar"
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
      class="pa-2 d-flex flex-column flex-grow-1 psm-sidebar__content"
      style="min-width: 250px;"
      :class="{ 'psm-sidebar__content--hidden': !state.isSidebarOpen }"
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

        <div class="text-caption text-grey mb-1">{{ t('modelMode') }}</div>
        <v-btn-toggle
          :model-value="state.modelMode"
          mandatory
          divided
          density="compact"
          color="teal"
          variant="outlined"
          class="w-100 mb-4"
          :disabled="!state.selectedFile"
          @update:model-value="(v) => v && setModelMode(v as 'sd' | 'anima')"
        >
          <v-btn value="sd" size="small" class="flex-grow-1">{{ t('modelModeSd') }}</v-btn>
          <v-btn value="anima" size="small" class="flex-grow-1">{{ t('modelModeAnima') }}</v-btn>
        </v-btn-toggle>

        <!-- Grouped settings (collapsible, keeps sidebar compact) -->
        <v-expansion-panels variant="accordion" multiple class="mb-4">

          <!-- Group 1: Display / Check settings -->
          <v-expansion-panel :title="t('displaySettings')">
            <v-expansion-panel-text>
              <div class="text-caption text-grey mb-1">{{ t('duplicateCheckMode') }}</div>
              <v-radio-group
                :model-value="state.duplicateCheckMode"
                density="compact"
                color="primary"
                hide-details
                class="mb-4"
                @update:model-value="(val) => val && setDuplicateCheckMode(val as 'none' | 'warn' | 'error')"
              >
                <v-radio :label="t('checkNone')" value="none"></v-radio>
                <v-radio :label="t('checkWarn')" value="warn"></v-radio>
                <v-radio :label="t('checkError')" value="error"></v-radio>
              </v-radio-group>

              <v-switch
                v-model="state.showWeightSlider"
                color="primary"
                density="compact"
                hide-details
                :label="t('showWeightSlider')"
                @update:modelValue="saveSettingsLocal"
                class="mb-4"
              ></v-switch>

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
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- Group 2: Shortcut / Storage -->
          <v-expansion-panel :title="t('envSettings')">
            <v-expansion-panel-text>
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
              <div class="d-flex align-center">
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
            </v-expansion-panel-text>
          </v-expansion-panel>

          <!-- Group 3: Translate Settings (Phase 2.5) -->
          <v-expansion-panel v-if="state.translateSettings" :title="t('translateSettings')">
            <v-expansion-panel-text>
              <v-btn-toggle
                :model-value="state.translateSettings.active"
                mandatory
                divided
                density="compact"
                color="teal"
                variant="outlined"
                class="w-100 mb-3"
                @update:model-value="(v) => v && setTranslateActive(v as 'local' | 'cloud')"
              >
                <v-btn value="local" size="small" class="flex-grow-1">{{ t('translateLocal') }}</v-btn>
                <v-btn value="cloud" size="small" class="flex-grow-1">{{ t('translateCloud') }}</v-btn>
              </v-btn-toggle>

              <div
                v-if="state.translateSettings.active === 'cloud'"
                class="text-caption text-orange mb-2"
              >{{ t('translateCloudWarn') }}</div>

              <v-select
                v-model="selectedPreset"
                :items="[
                  { title: 'Ollama', value: 'ollama' },
                  { title: 'LM Studio', value: 'lmstudio' },
                  { title: 'OpenAI', value: 'openai' },
                  { title: 'OpenRouter', value: 'openrouter' },
                  { title: 'DeepL API Free', value: 'deepl' },
                ]"
                :label="t('translatePreset')"
                density="compact"
                variant="outlined"
                hide-details
                :menu-props="{ zIndex: 20000010 }"
                class="mb-2"
                @update:model-value="applyPreset"
              ></v-select>

              <v-text-field
                v-model="activeProfile.endpoint"
                :label="t('translateEndpoint')"
                density="compact"
                variant="outlined"
                hide-details
                class="mb-2"
                @change="saveTranslateSettings"
              ></v-text-field>

              <v-text-field
                v-if="activeProfile.provider !== 'deepl'"
                v-model="activeProfile.model"
                :label="t('translateModel')"
                density="compact"
                variant="outlined"
                hide-details
                class="mb-2"
                @change="saveTranslateSettings"
              ></v-text-field>

              <v-text-field
                v-model="activeProfile.api_key"
                :label="t('translateApiKey')"
                type="password"
                autocomplete="off"
                density="compact"
                variant="outlined"
                hide-details
                class="mb-2"
                @change="saveTranslateSettings"
              ></v-text-field>

              <v-btn
                size="small"
                variant="tonal"
                color="teal"
                block
                :loading="state.isTranslating"
                @click="onTestTranslate"
              >{{ t('translateTest') }}</v-btn>

              <div
                v-if="testResult"
                class="text-caption mt-2"
                :class="testResult.ok ? 'text-success' : 'text-error'"
              >{{ (testResult.ok ? t('translateTestOk') : t('translateTestFail')) + ': ' + testResult.text }}</div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </div>
      <v-spacer></v-spacer>
    </div>
  </div>
</template>

<style scoped lang="scss">
.psm-sidebar {
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  &__content {
    transition: opacity 0.2s;
    opacity: 1;

    /* 項目がサイドバーの高さを超えた場合は縦スクロール */
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    scrollbar-width: thin; /* Firefox */

    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &--hidden {
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0s 0.2s; /* delay visibility hide */
    }
  }
}
</style>
