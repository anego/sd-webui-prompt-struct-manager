// Vuetifyのスタイル定義
declare module 'vuetify/styles';

// CSSファイル全般の定義 (@mdi/font 等のため)
declare module '*.css';

// その他のリソース定義が必要な場合もここに追記
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare const __BUILD_TIMESTAMP__: string;