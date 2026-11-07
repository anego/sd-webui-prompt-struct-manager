import { describe, it, expect } from "bun:test";
import { toInputText } from "../src/inputValue";
import { buildEnabledView } from "../src/viewFilter";
import { PsmItem } from "../src/types";

// -------------------------------------------------------------------------
// テキスト入力の値の変換 (toInputText) のテスト
// -------------------------------------------------------------------------
// Vuetify の v-text-field は、clearable のクリアボタンを押すと v-model に null を入れる。
// 検索欄の値をそのまま toLowerCase に渡すと例外になり、表示フィルター中にペインが描画されなくなっていた。

describe("toInputText - テキスト入力の値を文字列に変換", () => {
  it("1.1 クリアボタンで入る null と、未設定の undefined を空文字列に変換し、文字列はそのまま返すこと", () => {
    // Arrange
    const values = [null, undefined, "", "smile"];

    // Act
    const result = values.map(toInputText);

    // Assert
    expect(result).toEqual(["", "", "", "smile"]);
  });

  it("1.2 クリア後の検索欄の値を変換すれば、表示フィルターを絞り込みなしで計算できること", () => {
    // Arrange
    const tree: PsmItem[] = [
      { id: 1, name: "walk", content: "walk", enabled: true, weight: 1, is_group: false },
      { id: 2, name: "run", content: "run", enabled: false, weight: 1, is_group: false },
    ];
    const clearedValue: string | null = null;

    // Act
    const view = buildEnabledView(tree, toInputText(clearedValue));

    // Assert
    expect(view.flatLeaves.map((e) => e.item.id)).toEqual([1]);
  });
});
