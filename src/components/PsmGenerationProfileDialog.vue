<script setup lang="ts">
/**
 * 生成設定プロファイル (Phase 6) 保存ダイアログ
 * Checkpoint/VAE/Sampler等のWebUI生成設定を、項目を選んで名前を付けて保存する。
 * 保存済みプロファイルの適用・削除はツールバーのプルダウン（App.vue）から行う
 * （保存と適用の導線を分けるため、この画面は保存専用としている）。
 */
import { ref, computed, watch } from "vue";
import { saveGenerationProfile } from "../store";
import { GENERATION_FIELDS, getActiveTabPrefix, GenerationFieldValue } from "../generationFields";
import { GenerationFieldId } from "../types";
import PsmModal from "./PsmModal.vue";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
}>();

const emptyCheckedFields = (): Record<GenerationFieldId, boolean> =>
  Object.fromEntries(GENERATION_FIELDS.map((f) => [f.id, false])) as Record<GenerationFieldId, boolean>;

const newProfileName = ref("");
const checkedFields = ref<Record<GenerationFieldId, boolean>>(emptyCheckedFields());
const currentValues = ref<Partial<Record<GenerationFieldId, GenerationFieldValue>>>({});

/** ダイアログを開いた時点のWebUI現在値を読み取ってプレビュー表示する */
const refreshCurrentValues = () => {
  const prefix = getActiveTabPrefix();
  const values: Partial<Record<GenerationFieldId, GenerationFieldValue>> = {};
  for (const f of GENERATION_FIELDS) {
    const v = f.read(prefix);
    if (v !== undefined) values[f.id] = v;
  }
  currentValues.value = values;
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      newProfileName.value = "";
      checkedFields.value = emptyCheckedFields();
      refreshCurrentValues();
    }
  }
);

const checkedFieldIds = computed<GenerationFieldId[]>(() =>
  GENERATION_FIELDS.filter((f) => checkedFields.value[f.id]).map((f) => f.id)
);

const canSave = computed(() => !!newProfileName.value.trim() && checkedFieldIds.value.length > 0);

const selectAllFields = () => {
  for (const f of GENERATION_FIELDS) checkedFields.value[f.id] = true;
};
const selectNoFields = () => {
  for (const f of GENERATION_FIELDS) checkedFields.value[f.id] = false;
};

const formatValue = (v: GenerationFieldValue | undefined): string => {
  if (v === undefined) return "-";
  return String(v);
};

const handleSave = async () => {
  if (!canSave.value) return;
  await saveGenerationProfile(newProfileName.value.trim(), checkedFieldIds.value);
  emit("update:modelValue", false);
};
</script>

<template>
  <PsmModal
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="560"
  >
    <v-card data-testid="gen-profile-dialog">
      <v-toolbar density="compact" color="surface">
        <v-toolbar-title>{{ t('genProfileSaveTitle') }}</v-toolbar-title>
        <v-btn icon @click="emit('update:modelValue', false)"><v-icon>mdi-close</v-icon></v-btn>
      </v-toolbar>

      <v-card-text class="overflow-y-auto" style="max-height: 70vh;">
        <div class="text-caption text-grey mb-3">{{ t('genProfileHint') }}</div>

        <v-text-field
          v-model="newProfileName"
          :label="t('newGenProfileName')"
          variant="outlined"
          density="compact"
          hide-details
          autofocus
          class="mb-3"
          data-testid="gen-profile-name-input"
        ></v-text-field>

        <div class="d-flex ga-2 mb-2">
          <v-btn size="small" variant="text" @click="selectAllFields" data-testid="gen-profile-select-all-btn">
            {{ t('genProfileSelectAll') }}
          </v-btn>
          <v-btn size="small" variant="text" @click="selectNoFields" data-testid="gen-profile-select-none-btn">
            {{ t('genProfileSelectNone') }}
          </v-btn>
        </div>

        <v-row dense>
          <v-col v-for="f in GENERATION_FIELDS" :key="f.id" cols="6">
            <v-checkbox
              v-model="checkedFields[f.id]"
              density="compact"
              hide-details
              :label="t(f.labelKey)"
              :data-testid="`gen-profile-field-${f.id}`"
            ></v-checkbox>
            <div class="text-caption text-grey psm-gen-profile__current-value">
              {{ t('genProfileCurrentValue') }}: {{ formatValue(currentValues[f.id]) }}
            </div>
          </v-col>
        </v-row>
      </v-card-text>

      <v-divider></v-divider>
      <v-card-actions class="pa-4 bg-surface">
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :disabled="!canSave"
          @click="handleSave"
          data-testid="gen-profile-save-btn"
        >{{ t('save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </PsmModal>
</template>

<style scoped lang="scss">
.psm-gen-profile__current-value {
  margin-left: 32px;
  margin-top: -8px;
  margin-bottom: 4px;
}
</style>
