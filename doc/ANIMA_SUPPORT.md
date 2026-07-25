# PSM Anima対応 調査報告・改修方針書

作成日: 2026-07-22 / 対象: sd-webui-prompt-struct-manager (ForgeNeo導入版)

## 1. 背景: Animaのプロンプト仕様(PSMに関係する部分のみ)

Anima (circlestone-labs/Anima, 2B, Qwen3テキストエンコーダ) はDanbooruタグ・自然言語・その混在をサポートする。PSMに影響する仕様は以下。

| 項目 | 仕様 | SD系との差分 |
|---|---|---|
| タグ表記 | 小文字、アンダースコアでなくスペース | 同様(WebUI文化圏では既にスペース派が主流) |
| スコアタグ | `score_1`〜`score_9` のみアンダースコア必須 | **PSMの `_`→スペース置換と衝突** |
| タグ順序 | `[品質/メタ/年代/安全] [1girl等] [キャラ] [作品] [絵師] [一般]` | 順序が推奨される(SD系は原則自由) |
| 絵師タグ | `@` プレフィックス必須 (`@artist name`) | 新規仕様。`@`自体は現行コンパイルで破壊されない |
| 自然言語 | 2文以上の長文が有効。タグとの混在可 | カンマ分割・括弧エスケープと相性が悪い |
| 重み構文 | `(tag:1.2)` はForgeNeoがエンコーダ側で処理するため有効 | 変更不要 |
| ランダム | Dynamic Prompts `{A|B}` は拡張側の機能なので有効 | 変更不要 |

推奨プリフィックス/ネガティブ(テンプレートとして同梱したい):

- Positive接頭辞: `masterpiece, best quality, score_7, safe, `
- Negative: `worst quality, low quality, score_1, score_2, score_3, artist name`

## 2. 現状コードの分析

プロンプト出力経路: `App.vue handleApply()` → `store.ts getCompiledPrompts()` → WebUIテキストエリアへ反映。
取込経路: `store.ts getWebUIData()` → `parsePrompts()` (カンマ分割)。

### 問題点一覧

| # | 深刻度 | 箇所 | 内容 |
|---|---|---|---|
| P1 | **高(バグ)** | `store.ts:879` `content.replace(/_/g, " ")` | `score_7` が `score 7` になり品質タグが無効化。なお `^_^` `>_<` 等の顔文字タグもSD系運用で既に破壊されており、Anima以前からの潜在バグ |
| P2 | 中 | `parsePrompts()` (store.ts:831) | WebUI取込時にカンマで機械分割。自然言語プロンプトが文節でバラバラのアイテムになる |
| P3 | 中 | `store.ts:883` 括弧エスケープ | 自然言語文中の `(...)` が `\(...\)` になる。タグ用途では正しいがNL用途では不正 |
| P4 | 中 | 構造上の制約 | タグカテゴリ順序を保証する仕組みがない(ツリーの手動並び順に依存) |
| P5 | 低 | テンプレート | Anima向け初期構成(品質/年代/安全/キャラ/絵師/一般のグループ雛形)がない |

## 3. 改修方針: モデルモード方式

設定に「モデルモード」を追加し、コンパイル/取込ルールを切り替える。

### 3.1 モードの保存場所

YAMLファイル単位で保存することを推奨する(ファイル=モデル/プロジェクト単位の運用実態に合致)。

```yaml
# YAMLルートに追加(未定義は "sd" 扱い → 後方互換)
model_mode: anima   # "sd" | "anima"
positive: [...]
negative: [...]
```

- `src/types.ts`: `ModelMode = "sd" | "anima"` を追加、store stateに `modelMode` を追加
- `scripts/psm/api.py` / `storage.py`: save/load時に `model_mode` をパススルー
- UI: サイドバー(`PsmSideBar.vue`)のファイル選択付近にモードセレクタを表示

### 3.2 モード別コンパイルルール

`getCompiledPrompts()` にモードを渡す。

| 処理 | sd | anima |
|---|---|---|
| `_`→スペース置換 | 現行どおり(ただしP1修正は共通適用) | 同左 |
| `score_\d` 保護 | 適用(無害) | 適用 |
| 括弧エスケープ | 現行どおり | タグアイテムは現行どおり、自然言語アイテムはスキップ |
| カテゴリ整列 | なし | 任意(3.4参照) |

**P1修正(モード非依存・最優先)**: 置換除外パターンをワイルドカードだけでなく以下に拡張する。

```typescript
const PRESERVE_UNDERSCORE = [
  /^__.+__$/,        // ワイルドカード(現行)
  /^score_\d$/,      // Animaスコアタグ
  /^[\^>o;=]_[\^<o;=]?$/, // 顔文字タグ (^_^, >_< など) ※要検討
];
```

より安全な代替案: 「アンダースコアを置換しない」チェックボックスをアイテムに追加し、既定の自動判定(上記パターン)+手動オーバーライドの二段構えにする。

### 3.3 自然言語アイテム (`isNatural`)

`PsmItem` に `isNatural?: boolean` を追加。編集モーダル(`PsmEditModal.vue`)にトグルを追加。

- コンパイル時: `_`置換・括弧エスケープ・末尾カンマ除去をスキップし、原文のまま出力
- 重み `(text:w)` は適用可能のまま(ForgeNeo側で機能する)
- 取込時(animaモード): 文末ピリオド区切りで文単位に分割し `isNatural: true` で取込む案。第一段階では「取込文字列全体を1アイテムにする」トグルで十分

### 3.4 カテゴリ順序サポート(任意機能)

グループに `category?: string` を追加し、animaモード時にルート直下をカテゴリ優先度で安定ソートして出力する。

```
quality(品質/メタ/年代/安全) → subject(1girl等) → character → series → artist → general(未指定含む)
```

- 並び替えは出力時のみ(ツリー表示は弄らない)
- `category` 未設定グループは `general` 扱い → 既存YAMLの出力順が変わらない
- 編集モーダルのグループ編集にカテゴリ選択を追加

### 3.5 Animaテンプレート

新規ファイル作成時にモードが `anima` なら雛形を投入する。

```yaml
positive:
  - {品質: "masterpiece, best quality, score_7, safe" をカテゴリquality のグループに}
  - {年代: "newest" など}
  - {キャラ / 作品 / 絵師(@付き) / 一般 の空グループ}
negative:
  - "worst quality, low quality, score_1, score_2, score_3, artist name"
```

## 4. 実装フェーズ案

| Phase | 状況 | 内容 | 影響ファイル |
|---|---|---|---|
| 1 | **実装済 (2026-07-22)** | P1修正(score_保護)。モード非依存で常時適用 | `store.ts`, `tests/store_prompt.spec.ts` |
| 2 | **実装済 (2026-07-22)** | モデルモード追加(YAML保存・UIセレクタ)、自然言語アイテム | `types.ts`, `store.ts`, `PsmSideBar.vue`, `PsmEditModal.vue`, `api.py`, `storage.py`, `i18n/*`, `tests/*` |
| 2.5 | **実装済 (2026-07-25)** | プロンプト翻訳機能(日→英、ローカルLLM/クラウド切替、設定はlocalStorage)。詳細は§5 | `types.ts`, `store.ts`, `PsmEditModal.vue`, `PsmSideBar.vue`, `api.py`, `translate.py`(新設), `i18n/*`, `tests/*` |
| 3 | **実装済 (2026-07-25)** | カテゴリ整列、Animaテンプレート | `types.ts`, `store.ts`, `App.vue`, `PsmEditModal.vue`, `PsmFileDialogs.vue`, `i18n/*`, `tests/*` |
| 4 | **実装済 (2026-07-25)** | ドキュメント更新(DATA_STRUCTURE / FEATURES 和英) | `doc/DATA_STRUCTURE(_en).md`, `doc/FEATURES(_en).md` |

| 5A | **実装済 (2026-07-25)** | 反映前プレビュー(コンパイル結果+タグ単位差分)。詳細は§6.1 | `store.ts`, `App.vue`, `PsmPreviewModal.vue`(新設), `i18n/*`, `tests/*` |
| 5B | **実装済 (2026-07-25)** | カテゴリ自動判定(tagcomplete タグDB)。詳細は§6.2 | `tagdb.py`(新設), `api.py`, `store.ts`, `PsmEditModal.vue`, `PsmSideBar.vue`, `i18n/*`, `tests/*` |

※ Phase 4 補足: 更新対象は日本語版とペアで保守されている `*_en.md`。`doc/en/` フォルダは旧世代のコピーと思われるため未更新(不要なら削除を検討)。

### Phase 5 実装メモ (2026-07-25)

- **5A**: `computePromptDiff(oldStr, newStr)` を純関数として `store.ts` に実装(カンマ区切りトークン比較・重複は出現回数で判定)。ツールバーの「プレビュー」ボタン → `PsmPreviewModal.vue`。animaモードではカテゴリ整列適用後の実出力を表示
- **5B**: データソースは**tagcomplete の `tags/danbooru.csv` を採用**(設計時に検討した大辞典データは未使用)。`tagdb.py` が `extensions/*/tags/danbooru*.csv` を自動探索し、遅延ロード+プロセス内キャッシュ
  - 実測: 170,752エントリ(エイリアス含む)を **0.14秒**でロード
  - Danbooruカテゴリ `0/1/3/4/5` → `general/artist/series/character/quality`、`1girl`・`solo` 等は `SUBJECT_TAGS` により `subject` へ振替
  - UIは**提案ベース**: 編集モーダルの「カテゴリ自動判定」(多数決+内訳表示)、サイドバーの「カテゴリ一括判定」(**未設定グループのみ**適用、animaモード時のみ表示)
- 副次修正: 未定義だったi18nキー5件(`open` / `refresh` / `configDir` / `selectDir` / `clickToOpen`)を和英に追加(ツールチップにキー名が生表示されていた既存バグ)
- 検証: tagdb を実CSVで直接テスト(カテゴリマッピング・エイリアス解決・正規化・キャッシュ)、`computePromptDiff` をミラー実行(10項目)し全パス。pytest 約17件・vitest 12件を追加

### Phase 3 実装メモ (2026-07-25)

- `PsmItem.category`(グループ用・省略可): `quality | subject | character | series | artist | general`
- animaモード時のみ、反映(Apply)時にルート直下をカテゴリ優先度で**安定ソート**して出力(`getCompiledPrompts(nodes, ", ", true)`)。ツリー表示・保存順は変更しない。sdモード・ネスト階層・category未指定(=general扱い)は従来の順序のまま
- グループ編集モーダルにカテゴリ選択を追加
- 新規ファイルダイアログに「Animaテンプレートで作成」スイッチを追加: 推奨タグ入りのカテゴリ別グループ雛形(品質/年代/主体/キャラ/作品/絵師/一般+推奨ネガティブ)+`model_mode: anima` で初期化
- テンプレートのIDは連番混合で同ミリ秒衝突を回避(`buildAnimaTemplate`)
- 検証: 整列・安定性・後方互換・ID一意性をサンドボックスでミラー実行し全パス。vitest 7件追加(ローカルで `pnpm test:unit` → `pnpm build`)

### Phase 2.5 実装メモ (2026-07-25)

- 設計(§5)どおり実装。バックエンドは `scripts/psm/translate.py`(provider抽象化・サニタイザ・endpoint検証)+ `/psm/translate`(ステートレス中継)
- フロントは `psm_translate_settings`(localStorage)にローカル/クラウド2プロファイル保持、サイドバー「翻訳設定」パネルで切替・プリセット・接続テスト
- 編集モーダルは自然言語モードON時のみ原文欄+「英訳 →」ボタンを表示。既存content上書き時は確認ダイアログ
- 検証: translate.pyロジック26項目をサンドボックスで直接実行し全パス。pytest 20件超・vitest 6件を追加(ローカルで `pytest` / `pnpm test:unit` 実行のこと)
- **`pnpm build` を実行するまでUIに反映されない**(Vue変更を含むため)

### Phase 1/2 実装メモ

- Phase 1: `dist/index.js` に同等パッチ適用済み(暫定)。`pnpm build` で正式再生成のこと
- Phase 2: **Vueコンポーネント変更を含むため `pnpm build` を実行するまでUIに反映されない**
- YAMLの `model_mode` は `"sd" | "anima"`(未定義・不正値は `"sd"` フォールバック)
- `storage.py` は保存時に既存ファイルの未知ルートキーを保持する(前方互換)
- アイテムの `isNatural: true` で置換・エスケープ・末尾カンマ除去をスキップ(重みは適用可)
- 検証: Python側はstorage直接テスト9件、TS側はロジックミラー検証で全パス(サンドボックスのレジストリ制限によりvitest/pytest+fastapiは未実行。ローカルで `pnpm test:unit` / `pytest` 推奨)

## 5. Phase 2.5: プロンプト翻訳機能 設計書

### 5.1 概要と方針

自然言語アイテムの日本語原文をローカルLLM経由で英訳し、Anima等の英語前提モデルで使えるようにする。

決定事項(2026-07-22確認):

- 原文は `PsmItem.sourceText`(新設・省略可能フィールド)に保持
- 翻訳対象は **isNaturalアイテムのみ**(タグは英語前提のまま)
- バックエンドは **OpenAI互換API**、既定値はOllama(`http://localhost:11434/v1`)。LM Studio / llama.cpp server / クラウドAPIもURL・モデル名変更のみで利用可
- 翻訳タイミングは **編集時**(反映時ではない)。決定的なプロンプトを保ち、生成レイテンシに影響させない

### 5.2 データ構造

```typescript
// types.ts
export interface PsmItem {
  // ...既存...
  /** 翻訳前の原文 (自然言語アイテム用。コンパイル出力には含まれない) */
  sourceText?: string;
}
```

- `getCompiledPrompts()` は `sourceText` を一切参照しない(出力は従来どおり `content` のみ)
- YAML後方互換: 省略可能フィールドのため既存ファイルはそのまま動作。Phase 2で実装済の未知キー保持により旧バージョンとの相互運用も安全

### 5.3 翻訳設定 (localStorage保存・2プロファイル切替)

決定事項(2026-07-23変更): 翻訳設定はサーバーの `config.json` ではなく**ブラウザのlocalStorage**に保存する。
「ローカルLLM」と「クラウド」の**2プロファイルを常時保持**し、スイッチひとつで切り替える(切替時に再入力不要)。

```json
// localStorage key: "psm_translate_settings"
{
  "active": "local",              // "local" | "cloud"
  "local": {
    "provider": "openai",
    "endpoint": "http://localhost:11434/v1",
    "model": "qwen3:4b",
    "api_key": "",
    "timeout_sec": 30,
    "system_prompt": ""           // 空なら内蔵デフォルト(5.5)
  },
  "cloud": {
    "provider": "openai",
    "endpoint": "https://api.openai.com/v1",
    "model": "gpt-5-mini",
    "api_key": "sk-...",
    "timeout_sec": 30,
    "system_prompt": ""
  }
}
```

- 既存の `psm_settings` とは別キーにする(APIキーを含むため、エクスポート系機能に巻き込まない)
- store.tsに `loadTranslateSettings()` / `saveTranslateSettings()` を追加(既存のsaveSettingsLocalと同パターン)
- バックエンドは翻訳設定を**一切保存しない**(ステートレス)。`config.py` への変更は不要になる

**provider の種別**:

| provider | 対応サービス | 備考 |
|---|---|---|
| `openai` (既定) | Ollama / LM Studio / llama.cpp server / OpenAI / OpenRouter / Groq 等 | `{endpoint}/chat/completions` を呼ぶ。ローカルもクラウドも同一実装 |
| `deepl` | DeepL API (Free/Pro) | 翻訳特化・決定的。`system_prompt`/`model` は無視され `target_lang=EN` 固定 |

**UIプリセット**(選択中プロファイルのendpoint/model等を自動入力、詳細は編集可):

```
Ollama (ローカル)        → openai / http://localhost:11434/v1 / qwen3:4b
LM Studio (ローカル)     → openai / http://localhost:1234/v1 / (ロード中モデル)
OpenAI                  → openai / https://api.openai.com/v1 / gpt-5-mini
OpenRouter              → openai / https://openrouter.ai/api/v1 / (任意)
DeepL API Free          → deepl / https://api-free.deepl.com/v2 / -
カスタム                 → 全項目手入力
```

**localStorage保存のセキュリティ特性(把握しておくこと)**:

- 利点: サーバー側ファイルに残らない。ブラウザ・PCごとに独立。`--share` や多人数利用でもキーが共有されない
- 注意: WebUIは全拡張のJSが同一オリジンで動くため、**インストール済みの他拡張のJSからlocalStorageは読める**(config.json方式でも他拡張のPythonから読める点は同じで、リスクの所在が変わるだけ)
- 注意: `--listen` でLAN公開かつHTTPの場合、翻訳リクエストに載るキーが平文で流れる。ローカル利用(localhost)なら問題なし
- 設定UIのAPIキー欄は `type="password"` でマスク表示

### 5.4 APIエンドポイント

```
POST /psm/translate
  body: {
    "text": "日本語の原文",
    "config": {                    // フロントがlocalStorageのアクティブプロファイルを毎回同送
      "provider": "openai",
      "endpoint": "http://localhost:11434/v1",
      "model": "qwen3:4b",
      "api_key": "",
      "timeout_sec": 30,
      "system_prompt": ""
    }
  }
  resp: { "status": "success", "text": "English translation" }
        { "status": "error", "message": "..." }
```

- `api.py` に追加。バックエンドは**ステートレスな中継**: リクエストの `config` を使い、providerに応じて `{endpoint}/chat/completions`(openai)または `{endpoint}/translate`(deepl)を呼ぶ。設定の保存はしない
- provider実装は `scripts/psm/translate.py`(新設)に分離し、`translate(text, config) -> str` の共通インターフェースで抽象化。プロバイダ追加はここに1関数足すだけにする
- **ブラウザから直接翻訳APIを叩かない理由**: CORS制約の回避(Ollama/クラウドともブラウザからの直接fetchはCORSで失敗しうる)。キー保管はフロント側だが、外部への送信経路はサーバー経由に統一する
- バックエンドでの `config` 検証: endpointは `http(s)://` のみ許可。SSRF対策として `file://` 等は拒否
- HTTPクライアントはWebUI同梱の `requests` を使用(依存追加なし)
- タイムアウト・接続エラー・認証エラー(401)はプロバイダ別の分かりやすいメッセージで返す(「Ollamaが起動していません」「APIキーが無効です」等)

接続テストは専用エンドポイントを設けず、フロントから `/psm/translate` に固定短文("こんにちは、世界")を送るだけとする(バックエンドがステートレスになったため専用APIは不要)。

### 5.5 翻訳プロンプトと応答サニタイズ

内蔵デフォルトのシステムプロンプト(案):

```
You are a translator for image-generation prompts. Translate the user's text
into natural English suitable as a text-to-image prompt. Output ONLY the
translation. No explanations, no quotes. Keep proper nouns as-is.
```

応答サニタイズ(必須):

- `<think>...</think>` ブロックの除去(Qwen3系のthinking出力対策)
- 前後の引用符・コードフェンス・「Translation:」等の前置きの除去
- 空応答・原文と同一応答はエラー扱い

### 5.6 UI

**編集モーダル (`PsmEditModal.vue`)**: 自然言語モードON時のみ

- content欄の上に「原文 (sourceText)」テキストエリアを表示
- 「英訳 →」ボタン: sourceTextを `/psm/translate` に送り、結果をcontentへ反映(手直し前提。既存contentがある場合は上書き確認)
- 翻訳中はボタンをローディング表示、失敗時はエラーをインライン表示

**サイドバー (`PsmSideBar.vue`)**: Storage欄の下に「翻訳設定」折りたたみを追加

- 最上部に**「ローカル / クラウド」切替トグル**(`active` を変更するだけ。各プロファイルの設定値は保持される)
- 選択中プロファイルの編集欄: プリセット選択(Ollama / LM Studio / OpenAI / OpenRouter / DeepL / カスタム)、エンドポイントURL、モデル名、APIキー(`type="password"` でマスク表示)
- クラウドプロファイル選択時は「プロンプト内容が外部サービスに送信されます」の注意書きを表示
- 「接続テスト」ボタン(固定短文で `/psm/translate` を呼び、結果をインライン表示)

### 5.7 推奨モデル(ドキュメント記載用)

| モデル | サイズ目安 | 備考 |
|---|---|---|
| qwen3:4b | ~2.6GB (Q4) | 既定候補。thinking出力はサニタイズで対応 |
| gemma3:4b | ~3GB | thinkingなしで扱いやすい |
| CPU推論 | - | 2〜3文なら数秒。VRAMをForgeNeoと取り合わない利点。Ollamaの `keep_alive` 短縮設定も有効 |

### 5.8 実装ステップ

1. `scripts/psm/translate.py`(新設): provider抽象化(`openai` / `deepl`)+応答サニタイザ+endpoint検証
2. `api.py`: `/psm/translate`(ステートレス中継)
3. `types.ts` / `store.ts`: `sourceText` 追加、`TranslateSettings`型(local/cloud 2プロファイル+active)、`loadTranslateSettings()` / `saveTranslateSettings()` / `translateText()` アクション
4. `PsmEditModal.vue`: 原文欄+英訳ボタン
5. `PsmSideBar.vue`: 翻訳設定UI(ローカル/クラウド切替トグル+プリセット+接続テスト)
6. `i18n/ja.ts` / `en.ts`: キー追加
7. テスト: Python(サニタイザ単体、provider別モックHTTPテスト、endpoint検証)、TS(sourceTextがコンパイル出力に混入しないこと、localStorage保存・復元)
8. `pnpm build`(ローカル)

※ `config.py` への変更は不要になった(翻訳設定はフロント保存のため)

### 5.9 リスク・留意点

- LLM応答の揺れ → 編集時翻訳+手直し前提の設計で吸収
- Ollama未起動・モデル未pull → 接続テストボタンとエラーメッセージで案内
- 生成中のVRAM圧迫 → CPU推論・keep_alive短縮を推奨事項としてREADMEに記載
- クラウドAPI利用時はプロンプト内容が外部送信される → 設定UIに注意書きを表示(ローカルLLMなら完全オフライン)
- APIキーはlocalStorageにのみ保存(サーバー側は保存しない)。同一オリジンで動く他拡張のJSから読める点は留意(5.3参照)
- localStorageはブラウザ・PCごとに独立 → 別ブラウザで開くと翻訳設定の再入力が必要(仕様として許容)
- 将来拡張: タグアイテムの日本語→Danbooruタグ変換は精度課題があるため本Phaseのスコープ外

## 6. Phase 5: カテゴリ自動判定・反映前プレビュー 設計書

作成日: 2026-07-25

### 6.1 Phase 5A: 反映前プレビュー (フロントエンドのみ)

「反映」前にコンパイル結果と現在のWebUIテキストエリアとの差分を確認するモーダル。

**UI**: ツールバーの「反映」ボタン群の隣に「プレビュー」ボタンを追加 → `PsmPreviewModal.vue`(新設)を表示。

- Positive / Negative それぞれについて表示:
  - コンパイル結果全文(animaモードならカテゴリ整列適用後 = `getCompiledPrompts(nodes, ", ", true)`)
  - **タグ単位の差分**: 現在のWebUIテキストエリアの内容とカンマ区切りトークンで比較し、追加タグを緑・削除タグを赤・共通タグをグレーでチップ表示
  - 統計: タグ数 / 文字数
- モーダル内「このまま反映」ボタンで `handleApply` を実行して閉じる
- 差分ロジックは純関数 `computePromptDiff(oldStr, newStr)` として `store.ts`(または `utils`)に実装しユニットテスト可能にする
  - トークン化: カンマ分割 + trim。`<lora:...>` や自然言語文もトークンとして扱う(分割はカンマのみ)
  - 判定: 追加 = newにあってoldにない / 削除 = oldにあってnewにない(重複タグは出現回数で比較)

**影響ファイル**: `App.vue`(ボタン)、`PsmPreviewModal.vue`(新設)、`store.ts`(computePromptDiff)、`i18n/*`、`tests/store_prompt.spec.ts`

### 6.2 Phase 5B: カテゴリ自動判定

タグデータベースを参照して、グループのカテゴリを自動判定・提案する。

**データソース(自動探索・優先順)**:

| 優先 | ソース | 形式 | 備考 |
|---|---|---|---|
| 1 | a1111-sd-webui-tagcomplete | `extensions/*/tags/danbooru*.csv`(`tag,category,count,aliases`) | 軽量・高速。本環境には未導入だが公開リポジトリとして対応 |
| 2 | プロンプト大辞典 | `extensions/sd-webui-prompt-dictionary/data/runtime_js/00_prompt_dictionary_data.js` | **本環境で利用可能**。14万語、`category` + `ja`(日本語訳)を含む。`window.PROMPT_DICTIONARY_DATA = [...]` 形式のため接頭辞を除去してJSONパース |

**バックエンド** (`scripts/psm/tagdb.py` 新設):

- 遅延ロード+プロセス内キャッシュ。パース後は `{正規化タグ: {"category": str, "ja": str}}` の最小辞書のみ保持(61MBのJSONは読み捨て)
- 正規化: 小文字化・スペース→アンダースコア(PSM内はスペース表記、DB側はアンダースコア表記のため)
- エイリアスも辞書に展開
- Danbooruカテゴリ → PSMカテゴリのマッピング:
  - `0`(general) → `general`(ただし主体タグリストに一致すれば `subject`)
  - `1`(artist) → `artist` / `3`(copyright) → `series` / `4`(character) → `character` / `5`(meta) → `quality`
  - 主体タグリスト(ハードコード): `1girl, 1boy, 2girls, 2boys, 3girls, multiple girls, multiple boys, solo, 1other, no humans` 等
- API:
  - `POST /psm/tag-categories` `{tags: [...]}` → `{status, categories: {tag: PSMカテゴリ|"unknown"}, source: "..."}`
  - `GET /psm/tagdb-status` → `{available: bool, source, entries}`(初回ロードのトリガー兼用)

**フロントエンドUX**(v1は提案ベース、自動書き換えはしない):

1. **グループ編集モーダル「自動判定」ボタン**: グループ直下のアイテム(タグアイテムのみ、`<lora:...>`・ワイルドカード・自然言語は除外)を照会し、**多数決**でカテゴリを提案 → カテゴリ選択欄に反映(ユーザーが完了を押すまで保存されない)。判定内訳(「12件中: キャラ8, 一般3, 不明1」)をヒント表示
2. **一括判定**: サイドバー(Animaモード時のみ表示)の「カテゴリ一括判定」ボタン → カテゴリ**未設定**のルート直下グループのみを判定して適用し、結果サマリを表示。設定済みグループは変更しない
3. タグDBが見つからない場合はボタンを無効化し、ツールチップで対応拡張(tagcomplete / プロンプト大辞典)を案内

**影響ファイル**: `tagdb.py`(新設)、`api.py`、`store.ts`(照会アクション)、`PsmEditModal.vue`、`PsmSideBar.vue`、`i18n/*`、`tests/test_psm_tagdb.py`(新設)、`tests/store_prompt.spec.ts`

### 6.3 将来拡張(スコープ外メモ)

- タグの日本語注釈表示: 大辞典の `ja` フィールドを流用可能(tagdb.pyが既に保持する設計のため追加コスト小)
- 配置ミスの常時lint表示(重複チェックと同様のハイライト機構の流用)

## 7. 互換性・注意事項

- `model_mode` / `isNatural` / `category` はすべて省略可能な追加フィールドのため、既存YAMLはそのまま読める(後方互換)
- 旧バージョンPSMで新YAMLを開いた場合、未知フィールドが保存時に脱落する可能性があるため、`storage.py` は未知キーを保持する実装(dictパススルー)にしておくこと
- Phase 1のscore_保護はSD系(Pony系モデルの `score_9` 等)にもプラスに働く
- 顔文字タグの保護パターンは誤爆リスクがあるため、テストケース(`^_^`, `>_<`, `+_+`, `@_@`, `0_0`)を先に用意して確定させること
