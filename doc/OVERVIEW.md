# Prompt Struct Manager (PSM) - 概要仕様書

## 1. プロジェクト概要
**Prompt Struct Manager (PSM)** は、Stable Diffusion WebUI (Automatic1111 / Forge) 上で動作する拡張機能です。
複雑になりがちなプロンプト（呪文）を「構造化」して管理し、効率的な画像生成ワークフローを提供することを目的としています。

### 主な解決課題
- プロンプトのブロック管理（衣装、背景、画風などをフォルダ分け）
- 階層構造による視覚的な整理
- プリセットの素早い切り替え
- WebUIの標準テキストエリアへのワンクリック反映

## 2. アーキテクチャ構成
本拡張機能は、バックエンド（Python/Gradio）とフロントエンド（Vue.js/TypeScript）のハイブリッド構成となっています。

### フロントエンド (Frontend)
- **Framework:** Vue.js 3 (Composition API)
- **UI Library:** Vuetify 3 (Material Design)
- **Build Tool:** Vite
- **Language:** TypeScript
- **State Management:** Reactive Store (`src/store.ts`)
- **Overlay Method:** `javascript/psm_panel.js` を介してWebUIのDOM上にオーバーレイとしてマウントされます。

### バックエンド (Backend)
- **Framework:** Python (Stable Diffusion WebUI Extension API)
- **API:** FastAPI (WebUI内部) を利用したカスタムAPIエンドポイントの実装
- **Persistence:** ローカルファイルシステムへのYAMLファイル保存

## 3. ファイル構造
```
extensions/sd-webui-prompt-struct-manager/
├── doc/                # 仕様ドキュメント
├── javascript/         # WebUI読み込み用エントリポイント (psm_panel.js)
├── scripts/            # ビルド用スクリプト (embed_font.js)
├── src/                # Vue.js フロントエンドソースコード
│   ├── components/     # UIコンポーネント (GroupMap, TreePaneなど)
│   ├── composables/    # 共通ロジック (useKeyboardNavなど)
│   ├── App.vue         # メインコンポーネント
│   ├── main.ts         # エントリポイント
│   ├── store.ts        # 状態管理
│   ├── log.ts          # ログ管理
│   └── types.ts        # 型定義
├── dist/               # ビルド成果物 (index.js)
├── vite.config.ts      # Vite設定
└── package.json        # 依存関係定義
```

## 4. 主な技術的決定事項
- **CSS Injected by JS:** WebUI環境でのロード順序問題やキャッシュ問題を回避するため、CSSはJSバンドル内にインジェクトまたはBase64埋め込みを行っています。
- **Font Embedding:** MDIアイコンは `.woff2` ファイルをBase64変換してCSSに埋め込み、オフライン環境やCDN制限環境でも動作を保証しています。
- **Dev Mode:** 開発者向けのデバッグログやインポート機能は、グローバル設定のフラグによって制御されています。
