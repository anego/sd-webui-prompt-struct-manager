# Vue Component Style Rules

## 適用範囲
すべての `.vue` ファイルの `<style>` ブロック、およびプロジェクトの共通スタイルファイルに適用する。

## 必須要件 (Requirements)

1. **共通スタイルの分離 (Global & Shared Styles)**:
   - 複数のコンポーネントで使い回す共通のスタイル（汎用的なUIパーツ、ユーティリティクラスなど）や、SCSSの共通変数（色、サイズ）は、個別の `.vue` ファイル内に記述せず、必ず `src/styles/main.scss` に追加すること。
   - エージェントはスタイルを定義する際、それが対象のコンポーネント固有のものか、共通化すべきものかを常に検討し、重複するCSSの生成を避けること。

2. **コンポーネント固有のスタイル指定**:
   - `.vue` ファイル内で固有のスタイルを定義する場合は、必ず `<style lang="scss" scoped>` を使用すること。
   - SD WebUI（Gradio）のグローバルスタイルとの意図しない衝突を防ぐため、`scoped` を徹底する。

3. **命名規則 (BEM記法)**:
   - 共通スタイル・スコープ付きスタイルを問わず、クラス名は厳密に BEM (Block, Element, Modifier) 記法に従うこと。
   - Block: `.block-name`
   - Element: `.block-name__element`
   - Modifier: `.block-name--modifier` または `.block-name__element--modifier`

4. **SCSSのネストとアンパサンド (`&`) の使用規則**:
   - ElementやModifierの定義には、親参照の `&` を使用して記述すること。
   - **【重要】** 特異性（Specificity）が無駄に高くなるのを防ぐため、HTMLのDOM構造をそのままネストしないこと。ネストは原則として「疑似クラス（`:hover`など）」や「Modifier」、および「Elementの結合」の1〜2階層までに留める。

   ✅ **Good (BEMの正しいネスト):**
```scss
   .prompt-manager {
     display: flex;

     &__header {
       font-weight: bold;

       &--active {
         color: red;
       }
     }
   }

5. **!important の使用について**
  - `!important`は本当にどうしようもない場合を除いて使用してはいけない。
