# Testing Rules

## 適用範囲
`tests/` ディレクトリ配下のすべてのテストコード（Python / JavaScript / E2E）に適用する。

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

2. **E2Eテスト (Playwright) における堅牢な待機制御 (E2E Testing Wait Robustness)**:
   - **非同期UI変更（言語切り替え等）の確実な待機**:
     - 言語切り替えボタンのクリックなど、ローカル設定の変更の後は、固定時間スリープ（`page.waitForTimeout(500)`等）を**禁止**する。
     - 変更がDOM/UIに確実に反映されたことを示す動的なテキスト（例: 翻訳後のテキスト）やアクティブな要素状態が可視化（`visible`）するまで、明示的なセレクタで待機すること。これにより、マシンの負荷状況や実行速度の違いによる不安定さ（フレーキーテスト）を防止する。
   - **非同期通信中のローディングオーバーレイの消滅待機**:
     - YAMLファイルの新規作成、保存、複製、リネーム、削除、およびプロファイルの保存・適用・削除など、バックエンドとの非同期API通信を伴うアクション（クリック等）の直後には、必ずローディングオーバーレイ（`loading-overlay`）が非表示（`hidden`）になるのを同期して待機すること。
     - オーバーレイが表示されている間は他の要素へのクリックが物理的に遮断され、テストが予期せず失敗する原因となるため、この同期待機を徹底する。
   - **安易な `{ force: true }` クリックの禁止**:
     - アニメーション中やローディングオーバーレイ表示中の要素に対し、安易に `{ force: true }` を使用して強制クリックするのを避けること。強制クリックは意図しないオーバーレイの上をクリックして不発に終わる原因になり、問題の発見を遅らせる。原則として、要素が可視かつ安定（`stable`）するのを待ってから通常クリックを行うこと。
