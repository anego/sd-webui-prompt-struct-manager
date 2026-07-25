# Vue & TypeScript Rules

## 適用範囲
すべての `.ts` ファイル、および `.vue` ファイルの `<script>` ブロックに適用する。

## 必須要件 (Requirements)

1. **TypeScriptの厳格化と `any` の禁止**:
   - 変数、引数、戻り値には必ず型を定義し、型推論が効く場合でも複雑なオブジェクトには `interface` または `type` を明記すること。
   - **【禁止】** `any` の使用は例外なく禁止する。APIのレスポンスなど型が不明な場合は `unknown` を使用し、Type Guard（型ガード）や `zod` 等のバリデーションを用いて安全にキャストすること。
   - `as Type` による強制的な型アサーションは極力避け、型の絞り込み（Narrowing）を優先すること。

2. **Vue 3 Composition API の徹底**:
   - `.vue` ファイルでは必ず `<script setup lang="ts">` を使用すること。Options API（`export default { data() { ... } }`）は使用しない。
   - `defineProps` や `defineEmits` は、TypeScriptの型ベースの宣言を使用すること。
   
   ✅ **Good:**
   
```typescript
   interface Props {
     promptText: string;
     isActive?: boolean;
   }
   const props = defineProps<Props>();
   const emit = defineEmits<{
     (e: 'update:prompt', value: string): void;
   }>();
