## 前提条件
開発を開始するには、以下の環境が整っている必要があります。

Docker / Docker Compose

Visual Studio Code

VS Code 拡張機能: Dev Containers

## 開発用コンテナ起動
```
docker compose up -d
```

## VS Code でコンテナを開く (推奨)
IDE 側の型定義エラー（赤線）を解消し、コンポーネントの補完を有効にするために Dev Containers を使用してください。

VS Code で本プロジェクトを開く。

左下の緑色のアイコンをクリックし、「Reopen in Container」 を選択。

/app フォルダがワークスペースとしてマウントされ、Vue 開発に必要な拡張機能（Volar 等）が自動インストールされます。

## playwright
### テスト実行
```
npx playwright test
npx playwright test --workers=1
```
