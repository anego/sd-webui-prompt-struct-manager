import { describe, it, expect } from "bun:test";
import { convertForeignNodes, isForeignNode } from "../src/foreignFormat";
import { getCompiledPrompts } from "../src/store";
import { PsmItem } from "../src/types";

// -------------------------------------------------------------------------
// 別のツールの形式 (group / items / prompt) のファイルの変換 (src/foreignFormat.ts)
// この形式のノードには content が無く、そのままではペインの描画 (トークン数の計算) が例外になり、ペインが消えていた。
// -------------------------------------------------------------------------

/** 読み込んだファイルの内容を再現する (JSON を経由して、型定義に合わない値もそのまま作る) */
const loaded = (value: unknown): unknown[] => JSON.parse(JSON.stringify(value));

describe("convertForeignNodes - 別のツールの形式から PSM の形式への変換", () => {
  it("1.1 グループ (group / items / open) を、名前・子・開閉状態を持つ PSM のグループに変換すること", () => {
    // Arrange
    const nodes = loaded([{ group: "主題", items: [], enabled: false, open: false, weight: 1.2, id: 50 }]);

    // Act
    const result = convertForeignNodes(nodes);

    // Assert
    expect(result.nodes).toEqual([
      { id: 50, name: "主題", content: "", enabled: false, weight: 1.2, memo: "", is_group: true, isOpen: false, children: [] },
    ]);
    expect(result.convertedCount).toBe(1);
  });

  it("1.2 プロンプト (prompt / memo) を、内容とメモを持つ PSM のプロンプトに変換し、star は引き継がないこと", () => {
    // Arrange
    const nodes = loaded([{ prompt: "official art", memo: "オフィシャル", enabled: false, weight: 0.9, star: true, id: 7 }]);

    // Act
    const result = convertForeignNodes(nodes);

    // Assert
    expect(result.nodes).toEqual([
      { id: 7, name: "", content: "official art", enabled: false, weight: 0.9, memo: "オフィシャル", is_group: false },
    ]);
  });

  it("1.3 prompt が文字列の配列の場合は、カンマ区切りでつないだ内容にすること", () => {
    // Arrange (イブキ.yaml の形)
    const nodes = loaded([{ enabled: true, prompt: ["ibuki (blue archive)", "low wings", "gold eyes"], memo: "イブキ" }]);

    // Act
    const result = convertForeignNodes(nodes);

    // Assert
    expect(result.nodes[0].content).toBe("ibuki (blue archive), low wings, gold eyes");
  });

  it("1.4 入れ子のグループもたどって変換し、無い値 (enabled / weight / open / memo) は既定値にすること", () => {
    // Arrange
    const nodes = loaded([{ group: "外", items: [{ group: "内", items: [{ prompt: "1girl" }] }] }]);

    // Act
    const result = convertForeignNodes(nodes);

    // Assert
    const inner = result.nodes[0].children![0];
    expect(inner).toMatchObject({ name: "内", is_group: true, enabled: true, weight: 1, isOpen: true, memo: "" });
    expect(inner.children![0]).toMatchObject({ content: "1girl", enabled: true, weight: 1, memo: "", is_group: false });
    expect(result.convertedCount).toBe(3);
  });

  it("1.5 IDが無いノードには新しいIDを振り、互いに重複しないこと", () => {
    // Arrange
    const nodes = loaded([{ prompt: "a" }, { prompt: "b" }, { group: "g", items: [{ prompt: "c" }] }]);

    // Act
    const result = convertForeignNodes(nodes);

    // Assert
    const ids = [result.nodes[0].id, result.nodes[1].id, result.nodes[2].id, result.nodes[2].children![0].id];
    expect(ids.every((id) => Number.isSafeInteger(id))).toBe(true);
    expect(new Set(ids).size).toBe(4);
  });

  it("1.6 PSM の形式のツリーは、同じ配列・同じオブジェクトのまま返し、変換件数は0であること", () => {
    // Arrange
    const nodes = loaded([
      { id: 1, name: "g", content: "", enabled: true, weight: 1, memo: "", is_group: true, children: [{ id: 2, name: "", content: "a", enabled: true, weight: 1, memo: "", is_group: false }] },
    ]);

    // Act
    const result = convertForeignNodes(nodes);

    // Assert (入力は unknown[] なので、同じ配列かどうかは unknown として比べる)
    const returned: unknown = result.nodes;
    expect(returned).toBe(nodes);
    expect(result.convertedCount).toBe(0);
  });

  it("1.7 PSM のグループの中に別形式のノードがある場合は、そのノードだけを変換すること", () => {
    // Arrange
    const nodes = loaded([
      { id: 1, name: "g", content: "", enabled: true, weight: 1, memo: "", is_group: true, children: [{ prompt: "solo", id: 3 }] },
    ]);

    // Act
    const result = convertForeignNodes(nodes);

    // Assert
    expect(result.nodes[0]).toMatchObject({ id: 1, name: "g", is_group: true });
    expect(result.nodes[0].children).toEqual([{ id: 3, name: "", content: "solo", enabled: true, weight: 1, memo: "", is_group: false }]);
    expect(result.convertedCount).toBe(1);
  });

  it("1.8 オブジェクトでない要素 (null など) は取り除くこと", () => {
    // Arrange
    const nodes = loaded([null, { prompt: "a", id: 1 }, "text"]);

    // Act
    const result = convertForeignNodes(nodes);

    // Assert
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].content).toBe("a");
  });

  it("1.9 変換後のツリーは、ペインのトークン数の計算 (getCompiledPrompts) で例外にならないこと", () => {
    // Arrange (変換前はこの計算が token.trim の例外になり、Positive ペインが消えていた)
    const nodes = loaded([
      { group: "主題", items: [{ prompt: "1girl", enabled: true }, { prompt: ["solo", "smile"], enabled: true }], enabled: true, open: true },
    ]);
    const converted: PsmItem[] = convertForeignNodes(nodes).nodes;

    // Act
    const compiled = getCompiledPrompts(converted, ", ", true);

    // Assert
    expect(compiled).toBe("1girl, solo, smile");
  });
});

describe("isForeignNode - 別のツールの形式のノードかの判定", () => {
  it("2.1 group / items / prompt があり、is_group / content が無いノードだけを別形式と判定すること", () => {
    // Arrange / Act / Assert
    expect(isForeignNode({ group: "g", items: [] })).toBe(true);
    expect(isForeignNode({ prompt: "a" })).toBe(true);
    expect(isForeignNode({ id: 1, name: "", content: "a", is_group: false })).toBe(false);
    expect(isForeignNode({ id: 1, prompt: "a", content: "a" })).toBe(false);
    expect(isForeignNode({ id: 1, name: "x" })).toBe(false);
  });
});
