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
  state.modelMode = "sd";
  state.translateSettings = null;
  
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

  it("1.6 プロンプト内のアンダーバーが半角スペースに自動置換され、かつワイルドカードは保護されること", () => {
    // Arrange
    const nodes: PsmItem[] = [
      { id: 1, name: "p1", content: "sway_back", enabled: true, weight: 1.0, is_group: false },
      { id: 2, name: "p2", content: "__character__", enabled: true, weight: 1.0, is_group: false }, // ワイルドカード
      { id: 3, name: "p3", content: "camel_case_name", enabled: true, weight: 1.1, is_group: false }, // 重み付き
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert
    // sway_back が sway back、camel_case_name が camel case name（重み付き）になり、__character__ はそのまま維持されること
    expect(result).toBe("sway back, __character__, (camel case name:1.1)");
  });

  it("1.7 スコアタグ (score_N / score_N_up) のアンダーバーが置換されず保護されること", () => {
    // Arrange: Anima形式 (score_7) と Pony形式 (score_8_up) の両方を検証
    const nodes: PsmItem[] = [
      { id: 1, name: "p1", content: "score_7", enabled: true, weight: 1.0, is_group: false },
      { id: 2, name: "p2", content: "score_8_up", enabled: true, weight: 1.0, is_group: false },
      { id: 3, name: "p3", content: "score_9", enabled: true, weight: 1.2, is_group: false }, // 重み付きでも保護
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert
    expect(result).toBe("score_7, score_8_up, (score_9:1.2)");
  });

  it("1.8 1アイテムにカンマ区切りで複数タグが含まれる場合、スコアタグのみ保護され他は置換されること", () => {
    // Arrange: Anima推奨プリフィックスをまるごと1アイテムにした運用を想定
    const nodes: PsmItem[] = [
      { id: 1, name: "quality", content: "masterpiece, best_quality, score_7, safe", enabled: true, weight: 1.0, is_group: false },
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert: best_quality は置換され、score_7 は保護されること
    expect(result).toBe("masterpiece, best quality, score_7, safe");
  });

  it("1.9 顔文字タグ (^_^, >_<, @_@, +_+, 0_0, ;_;) のアンダーバーが保護されること", () => {
    // Arrange
    const emotes = ["^_^", ">_<", "@_@", "+_+", "0_0", ";_;"];
    const nodes: PsmItem[] = emotes.map((e, i) => ({
      id: i + 1, name: "", content: e, enabled: true, weight: 1.0, is_group: false,
    }));
    // 通常タグが巻き込まれないことも同時に確認
    nodes.push({ id: 99, name: "", content: "long_hair", enabled: true, weight: 1.0, is_group: false });

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert
    expect(result).toBe("^_^, >_<, @_@, +_+, 0_0, ;_;, long hair");
  });

  it("1.12 拡張ネットワーク構文 (<lora:...>) のアンダーバーが保護されること", () => {
    // Arrange: アンダースコアを含むLoRA名 + 通常タグの混在
    const nodes: PsmItem[] = [
      { id: 1, name: "", content: "<lora:my_style_v2:0.8>", enabled: true, weight: 1.0, is_group: false },
      { id: 2, name: "", content: "<hypernet:some_net:1.0>", enabled: true, weight: 1.0, is_group: false },
      { id: 3, name: "", content: "long_hair", enabled: true, weight: 1.0, is_group: false },
      // 1アイテム内にカンマ区切りで混在するケース
      { id: 4, name: "", content: "<lora:chara_a:0.7>, trigger_word", enabled: true, weight: 1.0, is_group: false },
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert: LoRA名は保護され、通常タグ (long_hair, trigger_word) は置換されること
    expect(result).toBe("<lora:my_style_v2:0.8>, <hypernet:some_net:1.0>, long hair, <lora:chara_a:0.7>, trigger word");
  });

  it("1.11 sourceText (翻訳原文) はコンパイル出力に一切含まれないこと", () => {
    // Arrange: 原文(日本語)を保持した自然言語アイテム
    const nodes: PsmItem[] = [
      {
        id: 1, name: "nl", content: "A cat on the beach.", enabled: true, weight: 1.0,
        is_group: false, isNatural: true, sourceText: "浜辺の猫",
      },
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert: 出力は content のみで、原文は混入しない
    expect(result).toBe("A cat on the beach.");
    expect(result).not.toContain("浜辺の猫");
  });

  it("1.10 自然言語アイテム (isNatural) は置換・エスケープされず原文のまま出力されること", () => {
    // Arrange: Anima向けの自然言語プロンプトを想定
    const nlText = "An anime girl with long_hair (transparent) is standing, smiling.";
    const nodes: PsmItem[] = [
      { id: 1, name: "tag", content: "masterpiece", enabled: true, weight: 1.0, is_group: false },
      { id: 2, name: "nl", content: `  ${nlText}  `, enabled: true, weight: 1.0, is_group: false, isNatural: true },
      { id: 3, name: "nl-weighted", content: "A cat sits.", enabled: true, weight: 1.2, is_group: false, isNatural: true },
    ];

    // Act
    const result = getCompiledPrompts(nodes);

    // Assert: isNatural は前後trimのみ (アンダースコア・括弧・文中カンマ・ピリオドが保持される)
    // 重みは自然言語アイテムにも適用可能
    expect(result).toBe(`masterpiece, ${nlText}, (A cat sits.:1.2)`);
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
        profiles: state.profiles,
        model_mode: state.modelMode,
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
    // model_mode 未定義の旧ファイルは "sd" にフォールバックすること (後方互換)
    expect(state.modelMode).toBe("sd");
  });

  it("3.3b loadPrompts: model_mode が anima のファイルをロードすると state.modelMode に反映されること", async () => {
    // Arrange
    state.selectedFile = "anima_file.yaml";
    state.modelMode = "sd";
    const apiPayload = { positive: [], negative: [], profiles: [], model_mode: "anima" };
    const mockResponse = { ok: true, json: async () => apiPayload };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await loadPrompts();

    // Assert
    expect(state.modelMode).toBe("anima");
  });

  it("3.3c setModelMode: モードを設定すると即時保存され、ペイロードに model_mode が含まれること", async () => {
    // Arrange
    state.selectedFile = "mode_test.yaml";
    const mockResponse = { ok: true, json: async () => ({ status: "success" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await setModelMode("anima");

    // Assert
    expect(state.modelMode).toBe("anima");
    expect(fetch).toHaveBeenCalledWith("/psm/save-prompts", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"model_mode":"anima"'),
    }));
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
  loadSettingsLocal,
  setModelMode
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

// -------------------------------------------------------------------------
// 5. 状態スナップショット「プロファイル」機能のテスト
// -------------------------------------------------------------------------
import { 
  saveProfile, 
  applyProfile, 
  deleteProfile,
  startLoading,
  stopLoading
} from "../src/store";

describe("状態スナップショット「プロファイル」機能", () => {
  beforeEach(() => {
    state.profiles = [];
    state.selectedProfileName = "";
  });

  it("5.1 saveProfile: 現在のツリー状態（enabled/weight）を新規プロファイルとして保存できること", async () => {
    // Arrange
    state.selectedFile = "test_profile.yaml";
    state.positive = [
      { id: 101, name: "p1", content: "1girl", enabled: true, weight: 1.2, is_group: false },
    ];
    state.negative = [
      { id: 201, name: "n1", content: "lowres", enabled: false, weight: 1.0, is_group: false },
    ];
    
    const mockResponse = { ok: true, json: async () => ({ status: "success" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await saveProfile("MyProfile");

    // Assert
    expect(state.profiles.length).toBe(1);
    expect(state.profiles[0].name).toBe("MyProfile");
    expect(state.profiles[0].states).toEqual([
      { id: 101, enabled: true, weight: 1.2 },
      { id: 201, enabled: false, weight: 1.0 },
    ]);
    expect(state.selectedProfileName).toBe("MyProfile");
    expect(fetch).toHaveBeenCalledWith("/psm/save-prompts", expect.any(Object));
  });

  it("5.2 applyProfile: 保存されたプロファイルを適用した時、ツリー内の全アイテムの状態が一括上書きされること", async () => {
    // Arrange
    state.selectedFile = "test_profile.yaml";
    state.positive = [
      { id: 101, name: "p1", content: "1girl", enabled: false, weight: 1.0, is_group: false },
    ];
    state.negative = [
      { id: 201, name: "n1", content: "lowres", enabled: true, weight: 1.0, is_group: false },
    ];
    state.profiles = [
      {
        name: "PresetA",
        states: [
          { id: 101, enabled: true, weight: 1.5 },
          { id: 201, enabled: false, weight: 0.8 },
        ]
      }
    ];
    
    const mockResponse = { ok: true, json: async () => ({ status: "success" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await applyProfile("PresetA");

    // Assert
    expect(state.positive[0].enabled).toBe(true);
    expect(state.positive[0].weight).toBe(1.5);
    expect(state.negative[0].enabled).toBe(false);
    expect(state.negative[0].weight).toBe(0.8);
    expect(state.selectedProfileName).toBe("PresetA");
    expect(fetch).toHaveBeenCalledWith("/psm/save-prompts", expect.any(Object));
  });

  it("5.3 deleteProfile: 指定されたプロファイルを正常に削除し、選択状態であれば選択解除すること", async () => {
    // Arrange
    state.selectedFile = "test_profile.yaml";
    state.profiles = [
      { name: "PresetA", states: [] },
      { name: "PresetB", states: [] },
    ];
    state.selectedProfileName = "PresetA";
    
    const mockResponse = { ok: true, json: async () => ({ status: "success" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await deleteProfile("PresetA");

    // Assert
    expect(state.profiles.length).toBe(1);
    expect(state.profiles.find(p => p.name === "PresetA")).toBeUndefined();
    expect(state.selectedProfileName).toBe("");
  });
});

// -------------------------------------------------------------------------
// 11. トークン数の概算 (estimateTokenCount) のテスト
// -------------------------------------------------------------------------
import { estimateTokenCount, CLIP_CHUNK_SIZE } from "../src/store";

describe("estimateTokenCount - トークン数の概算", () => {
  it("11.1 空文字は0トークン・1チャンクを返すこと", () => {
    expect(estimateTokenCount("")).toEqual({ tokens: 0, chunks: 1, breaks: 0 });
    expect(estimateTokenCount("   ")).toEqual({ tokens: 0, chunks: 1, breaks: 0 });
  });

  it("11.2 短い単語は1トークン、カンマも1トークンとして数えること", () => {
    // "1girl" (1) + カンマ (1) + "solo" (1) + カンマ (1) = 4
    expect(estimateTokenCount("1girl, solo").tokens).toBe(4);
  });

  it("11.3 長い単語は複数トークンとして概算すること", () => {
    // 7文字以上は分割されやすいため加算される
    const short = estimateTokenCount("cat").tokens;
    const long = estimateTokenCount("extraordinarily").tokens;
    expect(long).toBeGreaterThan(short);
  });

  it("11.4 拡張ネットワーク構文 (<lora:...>) はカウントしないこと", () => {
    // LoRAはエンコード前に除去されるため、タグのみのカウントと一致する
    const withLora = estimateTokenCount("1girl, <lora:my_style_v2:0.8>, solo").tokens;
    const without = estimateTokenCount("1girl, solo").tokens;
    expect(withLora).toBe(without);
  });

  it("11.5 強調構文の括弧と重み指定をカウントしないこと", () => {
    expect(estimateTokenCount("(masterpiece:1.4)").tokens)
      .toBe(estimateTokenCount("masterpiece").tokens);
    expect(estimateTokenCount("((detailed))").tokens)
      .toBe(estimateTokenCount("detailed").tokens);
  });

  it("11.6 BREAK はトークンに数えず、チャンク境界を強制すること", () => {
    // Arrange: BREAK前後に1タグずつ
    const r = estimateTokenCount("1girl, BREAK, solo");

    // Assert: トークンは 1girl(1)+,(1) + solo(1)+,(1) = 4、BREAKでチャンクが分かれる
    expect(r.tokens).toBe(4);
    expect(r.breaks).toBe(1);
    expect(r.chunks).toBe(2);
  });

  it("11.7 75トークンを超えるとチャンク数が増えること", () => {
    // Arrange: 短いタグを大量に並べる (1タグ = 単語1 + カンマ1 = 2トークン)
    const many = Array.from({ length: 60 }, () => "cat").join(", ");
    const r = estimateTokenCount(many);

    // Assert
    expect(r.tokens).toBeGreaterThan(CLIP_CHUNK_SIZE);
    expect(r.chunks).toBe(Math.ceil(r.tokens / CLIP_CHUNK_SIZE));
  });

  it("11.8 自然言語の長文もカウントできること", () => {
    const r = estimateTokenCount("An anime girl with long hair is standing in a field.");
    expect(r.tokens).toBeGreaterThan(8);
    expect(r.chunks).toBe(1);
  });
});

// -------------------------------------------------------------------------
// 9. 反映前プレビューの差分計算 (Phase 5A) のテスト
// -------------------------------------------------------------------------
import { computePromptDiff, suggestCategoryForGroup, bulkAssignCategories } from "../src/store";

describe("computePromptDiff - 反映前プレビューの差分計算 (Phase 5A)", () => {
  it("9.1 追加・削除・共通トークンを正しく分類すること", () => {
    // Arrange & Act
    const d = computePromptDiff("1girl, solo, smile", "1girl, smile, long hair");

    // Assert: 共通(1girl, smile) / 追加(long hair) / 削除(solo)
    expect(d.common).toBe(2);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(d.tokens.filter((t) => t.kind === "added").map((t) => t.text)).toEqual(["long hair"]);
    expect(d.tokens.filter((t) => t.kind === "removed").map((t) => t.text)).toEqual(["solo"]);
  });

  it("9.2 トークンは新プロンプトの順で並び、削除トークンが末尾に付くこと", () => {
    // Act
    const d = computePromptDiff("old_tag, keep", "keep, new_tag");

    // Assert
    expect(d.tokens.map((t) => t.text)).toEqual(["keep", "new_tag", "old_tag"]);
    expect(d.tokens.map((t) => t.kind)).toEqual(["common", "added", "removed"]);
  });

  it("9.3 変更がない場合は added/removed が 0 になること", () => {
    const d = computePromptDiff("a, b, c", "a, b, c");
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
    expect(d.common).toBe(3);
  });

  it("9.4 重複タグを出現回数で比較すること", () => {
    // Arrange: 旧2回 → 新3回なら 1つだけ「追加」
    const d = computePromptDiff("dup, dup", "dup, dup, dup");
    expect(d.common).toBe(2);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(0);
  });

  it("9.5 空文字・余分な空白やカンマを安全に扱えること", () => {
    // Arrange: 空の旧プロンプトから2タグ追加
    const d1 = computePromptDiff("", " a ,, b , ");
    expect(d1.added).toBe(2);
    expect(d1.removed).toBe(0);
    expect(d1.tokens.map((t) => t.text)).toEqual(["a", "b"]);

    // 全削除のケース
    const d2 = computePromptDiff("a, b", "");
    expect(d2.removed).toBe(2);
    expect(d2.added).toBe(0);
  });

  it("9.6 LoRA構文や自然言語文をカンマ単位のトークンとして扱うこと", () => {
    // Arrange: LoRA構文は分割せず1トークン、自然言語文はカンマで分かれる
    const d = computePromptDiff(
      "<lora:old_style:0.8>",
      "<lora:new_style:0.8>, A girl stands"
    );
    expect(d.tokens.filter((t) => t.kind === "added").map((t) => t.text))
      .toEqual(["<lora:new_style:0.8>", "A girl stands"]);
    expect(d.tokens.filter((t) => t.kind === "removed").map((t) => t.text))
      .toEqual(["<lora:old_style:0.8>"]);
  });
});

// -------------------------------------------------------------------------
// 10. カテゴリ自動判定 (Phase 5B) のテスト
// -------------------------------------------------------------------------

describe("カテゴリ自動判定 (Phase 5B)", () => {
  const leaf = (content: string, extra: Partial<PsmItem> = {}): PsmItem => ({
    id: Math.random() * 1e9 | 0, name: "", content, enabled: true, weight: 1.0, is_group: false, ...extra,
  });
  const group = (name: string, children: PsmItem[], extra: Partial<PsmItem> = {}): PsmItem => ({
    id: Math.random() * 1e9 | 0, name, content: "", enabled: true, weight: 1.0,
    is_group: true, children, ...extra,
  });

  it("10.1 suggestCategoryForGroup: 多数決でカテゴリを提案し、内訳を返すこと", async () => {
    // Arrange: characterが多数
    const g = group("キャラ", [
      leaf("oomuro sakurako"), leaf("toshinou kyouko"), leaf("smile"),
    ]);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "success",
        categories: {
          "oomuro sakurako": "character",
          "toshinou kyouko": "character",
          "smile": "general",
        },
      }),
    } as Response);

    // Act
    const s = await suggestCategoryForGroup(g);

    // Assert
    expect(s.suggested).toBe("character");
    expect(s.counts).toEqual({ character: 2, general: 1 });
    expect(s.total).toBe(3);
    expect(s.unknown).toBe(0);
  });

  it("10.2 suggestCategoryForGroup: 自然言語・ワイルドカード・LoRA・制御トークンを照会対象から除外すること", async () => {
    // Arrange
    const g = group("混在", [
      leaf("1girl"),
      leaf("A girl is standing.", { isNatural: true }),
      leaf("__wildcard__"),
      leaf("<lora:foo:0.8>"),
      leaf("BREAK"),
    ]);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", categories: { "1girl": "subject" } }),
    } as Response);

    // Act
    const s = await suggestCategoryForGroup(g);

    // Assert: 照会されたのは 1girl のみ
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.tags).toEqual(["1girl"]);
    expect(s.total).toBe(1);
    expect(s.suggested).toBe("subject");
  });

  it("10.3 suggestCategoryForGroup: ネストしたグループ内のタグも収集すること", async () => {
    // Arrange
    const g = group("親", [
      leaf("masterpiece"),
      group("子", [leaf("best quality")]),
    ]);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", categories: {} }),
    } as Response);

    // Act
    await suggestCategoryForGroup(g);

    // Assert
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.tags).toEqual(["masterpiece", "best quality"]);
  });

  it("10.4 suggestCategoryForGroup: タグDB未検出時はエラーメッセージ付きで例外を投げること", async () => {
    // Arrange
    const g = group("g", [leaf("1girl")]);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "error", message: "タグDBが見つかりません。" }),
    } as Response);

    // Act & Assert
    await expect(suggestCategoryForGroup(g)).rejects.toThrow("タグDBが見つかりません。");
  });

  it("10.5 suggestCategoryForGroup: 対象タグが無い場合はAPIを呼ばず null を返すこと", async () => {
    // Arrange: 自然言語のみ
    const g = group("NLのみ", [leaf("A cat sits.", { isNatural: true })]);

    // Act
    const s = await suggestCategoryForGroup(g);

    // Assert
    expect(s.suggested).toBeNull();
    expect(s.total).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("10.6 bulkAssignCategories: 未設定グループのみに適用し、設定済みはスキップすること", async () => {
    // Arrange
    state.selectedFile = "bulk.yaml";
    state.positive = [
      group("未設定", [leaf("oomuro sakurako")]),
      group("設定済み", [leaf("smile")], { category: "quality" }), // 変更されないこと
    ];
    state.negative = [];

    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url) === "/psm/tag-categories") {
        return {
          ok: true,
          json: async () => ({ status: "success", categories: { "oomuro sakurako": "character" } }),
        } as Response;
      }
      return { ok: true, json: async () => ({ status: "success" }) } as Response;
    });

    // Act
    const r = await bulkAssignCategories();

    // Assert
    expect(state.positive[0].category).toBe("character");
    expect(state.positive[1].category).toBe("quality"); // 設定済みは保持
    expect(r.applied).toBe(1);
    expect(r.skipped).toBe(1);
    expect(fetch).toHaveBeenCalledWith("/psm/save-prompts", expect.any(Object));
  });
});

// -------------------------------------------------------------------------
// 8. カテゴリ整列とAnimaテンプレート (Phase 3) のテスト
// -------------------------------------------------------------------------
import { buildAnimaTemplate, createYamlFile } from "../src/store";

describe("カテゴリ整列とAnimaテンプレート (Phase 3)", () => {
  const grp = (name: string, category: string | undefined, content: string): PsmItem => ({
    id: Math.random() * 1e9 | 0, name, content: "", enabled: true, weight: 1.0, is_group: true,
    category: category as PsmItem["category"],
    children: [{ id: Math.random() * 1e9 | 0, name: "", content, enabled: true, weight: 1.0, is_group: false }],
  });

  it("8.1 animaモード時、applyCategoryOrder=true でルート直下がカテゴリ優先度順に整列されること", () => {
    // Arrange: ツリー上の並びはカテゴリ順序とバラバラ
    state.modelMode = "anima";
    const nodes: PsmItem[] = [
      grp("一般", "general", "smile"),
      grp("絵師", "artist", "@some artist"),
      grp("品質", "quality", "masterpiece"),
      grp("キャラ", "character", "oomuro sakurako"),
      grp("主体", "subject", "1girl"),
      grp("作品", "series", "yuru yuri"),
    ];

    // Act
    const result = getCompiledPrompts(nodes, ", ", true);

    // Assert: quality → subject → character → series → artist → general
    expect(result).toBe("masterpiece, 1girl, oomuro sakurako, yuru yuri, @some artist, smile");
  });

  it("8.2 同一カテゴリ内の相対順序が維持されること (安定ソート)", () => {
    // Arrange
    state.modelMode = "anima";
    const nodes: PsmItem[] = [
      grp("品質A", "quality", "masterpiece"),
      grp("一般A", "general", "first"),
      grp("品質B", "quality", "score_7"),
      grp("一般B", "general", "second"),
    ];

    // Act
    const result = getCompiledPrompts(nodes, ", ", true);

    // Assert
    expect(result).toBe("masterpiece, score_7, first, second");
  });

  it("8.3 sdモードでは applyCategoryOrder=true でも並び順が変わらないこと", () => {
    // Arrange
    state.modelMode = "sd";
    const nodes: PsmItem[] = [
      grp("一般", "general", "smile"),
      grp("品質", "quality", "masterpiece"),
    ];

    // Act & Assert: ツリー順のまま
    expect(getCompiledPrompts(nodes, ", ", true)).toBe("smile, masterpiece");
  });

  it("8.4 animaモードでも applyCategoryOrder 未指定 (既定false) なら並び順が変わらないこと", () => {
    // Arrange: 再帰呼び出し (ネスト側) が誤って整列されないことの保証
    state.modelMode = "anima";
    const nodes: PsmItem[] = [
      grp("一般", "general", "smile"),
      grp("品質", "quality", "masterpiece"),
    ];

    // Act & Assert
    expect(getCompiledPrompts(nodes)).toBe("smile, masterpiece");
  });

  it("8.5 category未指定のノードは general 扱いで、既存の出力順を壊さないこと", () => {
    // Arrange: カテゴリ未設定 (既存YAML想定) のグループとアイテム
    state.modelMode = "anima";
    const legacyItem: PsmItem = { id: 1, name: "", content: "legacy tag", enabled: true, weight: 1.0, is_group: false };
    const nodes: PsmItem[] = [
      legacyItem,
      grp("未設定グループ", undefined, "another"),
      grp("品質", "quality", "masterpiece"),
    ];

    // Act
    const result = getCompiledPrompts(nodes, ", ", true);

    // Assert: qualityのみ先頭へ、未指定同士は相対順維持
    expect(result).toBe("masterpiece, legacy tag, another");
  });

  it("8.6 buildAnimaTemplate: 推奨タグとカテゴリを持つ雛形が生成され、IDが一意であること", () => {
    // Act
    const template = buildAnimaTemplate();

    // Assert: 構造
    expect(template.positive.map((g) => g.category)).toEqual(
      ["quality", "quality", "subject", "character", "series", "artist", "general"]
    );
    const qualityContents = template.positive[0].children!.map((c) => c.content);
    expect(qualityContents).toEqual(["masterpiece", "best quality", "score_7", "safe"]);
    expect(template.negative[0].children!.map((c) => c.content)).toContain("artist name");

    // Assert: ID一意性 (同ミリ秒生成での衝突がないこと)
    const ids: number[] = [];
    const walk = (nodes: PsmItem[]) => nodes.forEach((n) => { ids.push(n.id); if (n.children) walk(n.children); });
    walk(template.positive); walk(template.negative);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("8.7 createYamlFile: テンプレート指定時に model_mode: anima と雛形が送信されること", async () => {
    // Arrange
    const mockResponse = { ok: true, json: async () => ({ status: "success", files: [] }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await createYamlFile("anima_new", true);

    // Assert
    const call = vi.mocked(fetch).mock.calls.find(c => c[0] === "/psm/save-prompts");
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.model_mode).toBe("anima");
    expect(JSON.stringify(body.positive)).toContain("score_7");
    expect(state.selectedFile).toBe("anima_new.yaml");
  });
});

// -------------------------------------------------------------------------
// 7. 翻訳機能 (Phase 2.5) のテスト
// -------------------------------------------------------------------------
import {
  loadTranslateSettings,
  saveTranslateSettings,
  translateText,
  defaultTranslateSettings
} from "../src/store";

describe("翻訳機能 (Phase 2.5)", () => {
  it("7.1 loadTranslateSettings: 保存データがない場合、既定値 (ローカル/Ollama) で初期化されること", () => {
    // Arrange
    mockLocalStorage.getItem.mockReturnValueOnce(null);

    // Act
    loadTranslateSettings();

    // Assert
    expect(state.translateSettings).not.toBeNull();
    expect(state.translateSettings!.active).toBe("local");
    expect(state.translateSettings!.local.endpoint).toBe("http://localhost:11434/v1");
    expect(state.translateSettings!.cloud.provider).toBe("openai");
  });

  it("7.2 loadTranslateSettings: 保存データの欠損キーが既定値で補完されること", () => {
    // Arrange: endpoint のみ保存されている部分データ (旧バージョン形式を想定)
    mockLocalStorage.getItem.mockReturnValueOnce(JSON.stringify({
      active: "cloud",
      cloud: { endpoint: "https://openrouter.ai/api/v1", api_key: "sk-x" },
    }));

    // Act
    loadTranslateSettings();

    // Assert: 指定分は反映され、欠損分 (timeout_sec等) は既定値で補完される
    expect(state.translateSettings!.active).toBe("cloud");
    expect(state.translateSettings!.cloud.endpoint).toBe("https://openrouter.ai/api/v1");
    expect(state.translateSettings!.cloud.api_key).toBe("sk-x");
    expect(state.translateSettings!.cloud.timeout_sec).toBe(30);
    expect(state.translateSettings!.local.endpoint).toBe("http://localhost:11434/v1");
  });

  it("7.3 saveTranslateSettings: psm_settings とは別キー (psm_translate_settings) に保存されること", () => {
    // Arrange
    state.translateSettings = defaultTranslateSettings();
    state.translateSettings.local.api_key = "local-key";

    // Act
    saveTranslateSettings();

    // Assert
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "psm_translate_settings",
      expect.stringContaining('"local-key"')
    );
    // 通常設定のキーに書き込まれていないこと
    expect(mockLocalStorage.setItem).not.toHaveBeenCalledWith(
      "psm_settings",
      expect.anything()
    );
  });

  it("7.4 translateText: アクティブプロファイルの設定を同送し、翻訳結果を返すこと", async () => {
    // Arrange
    state.translateSettings = defaultTranslateSettings();
    state.translateSettings.active = "local";
    const mockResponse = { ok: true, json: async () => ({ status: "success", text: "A cat." }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    const result = await translateText("猫");

    // Assert
    expect(result).toBe("A cat.");
    expect(fetch).toHaveBeenCalledWith("/psm/translate", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ text: "猫", config: state.translateSettings.local }),
    }));
    expect(state.isTranslating).toBe(false); // 完了後にフラグが戻ること
  });

  it("7.5 translateText: エラー応答時にメッセージ付きで例外を投げ、フラグが戻ること", async () => {
    // Arrange
    state.translateSettings = defaultTranslateSettings();
    const mockResponse = { ok: true, json: async () => ({ status: "error", message: "接続できません" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act & Assert
    await expect(translateText("猫")).rejects.toThrow("接続できません");
    expect(state.isTranslating).toBe(false);
  });
});

describe("非同期処理中のローディングインジケーター表示機能", () => {
  beforeEach(() => {
    state.isLoading = false;
    state.loadingText = "";
    state.loadingCount = 0;
  });

  it("6.1 startLoading & stopLoading: カウンタに応じて isLoading と loadingText が正しく同期・制御されること", () => {
    // 最初の読み込み開始
    startLoading("loading");
    expect(state.isLoading).toBe(true);
    expect(state.loadingText).toBe("loading");
    expect(state.loadingCount).toBe(1);

    // 重複した保存開始
    startLoading("saving");
    expect(state.isLoading).toBe(true);
    // 最初のテキストが優先される
    expect(state.loadingText).toBe("loading");
    expect(state.loadingCount).toBe(2);

    // 1つ目の処理が終了
    stopLoading();
    expect(state.isLoading).toBe(true);
    expect(state.loadingCount).toBe(1);

    // 全ての処理が終了
    stopLoading();
    expect(state.isLoading).toBe(false);
    expect(state.loadingText).toBe("");
    expect(state.loadingCount).toBe(0);
  });

  it("6.2 loadPrompts / savePrompts: 非同期処理実行中に isLoading が true になり、終了時に false に戻ること", async () => {
    state.selectedFile = "load_loading_test.yaml";
    
    // loadPromptsのモック
    const mockResponse = {
      ok: true,
      json: async () => {
        // レスポンス取得中に isLoading が true になっているかアサート
        expect(state.isLoading).toBe(true);
        expect(state.loadingText).toBe("loading");
        return { positive: [], negative: [], profiles: [] };
      }
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    await loadPrompts();

    // 処理完了後は false に戻る
    expect(state.isLoading).toBe(false);
    expect(state.loadingText).toBe("");
  });
});





