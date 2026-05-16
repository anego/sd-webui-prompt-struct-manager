<script setup lang="ts">
import { watch, onUnmounted } from "vue";
import { useI18n } from "../composables/useI18n";
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

const closeDialog = () => {
  emit("update:modelValue", false);
  emit("cancel");
};

const confirmDialog = () => {
  emit("update:modelValue", false);
  emit("confirm");
};

const handleKeydown = (e: KeyboardEvent) => {
  if (!props.modelValue) return;
  // stop propagation so that App.vue doesn't catch the enter/escape
  e.stopPropagation();

  if (e.key === "Enter") {
    e.preventDefault();
    if (props.mode === "warn") confirmDialog();
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
    max-width="450"
    :clickOutsideToClose="false"
  >
    <v-card>
      <v-card-title class="text-h6 pb-2" :class="mode === 'error' ? 'text-red' : 'text-warning'">
        <v-icon start>{{ mode === 'error' ? 'mdi-alert-circle' : 'mdi-alert' }}</v-icon>
        {{ mode === 'error' ? t('duplicateErrorTitle') || 'Duplicate Error' : t('duplicateWarnTitle') || 'Duplicate Warning' }}
      </v-card-title>
      <v-card-text class="pt-2 text-body-1" style="white-space: pre-wrap;">{{ mode === 'error' ? t('duplicateErrorMessage') || 'Cannot apply.' : t('duplicateWarnMessage') || 'Apply anyway?' }}</v-card-text>
      <v-card-actions class="pa-4 pt-0">
        <v-spacer></v-spacer>
        <v-btn v-if="mode === 'warn'" color="grey" variant="text" @click="closeDialog">{{ t('cancelEsc') || 'Cancel' }}</v-btn>
        <v-btn :color="mode === 'error' ? 'primary' : 'warning'" variant="elevated" @click="mode === 'warn' ? confirmDialog() : closeDialog()">
          {{ mode === 'error' ? (t('close') || 'Close') + ' (Enter)' : (t('apply') || 'Apply') + ' (Enter)' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </PsmModal>
</template>
