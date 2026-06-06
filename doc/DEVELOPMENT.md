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

## 4. 自動テスト

本プロジェクトでは、堅牢性と品質向上のため、フロントエンド単体テスト（Vitest）、バックエンド単体テスト（pytest）、実機ブラウザ（Playwright）の3層に分かれた階層的な自動テストスイートを導入しています。

### 4.1 フロントエンド単体テスト (Vitest)
フロントエンドのストアロジック (`store.ts`) や、重複チェック、排他選択、プロファイル復元などの状態制御をテストします。
- **テストファイル:** `tests/store_prompt.spec.ts` など
- **テスト件数:** 20件
- **実行コマンド:**
  ```bash
  npm run test:unit
  ```

### 4.2 バックエンド単体テスト (pytest)
Python APIエンドポイントや設定のI/O管理、YAMLの保存・読み込み仕様などをテストします。
- **テストファイル:** `tests/test_psm_extension.py` など
- **テスト件数:** 16件
- **実行コマンド:**
  ```bash
  pytest
  ```

### 4.3 E2Eテスト (Playwright)
実際のブラウザを模してUIを操作し、セットアップウィザード、ドラッグ＆ドロップ、ショートカットキー、ウェイトスライダーやプロファイルのUI連動などを総合的にテストします。
- **テストファイル:** `tests/design.spec.ts` など
- **テスト件数:** 6件
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
