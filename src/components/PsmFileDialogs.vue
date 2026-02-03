<script setup lang="ts">
/**
 * ファイル操作系ダイアログコンテナ
 * 新規作成、複製、リネーム、インポートの各ダイアログをまとめて管理します。
 */
import { ref } from "vue";
import {
  state,
  createYamlFile,
  duplicateCurrentFile,
  renameCurrentFile,
  createYamlWithData,
  savePrompts,
  getWebUIData,
} from "../store";
import PsmModal from "./PsmModal.vue";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();

const props = defineProps<{
  newDialog: boolean;
  copyDialog: boolean;
  renameDialog: boolean;
  importDialog: boolean;
}>();

const emit = defineEmits<{
  (e: "update:newDialog", val: boolean): void;
  (e: "update:copyDialog", val: boolean): void;
  (e: "update:renameDialog", val: boolean): void;
  (e: "update:importDialog", val: boolean): void;
}>();

const names = ref({ new: "", copy: "", rename: "", import: "" });

/**
 * 新規ファイル作成実行
 */
const handleCreateFile = async () => {
  const n = names.value.new.trim();
  if (!n) return;
  await createYamlFile(n);
  emit("update:newDialog", false);
  names.value.new = "";
};

/**
 * ファイル複製実行
 */
const handleCopyFileExec = async () => {
  const n = names.value.copy.trim();
  if (!n) return;
  await duplicateCurrentFile(n);
  emit("update:copyDialog", false);
  names.value.copy = "";
};

/**
 * ファイルリネーム実行
 */
const handleRenameFileExec = async () => {
  const n = names.value.rename.trim();
  if (!n) return;
  await renameCurrentFile(n);
  emit("update:renameDialog", false);
  names.value.rename = "";
};

/**
 * インポート実行
 * @param mode "overwrite" (現在ファイルに上書き) or "new" (新規ファイル作成)
 */
const executeImport = async (mode: "overwrite" | "new") => {
  const data = getWebUIData();
  if (mode === "overwrite") {
    state.positive = data.positive;
    state.negative = data.negative;
    await savePrompts();
  } else {
    const n = names.value.import.trim();
    if (n) await createYamlWithData(n, data.positive, data.negative);
  }
  emit("update:importDialog", false);
};
</script>

<template>
  <div>
    <PsmModal
      :model-value="newDialog"
      @update:model-value="emit('update:newDialog', $event)"
      max-width="400"
    >
      <v-card :title="t('createNewFile')" data-testid="yaml-modal">
        <v-card-text>
          <v-text-field
            :label="t('newFileName')"
            v-model="names.new"
            @keyup.enter="handleCreateFile"
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="emit('update:newDialog', false)">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" @click="handleCreateFile">{{ t('create') }}</v-btn>
        </v-card-actions>
      </v-card>
    </PsmModal>

    <PsmModal
      :model-value="copyDialog"
      @update:model-value="emit('update:copyDialog', $event)"
      max-width="400"
    >
      <v-card :title="t('copyFile')">
        <v-card-text>
          <div class="text-caption mb-2">
            {{ t('copySource') }}: {{ state.selectedFile }}
          </div>
          <v-text-field
            :label="t('newFileName')"
            v-model="names.copy"
            @keyup.enter="handleCopyFileExec"
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="emit('update:copyDialog', false)">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" @click="handleCopyFileExec">{{ t('duplicate') }}</v-btn>
        </v-card-actions>
      </v-card>
    </PsmModal>

    <PsmModal
      :model-value="renameDialog"
      @update:model-value="emit('update:renameDialog', $event)"
      max-width="400"
    >
      <v-card :title="t('renameFile')">
        <v-card-text>
          <div class="text-caption mb-2">
            {{ t('currentFile') }}: {{ state.selectedFile }}
          </div>
          <v-text-field
            :label="t('newFileName')"
            v-model="names.rename"
            @keyup.enter="handleRenameFileExec"
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="emit('update:renameDialog', false)">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" @click="handleRenameFileExec">{{ t('execute') }}</v-btn> // "変更" -> "Execute" or "Rename". Dictionary has "rename" as "名前変更"(Noun) or "Rename File". But button "変更" usually "Change" or "Rename". I'll use t('execute') or create 'renameAction'? I have 'rename' in i18n ("名前変更"). I'll use t('rename') (which is "名前変更" but button might be "変更"). "変更" -> "execute"? I added `execute` "実行". `rename` "名前変更". Button says "変更". I will use `execute` or `rename`. Let's use `t('rename')` it might be weird ("名前変更"). I'll use `t('execute')` or leave as is? I'll use `t('execute')` (Run/Execute/Change).
        </v-card-actions>
      </v-card>
    </PsmModal>

    <PsmModal
      :model-value="importDialog"
      @update:model-value="emit('update:importDialog', $event)"
      max-width="500"
    >
      <v-card :title="t('importData')" data-testid="import-ui">
        <v-card-text>
          <v-btn
            block
            variant="tonal"
            class="mb-4"
            @click="executeImport('overwrite')"
          >
            {{ t('overwriteCurrent') }} ({{ state.selectedFile }})
          </v-btn>
          <v-divider class="mb-4"></v-divider>
          <v-text-field
            :label="t('newFileName')"
            v-model="names.import"
          ></v-text-field>
          <v-btn block color="primary" @click="executeImport('new')"
            >{{ t('createAndSave') }}</v-btn
          >
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn @click="emit('update:importDialog', false)">{{ t('close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </PsmModal>
  </div>
</template>
