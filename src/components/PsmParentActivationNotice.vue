<script setup lang="ts">
/**
 * PsmParentActivationNotice.vue
 * 親グループが無効な項目を有効にしようとしたときの通知 (スナックバー)。
 * 設定 (parentActivationMode) に応じて、反映されない理由の表示、祖先グループも有効にするかの確認、
 * 祖先グループを有効にした結果と「元に戻す」を表示する。
 */
import { computed, ref, watch } from "vue";
import {
  state,
  confirmParentActivation,
  confirmParentActivationAlways,
  undoParentActivation,
  dismissParentActivationNotice,
} from "../store";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

/** 確認待ちは操作を待つため、他の通知より長めに表示する */
const TIMEOUT_MS = { blocked: 4000, confirm: 10000, activated: 6000 } as const;

const notice = computed(() => state.parentActivationNotice);

const isOpen = computed({
  get: () => notice.value !== null,
  set: (open: boolean) => {
    if (!open) dismissParentActivationNotice();
  },
});

/**
 * 通知の内容が切り替わったら (確認→有効化など) スナックバーを作り直し、
 * 表示時間のカウントを最初からやり直す
 */
const renderKey = ref(0);
watch(notice, (next, prev) => {
  if (next && next !== prev) renderKey.value += 1;
});

const groupsLabel = computed(() => notice.value?.groupNames.join(" > ") ?? "");

const message = computed(() => {
  const current = notice.value;
  if (!current) return "";
  if (current.kind !== "activated") return t("parentDisabledNotReflected", { groups: groupsLabel.value });
  const enabled = t("parentGroupsEnabled", { groups: groupsLabel.value });
  if (current.extraCount === 0) return enabled;
  return `${enabled}${t("parentGroupsEnabledExtra", { count: String(current.extraCount) })}`;
});

const timeout = computed(() => (notice.value ? TIMEOUT_MS[notice.value.kind] : TIMEOUT_MS.blocked));
</script>

<template>
  <v-snackbar
    :key="renderKey"
    v-model="isOpen"
    :timeout="timeout"
    :vertical="notice?.kind === 'confirm'"
    attach
    multi-line
    data-testid="parent-activation-notice"
  >
    {{ message }}

    <template #actions>
      <template v-if="notice?.kind === 'confirm'">
        <v-btn
          color="primary"
          variant="text"
          @click="confirmParentActivation"
          data-testid="parent-activation-confirm-btn"
        >{{ t('enableParentsToo') }}</v-btn>
        <v-btn
          variant="text"
          @click="confirmParentActivationAlways"
          data-testid="parent-activation-always-btn"
        >{{ t('alwaysEnableParents') }}</v-btn>
      </template>
      <v-btn
        v-else-if="notice?.kind === 'activated'"
        color="primary"
        variant="text"
        @click="undoParentActivation"
        data-testid="parent-activation-undo-btn"
      >{{ t('undo') }}</v-btn>
      <v-btn
        variant="text"
        icon="mdi-close"
        size="small"
        :title="t('close')"
        @click="dismissParentActivationNotice"
        data-testid="parent-activation-close-btn"
      ></v-btn>
    </template>
  </v-snackbar>
</template>
