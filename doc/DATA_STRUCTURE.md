# Prompt Struct Manager - データ構造仕様書

## 1. TypeScript 型定義 (`src/types.ts`)

### `PsmItem`
プロンプトまたはグループを表す基本単位。再帰的な構造を持つ。
```typescript
export interface PsmItem {
  id: number;           // 一意の識別子 (現在の実装では Date.now() + Math.random())
  name: string;         // 表示名 (グループ名またはプロンプトのエイリアス)
  content: string;      // 実際のプロンプト文字列 (例: "1girl, solo")
  enabled: boolean;     // 有効/無効フラグ
  weight: number;       // 強調の重み (標準: 1.0)
  memo?: string;        // ユーザー用メモ
  
  is_group: boolean;    // グループか否か
  isOpen?: boolean;     // グループの場合の開閉状態 (UI用)
  children?: PsmItem[]; // 子アイテムの配列 (is_group: true の場合)
  
  depth?: number;       // 表示用: 階層の深さ (計算プロパティまたは一時付与)
}
```

## 2. YAML ファイル構造
保存されるYAMLファイルは、以下のルート構造を持つ。

```yaml
positive:
  - id: 1234567890.123
    name: "キャラクター"
    content: ""
    enabled: true
    is_group: true
    children:
      - id: 1234567890.456
        name: "Main Character"
        content: "1girl, silver hair"
        enabled: true
        weight: 1.2
        is_group: false

negative:
  - id: 9876543210.123
    name: "Low Quality"
    content: "lowres, bad anatomy"
    enabled: true
    is_group: false
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
  "toggle_shortcut": "Ctrl+Q"
}
```
