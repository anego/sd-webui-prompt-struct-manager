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
