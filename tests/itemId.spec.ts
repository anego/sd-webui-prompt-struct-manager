import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test";
import { stubGlobal, unstubAllGlobals } from "./helpers/globals";
import { createItemId, reserveItemIds, repairItemIds } from "../src/itemId";
import { state, duplicateItem, parsePromptToItems, buildAnimaTemplate, loadPrompts } from "../src/store";
import { PsmItem, PsmProfile } from "../src/types";

// -------------------------------------------------------------------------
// アイテムIDの発行と、読み込み時の修復 (src/itemId.ts)
// アプリ全体が「IDはファイル内で一意」を前提にしているため、
// 新しいIDが衝突しないことと、重複・欠損したファイルを読み込み時に直せることを検証する。
// -------------------------------------------------------------------------

/** 同じミリ秒内の処理を再現するために固定する現在時刻 */
const FIXED_NOW = 1_785_000_000_000;

/**
 * 読み込んだファイルの内容を再現する
 * 実際のファイルには、型定義に合わない値 (IDの欠損・文字列のID) が入っているため、JSON を経由して作る。
 */
const loadedTree = (value: unknown): PsmItem[] => JSON.parse(JSON.stringify(value));
const loadedProfiles = (value: unknown): PsmProfile[] => JSON.parse(JSON.stringify(value));

const leaf = (id: unknown, content: string) => ({ id, name: "", content, enabled: true, weight: 1, memo: "", is_group: false });
const group = (id: unknown, name: string, children: unknown[]) => ({
  id, name, content: "", enabled: true, weight: 1, memo: "", is_group: true, isOpen: true, children,
});

/** ツリー内のすべてのIDを、親を先にした順で集める */
const collectIds = (nodes: PsmItem[]): unknown[] =>
  nodes.flatMap((node) => [node.id, ...(node.is_group && node.children ? collectIds(node.children) : [])]);

/** 新しいIDを 1001, 1002, ... の順に発行する (テスト用) */
const sequentialIssuer = (start = 1001) => {
  let next = start;
  return (): number => next++;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createItemId / reserveItemIds - 新しいIDの発行", () => {
  it("1.1 同じミリ秒内に1万回発行しても、すべて異なり、発行順に大きくなること", () => {
    // Arrange
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);

    // Act
    const ids = Array.from({ length: 10_000 }, () => createItemId());

    // Assert
    expect(new Set(ids).size).toBe(10_000);
    expect(ids.every((id, i) => i === 0 || id > ids[i - 1])).toBe(true);
  });

  it("1.2 読み込んだファイルに現在時刻より先のIDがある場合、それより大きいIDを発行すること", () => {
    // Arrange
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const futureId = (FIXED_NOW + 60_000) * 1000;
    const tree = loadedTree([group(1, "g", [leaf(futureId, "a")])]);

    // Act
    reserveItemIds([tree]);
    const id = createItemId();

    // Assert
    expect(id).toBeGreaterThan(futureId);
  });

  it("1.3 文字列や安全な整数の範囲外のIDは、発行の基準にしないこと", () => {
    // Arrange
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW + 120_000);
    const tree = loadedTree([leaf("9999999999999999999", "a"), leaf(Number.MAX_SAFE_INTEGER * 2, "b")]);

    // Act
    reserveItemIds([tree]);
    const first = createItemId();
    const second = createItemId();

    // Assert: 範囲外の値を基準にすると、+1 しても同じ値になり重複してしまう
    expect(second).toBeGreaterThan(first);
    expect(Number.isSafeInteger(second)).toBe(true);
  });
});

describe("IDを発行する処理 - まとめて作っても重複しないこと", () => {
  beforeEach(() => {
    stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn() });
    state.positive = [];
    state.negative = [];
    state.selectedFile = ""; // 保存 (fetch) を行わない
  });

  afterEach(() => {
    unstubAllGlobals();
  });

  it("2.1 子が80個あるグループを同じミリ秒内に複製しても、IDが重複しないこと", async () => {
    // Arrange
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW + 200_000);
    const children = Array.from({ length: 80 }, (_, i) => leaf(i + 2, `tag${i}`));
    state.positive = loadedTree([group(1, "大きいグループ", children)]);

    // Act
    await duplicateItem(state.positive[0], state.positive);

    // Assert
    expect(state.positive).toHaveLength(2);
    const ids = collectIds(state.positive);
    expect(ids).toHaveLength(162);
    expect(new Set(ids).size).toBe(162);
  });

  it("2.2 PNG Info の Positive と Negative を同じミリ秒内に取り込んでも、ペイン間でIDが重ならないこと", () => {
    // Arrange
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW + 300_000);

    // Act
    const positive = parsePromptToItems("masterpiece, 1girl, solo, smile");
    const negative = parsePromptToItems("lowres, bad hands, worst quality");

    // Assert
    const negIds = new Set(negative.map((item) => item.id));
    expect(positive.some((item) => negIds.has(item.id))).toBe(false);
  });

  it("2.3 Anima の雛形で作られるIDが、Positive と Negative を通して重複しないこと", () => {
    // Arrange
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW + 400_000);

    // Act
    const template = buildAnimaTemplate();

    // Assert
    const ids = collectIds([...template.positive, ...template.negative]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("repairItemIds - 読み込んだファイルのIDの修復", () => {
  it("3.1 IDに問題が無い場合は、入力と同じオブジェクトをそのまま返すこと", () => {
    // Arrange
    const positive = loadedTree([group(1, "g", [leaf(2, "a")])]);
    const negative = loadedTree([leaf(3, "b")]);
    const profiles = loadedProfiles([{ name: "p", states: [{ id: 2, enabled: false, weight: 1 }] }]);

    // Act
    const result = repairItemIds({ positive, negative, profiles }, sequentialIssuer());

    // Assert
    expect(result.positive).toBe(positive);
    expect(result.negative).toBe(negative);
    expect(result.profiles[0]).toBe(profiles[0]);
    expect(result.duplicateCount).toBe(0);
    expect(result.missingCount).toBe(0);
    expect(result.droppedStateCount).toBe(0);
  });

  it("3.2 同じペイン内の重複は、先に出てくるノードのIDを残し、後のノードに新しいIDを振ること (入力は変更しない)", () => {
    // Arrange
    const positive = loadedTree([group(1, "g", [leaf(2, "a"), leaf(2, "b")])]);

    // Act
    const result = repairItemIds({ positive, negative: [], profiles: [] }, sequentialIssuer());

    // Assert
    expect(collectIds(result.positive)).toEqual([1, 2, 1001]);
    expect(result.duplicateCount).toBe(1);
    expect(collectIds(positive)).toEqual([1, 2, 2]);
    // 変更の無いノードは同じオブジェクトのまま
    expect(result.positive[0].children![0]).toBe(positive[0].children![0]);
  });

  it("3.3 ペインをまたぐ重複は、Positive のIDを残し、Negative に新しいIDを振ること", () => {
    // Arrange (PNG Info の取り込みで、両ペインの先頭が同じIDになっていた状態)
    const positive = loadedTree([leaf(100, "masterpiece"), leaf(101, "1girl")]);
    const negative = loadedTree([leaf(100, "lowres"), leaf(101, "bad hands")]);

    // Act
    const result = repairItemIds({ positive, negative, profiles: [] }, sequentialIssuer());

    // Assert
    expect(collectIds(result.positive)).toEqual([100, 101]);
    expect(collectIds(result.negative)).toEqual([1001, 1002]);
    expect(result.duplicateCount).toBe(2);
  });

  it("3.4 IDが無いノード (未定義・null・空文字) に新しいIDを振ること", () => {
    // Arrange
    const positive = loadedTree([leaf(undefined, "a"), leaf(null, "b"), group("", "g", [leaf(5, "c")])]);

    // Act
    const result = repairItemIds({ positive, negative: [], profiles: [] }, sequentialIssuer());

    // Assert
    expect(collectIds(result.positive)).toEqual([1001, 1002, 1003, 5]);
    expect(result.missingCount).toBe(3);
    expect(result.duplicateCount).toBe(0);
  });

  it("3.5 重複していない文字列のIDはそのまま残し、重複している文字列のIDには新しいIDを振ること", () => {
    // Arrange (古い形式のファイル)
    const positive = loadedTree([leaf("6n0b48eu0", "a"), leaf("s805y08ip", "b"), leaf("6n0b48eu0", "c")]);

    // Act
    const result = repairItemIds({ positive, negative: [], profiles: [] }, sequentialIssuer());

    // Assert
    expect(collectIds(result.positive)).toEqual(["6n0b48eu0", "s805y08ip", 1001]);
    expect(result.duplicateCount).toBe(1);
  });

  it("3.6 新しく振るIDが、後ろに出てくるノードの既存のIDと重ならないこと", () => {
    // Arrange: 発行関数が最初に返す 1001 を、後ろのノードが既に使っている
    const positive = loadedTree([leaf(1, "a"), leaf(1, "b"), leaf(1001, "c")]);

    // Act
    const result = repairItemIds({ positive, negative: [], profiles: [] }, sequentialIssuer());

    // Assert
    expect(collectIds(result.positive)).toEqual([1, 1002, 1001]);
  });

  it("3.7 振り直したノードに、プロファイルの元のIDの状態を引き継ぐこと (同じIDが複数ある場合は後の状態)", () => {
    // Arrange: 修復前は、同じIDの2つのノードの両方に、後に記録された状態が適用されていた
    const positive = loadedTree([leaf(1, "a"), leaf(1, "b"), leaf(2, "c")]);
    const profiles = loadedProfiles([
      { name: "朝", states: [{ id: 1, enabled: true, weight: 1 }, { id: 1, enabled: false, weight: 1.2 }, { id: 2, enabled: true, weight: 1 }] },
      { name: "対象外", states: [{ id: 2, enabled: false, weight: 1 }] },
    ]);

    // Act
    const result = repairItemIds({ positive, negative: [], profiles }, sequentialIssuer());

    // Assert
    expect(result.profiles[0].states).toEqual([
      { id: 1, enabled: true, weight: 1 },
      { id: 1, enabled: false, weight: 1.2 },
      { id: 2, enabled: true, weight: 1 },
      { id: 1001, enabled: false, weight: 1.2 },
    ]);
    // 振り直したIDの状態を持たないプロファイルは、そのままのオブジェクト
    expect(result.profiles[1]).toBe(profiles[1]);
  });

  it("3.8 IDの無いプロファイルの状態は、どのノードにも対応しないため削除し、件数を返すこと", () => {
    // Arrange
    const positive = loadedTree([leaf(1, "a")]);
    const profiles = loadedProfiles([{ name: "p", states: [{ enabled: true, weight: 1 }, { id: 1, enabled: false, weight: 1 }] }]);

    // Act
    const result = repairItemIds({ positive, negative: [], profiles }, sequentialIssuer());

    // Assert
    expect(result.profiles[0].states).toEqual([{ id: 1, enabled: false, weight: 1 }]);
    expect(result.droppedStateCount).toBe(1);
  });

  it("3.9 グループではないノードに残っている children はたどらないこと (画面にも出力にも使われないため)", () => {
    // Arrange
    const positive = loadedTree([{ ...leaf(1, "a"), children: [leaf(2, "hidden")] }, leaf(2, "b")]);

    // Act
    const result = repairItemIds({ positive, negative: [], profiles: [] }, sequentialIssuer());

    // Assert: 使われていない children の ID 2 を先に出てきたものと数えず、表示中の ID 2 を残す
    expect(result.positive).toBe(positive);
    expect(result.duplicateCount).toBe(0);
  });
});

describe("loadPrompts - 読み込み時の形式の変換・IDの修復と保存", () => {
  /** fetch の呼び出し部分だけの型 (typeof fetch は preconnect なども要求するため、差し替え先はこの型で作る) */
  type FetchCall = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  let fetchMock = vi.fn<FetchCall>();

  /** get-prompts には指定の内容を返し、save-prompts は成功させる */
  const respondWith = (payload: unknown): void => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/psm/get-prompts")) return new Response(JSON.stringify(payload));
      return new Response(JSON.stringify({ status: "success" }));
    });
  };

  /** save-prompts へ送った内容 */
  const savedBodies = (): unknown[] =>
    fetchMock.mock.calls
      .filter(([input]) => String(input) === "/psm/save-prompts")
      .map(([, init]) => JSON.parse(String(init?.body)));

  beforeEach(() => {
    stubGlobal("localStorage", { getItem: vi.fn(), setItem: vi.fn() });
    fetchMock = vi.fn<FetchCall>();
    stubGlobal("fetch", fetchMock);
    state.positive = [];
    state.negative = [];
    state.profiles = [];
    state.fileRepairNotice = null;
    state.selectedFile = "anima_test.yaml";
  });

  afterEach(() => {
    unstubAllGlobals();
  });

  it("4.1 重複・欠損したIDがあるファイルは、修復した内容をすぐに保存し、修復件数を通知すること", async () => {
    // Arrange
    respondWith({
      positive: [leaf(100, "masterpiece"), leaf(undefined, "1girl")],
      negative: [leaf(100, "lowres")],
      profiles: [{ name: "p", states: [{ id: 100, enabled: false, weight: 1 }] }],
    });

    // Act
    await loadPrompts();

    // Assert
    const ids = collectIds([...state.positive, ...state.negative]);
    expect(new Set(ids).size).toBe(3);
    expect(state.positive[0].id).toBe(100);
    expect(state.fileRepairNotice).toEqual({ file: "anima_test.yaml", convertedCount: 0, repairedCount: 2 });

    const bodies = savedBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      file: "anima_test.yaml",
      negative: [{ id: state.negative[0].id, content: "lowres" }],
    });
    // Negative の振り直したノードにも、プロファイルの状態が引き継がれて保存されること
    expect(bodies[0]).toMatchObject({
      profiles: [{ name: "p", states: [{ id: 100 }, { id: state.negative[0].id, enabled: false }] }],
    });
  });

  it("4.2 IDに問題が無いファイルは、保存も通知もしないこと", async () => {
    // Arrange
    respondWith({ positive: [leaf(1, "a")], negative: [leaf(2, "b")], profiles: [] });

    // Act
    await loadPrompts();

    // Assert
    expect(savedBodies()).toHaveLength(0);
    expect(state.fileRepairNotice).toBeNull();
  });

  it("4.3 別のファイルを読み込むと、前のファイルの修復の通知は閉じられること", async () => {
    // Arrange
    state.fileRepairNotice = { file: "old.yaml", convertedCount: 0, repairedCount: 3 };
    respondWith({ positive: [leaf(1, "a")], negative: [], profiles: [] });

    // Act
    await loadPrompts();

    // Assert
    expect(state.fileRepairNotice).toBeNull();
  });

  it("4.4 削除したのがIDの無いプロファイルの状態だけの場合は、保存するが通知はしないこと", async () => {
    // Arrange
    respondWith({ positive: [leaf(1, "a")], negative: [], profiles: [{ name: "p", states: [{ enabled: true, weight: 1 }] }] });

    // Act
    await loadPrompts();

    // Assert
    expect(savedBodies()).toHaveLength(1);
    expect(state.profiles[0].states).toEqual([]);
    expect(state.fileRepairNotice).toBeNull();
  });

  it("4.5 別のツールの形式 (group / items / prompt) のファイルは、PSM の形式に変換して保存し、変換件数を通知すること", async () => {
    // Arrange (p3.yaml と同じ形。入れ子のプロンプトにはIDが無い)
    respondWith({
      positive: [{ group: "主題", items: [{ prompt: "1girl", memo: "女の子", enabled: true, weight: 1, star: false }], enabled: true, open: true, weight: 1 }],
      negative: [{ prompt: "lowres, bad hands", memo: "基本", enabled: true, weight: 1, star: false }],
    });

    // Act
    await loadPrompts();

    // Assert
    expect(state.positive[0]).toMatchObject({ name: "主題", is_group: true, isOpen: true });
    expect(state.positive[0].children![0]).toMatchObject({ content: "1girl", memo: "女の子", is_group: false });
    expect(state.negative[0]).toMatchObject({ content: "lowres, bad hands", is_group: false });
    const ids = collectIds([...state.positive, ...state.negative]);
    expect(ids.every((id) => typeof id === "number")).toBe(true);
    expect(new Set(ids).size).toBe(3);

    expect(state.fileRepairNotice).toEqual({ file: "anima_test.yaml", convertedCount: 3, repairedCount: 0 });
    const bodies = savedBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ positive: [{ name: "主題", is_group: true, children: [{ content: "1girl" }] }] });
  });
});
