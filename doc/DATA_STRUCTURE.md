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
  
  depth?: number;       // 表示用: 階層の深さ (計算プロパティまたは一時付与)
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
```

## 2. YAML ファイル構造
保存されるYAMLファイルは、以下のルート構造を持つ。

```yaml
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

## 3. 設定データ (`localStorage` / `config.json`)

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
