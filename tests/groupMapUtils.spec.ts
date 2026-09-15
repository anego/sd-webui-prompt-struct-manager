import { describe, it, expect } from "vitest";
import { buildGroupMap, GroupMapItem } from "../src/groupMapUtils";
import { PsmItem } from "../src/types";

// -------------------------------------------------------------------------
// グループマップ構築 (buildGroupMap) のテスト
// -------------------------------------------------------------------------
// グループ内排他選択などで多数の兄弟アイテムが同時にenabledを切り替えると、
// このマップの再計算コストが体感できるラグの原因になっていたため、
// 単一パスでの集計ロジックが正しく元の挙動と同じ結果になることを検証する。

const leaf = (id: number, enabled = true): PsmItem => ({
  id, name: "", content: "tag", enabled, weight: 1, is_group: false,
});
const grp = (id: number, name: string, children: PsmItem[], enabled = true): PsmItem => ({
  id, name, content: "", enabled, weight: 1, is_group: true, children,
});

const isHeader = (entry: unknown): entry is { type: "header"; label: string } =>
  typeof entry === "object" && entry !== null && "type" in entry;

const groupsOf = (entries: ReturnType<typeof buildGroupMap>): GroupMapItem[] =>
  entries.filter((e): e is GroupMapItem => !isHeader(e));

describe("buildGroupMap - グループマップの構築", () => {
  it("1.1 空のツリーでは見出し2件のみが返ること (グループなし判定に使われる)", () => {
    // Act
    const result = buildGroupMap([], []);

    // Assert
    expect(result).toEqual([
      { type: "header", label: "Positive" },
      { type: "header", label: "Negative" },
    ]);
  });

  it("1.2 見出しの並び順が Positive → Negativeグループ → Negative見出し の順であること", () => {
    // Arrange
    const positive = [grp(1, "PosGroup", [leaf(2)])];
    const negative = [grp(3, "NegGroup", [leaf(4)])];

    // Act
    const result = buildGroupMap(positive, negative);

    // Assert
    expect(result.map((e) => (isHeader(e) ? e.label : (e as GroupMapItem).name))).toEqual([
      "Positive", "PosGroup", "Negative", "NegGroup",
    ]);
  });

  it("1.3 フラットなグループでは、有効なリーフのみが activeCount に数えられること", () => {
    // Arrange
    const positive = [
      grp(1, "Group", [leaf(2, true), leaf(3, false), leaf(4, true)]),
    ];

    // Act
    const [group] = groupsOf(buildGroupMap(positive, []));

    // Assert
    expect(group.activeCount).toBe(2);
  });

  it("1.4 グループ自身が無効な場合、子が有効でも activeCount は0になること", () => {
    // Arrange
    const positive = [
      grp(1, "DisabledGroup", [leaf(2, true), leaf(3, true)], false),
    ];

    // Act
    const [group] = groupsOf(buildGroupMap(positive, []));

    // Assert
    expect(group.enabled).toBe(false);
    expect(group.activeCount).toBe(0);
  });

  it("1.5 ネストしたグループ: 祖先が無効でも、子孫グループ自身の activeCount は自分自身の状態のみで独立して決まること", () => {
    // Arrange: 親グループは無効だが、子グループ自体は有効で子リーフも有効
    const child = grp(2, "ChildGroup", [leaf(3, true), leaf(4, true)], true);
    const positive = [grp(1, "ParentGroup", [child], false)];

    // Act
    const groups = groupsOf(buildGroupMap(positive, []));
    const parent = groups.find((g) => g.id === 1)!;
    const childEntry = groups.find((g) => g.id === 2)!;

    // Assert: 親は無効なので0、子は親の状態に関係なく自分自身の有効数を持つ
    expect(parent.activeCount).toBe(0);
    expect(childEntry.activeCount).toBe(2);
  });

  it("1.6 深いネストでも、祖先の集計に子孫の有効数が正しく積み上がること", () => {
    // Arrange: 祖父 > 親 > 子(2件のリーフ、うち1件無効)
    const child = grp(3, "Child", [leaf(4, true), leaf(5, false)]);
    const parent = grp(2, "Parent", [child, leaf(6, true)]);
    const grandparent = grp(1, "Grandparent", [parent]);

    // Act
    const groups = groupsOf(buildGroupMap([grandparent], []));
    const byId = (id: number) => groups.find((g) => g.id === id)!;

    // Assert
    expect(byId(3).activeCount).toBe(1); // child: leaf(4)のみ有効
    expect(byId(2).activeCount).toBe(2); // parent: child由来の1 + leaf(6)
    expect(byId(1).activeCount).toBe(2); // grandparent: parent由来の2がそのまま積み上がる
  });

  it("1.7 depth がネストの深さに応じて正しく設定されること", () => {
    // Arrange
    const child = grp(2, "Child", [leaf(3)]);
    const parent = grp(1, "Parent", [child]);

    // Act
    const groups = groupsOf(buildGroupMap([parent], []));

    // Assert
    expect(groups.find((g) => g.id === 1)!.depth).toBe(0);
    expect(groups.find((g) => g.id === 2)!.depth).toBe(1);
  });

  it("1.8 name が空文字の場合は '(No Name)' にフォールバックすること", () => {
    // Arrange
    const positive = [grp(1, "", [leaf(2)])];

    // Act
    const [group] = groupsOf(buildGroupMap(positive, []));

    // Assert
    expect(group.name).toBe("(No Name)");
  });

  it("1.9 リーフのみのツリー(グループが1つも無い場合)は見出しのみが返ること", () => {
    // Arrange
    const positive = [leaf(1), leaf(2)];

    // Act
    const result = buildGroupMap(positive, []);

    // Assert
    expect(groupsOf(result)).toEqual([]);
    expect(result.some(isHeader)).toBe(true);
  });

  it("1.10 nullish な要素が配列に混在していても無視して処理できること", () => {
    // Arrange: 想定外の状態 (削除競合等) でnullが混じるケースへの耐性を確認
    const positive = [null as unknown as PsmItem, leaf(1, true)];

    // Act & Assert
    expect(() => buildGroupMap(positive, [])).not.toThrow();
  });
});
