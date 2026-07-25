# Project Rules: sd-webui-prompt-struct-manager

## 技術スタック制約
- **Frontend:** Vue 3 (script setup), TypeScript, Vite, Tailwind CSS.
- **Backend:** Python (SD-WebUI Extension API), pathlib, JSON serialization.

## 実装上の鉄則
1. **データ構造の整合性:** プロンプトの構造（Tree/List）を変更する場合、エクスポート済みの旧バージョンJSONとの互換性を常に考慮せよ。
2. **UIの一貫性:** SD-WebUIのダークモード/ライトモード両方で視認性が保たれるよう、Tailwindの色の選定に注意せよ。
3. **副作用の隔離:** `scripts/` 配下のメインロジックと、ユーティリティ関数（文字列処理、JSON変換）を明確に分離せよ。

## ワークフロー
- 実装前に必ず `implementation_plan.md` を作成し、日本語でレビューを受けよ。
- タスク完了後は `task.md` を更新し、進捗を可視化せよ。