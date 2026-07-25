# Prompt Struct Manager - 開発者ガイド

## 1. ビルド環境のセットアップ

### 必要要件
- Node.js (v24以上推奨、Voltaによりv24.13.0が指定されています)
- npm

### インストール
```bash
cd extensions/sd-webui-prompt-struct-manager
npm install
```

## 2. ビルドプロセス

### 通常ビルド
```bash
npm run build
```
このコマンドは内部的に以下のステップを実行します。
1. `node scripts/embed_font.js`: MDIフォントをBase64化してCSS (`src/mdi-embedded.css`) を生成。
2. `vite build`: Vueアプリケーションをビルドし、`dist/` ディレクトリに出力。

### 開発サーバー
```bash
npm run dev
```
※ WebUIとの連携確認にはビルドファイルの配置が必要なため、通常は `npm run build -- --watch` を使用するか、ホットリロード対応の環境構築が必要です。

## 3. ディレクトリ構成と主要ファイル

### `scripts/embed_font.js`
MDIアイコン (`@mdi/font`) の表示崩れを防ぐための重要スクリプト。
- `node_modules/@mdi/font/fonts/materialdesignicons-webfont.woff2` を読み込む。
- Base64エンコードし、`@font-face` 定義を作成。
- `src/mdi-embedded.css` として出力し、`main.ts` でインポート可能にする。

### `src/log.ts`
統合ログ管理モジュール。
- `Logger.info()`: 常に出力。
- `Logger.debug()`: `state.isDevMode` が `true` の場合のみ出力。
- `[PSM]` プレフィックスを自動付与。

### `src/dragOptions.ts`
ドラッグ&ドロップ (SortableJS / vuedraggable) の共通オプションを集約したモジュール。
- **`forceFallback: true`**: PSMは `gradio-app` のshadowRoot内にマウントされるため、HTML5ネイティブDnDではイベント伝播が不安定になる。SortableJSのマウス駆動モードに統一している（ネイティブの `dragover` / `drop` ハンドラは使用しないこと）。
- **`pull: "clone"`**: 他リストへのドラッグ中に移動元から要素が抜けないようにする。抜けるとレイアウトが詰まり、ドロップ先がカーソルから逃げるため。移動元からの削除は `finalizeCrossListMove()` がドロップ確定後に行う。
- ドロップ精度に関わる設定（`fallbackOnBody` / `emptyInsertThreshold` / `swapThreshold` / `invertSwap` / `scroll`）もここで一元管理する。

### `scripts/psm/translate.py`
翻訳バックエンドのプロバイダ抽象化モジュール。
- `PROVIDERS` に `openai`（OpenAI互換API）と `deepl` を登録。新規プロバイダは `_translate_<name>()` を実装して登録するだけで追加できる。
- ステートレス設計。翻訳設定はリクエストごとにフロントエンド（localStorage）から渡される。
- `sanitize_response()` がQwen系の `<think>` ブロックや前置き・引用符を除去する。

### `scripts/psm/tagdb.py`
タグDB参照とサブ分類の判定モジュール。
- `extensions/*/tags/danbooru*.csv`（tagcomplete）を自動探索し、遅延ロード＋プロセス内キャッシュで保持する（実測: 約17万エントリを0.14秒）。
- `lookup()` がDanbooruのタグ種別をPSMカテゴリへ変換し、`subcategory()` がキーワードルールで13分類へ振り分ける。
- `SUBCATEGORY_RULES` は**上から順に評価される**ため、より限定的なルールを先に置くこと（例: `hair ornament` を `hair` より前に）。フロントエンドの `SUBCAT_LABELS` / `SUBCAT_ORDER`（`store.ts`）とキーを一致させる必要がある。

## 4. 自動テスト

本プロジェクトでは、堅牢性と品質向上のため、フロントエンド単体テスト（Vitest）、バックエンド単体テスト（pytest）、実機ブラウザ（Playwright）の3層に分かれた階層的な自動テストスイートを導入しています。

### 4.1 フロントエンド単体テスト (Vitest)
フロントエンドのストアロジック (`store.ts`) をテストします。重複チェック・排他選択・プロファイル復元に加え、
プロンプトのコンパイル（アンダースコア保護／カテゴリ整列）、翻訳、差分計算、トークン数概算、PNG Info取込、
移動先クイック選択、ドラッグ&ドロップの移動確定などを対象とします。
- **テストファイル:** `tests/store_prompt.spec.ts`
- **テスト件数:** 約112件
- **実行コマンド:**
  ```bash
  npm run test:unit
  ```

### 4.2 バックエンド単体テスト (pytest)
Python APIエンドポイント、設定のI/O管理、YAMLの保存・読み込み仕様、翻訳プロバイダ、タグDBの判定をテストします。
- **テストファイル:**
  - `tests/test_psm_extension.py` — API・設定・YAML永続化
  - `tests/test_psm_translate.py` — 翻訳プロバイダ、応答サニタイズ、エラーマッピング
  - `tests/test_psm_tagdb.py` — タグDBのロード、カテゴリ変換、サブ分類判定
- **テスト件数:** 約74件（`parametrize` 展開後はさらに増加）
- **実行コマンド:**
  ```bash
  pytest
  ```

### 4.3 E2Eテスト (Playwright)
実際のブラウザを模してUIを操作し、セットアップウィザード、ドラッグ＆ドロップ、ショートカットキー、ウェイトスライダーやプロファイルのUI連動などを総合的にテストします。
- **テストファイル:** `tests/design.spec.ts` など
- **テスト件数:** 9件
- **実行コマンド:**
  ```bash
  # ローカルのWebUIサーバーが起動した状態で実行してください（デフォルトは http://localhost:7860）
  npx playwright test
  ```
- **一括実行スクリプト (Windowsローカル環境用):**
  リポジトリ直下の `test_local.bat` を実行することで、依存関係インストールから Playwright の実行までを一括で行うことができます。
  ```bash
  .\test_local.bat
  ```

## 5. デバッグ
ブラウザのコンソールで `[PSM]` でフィルタリングすることで、本拡張機能のログのみを抽出できます。

本拡張機能は、ブラウザ標準のコンソールログレベル設計に従い、開発用の詳細なトレースログは `console.debug()` を、アプリケーションの正常動作マイルストーンは `console.info()` を、エラーや警告は `console.error()`, `console.warn()` を使用して出力しています。
そのため、通常リリース時のログ表示（Info レベル以上）ではコンソールがデバッグログで汚されることはなく、ブラウザの開発者ツールで「詳細（Verbose / Debug）」レベルを有効にした場合のみ詳細なログを確認することができます。

詳細なログが必要な場合は、設定ファイル (`config.json`) の `dev_mode` を `true` にするか、UI上（実装されている場合）から開発モードを有効にしてください。

## 6. スタイルとCSSアーキテクチャ

本プロジェクトでは保守性と拡張性を高めるため、以下のスタイルガイドラインを採用しています。

### 6.1 SCSSとBEM記法の採用
- スタイル記述には **SCSS** を使用し、セレクタの命名には **BEM (Block, Element, Modifier)** 記法を原則とします。
- これにより、コンポーネント間のスタイルの衝突を防ぎ、構造を明確化しています。（例: `.psm-node`, `.psm-node__add-zone`, `.psm-node--focused`）

### 6.2 変数の一元管理
- 色、サイズ、Z-indexなどのマジックナンバーは直接記述せず、`src/styles/_variables.scss` に定数として定義し、各コンポーネントで `@use` して参照します。
- テーマカラーの変更やレイアウトの調整を一箇所で行えるようにしています。

### 6.3 `!important` の使用制限
- Vuetifyのデフォルトスタイルを上書きする際、安易な `!important` の使用は**厳禁**です。
- 代わりに、親要素（`html body .psm-app-root`等）やタグ名の追加（`div.psm-node` 等）によって**CSSの詳細度（Specificity）**を上げることで、安全にスタイルを上書きします。
