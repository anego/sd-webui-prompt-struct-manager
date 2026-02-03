# Prompt Struct Manager - 開発者ガイド

## 1. ビルド環境のセットアップ

### 必要要件
- Node.js (v18以上推奨)
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

## 4. テスト (E2E)
Playwrightを使用したE2Eテスト環境が設定されています。
```bash
npx playwright test
```

## 5. デバッグ
ブラウザのコンソールで `[PSM]` でフィルタリングすることで、本拡張機能のログのみを抽出できます。
詳細なログが必要な場合は、設定ファイル (`config.json`) の `dev_mode` を `true` にするか、UI上（実装されている場合）から開発モードを有効にしてください。
