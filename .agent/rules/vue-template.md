# Vue Template Rules

## 適用範囲
すべての `.vue` ファイルの `<template>` ブロックに適用する。

## 必須要件 (Requirements)

1. **ディレクティブの省略記法 (Shorthands)**:
   - 属性のバインディングやイベントリスナーは、常に省略記法を使用すること。
   - `v-bind:class` -> `:class`
   - `v-on:click` -> `@click`
   - `v-slot:header` -> `#header`

2. **リストレンダリング (`v-for`) とキー (`:key`)**:
   - `v-for` を使用する際は、必ず一意の `:key` をバインドすること。
   - **【禁止】** 要素の順序が動的に変更される（ソートや削除がある）リストにおいて、配列のインデックス（`index`）を `:key` に使用することは禁止する。必ず一意のID（`item.id`など）を使用すること。

3. **`v-if` と `v-for` の混在禁止**:
   - 同一のHTML要素（タグ）に `v-if` と `v-for` を同時に記述しないこと。
   - リストの一部をフィルタリングしたい場合は、テンプレート側で `v-if` を使うのではなく、`<script>` 側で `computed` を用いてフィルタリング済みの配列を作成し、それを `v-for` で回すこと。

4. **動的なクラスバインディングとBEM**:
   - BEM記法（`vue-style.md`）と動的クラスを組み合わせる場合、テンプレートリテラルで無理に文字列を結合せず、Vueのオブジェクト構文・配列構文を使用して可読性を保つこと。

   ✅ **Good:**
   
```html
   <div 
     class="prompt-card"
     :class="{ 'prompt-card--active': isActive, 'prompt-card--error': hasError }"
   >
