import { describe, it, expect, beforeEach, vi } from "vitest";
import { 
  state, 
  getCompiledPrompts, 
  detectDuplicates, 
  savePrompts, 
  loadPrompts,
  createYamlFile,
  duplicateCurrentFile,
  renameCurrentFile,
  deleteCurrentFile
} from "../src/store";
import { PsmItem } from "../src/types";

// -------------------------------------------------------------------------
// テスト前処理とモック設定
// -------------------------------------------------------------------------
// Node環境にはブラウザの localStorage や document, fetch が存在しないため
// テスト開始前にこれらをモックとしてグローバルにスタブ化します。
// -------------------------------------------------------------------------

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
};

beforeEach(() => {
  // グローバルモックの注入
  vi.stubGlobal("localStorage", mockLocalStorage);
  vi.stubGlobal("document", {
    getElementById: vi.fn(),
    querySelector: vi.fn(),
  });
  vi.stubGlobal("fetch", vi.fn());
  
  // 各テスト間で状態が干渉しないように Piniaライクな状態オブジェクトをリセットします
  state.positive = [];
  state.negative = [];
  state.selectedFile = "";
  state.duplicateCheckMode = "none";
  state.duplicateTexts.clear();
  
  vi.clearAllMocks();
});

// -------------------------------------------------------------------------
// 1. プロンプト階層コンパイル機能 (getCompiledPrompts) のテスト
// -------------------------------------------------------------------------

describe("getCompiledPrompts - プロンプト階層コンパイル", () => {
  it("1.1 有効なプロンプトをカンマ区切りで正しく結合できること", () => {
    // Arrange
    const nodes: PsmItem[] = [
      { id: 1, name: "p1", content: "1girl", enabled: true, weight: 1.0, is_group: false },
      { id: 2, name: "p2", content: "solo", enabled: true, weight: 1.0, is_group: false },
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert
    expect(result).toBe("1girl, solo");
  });

  it("1.2 無効化されたプロンプトや、無効化された親グループ配下の子が正しく除外されること", () => {
    // Arrange
    const nodes: PsmItem[] = [
      { id: 1, name: "p1", content: "1girl", enabled: true, weight: 1.0, is_group: false },
      { id: 2, name: "p2", content: "solo", enabled: false, weight: 1.0, is_group: false }, // 個別に無効化
      {
        id: 3,
        name: "Group A",
        content: "",
        enabled: false, // 親グループが無効化されているため、配下の子は除外されるべき
        is_group: true,
        children: [
          { id: 4, name: "p3", content: "detailed background", enabled: true, weight: 1.0, is_group: false },
        ]
      }
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert
    expect(result).toBe("1girl");
  });

  it("1.3 重み付け(weight)が1.0以外のときに (text:weight) のSD WebUI形式で出力されること", () => {
    // Arrange
    const nodes: PsmItem[] = [
      { id: 1, name: "p1", content: "masterpiece", enabled: true, weight: 1.2, is_group: false },
      { id: 2, name: "p2", content: "highly detailed", enabled: true, weight: 1.0, is_group: false },
      { id: 3, name: "p3", content: "realistic", enabled: true, weight: 0.8, is_group: false },
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert
    expect(result).toBe("(masterpiece:1.2), highly detailed, (realistic:0.8)");
  });

  it("1.4 ランダムグループ (isRandom: true) の場合に Dynamic Prompts {A|B|C} 形式で結合されること", () => {
    // Arrange
    const nodes: PsmItem[] = [
      { id: 1, name: "p1", content: "1girl", enabled: true, weight: 1.0, is_group: false },
      {
        id: 2,
        name: "Outfit Random",
        content: "",
        enabled: true,
        is_group: true,
        isRandom: true, // ランダムモード
        children: [
          { id: 3, name: "o1", content: "red dress", enabled: true, weight: 1.0, is_group: false },
          { id: 4, name: "o2", content: "blue swimsuit", enabled: true, weight: 1.0, is_group: false },
          { id: 5, name: "o3", content: "white uniform", enabled: false, weight: 1.0, is_group: false }, // 無効な選択肢は除外されること
        ]
      }
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert
    expect(result).toBe("1girl, {red dress|blue swimsuit}");
  });

  it("1.5 プロンプト内の括弧が正しくエスケープされ、末尾のカンマや余分な空白がクリーンアップされること", () => {
    // Arrange
    const nodes: PsmItem[] = [
      { id: 1, name: "p1", content: "smile (showing teeth)", enabled: true, weight: 1.0, is_group: false },
      { id: 2, name: "p2", content: "sparkles,  ", enabled: true, weight: 1.0, is_group: false }, // 末尾カンマと空白
      { id: 3, name: "p3", content: "holding flower", enabled: true, weight: 1.1, is_group: false },
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert
    // 括弧が \( \) にエスケープされ、末尾カンマが消え、重み付けが正しく適用されていること
    expect(result).toBe("smile \\(showing teeth\\), sparkles, (holding flower:1.1)");
  });
});

// -------------------------------------------------------------------------
// 2. 重複チェック機能 (detectDuplicates) のテスト
// -------------------------------------------------------------------------

describe("detectDuplicates - 重複プロンプト検出", () => {
  it("2.1 ツリー内に同一テキストの有効プロンプトが複数存在する場合に正しく検出すること", () => {
    // Arrange
    state.positive = [
      { id: 1, name: "p1", content: "masterpiece", enabled: true, weight: 1.0, is_group: false },
      { id: 2, name: "p2", content: "1girl", enabled: true, weight: 1.0, is_group: false },
    ];
    state.negative = [
      { id: 3, name: "n1", content: "lowres", enabled: true, weight: 1.0, is_group: false },
      { id: 4, name: "n2", content: "1girl", enabled: true, weight: 1.0, is_group: false }, // 重複している
    ];

    // Act
    const duplicates = detectDuplicates();

    // Assert
    expect(duplicates.size).toBe(1);
    expect(duplicates.has("1girl")).toBe(true);
  });

  it("2.2 BREAK や AND などの制御トークンは重複検出から除外されること", () => {
    // Arrange
    state.positive = [
      { id: 1, name: "b1", content: "BREAK", enabled: true, weight: 1.0, is_group: false },
      { id: 2, name: "p1", content: "1girl", enabled: true, weight: 1.0, is_group: false },
      { id: 3, name: "b2", content: "break", enabled: true, weight: 1.0, is_group: false }, // 小文字表記でも除外されるべき
      { id: 4, name: "a1", content: "AND", enabled: true, weight: 1.0, is_group: false },
      { id: 5, name: "a2", content: "and", enabled: true, weight: 1.0, is_group: false }, // ANDも除外
    ];

    // Act
    const duplicates = detectDuplicates();

    // Assert
    expect(duplicates.size).toBe(0); // 制御キーワードなので重複数はゼロ
  });

  it("2.3 無効化されたプロンプトや、無効グループ配下にあるものは重複と見なされないこと", () => {
    // Arrange
    state.positive = [
      { id: 1, name: "p1", content: "masterpiece", enabled: true, weight: 1.0, is_group: false },
      { id: 2, name: "p2", content: "masterpiece", enabled: false, weight: 1.0, is_group: false }, // 個別に無効化
      {
        id: 3,
        name: "Disabled Group",
        content: "",
        enabled: false, // グループ無効
        is_group: true,
        children: [
          { id: 4, name: "p3", content: "masterpiece", enabled: true, weight: 1.0, is_group: false },
        ]
      }
    ];

    // Act
    const duplicates = detectDuplicates();

    // Assert
    // 実際に「有効」な masterpiece は1つだけになるため、重複は検出されないべき
    expect(duplicates.size).toBe(0);
  });
});

// -------------------------------------------------------------------------
// 3. YAML保存・ファイル管理API連携 (fetch) のテスト
// -------------------------------------------------------------------------

describe("YAML 保存 & ファイル管理 API 連携", () => {
  it("3.1 savePrompts: ファイル名が設定されている場合、正しいペイロードでPOSTリクエストを送ること", async () => {
    // Arrange
    state.selectedFile = "my_prompts.yaml";
    state.positive = [{ id: 1, name: "p1", content: "1girl", enabled: true, weight: 1.0, is_group: false }];
    state.negative = [{ id: 2, name: "n1", content: "lowres", enabled: true, weight: 1.0, is_group: false }];

    const mockResponse = { ok: true, json: async () => ({ status: "success" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await savePrompts();

    // Assert
    expect(fetch).toHaveBeenCalledWith("/psm/save-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: "my_prompts.yaml",
        positive: state.positive,
        negative: state.negative,
      }),
    });
  });

  it("3.2 savePrompts: ファイル名が空の場合、APIを呼び出さないこと", async () => {
    // Arrange
    state.selectedFile = "";

    // Act
    await savePrompts();

    // Assert
    expect(fetch).not.toHaveBeenCalled();
  });

  it("3.3 loadPrompts: GETリクエストを送り、レスポンスデータをリアクティブ状態に正しく展開すること", async () => {
    // Arrange
    state.selectedFile = "load_target.yaml";
    const apiPayload = {
      positive: [{ id: 10, name: "load1", content: "masterpiece", enabled: true, weight: 1.0, is_group: false }],
      negative: [{ id: 20, name: "load2", content: "bad hands", enabled: true, weight: 1.0, is_group: false }]
    };

    const mockResponse = { ok: true, json: async () => apiPayload };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await loadPrompts();

    // Assert
    expect(fetch).toHaveBeenCalledWith("/psm/get-prompts?file=load_target.yaml");
    // ロードされたデータが state に反映されていること
    expect(state.positive).toEqual(apiPayload.positive);
    expect(state.negative).toEqual(apiPayload.negative);
  });

  it("3.4 createYamlFile: /psm/save-prompts に対して初期化データをPOSTし、作成後に再読み込みされること", async () => {
    // Arrange
    const mockResponse = { ok: true, json: async () => ({ status: "success", files: ["new_file.yaml"] }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await createYamlFile("new_file");

    // Assert
    // 1. ファイルの空保存APIが呼ばれたか
    expect(fetch).toHaveBeenCalledWith("/psm/save-prompts", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ file: "new_file.yaml", positive: [], negative: [] })
    }));

    // 2. 作成したファイルが選択状態に変更されていること
    expect(state.selectedFile).toBe("new_file.yaml");
  });

  it("3.5 duplicateCurrentFile / renameCurrentFile / deleteCurrentFile: 各操作に対応するAPIが正しいメソッドとパラメータで叩かれること", async () => {
    // Arrange
    state.selectedFile = "current.yaml";
    const mockResponse = { ok: true, json: async () => ({ status: "success", files: [] }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act & Assert (複合ステップの検証)
    // 複製テストの Act
    await duplicateCurrentFile("current_copy");
    // 複製テストの Assert
    expect(fetch).toHaveBeenCalledWith("/psm/duplicate-file", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ src: "current.yaml", dst: "current_copy.yaml" })
    }));

    // リネームテストの Act (複製後は current_copy.yaml が対象)
    await renameCurrentFile("renamed.yaml");
    // リネームテストの Assert
    expect(fetch).toHaveBeenCalledWith("/psm/rename-file", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ src: "current_copy.yaml", dst: "renamed.yaml" })
    }));

    // 削除テストの Act (リネーム後は renamed.yaml が対象)
    await deleteCurrentFile();
    // 削除テストの Assert
    expect(fetch).toHaveBeenCalledWith("/psm/delete-file?file=renamed.yaml", expect.objectContaining({
      method: "DELETE"
    }));
  });
});

// -------------------------------------------------------------------------
// 4. カテゴリ内排他選択 (isExclusive) のテスト
// -------------------------------------------------------------------------

import { 
  toggleItemEnabled, 
  toggleGroupExclusive,
  resetWeight,
  saveSettingsLocal,
  loadSettingsLocal
} from "../src/store";

describe("カテゴリ内排他選択 (isExclusive)", () => {
  it("4.1 toggleItemEnabled: 親が isExclusive の場合、ある要素を有効化すると他の兄弟要素がすべて無効化されること", async () => {
    // Arrange
    const parentGroup: PsmItem = {
      id: 1,
      name: "Group Exclusive",
      content: "",
      enabled: true,
      weight: 1.0,
      is_group: true,
      isExclusive: true, // 排他選択有効
      children: []
    };

    const c1: PsmItem = { id: 2, name: "c1", content: "A", enabled: true, weight: 1.0, is_group: false };
    const c2: PsmItem = { id: 3, name: "c2", content: "B", enabled: false, weight: 1.0, is_group: false };
    const c3: PsmItem = { id: 4, name: "c3", content: "C", enabled: false, weight: 1.0, is_group: false };
    
    parentGroup.children = [c1, c2, c3];
    const parentChildren = parentGroup.children;

    const mockResponse = { ok: true, json: async () => ({ status: "success" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act: c2 を有効化する
    await toggleItemEnabled(c2, parentChildren, parentGroup);

    // Assert: c2が有効になり、c1が自動無効化されていること
    expect(c2.enabled).toBe(true);
    expect(c1.enabled).toBe(false);
    expect(c3.enabled).toBe(false);
  });

  it("4.2 toggleGroupExclusive: isExclusive を ON にした際、すでに複数有効な要素があれば最初の1つだけを残して無効化すること", async () => {
    // Arrange
    const group: PsmItem = {
      id: 1,
      name: "Group to ON",
      content: "",
      enabled: true,
      weight: 1.0,
      is_group: true,
      isExclusive: false, // 最初は排他選択無効
      children: [
        { id: 2, name: "c1", content: "A", enabled: true, weight: 1.0, is_group: false },
        { id: 3, name: "c2", content: "B", enabled: true, weight: 1.0, is_group: false }, // 有効
        { id: 4, name: "c3", content: "C", enabled: false, weight: 1.0, is_group: false }
      ]
    };

    const mockResponse = { ok: true, json: async () => ({ status: "success" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act: isExclusive を ON にする
    await toggleGroupExclusive(group);

    // Assert: isExclusive が true になり、c1(最初の有効要素)のみ true、c2 は無効化されること
    expect(group.isExclusive).toBe(true);
    expect(group.children![0].enabled).toBe(true);  // c1
    expect(group.children![1].enabled).toBe(false); // c2
    expect(group.children![2].enabled).toBe(false); // c3
  });

  it("4.3 resetWeight: resetWeight を呼び出すと、アイテムの重みが 1.0 に戻ること", async () => {
    // Arrange
    state.selectedFile = "dummy.yaml";
    const item: PsmItem = { id: 2, name: "c1", content: "A", enabled: true, weight: 1.5, is_group: false };
    const mockResponse = { ok: true, json: async () => ({ status: "success" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await resetWeight(item);

    // Assert
    expect(item.weight).toBe(1.0);
    expect(fetch).toHaveBeenCalledWith("/psm/save-prompts", expect.any(Object));
  });

  it("4.4 showWeightSlider のローカルストレージ自動保存・復元", () => {
    // Arrange
    state.showWeightSlider = false; // デフォルト true から false へ
    
    // Act (保存)
    saveSettingsLocal();
    
    // Assert
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "psm_settings", 
      expect.stringContaining('"show_weight_slider":false')
    );

    // Arrange (復元のためにモックの戻り値をセット)
    mockLocalStorage.getItem.mockReturnValueOnce(JSON.stringify({
      show_weight_slider: false,
      ui_scale: "large"
    }));

    // Act (ロード)
    state.showWeightSlider = true; // 一旦 true に戻す
    loadSettingsLocal();

    // Assert
    expect(state.showWeightSlider).toBe(false);
  });
});


