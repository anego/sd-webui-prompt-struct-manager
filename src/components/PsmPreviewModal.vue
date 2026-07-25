<script setup lang="ts">
/**
 * 反映前プレビューモーダル (Phase 5A)
 * コンパイル結果全文と、現在のWebUIテキストエリアとのタグ単位差分を表示します。
 * animaモード時はカテゴリ整列適用後の実際の出力順で表示されます。
 */
import { computed } from "vue";
import {
  state,
  getCompiledPrompts,
  computePromptDiff,
  getWebUIRawPrompts,
  PromptDiffResult,
} from "../store";
import PsmModal from "./PsmModal.vue";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const props = defineProps<{ modelValue: boolean }>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "apply"): void;
}>();

interface PreviewSection {
  label: string;
  labelClass: string;
  compiled: string;
  diff: PromptDiffResult;
  tagCount: number;
}

/** モーダル表示時のみ計算する (WebUIテキストエリアの読み取りを含むため) */
const sections = computed<PreviewSection[] | null>(() => {
  if (!props.modelValue) return null;
  const current = getWebUIRawPrompts();
  const build = (label: string, labelClass: string, nodes: typeof state.positive, oldStr: string): PreviewSection => {
    const compiled = getCompiledPrompts(nodes, ", ", true);
    return {
      label,
      labelClass,
      compiled,
      diff: computePromptDiff(oldStr, compiled),
      tagCount: compiled ? compiled.split(",").filter((s) => s.trim()).length : 0,
    };
  };
  return [
    build("Positive", "text-primary", state.positive, current.positive),
    build("Negative", "text-error", state.negative, current.negative),
  ];
});

const chipColor = (kind: string) => {
  switch (kind) {
    case "added": return "success";
    case "removed": return "error";
    default: return "grey-darken-1";
  }
};

const onApply = () => {
  emit("apply");
  emit("update:modelValue", false);
};
</script>

<template>
  <PsmModal
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="800"
  >
    <v-card data-testid="preview-modal">
      <v-toolbar density="compact" color="surface">
        <v-toolbar-title>{{ t('previewTitle') }}</v-toolbar-title>
        <v-btn icon @click="emit('update:modelValue', false)"><v-icon>mdi-close</v-icon></v-btn>
      </v-toolbar>

      <v-card-text v-if="sections" class="overflow-y-auto" style="max-height: 65vh;">
        <template v-for="sec in sections" :key="sec.label">
          <div class="d-flex align-center ga-2 mb-1">
            <span class="text-subtitle-2 font-weight-bold" :class="sec.labelClass">{{ sec.label }}</span>
            <span class="text-caption text-grey">
              {{ sec.tagCount }} tags / {{ sec.compiled.length }} chars
            </span>
            <span v-if="sec.diff.added || sec.diff.removed" class="text-caption">
              <span class="text-success">+{{ sec.diff.added }}</span>
              /
              <span class="text-error">-{{ sec.diff.removed }}</span>
            </span>
            <span v-else class="text-caption text-grey">{{ t('previewNoChange') }}</span>
          </div>

          <!-- コンパイル結果全文 -->
          <pre class="psm-preview__compiled text-caption pa-2 rounded mb-2">{{ sec.compiled || "(empty)" }}</pre>

          <!-- タグ単位の差分 -->
          <div v-if="sec.diff.added || sec.diff.removed" class="d-flex flex-wrap ga-1 mb-4">
            <v-chip
              v-for="(tok, i) in sec.diff.tokens"
              :key="i"
              size="x-small"
              label
              :color="chipColor(tok.kind)"
              :variant="tok.kind === 'common' ? 'outlined' : 'flat'"
              :class="{ 'text-decoration-line-through': tok.kind === 'removed' }"
            >{{ tok.text }}</v-chip>
          </div>
          <div v-else class="mb-4"></div>
        </template>

        <div class="text-caption text-grey">
          <v-icon size="12" color="success">mdi-square</v-icon> {{ t('previewAdded') }}
          <v-icon size="12" color="error" class="ml-2">mdi-square</v-icon> {{ t('previewRemoved') }}
          <v-icon size="12" color="grey" class="ml-2">mdi-square-outline</v-icon> {{ t('previewCommon') }}
        </div>
      </v-card-text>

      <v-divider></v-divider>

      <v-card-actions class="pa-4 bg-surface">
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="emit('update:modelValue', false)">{{ t('cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          class="px-6"
          @click="onApply"
          data-testid="preview-apply-btn"
        >{{ t('previewApply') }}</v-btn>
      </v-card-actions>
    </v-card>
  </PsmModal>
</template>

<style scoped lang="scss">
.psm-preview__compiled {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;
  user-select: text;
}
</style>
