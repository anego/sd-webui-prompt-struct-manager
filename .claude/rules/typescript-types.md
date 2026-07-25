# TypeScript & Type Definitions Rules

## 適用範囲
プロジェクト内のすべての `*.ts` および `*.d.ts` ファイルに適用する（`.vue` の `<script setup lang="ts">` 内の処理にも準用）。

## 必須要件 (Requirements)

1. **`*.d.ts` の役割 (Ambient Declarations)**:
   - `*.d.ts` ファイルには型定義（`interface`, `type`, `declare`）のみを記述し、実行可能なロジックや初期化コードを絶対に含めないこと。
   - SD WebUI（Gradio）が提供するグローバル変数・関数の型定義は、必ず `src/types/` 配下の `*.d.ts`（例: `sd-webui.d.ts`）に集約すること。

2. **グローバルスコープの安全な拡張 (`declare global`)**:
   - `window` オブジェクトやグローバルスコープに存在する SD WebUI 固有の関数（`gradioApp`, `get_uiCurrentTab` など）や変数（`opts`）を利用する場合、暗黙の `any` は許容しない。
   - 必ず `*.d.ts` 内で `declare global { interface Window { ... } }` や `declare function` を用いて、予測可能な型を定義すること。

   ✅ **Good (sd-webui.d.ts の例):**
   
```typescript
   declare global {
     interface Window {
       opts: Record<string, unknown>; // 必要なプロパティがわかっている場合は厳密に定義する
     }
     function gradioApp(): DocumentFragment | HTMLElement;
     function onUiLoaded(callback: () => void): void;
   }
   export {}; // ファイルをモジュールとして認識させるために必要
