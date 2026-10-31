# Testing Rules

## 適用範囲
`tests/` ディレクトリ配下のすべてのテストコード（Python / TypeScript）、および手動確認チェックリスト（`tests/TEST_SPEC.md` / `tests/TEST_SPEC_en.md`）に適用する。

## 必須要件 (Requirements)

1. **テストの構造 (AAA Pattern)**:
   - テストコードは Arrange（準備）, Act（実行）, Assert（検証） のブロックが視覚的にわかるように記述すること。

   ✅ **Good:**
   
```python
   def test_prompt_parser_handles_empty_string():
       # Arrange
       parser = PromptParser()
       empty_input = ""

       # Act
       result = parser.parse(empty_input)

       # Assert
       assert result.is_empty is True
```

2. **フロントエンド単体テスト (`bun test`)**:
   - テストファイルは `tests/` 配下に `*.spec.ts` として作成する（`bunfig.toml` で収集対象を `tests/` に限定している）。実行は `bun run test:unit`。
   - `describe` / `it` / `expect` / `vi` などは `bun:test` からインポートすること。`vitest` からはインポートしない（依存から削除済み）。
   - **グローバル変数の差し替え**:
     - `fetch`・`document`・`navigator` などのグローバル変数は、`tests/helpers/globals.ts` の `stubGlobal()` で差し替え、`afterEach` で必ず `unstubAllGlobals()` を呼んで元に戻すこと。
     - `globalThis` への直接代入は禁止する。`bun test` は全テストファイルを同一プロセスで実行するため、戻し忘れが他のファイルのテストに波及する。また Bun の `navigator` などは読み取り専用で、直接代入できない。
   - **`fetch` のモック**:
     - `bun:test` の `vi` には `mocked` が無いため、`vi.fn<typeof fetch>()` を変数で保持し、その変数を直接参照して呼び出し内容の検証や戻り値の設定を行うこと（`as` による型アサーションは不要）。

3. **E2Eテストの廃止と手動確認 (Manual Verification)**:
   - Playwright による E2E テストは v1.6.0 で廃止した（Bun ランタイムが Playwright の公式サポート外のため）。Playwright などのブラウザ自動操作によるテストを追加しないこと。必要になった場合は、追加前にユーザーに相談すること。
   - **UIを介さずに検証できるロジックは単体テストで担保する**: `store.ts` などの関数で検証できる内容は、手動確認に回さず必ず `bun test` の単体テストを追加すること。
   - **UIに関わる変更時の手動確認依頼**: `.vue`・スタイル・キーボード/マウス操作に関わる変更を行った場合は、`tests/TEST_SPEC.md` の「2.3 手動確認チェックリスト」から影響する項目の番号（例: `B-5`, `C-3`）を挙げ、ユーザーに確認を依頼すること。
   - **チェックリストの保守**: UIの機能を追加・変更した場合は、確認手順と期待結果をチェックリストに追記・修正すること。日本語版 `TEST_SPEC.md` と英語版 `TEST_SPEC_en.md` の両方を更新する。
