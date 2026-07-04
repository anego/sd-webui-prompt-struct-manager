# Python Backend Rules

## 適用範囲
すべての `.py` ファイル（SD WebUIのカスタムスクリプト、APIエンドポイント、内部ロジックなど）に適用する。

## 必須要件 (Requirements)

1. **厳格な型定義 (Strict Typing)**:
   - 関数の引数、戻り値には必ず型ヒント (Type Hints) を記述すること。
   - **【禁止】** `Any` 型の使用は原則禁止する。型が動的に変わる場合は `Union` や `TypeVar`、複雑な辞書には `TypedDict` やデータクラス (`dataclass` / `pydantic`) を用いて正確に定義すること。

2. **早期リターン (Early Returns)**:
   - ネストを浅く保つため、ガード節（Guard Clauses）を用いて異常系や前提条件を満たさない場合は関数群の先頭で `return` または `raise` を行うこと。
   - `if-else` による深いネストは許可しない。

   ✅ **Good (早期リターン):**
   
```python
   def process_prompt(prompt: Optional[str]) -> str:
       if not prompt:
           return ""
       if "error" in prompt:
           raise ValueError("Invalid prompt format")
       return parse_logic(prompt)
