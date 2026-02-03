<script setup lang="ts">
import { ref } from "vue";
import { state, saveConfig, createYamlFile } from "../store";
import { useI18n } from "../composables/useI18n";

const { t } = useI18n();
const step = ref(1);
const filename = ref("prompts");
const isLoading = ref(false);

const pickDirLocal = async () => {
    try {
        const res = await fetch("/psm/pick-dir");
        const data = await res.json();
        if (data.path) {
            state.configDir = data.path;
        }
    } catch (e) {
        console.error("Failed to pick dir", e);
    }
};

const handleFinish = async () => {
    if (!state.configDir || !filename.value) return;
    isLoading.value = true;
    try {
        // 1. Save Config (Backend will write config.json)
        // This triggers finding the ID, but since we await, we hold flow here?
        // Actually saveConfig -> loadConfig -> state.isConfigured = true -> App.vue unmounts this component.
        // However, Promise execution context usually survives unmount in modern browsers unless cancelled.
        // To be safe, we perform sequence carefully.
        
        await saveConfig(state.configDir);
        
        // 2. Create Initial File
        // The backend relies on config.json being present (which it is now)
        await createYamlFile(filename.value);
        
        // Explicitly set configured if somehow logic drifted, but saveConfig does it.
    } catch (e) {
        console.error("Setup failed", e);
        alert("Setup failed: " + e);
    } finally {
        isLoading.value = false;
    }
};
</script>

<template>
  <v-container class="d-flex align-center justify-center h-100">
    <v-card width="500" class="pa-6 text-center" elevation="8" :loading="isLoading">
      <v-window v-model="step">
        <!-- Step 1: Directory -->
        <v-window-item :value="1">
            <v-icon size="64" color="primary" class="mb-4">mdi-folder-star</v-icon>
            <h2 class="text-h5 font-weight-bold mb-2">Welcome to Prompt Struct Manager</h2>
            <p class="text-body-2 text-grey-lighten-1 mb-6">
                はじめに、プロンプトデータ（YAMLファイル）を保存するフォルダを指定してください。<br>
                指定したフォルダ内にデータが蓄積されます。
            </p>

            <div class="mb-6">
                <v-text-field
                    v-model="state.configDir"
                    :label="t('saveDir')"
                    readonly
                    variant="outlined"
                    prepend-inner-icon="mdi-folder"
                    hide-details
                    class="mb-2"
                    @click="pickDirLocal"
                ></v-text-field>
                <div class="text-caption text-grey text-left">
                    ※ Google Drive等の同期フォルダを指定するとバックアップが容易です。
                </div>
            </div>

            <v-btn
                block
                color="primary"
                size="large"
                prepend-icon="mdi-arrow-right"
                @click="step = 2"
                :disabled="!state.configDir"
                data-testid="setup-next-btn"
            >
                Next
            </v-btn>
            <v-btn
                variant="text"
                size="small"
                class="mt-2"
                prepend-icon="mdi-folder-open"
                @click="pickDirLocal"
            >
                {{ t('selectDir') }}
            </v-btn>
        </v-window-item>

        <!-- Step 2: Initial File -->
        <v-window-item :value="2">
            <v-icon size="64" color="secondary" class="mb-4">mdi-file-document-plus</v-icon>
            <h2 class="text-h5 font-weight-bold mb-2">Create Initial File</h2>
            <p class="text-body-2 text-grey-lighten-1 mb-6">
                最初のプロンプトファイルを作成します。<br>
                任意の名前を入力してください。（例: characters, styles）
            </p>

            <div class="mb-6">
                <v-text-field
                    v-model="filename"
                    label="Filename"
                    variant="outlined"
                    suffix=".yaml"
                    prepend-inner-icon="mdi-file"
                    hide-details
                    autofocus
                ></v-text-field>
            </div>

            <div class="d-flex ga-2">
                <v-btn
                    variant="text"
                    @click="step = 1"
                >
                    Back
                </v-btn>
                <v-btn
                    block
                    color="primary"
                    size="large"
                    prepend-icon="mdi-check"
                    @click="handleFinish"
                    :loading="isLoading"
                    :disabled="!filename"
                    data-testid="setup-finish-btn"
                >
                    Start
                </v-btn>
            </div>
        </v-window-item>
      </v-window>
    </v-card>
  </v-container>
</template>
