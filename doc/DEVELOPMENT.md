# Prompt Struct Manager - 開発者ガイド

## 1. ビルド環境のセットアップ

### 必要要件
- [Bun](https://bun.com/) (1.3以上)
  - パッケージ管理・ビルド・単体テストのすべてを Bun で行います。Node.js は不要です。
- Python (SD WebUI の venv) ※ バックエンドテストを実行する場合のみ

### Bun のインストール (Windows)
[Scoop](https://scoop.sh/) でインストールします。
```bash
scoop install bun
bun --version
```
アップデートも Scoop で行います (`bun upgrade` は Scoop の管理外での更新になるため使用しません)。
```bash
scoop update bun
```

### 依存パッケージのインストール
```bash
cd extensions/sd-webui-prompt-struct-manager
bun install
```
バージョンは `bun.lock` で固定されています。

## 2. ビルドプロセス

### 通常ビルド
```bash
bun run build
```
このコマンドは内部的に以下のステップを実行します。
1. `bun scripts/embed_font.js`: MDIフォントをBase64化してCSS (`src/mdi-embedded.css`) を生成。
2. `bun --bun vite build`: Vueアプリケーションをビルドし、`dist/` ディレクトリに出力。

ビルド結果 (`dist/index.js`) はリポジトリにコミットします。WebUI はこのファイルを読み込むだけのため、エンドユーザー側に Bun や Node.js は不要です。

### ウォッチビルド
```bash
bun run dev
```
ソースの変更を検知して `dist/` へ再ビルドします。反映には WebUI のリロードが必要です。

### `--bun` 指定について
`package.json` のスクリプトでは `vite` を `bun --bun vite ...` の形で呼び出しています。Node.js がインストールされているマシンでは、`--bun` を付けないと `vite` 先頭の `#!/usr/bin/env node` に従って Node.js で実行されてしまうためです。スクリプトやツールを追加する際も、Node.js で動いていないか確認してください (確認方法は「4.4 Node.js 非依存の確認」を参照)。

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

### `src/itemId.ts`
アイテムIDの発行と、読み込み時の修復を行うモジュール。
- プロファイル・ロック判定・フォーカス・表示フィルター・`:key`・`node-<ID>` の要素IDなどは、**ファイル内でIDが一意であること**を前提にしている。
- **新しいIDは必ず `createItemId()` で発行すること。** 現在時刻を基準に、常に前回より大きい値を返すため、同じミリ秒内に大量に発行しても重複しない。`Date.now()` や乱数で独自に採番しないこと（以前はグループの複製や PNG Info の取り込みでIDが重複していた）。
- `repairItemIds()` は副作用のない関数で、重複した2つ目以降と欠損したIDに新しいIDを振り、プロファイルの状態を新しいIDへ引き継ぐ。`store.ts` の `loadPrompts` が、別のツールの形式の変換（`src/foreignFormat.ts`）のあとに呼び、修復した場合はすぐに保存する。

### `src/webUiRoot.ts`
WebUI (Gradio) の画面要素を探す起点を返すモジュール。
- `gradio-app` が shadowRoot を持つ環境では、WebUI の要素も PSM の要素もその中にあり、`document.getElementById` では見つからない。WebUI やツリーの要素を探すときは、`getWebUiRoot()` / `findNodeElement()` を使うこと。

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

本プロジェクトでは、フロントエンド単体テスト（`bun test`）とバックエンド単体テスト（pytest）の2種類の自動テストでロジックを、リリース前の手動確認で画面表示と操作を担保しています。テストの詳細は [tests/TEST_SPEC.md](../tests/TEST_SPEC.md) を参照してください。

### 4.1 フロントエンド単体テスト (`bun test`)
フロントエンドのストアロジック (`store.ts`) をテストします。重複チェック・排他選択・プロファイル復元に加え、
プロンプトのコンパイル（アンダースコア保護／カテゴリ整列）、翻訳、差分計算、トークン数概算、PNG Info取込、
移動先クイック選択、ドラッグ&ドロップの移動確定、アイテムの追加・編集・複製・削除などを対象とします。
- **テストファイル:**
  - `tests/store_prompt.spec.ts` — ストアロジック全般
  - `tests/groupMapUtils.spec.ts` — グループマップ集計
  - `tests/generationFields.spec.ts` — 生成設定フィールドの読み書き
  - `tests/viewFilter.spec.ts` — 表示フィルター（有効なプロンプトとそれを含むグループの計算）と、キーボードでたどる表示中の項目の計算
  - `tests/inputValue.spec.ts` — 検索欄の値の変換（クリアボタンで入る `null` の扱い）
  - `tests/itemId.spec.ts` — アイテムIDの発行と、読み込み時の重複・欠損したIDの修復
  - `tests/foreignFormat.spec.ts` — 別のツールの形式のファイルの変換
  - `tests/webUiRoot.spec.ts` — WebUI の画面要素を探す起点（shadowRoot の有無）
- **テスト件数:** 317件
- **実行コマンド:**
  ```bash
  bun run test:unit
  ```
- **補足:** テストランナーは `bun:test` を使用し、収集対象は `bunfig.toml` で `tests/` 配下に限定しています。`bun:test` の `vi` には `stubGlobal` / `unstubAllGlobals` が無いため、グローバル変数（`fetch` など）の差し替えには `tests/helpers/globals.ts` の `stubGlobal()` / `unstubAllGlobals()` を使用してください（`bun test` は全テストファイルを同一プロセスで実行するため、`afterEach` で必ず元に戻します）。

### 4.2 バックエンド単体テスト (pytest)
Python APIエンドポイント、設定のI/O管理、YAMLの保存・読み込み仕様、翻訳プロバイダ、タグDBの判定をテストします。
- **テストファイル:**
  - `tests/test_psm_extension.py` — API・設定・YAML永続化
  - `tests/test_psm_cache.py` — 書き込みキャッシュのデバウンス動作
  - `tests/test_psm_translate.py` — 翻訳プロバイダ、応答サニタイズ、エラーマッピング
  - `tests/test_psm_tagdb.py` — タグDBのロード、カテゴリ変換、サブ分類判定
- **テスト件数:** 125件（`parametrize` 展開後）
- **実行コマンド:**
  ```bash
  ..\..\venv\Scripts\python -m pytest tests\
  ```

### 4.3 手動確認
v1.6.0 で Playwright による E2E テストを廃止しました。見た目（色・枠線・レイアウト）、キーボード/マウス操作、プロンプト大辞典との連携などは、リリース前（およびUIに関わる変更を行った時）に [tests/TEST_SPEC.md の手動確認チェックリスト](../tests/TEST_SPEC.md#23-手動確認チェックリスト) に沿って確認してください。
1. `bun run build` を実行する
2. WebUI をリロードする（Python 側に変更が無ければ再起動は不要）
3. チェックリストの項目を順に確認する

### 4.4 Node.js 非依存の確認
Node.js が入ったマシンでも Bun だけで開発できることを確認するには、PowerShell で一時的に PATH から Node.js を外してから実行します（そのウィンドウ内だけの変更で、他のターミナルには影響しません）。
```powershell
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notmatch 'nodejs|volta' }) -join ';'
node --version  # 見つからないことを確認
bun install; bun run build; bun run test:unit
```
スクリプトの `--bun` 指定が漏れていると、`node` が見つからずにエラーになります。

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
