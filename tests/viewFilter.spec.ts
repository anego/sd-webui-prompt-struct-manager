import { describe, it, expect } from "bun:test";
import { buildEnabledView, matchesQuery } from "../src/viewFilter";
import { PsmItem } from "../src/types";

// -------------------------------------------------------------------------
// 表示フィルター (buildEnabledView) のテスト
// -------------------------------------------------------------------------
// ツールバーの「有効のみ」「有効(グループ付き)」で表示する項目の計算を検証する。
// 「有効」は実際にプロンプトへ反映される (自身と祖先がすべて有効な) ものを指す。

const leaf = (id: number, name: string, enabled = true, extra: Partial<PsmItem> = {}): PsmItem => ({
  id, name, content: name, enabled, weight: 1, memo: "", is_group: false, ...extra,
});
const grp = (id: number, name: string, children: PsmItem[], enabled = true, extra: Partial<PsmItem> = {}): PsmItem => ({
  id, name, content: "", enabled, weight: 1, memo: "", is_group: true, children, ...extra,
});

describe("buildEnabledView - 有効なプロンプトとそれを含むグループの計算", () => {
  it("1.1 自身と祖先がすべて有効なプロンプトだけを、ツリーの順に並べること", () => {
    // Arrange
    const tree = [
      grp(1, "動作", [
        leaf(2, "歩く"),
        leaf(3, "走る", false),
        leaf(4, "ジャンプ"),
        grp(5, "座り", [leaf(6, "正座", false), leaf(7, "あぐら")]),
      ]),
      grp(8, "服装", [leaf(9, "制服", false), leaf(10, "水着", false)]),
      leaf(11, "1girl"),
    ];

    // Act
    const view = buildEnabledView(tree);

    // Assert
    expect(view.flatLeaves.map((e) => e.item.name)).toEqual(["歩く", "ジャンプ", "あぐら", "1girl"]);
  });

  it("1.2 有効なプロンプトを含むグループだけを表示対象にし、含まないグループと無効なプロンプトは除くこと", () => {
    // Arrange
    const tree = [
      grp(1, "動作", [leaf(2, "歩く"), leaf(3, "走る", false), grp(5, "座り", [leaf(6, "正座", false), leaf(7, "あぐら")])]),
      grp(8, "服装", [leaf(9, "制服", false)]),
      grp(12, "空", []),
    ];

    // Act
    const view = buildEnabledView(tree);

    // Assert
    expect([...view.visibleIds].sort((a, b) => a - b)).toEqual([1, 2, 5, 7]);
  });

  it("1.3 祖先グループが無効なプロンプトは、自身が有効でも対象外になること", () => {
    // Arrange
    const tree = [grp(1, "無効グループ", [leaf(2, "有効だが反映されない"), grp(3, "子", [leaf(4, "孫")])], false)];

    // Act
    const view = buildEnabledView(tree);

    // Assert
    expect(view.flatLeaves).toEqual([]);
    expect(view.visibleIds.size).toBe(0);
  });

  it("1.4 非表示グループの配下も対象にし、非表示グループの中であることを記録すること", () => {
    // Arrange
    const tree = [grp(1, "外", [grp(2, "非表示", [leaf(3, "隠れた有効プロンプト")], true, { isHidden: true }), leaf(4, "通常")])];

    // Act
    const view = buildEnabledView(tree);

    // Assert
    expect(view.visibleIds.has(2)).toBe(true);
    expect(view.flatLeaves.map((e) => [e.item.id, e.inHiddenGroup])).toEqual([[3, true], [4, false]]);
  });

  it("1.5 祖先グループのロックを記録し、プロンプトを含むリストへの参照を返すこと", () => {
    // Arrange
    const lockedChildren = [leaf(3, "ロック配下")];
    const tree = [grp(1, "ロック", [grp(2, "子", lockedChildren)], true, { isLocked: true }), leaf(4, "通常")];

    // Act
    const view = buildEnabledView(tree);

    // Assert
    expect(view.flatLeaves[0].locked).toBe(true);
    expect(view.flatLeaves[0].parentChildren).toBe(lockedChildren);
    expect(view.flatLeaves[1].locked).toBe(false);
    expect(view.flatLeaves[1].parentChildren).toBe(tree);
  });

  it("1.6 検索クエリがある場合、名前・内容・メモのいずれかが一致するプロンプトに絞り込むこと (大文字小文字は区別しない)", () => {
    // Arrange
    const tree = [
      leaf(1, "Smile"),
      leaf(2, "frown"),
      leaf(3, "laugh", true, { memo: "笑顔の一種 SMILE" }),
      leaf(4, "smile", false),
    ];

    // Act
    const view = buildEnabledView(tree, "smile");

    // Assert
    expect(view.flatLeaves.map((e) => e.item.id)).toEqual([1, 3]);
  });

  it("1.7 祖先グループの名前が検索クエリに一致する場合、配下の有効なプロンプトをすべて対象にすること", () => {
    // Arrange
    const tree = [
      grp(1, "表情", [leaf(2, "smile"), leaf(3, "frown", false), grp(4, "目", [leaf(5, "closed eyes")])]),
      grp(6, "ポーズ", [leaf(7, "standing")]),
    ];

    // Act
    const view = buildEnabledView(tree, "表情");

    // Assert
    expect(view.flatLeaves.map((e) => e.item.id)).toEqual([2, 5]);
    expect([...view.visibleIds].sort((a, b) => a - b)).toEqual([1, 2, 4, 5]);
  });
});

describe("matchesQuery - 検索クエリとの一致", () => {
  it("1.8 名前・内容・メモのいずれかに含まれれば一致し、空の項目は無視すること", () => {
    // Arrange
    const item = leaf(1, "", true, { content: "Long Hair", memo: "" });

    // Act
    const byContent = matchesQuery(item, "long");
    const notFound = matchesQuery(item, "short");

    // Assert
    expect(byContent).toBe(true);
    expect(notFound).toBe(false);
  });
});
