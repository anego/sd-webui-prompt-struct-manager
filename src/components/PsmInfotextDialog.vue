<script setup lang="ts">
/**
 * PNG Info (infotext) 取込ダイアログ
 * 生成画像のパラメータ文字列を貼り付けて、プロンプトを構造化して取り込みます。
 */
import { ref, computed, watch } from "vue";
import { state, importInfotext, parseInfotext, canUseAiClassify } from "../store";
import PsmModal from "./PsmModal.vue";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const props = defineProps<{ modelValue: boolean }>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
}>();

const rawText = ref("");
const newFileName = ref("");
const groupByCategory = ref(false);
const subdivideGeneral = ref(true);
const useAiSubdivide = ref(false);
const translateNames = ref(false);

/** AI補完が利用可能か (OpenAI互換プロバイダ設定時のみ) */
const aiAvailable = computed(() => canUseAiClassify());
const isImporting = ref(false);
const errorMsg = ref("");
const resultMsg = ref("");

/** ダイアログを開いたときに状態を初期化する (Animaモードなら既定でグループ化ON) */
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      errorMsg.value = "";
      resultMsg.value = "";
      groupByCategory.value = state.modelMode === "anima";
      subdivideGeneral.value = true;
      useAiSubdivide.value = false;
      translateNames.value = false;
    }
  }
);

/** 貼り付け内容のライブプレビュー (解析結果の概要) */
const preview = computed(() => {
  if (!rawText.value.trim()) return null;
  const p = parseInfotext(rawText.value);
  const countTags = (s: string) => s.split(",").filter((x) => x.trim()).length;
  return {
    posCount: countTags(p.positive),
    negCount: countTags(p.negative),
    params: Object.entries(p.params).slice(0, 8),
    paramTotal: Object.keys(p.params).length,
  };
});

const canImport = computed(() => !!rawText.value.trim() && !isImporting.value);

const runImport = async (mode: "overwrite" | "new") => {
  if (!canImport.value) return;
  if (mode === "new" && !newFileName.value.trim()) return;

  isImporting.value = true;
  errorMsg.value = "";
  resultMsg.value = "";
  try {
    const r = await importInfotext(rawText.value, {
      groupByCategory: groupByCategory.value,
      subdivideGeneral: subdivideGeneral.value,
      useAiSubdivide: useAiSubdivide.value,
      translateNames: translateNames.value,
      fileName: mode === "new" ? newFileName.value.trim() : undefined,
    });
    resultMsg.value = t("infotextResult", {
      pos: String(r.posCount),
      neg: String(r.negCount),
    });
    rawText.value = "";
    newFileName.value = "";
    emit("update:modelValue", false);
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    isImporting.value = false;
  }
};
</script>

<template>
  <PsmModal
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="700"
  >
    <v-card data-testid="infotext-dialog">
      <v-toolbar density="compact" color="surface">
        <v-toolbar-title>{{ t('infotextTitle') }}</v-toolbar-title>
        <v-btn icon @click="emit('update:modelValue', false)"><v-icon>mdi-close</v-icon></v-btn>
      </v-toolbar>

      <v-card-text class="overflow-y-auto" style="max-height: 65vh;">
        <div class="text-caption text-grey mb-2">{{ t('infotextHint') }}</div>

        <v-textarea
          v-model="rawText"
          :label="t('infotextInput')"
          variant="outlined"
          auto-grow
          rows="6"
          max-rows="12"
          hide-details
          class="mb-3"
          data-testid="infotext-input"
        ></v-textarea>

        <!-- 解析プレビュー -->
        <div v-if="preview" class="mb-3 pa-2 rounded psm-infotext__preview">
          <div class="text-caption mb-1">
            <span class="text-primary font-weight-bold">Positive</span>: {{ preview.posCount }} tags
            <span class="text-error font-weight-bold ml-3">Negative</span>: {{ preview.negCount }} tags
          </div>
          <div v-if="preview.params.length" class="d-flex flex-wrap ga-1 mt-1">
            <v-chip
              v-for="[k, v] in preview.params"
              :key="k"
              size="x-small"
              label
              variant="outlined"
            >{{ k }}: {{ v }}</v-chip>
            <span v-if="preview.paramTotal > preview.params.length" class="text-caption text-grey">
              +{{ preview.paramTotal - preview.params.length }}
            </span>
          </div>
        </div>

        <v-switch
          v-model="groupByCategory"
          color="teal"
          density="compact"
          inset
          hide-details
          :label="t('infotextGroupByCategory')"
          class="mb-1"
          data-testid="infotext-group-switch"
        ></v-switch>
        <div class="text-caption text-grey mb-2">{{ t('infotextGroupHint') }}</div>

        <!-- 一般グループの細分化 (カテゴリ別グループ化が有効な場合のみ) -->
        <v-switch
          v-model="subdivideGeneral"
          color="teal"
          density="compact"
          inset
          hide-details
          :disabled="!groupByCategory"
          :label="t('infotextSubdivide')"
          class="mb-1 ml-4"
          data-testid="infotext-subdivide-switch"
        ></v-switch>
        <div class="text-caption text-grey mb-2 ml-4">{{ t('infotextSubdivideHint') }}</div>

        <!-- AIによる未分類タグの補完 -->
        <v-switch
          v-model="useAiSubdivide"
          color="deep-purple-accent-2"
          density="compact"
          inset
          hide-details
          :disabled="!groupByCategory || !subdivideGeneral || !aiAvailable"
          :label="t('infotextAiSubdivide')"
          class="mb-1 ml-8"
          data-testid="infotext-ai-subdivide-switch"
        ></v-switch>
        <div class="text-caption text-grey mb-4 ml-8">
          {{ aiAvailable ? t('infotextAiSubdivideHint') : t('infotextAiUnavailable') }}
        </div>

        <v-switch
          v-model="translateNames"
          color="teal"
          density="compact"
          inset
          hide-details
          :label="t('infotextTranslateNames')"
          class="mb-1"
          data-testid="infotext-translate-switch"
        ></v-switch>
        <div class="text-caption text-grey mb-1">{{ t('infotextTranslateHint') }}</div>
        <div v-if="translateNames" class="text-caption text-grey mb-4">
          <v-icon size="12" class="mr-1">mdi-information-outline</v-icon>
          {{ t('infotextTranslateProfile', {
            profile: state.translateSettings?.active === 'cloud' ? t('translateCloud') : t('translateLocal'),
            model: state.translateSettings ? (state.translateSettings[state.translateSettings.active].model || '-') : '-'
          }) }}
        </div>
        <div v-else class="mb-4"></div>

        <v-divider class="mb-3"></v-divider>

        <!-- 現在のファイルへ上書き -->
        <v-btn
          block
          variant="tonal"
          class="mb-3"
          :disabled="!canImport || !state.selectedFile"
          :loading="isImporting"
          @click="runImport('overwrite')"
          data-testid="infotext-overwrite-btn"
        >{{ t('overwriteCurrent') }} ({{ state.selectedFile || '-' }})</v-btn>

        <!-- 新規ファイルとして作成 -->
        <v-text-field
          v-model="newFileName"
          :label="t('newFileName')"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-2"
        ></v-text-field>
        <v-btn
          block
          color="primary"
          :disabled="!canImport || !newFileName.trim()"
          :loading="isImporting"
          @click="runImport('new')"
          data-testid="infotext-create-btn"
        >{{ t('createAndSave') }}</v-btn>

        <div v-if="errorMsg" class="text-caption text-error mt-3">{{ errorMsg }}</div>
        <div v-if="resultMsg" class="text-caption text-success mt-3">{{ resultMsg }}</div>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions class="pa-4 bg-surface">
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </PsmModal>
</template>

<style scoped lang="scss">
.psm-infotext__preview {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
</style>
