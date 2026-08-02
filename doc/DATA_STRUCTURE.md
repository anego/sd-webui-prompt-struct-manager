# Prompt Struct Manager - データ構造仕様書

## 1. TypeScript 型定義 (`src/types.ts`)

### `PsmItem`
プロンプトまたはグループを表す基本単位。再帰的な構造を持つ。
```typescript
export interface PsmItem {
  id: number;           // 一意の識別子 (現在の実装では Date.now() * 1000 + Math.floor(Math.random() * 1000) による完全な整数)
  name: string;         // 表示名 (グループ名またはプロンプトのエイリアス)
  content: string;      // 実際のプロンプト文字列 (例: "1girl, solo")
  enabled: boolean;     // 有効/無効フラグ
  weight: number;       // 強調の重み (標準: 1.0)
  memo?: string;        // ユーザー用メモ
  
  is_group: boolean;    // グループか否か
  isRandom?: boolean;   // ランダムグループ (Dynamic Prompts {A|B} 形式で出力)
  isExclusive?: boolean;// カテゴリ内排他選択（択一モード）有効フラグ
  isOpen?: boolean;     // グループの場合の開閉状態 (UI用)
  children?: PsmItem[]; // 子アイテムの配列 (is_group: true の場合)

  isNatural?: boolean;  // 自然言語アイテム (置換・エスケープをスキップし原文出力)
  sourceText?: string;  // 翻訳前の原文 (出力には含まれない)
  category?: PsmCategory; // グループのタグカテゴリ (animaモード時の出力整列用)
  headerColor?: string;   // グループヘッダの背景色 (CSSカラー文字列。未指定はデフォルト)

  depth?: number;       // 表示用: 階層の深さ (計算プロパティまたは一時付与)
}

// タグカテゴリ (Anima推奨タグ順序: quality → subject → character → series → artist → general)
export type PsmCategory = "quality" | "subject" | "character" | "series" | "artist" | "general";

// モデルモード (YAMLファイル単位。未定義は "sd" 扱い)
export type ModelMode = "sd" | "anima";

// 翻訳プロバイダ / プロファイル / 設定 (Phase 2.5)
export type TranslateProvider = "openai" | "deepl";

export interface TranslateProfile {
  provider: TranslateProvider;
  endpoint: string;     // 例: http://localhost:11434/v1
  model: string;        // OpenAI互換のみ使用 (DeepLでは無視)
  api_key: string;
  timeout_sec: number;
  system_prompt: string; // 空なら内蔵デフォルト
}

export interface TranslateSettings {
  active: "local" | "cloud"; // 使用中のプロファイル
  local: TranslateProfile;
  cloud: TranslateProfile;
}

export interface PsmProfileState {
  id: number;           // 対象プロンプトのID
  enabled: boolean;     // 有効/無効フラグ
  weight: number;       // ウェイト値
}

export interface PsmProfile {
  name: string;         // プロファイル名
  states: PsmProfileState[]; // 各アイテムの状態リスト
}

// 生成設定プロファイル (Phase 6) が扱えるWebUI項目のID
// VAE / Sampling Method / Schedule Type はドロップダウン実装の都合上、自動適用を
// 確実に行えないため対象外としている (保存専用の項目は設けない方針)。
export type GenerationFieldId =
  | "checkpoint" | "steps" | "cfg_scale" | "width" | "height" | "seed";

export interface PsmGenerationSettings {
  checkpoint?: string;
  steps?: number;
  cfg_scale?: number;
  width?: number;
  height?: number;
  seed?: number;
}

export interface PsmGenerationProfile {
  name: string;               // プロファイル名
  fields: GenerationFieldId[]; // このプロファイルが保存・適用の対象とする項目
  settings: PsmGenerationSettings; // fields に含まれるキーのみ値を持つ
  updatedAt: string;          // ISO8601
}
```

## 2. YAML ファイル構造
保存されるYAMLファイルは、以下のルート構造を持つ。

```yaml
model_mode: anima   # "sd" | "anima" (省略時は "sd"。Phase 2で追加)
positive:
  - id: 1780190551195
    name: "キャラクター"
    content: ""
    enabled: true
    is_group: true
    children:
      - id: 1780190551200
        name: "Main Character"
        content: "1girl, silver hair"
        enabled: true
        weight: 1.2
        is_group: false

negative:
  - id: 1780190551300
    name: "Low Quality"
    content: "lowres, bad anatomy"
    enabled: true
    is_group: false

profiles:
  - name: "MyProfile"
    states:
      - id: 1780190551200
        enabled: true
        weight: 1.2
```

- **positive:** Positiveプロンプトツリーのルート配列。
- **negative:** Negativeプロンプトツリーのルート配列。
- **model_mode:** 対象モデルのモード。未定義・不正値は `sd` にフォールバック（後方互換）。
- **未知キーの保持:** 保存時、既存ファイルにある未知のルートキーはそのまま引き継がれます（将来バージョンとの相互運用性のため）。

## 3. 生成設定プロファイルファイル (`generation_profiles.json`) (Phase 6)
保存先ディレクトリ直下に配置される、プロンプトYAML群とは独立したファイル。Checkpoint/Sampling Steps等のWebUI生成設定を、名前を付けて保存したプロファイルの一覧を保持する。`.json` 拡張子のため `list-files`（プロンプトファイル一覧）には含まれない。

```json
{
  "profiles": [
    {
      "name": "Anime Standard",
      "fields": ["checkpoint", "steps", "cfg_scale"],
      "settings": {
        "checkpoint": "animagineXL.safetensors",
        "steps": 28,
        "cfg_scale": 6.0
      },
      "updatedAt": "2026-08-01T12:00:00+09:00"
    }
  ]
}
```

- **fields:** このプロファイルが保存・適用の対象とする項目のIDリスト。保存時にチェックボックスで選択した項目のみが記録される。
- **settings:** `fields` に含まれるキーのみ値を持つ。保存時にDOMから読み取れなかった項目は省略される。
- **対象項目:** `checkpoint` / `steps` / `cfg_scale` / `width` / `height` / `seed` の6項目。いずれもWebUIへの自動適用に対応する（VAE / Sampling Method / Schedule Typeは自動適用を確実に行えないため、対象項目そのものに含めていない）。

## 4. 設定データ (`localStorage` / `config.json`)

### `config.json` (Server-side)
Pythonバックエンドが管理する設定ファイル。
```json
{
  "save_dir": "C:/Path/To/Prompts",
  "is_configured": true,
  "dev_mode": false
}
```

### `psm_settings` (LocalStorage)
ブラウザ固有のUI設定。
```json
{
  "ui_scale": "medium",
  "lang": "ja",
  "last_file": "my_prompts.yaml",
  "sidebar_open": true,
  "toggle_shortcut": "Ctrl+Q",
  "duplicate_check_mode": "none",
  "show_weight_slider": true
}
```

### `psm_translate_settings` (LocalStorage)
翻訳設定 (Phase 2.5)。APIキーを含むため `psm_settings` とはキーを分離しています。
サーバー側には保存されず、翻訳リクエストごとにアクティブプロファイルがバックエンドへ同送されます。
```json
{
  "active": "local",
  "local": {
    "provider": "openai",
    "endpoint": "http://localhost:11434/v1",
    "model": "qwen3:4b",
    "api_key": "",
    "timeout_sec": 30,
    "system_prompt": ""
  },
  "cloud": {
    "provider": "openai",
    "endpoint": "https://api.openai.com/v1",
    "model": "gpt-5-mini",
    "api_key": "sk-...",
    "timeout_sec": 30,
    "system_prompt": ""
  }
}
```
