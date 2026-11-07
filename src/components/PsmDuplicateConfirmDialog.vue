<script setup lang="ts">
/**
 * 反映前の重複チェックで重複が見つかったときの警告/エラーダイアログ
 * 重複しているプロンプトを内容ごとに場所付きで一覧し、その場で無効にしたり、ツリー上の場所を表示したりできる。
 * 一覧はツリーの変更に合わせて数え直し、重複がすべて解消されたらエラーモードでも反映できるようにする。
 */
import { computed, nextTick, watch, onUnmounted } from "vue";
import { useI18n } from "../composables/useI18n";
import { collectDuplicateOccurrences, disableDuplicateOccurrence, revealItem } from "../store";
import { DuplicateGroup, DuplicateOccurrence } from "../types";
import { findNodeElement } from "../webUiRoot";
import PsmModal from "./PsmModal.vue";

const { t } = useI18n();

const props = defineProps<{
  modelValue: boolean;
  mode: "warn" | "error";
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "confirm"): void;
  (e: "cancel"): void; // or close
}>();

/** 現在のツリーでの重複の一覧 (表示中のみ計算する) */
const duplicateGroups = computed((): DuplicateGroup[] => (props.modelValue ? collectDuplicateOccurrences() : []));

/** ダイアログを開いたあとに、重複がすべて解消されたか */
const isResolved = computed(() => duplicateGroups.value.length === 0);

/** 反映できるか (警告モード、または重複が解消済みの場合) */
const canApply = computed(() => props.mode === "warn" || isResolved.value);

const closeDialog = () => {
  emit("update:modelValue", false);
  emit("cancel");
};

const confirmDialog = () => {
  emit("update:modelValue", false);
  emit("confirm");
};

/** ツリー上のプロンプトの表示名 (チップの表示と揃える) */
const labelOf = (occurrence: DuplicateOccurrence): string =>
  occurrence.item.name || occurrence.item.memo || occurrence.item.content;

const handleDisable = (occurrence: DuplicateOccurrence) => {
  disableDuplicateOccurrence(occurrence.item);
};

/** ダイアログを閉じ、祖先グループを開いてプロンプトまでスクロールする */
const handleShowLocation = async (occurrence: DuplicateOccurrence) => {
  if (!revealItem(occurrence.item.id)) return;
  emit("update:modelValue", false);
  await nextTick();
  findNodeElement(occurrence.item.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
};

const handleKeydown = (e: KeyboardEvent) => {
  if (!props.modelValue) return;
  // stop propagation so that App.vue doesn't catch the enter/escape
  e.stopPropagation();

  if (e.key === "Enter") {
    e.preventDefault();
    if (canApply.value) confirmDialog();
    else closeDialog();
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeDialog();
  }
};

watch(() => props.modelValue, (v) => {
  if (v) {
    window.addEventListener("keydown", handleKeydown, true);
  } else {
    window.removeEventListener("keydown", handleKeydown, true);
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown, true);
});
</script>

<template>
  <PsmModal
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="680"
    :clickOutsideToClose="false"
  >
    <v-card data-testid="duplicate-confirm-dialog">
      <v-card-title class="text-h6 pb-2" :class="isResolved ? 'text-success' : (mode === 'error' ? 'text-red' : 'text-warning')">
        <v-icon start>{{ isResolved ? 'mdi-check-circle-outline' : (mode === 'error' ? 'mdi-alert-circle' : 'mdi-alert') }}</v-icon>
        {{ mode === 'error' ? t('duplicateErrorTitle') || 'Duplicate Error' : t('duplicateWarnTitle') || 'Duplicate Warning' }}
        <span v-if="!isResolved" class="text-body-2 ml-1">({{ t('duplicateCount', { count: String(duplicateGroups.length) }) }})</span>
      </v-card-title>

      <v-card-text class="pt-2 text-body-1 psm-duplicate-dialog__message">{{
        isResolved ? t('duplicateResolved') : (mode === 'error' ? t('duplicateErrorMessage') || 'Cannot apply.' : t('duplicateWarnMessage') || 'Apply anyway?')
      }}</v-card-text>

      <v-card-text v-if="!isResolved" class="pt-0 psm-duplicate-dialog__list" data-testid="duplicate-list">
        <div
          v-for="group in duplicateGroups"
          :key="group.text"
          class="psm-duplicate-dialog__group"
        >
          <div class="psm-duplicate-dialog__text" :title="group.text">{{ group.text }}</div>
          <div
            v-for="occurrence in group.occurrences"
            :key="occurrence.item.id"
            class="psm-duplicate-dialog__row d-flex align-center ga-2"
            data-testid="duplicate-occurrence"
          >
            <!-- ルートからの場所 (ペイン > グループ > ... > プロンプト)。ランダムグループは生成ごとに1つだけ選ばれるため目印を付ける -->
            <div class="psm-duplicate-dialog__path flex-grow-1 text-truncate">
              <span class="text-grey">{{ occurrence.pane === 'positive' ? t('positive') : t('negative') }}</span>
              <template v-for="pathGroup in occurrence.groups" :key="pathGroup.id">
                <span class="text-grey mx-1">&gt;</span>
                <span>{{ pathGroup.name }}</span>
                <v-icon
                  v-if="pathGroup.isRandom"
                  size="x-small"
                  color="purple-accent-2"
                  class="ml-1"
                  :title="t('randomReflection')"
                >mdi-dice-multiple-outline</v-icon>
              </template>
              <span class="text-grey mx-1">&gt;</span>
              <span class="font-weight-bold">{{ labelOf(occurrence) }}</span>
            </div>
            <!-- 無効化したボタンにはツールチップが出ないため、ロック中の理由はアイコンで示す -->
            <v-icon
              v-if="occurrence.locked"
              size="small"
              color="red-lighten-1"
              class="flex-shrink-0"
              :title="t('duplicateLockedHint')"
              data-testid="duplicate-locked-icon"
            >mdi-lock</v-icon>
            <v-btn
              size="x-small"
              variant="tonal"
              color="grey"
              class="flex-shrink-0"
              prepend-icon="mdi-close-circle-outline"
              :disabled="occurrence.locked"
              data-testid="duplicate-disable-btn"
              @click="handleDisable(occurrence)"
            >{{ t('duplicateDisableThis') }}</v-btn>
            <v-btn
              size="x-small"
              variant="tonal"
              color="primary"
              class="flex-shrink-0"
              prepend-icon="mdi-crosshairs-gps"
              data-testid="duplicate-show-location-btn"
              @click="handleShowLocation(occurrence)"
            >{{ t('duplicateShowLocation') }}</v-btn>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="pa-4 pt-0">
        <v-spacer></v-spacer>
        <v-btn v-if="canApply" color="grey" variant="text" @click="closeDialog" data-testid="duplicate-cancel-btn">{{ t('cancelEsc') || 'Cancel' }}</v-btn>
        <v-btn
          :color="canApply ? (isResolved ? 'primary' : 'warning') : 'primary'"
          variant="elevated"
          data-testid="duplicate-confirm-btn"
          @click="canApply ? confirmDialog() : closeDialog()"
        >
          {{ canApply ? (isResolved ? t('apply') : t('duplicateApplyAnyway')) + ' (Enter)' : (t('close') || 'Close') + ' (Enter)' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </PsmModal>
</template>

<style scoped lang="scss">
@use "../styles/variables" as *;

.psm-duplicate-dialog {
  &__message {
    white-space: pre-wrap;
  }

  /* 重複が多い場合もボタンが画面外に出ないよう、一覧だけをスクロールさせる */
  &__list {
    max-height: 50vh;
    overflow-y: auto;
  }

  &__group {
    & + & {
      margin-top: $spacing-md;
    }
  }

  &__text {
    font-weight: bold;
    color: $color-warning;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__row {
    padding: 2px 0 2px $spacing-md;
    font-size: $font-size-sm;
  }

  &__path {
    min-width: 0;
  }
}
</style>
