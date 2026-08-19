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
// 12. PNG Info (infotext) 取込のテスト
// -------------------------------------------------------------------------
import {
  parseInfotext,
  parsePromptToItems,
  importInfotext,
  groupItemsByCategory,
  translateTagNames,
  applyTranslatedNames,
} from "../src/store";

const SAMPLE_INFOTEXT = `masterpiece, best quality, 1girl, (smile:1.2), <lora:my_style_v2:0.8>
Negative prompt: worst quality, low quality, bad anatomy
Steps: 30, Sampler: Euler a, Schedule type: Automatic, CFG scale: 4.5, Seed: 1234567890, Size: 896x1152, Model hash: abc123, Model: anima-preview3`;

describe("parseInfotext - PNG Info の解析", () => {
  it("12.1 Positive / Negative / パラメータを正しく分離すること", () => {
    // Act
    const p = parseInfotext(SAMPLE_INFOTEXT);

    // Assert
    expect(p.positive).toBe("masterpiece, best quality, 1girl, (smile:1.2), <lora:my_style_v2:0.8>");
    expect(p.negative).toBe("worst quality, low quality, bad anatomy");
    expect(p.params["Steps"]).toBe("30");
    expect(p.params["Sampler"]).toBe("Euler a");
    expect(p.params["CFG scale"]).toBe("4.5");
    expect(p.params["Size"]).toBe("896x1152");
    expect(p.params["Model"]).toBe("anima-preview3");
  });

  it("12.2 Negative prompt が無い場合も解析できること", () => {
    const p = parseInfotext("1girl, solo\nSteps: 20, Sampler: Euler");
    expect(p.positive).toBe("1girl, solo");
    expect(p.negative).toBe("");
    expect(p.params["Steps"]).toBe("20");
  });

  it("12.3 パラメータ行が無い (プロンプトのみ) 場合も解析できること", () => {
    const p = parseInfotext("1girl, solo");
    expect(p.positive).toBe("1girl, solo");
    expect(p.negative).toBe("");
    expect(p.params).toEqual({});
  });

  it("12.4 複数行のプロンプトを保持すること", () => {
    const p = parseInfotext("line one, tag\nline two, tag2\nNegative prompt: neg1,\nneg2\nSteps: 20");
    expect(p.positive).toBe("line one, tag\nline two, tag2");
    expect(p.negative).toBe("neg1,\nneg2");
  });

  it("12.5 空文字を安全に扱えること", () => {
    expect(parseInfotext("")).toEqual({ positive: "", negative: "", params: {} });
    expect(parseInfotext("   ")).toEqual({ positive: "", negative: "", params: {} });
  });
});

describe("parsePromptToItems - プロンプト文字列のツリー化", () => {
  it("12.6 カンマ区切りでアイテム化し、明示的な重みを weight に反映すること", () => {
    // Act
    const items = parsePromptToItems("masterpiece, (smile:1.2), (bad:0.8)");

    // Assert
    expect(items.map((i) => i.content)).toEqual(["masterpiece", "smile", "bad"]);
    expect(items.map((i) => i.weight)).toEqual([1.0, 1.2, 0.8]);
  });

  it("12.7 括弧の重ねがけを 1.1^n で概算すること", () => {
    const items = parsePromptToItems("((detailed)), [dark]");
    expect(items[0].content).toBe("detailed");
    expect(items[0].weight).toBeCloseTo(1.21, 2);
    expect(items[1].content).toBe("dark");
    expect(items[1].weight).toBeCloseTo(0.91, 2);
  });

  it("12.8 エスケープされた括弧を復元すること (出力時に再エスケープされるため)", () => {
    const items = parsePromptToItems("smile \\(showing teeth\\)");
    expect(items[0].content).toBe("smile (showing teeth)");
  });

  it("12.9 LoRA構文・ワイルドカード・BREAK をそのまま保持すること", () => {
    const items = parsePromptToItems("<lora:my_style_v2:0.8>, __character__, BREAK, 1girl");
    expect(items.map((i) => i.content)).toEqual([
      "<lora:my_style_v2:0.8>", "__character__", "BREAK", "1girl",
    ]);
    // 重みは変更されないこと
    expect(items.every((i) => i.weight === 1.0)).toBe(true);
  });

  it("12.10 長文・句点で終わる文は自然言語アイテムとして取り込むこと", () => {
    const items = parsePromptToItems("1girl, An anime girl with long hair is standing.");
    expect(items[0].isNatural).toBeUndefined();
    expect(items[1].isNatural).toBe(true);
  });

  it("12.11 IDが一意であること", () => {
    const items = parsePromptToItems(Array.from({ length: 50 }, (_, i) => `tag${i}`).join(", "));
    expect(new Set(items.map((i) => i.id)).size).toBe(50);
  });
});

describe("translateTagNames / applyTranslatedNames - タグ名の日本語化", () => {
  it("12.16 番号付きリストで一括翻訳し、元の配列順に対応付けること", async () => {
    // Arrange
    state.translateSettings = defaultTranslateSettings();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", text: "1. 女の子1人\n2. ロングヘア\n3. 笑顔" }),
    } as Response);

    // Act
    const names = await translateTagNames(["1girl", "long hair", "smile"]);

    // Assert
    expect(names).toEqual(["女の子1人", "ロングヘア", "笑顔"]);
    // 英語→日本語用のシステムプロンプトと target_lang が送られること
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.config.target_lang).toBe("JA");
    expect(body.config.system_prompt).toContain("Japanese");
    expect(body.text).toBe("1. 1girl\n2. long hair\n3. smile");
    expect(state.isTranslating).toBe(false);
  });

  it("12.17 番号が欠落・ズレた行は無視し、対応が取れた分のみ返すこと", async () => {
    // Arrange: 2番の行が欠落し、余計な説明行が混入したケース
    state.translateSettings = defaultTranslateSettings();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", text: "Here you go:\n1. 女の子1人\n3. 笑顔" }),
    } as Response);

    // Act
    const names = await translateTagNames(["1girl", "long hair", "smile"]);

    // Assert
    expect(names).toEqual(["女の子1人", "", "笑顔"]);
  });

  it("12.18 20件を超える場合は複数リクエストに分割すること", async () => {
    // Arrange
    state.translateSettings = defaultTranslateSettings();
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const lines = body.text.split("\n").map((l: string) => {
        const n = l.match(/^(\d+)\./)![1];
        return `${n}. 訳${n}`;
      });
      return { ok: true, json: async () => ({ status: "success", text: lines.join("\n") }) } as Response;
    });

    // Act
    const tags = Array.from({ length: 45 }, (_, i) => `tag${i}`);
    const names = await translateTagNames(tags);

    // Assert: 20+20+5 = 3リクエスト
    expect(vi.mocked(fetch).mock.calls.length).toBe(3);
    expect(names.length).toBe(45);
    expect(names.every((n) => n.startsWith("訳"))).toBe(true);
  });

  it("12.19 applyTranslatedNames: 名前が空のタグアイテムのみ更新し、特殊構文・自然言語・既存名はスキップすること", async () => {
    // Arrange
    state.translateSettings = defaultTranslateSettings();
    const items: PsmItem[] = [
      { id: 1, name: "", content: "1girl", enabled: true, weight: 1, is_group: false },
      { id: 2, name: "既存名", content: "smile", enabled: true, weight: 1, is_group: false },
      { id: 3, name: "", content: "<lora:foo:0.8>", enabled: true, weight: 1, is_group: false },
      { id: 4, name: "", content: "A girl stands.", enabled: true, weight: 1, is_group: false, isNatural: true },
      {
        id: 5, name: "グループ", content: "", enabled: true, weight: 1, is_group: true,
        children: [{ id: 6, name: "", content: "long hair", enabled: true, weight: 1, is_group: false }],
      },
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", text: "1. 女の子1人\n2. ロングヘア" }),
    } as Response);

    // Act
    const applied = await applyTranslatedNames(items);

    // Assert: 対象は 1girl と (グループ配下の) long hair のみ
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toBe("1. 1girl\n2. long hair");
    expect(applied).toBe(2);
    expect(items[0].name).toBe("女の子1人");
    expect(items[1].name).toBe("既存名");          // 既存名は保持
    expect(items[2].name).toBe("");                // LoRAはスキップ
    expect(items[3].name).toBe("");                // 自然言語はスキップ
    expect(items[4].children![0].name).toBe("ロングヘア");
  });

  it("12.21 importInfotext: 実行中はローディングオーバーレイが表示され、完了後に解除されること", async () => {
    // Arrange
    state.selectedFile = "target.yaml";
    state.translateSettings = defaultTranslateSettings();
    state.isLoading = false;
    state.loadingCount = 0;
    const seen: { isLoading: boolean; text: string }[] = [];
    vi.mocked(fetch).mockImplementation(async (url) => {
      // 非同期処理の実行中の状態を記録する
      seen.push({ isLoading: state.isLoading, text: state.loadingText });
      if (String(url) === "/psm/translate") {
        return { ok: true, json: async () => ({ status: "success", text: "1. 女の子1人\n2. ソロ" }) } as Response;
      }
      return { ok: true, json: async () => ({ status: "success" }) } as Response;
    });

    // Act
    await importInfotext("1girl, solo", { translateNames: true });

    // Assert: 処理中は isLoading=true かつ翻訳中のテキスト、完了後は解除
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.isLoading)).toBe(true);
    expect(seen[0].text).toBe("translatingNames");
    expect(state.isLoading).toBe(false);
    expect(state.loadingCount).toBe(0);
  });

  it("12.22 bulkAssignCategories: 実行中もローディングが表示され、完了後に解除されること", async () => {
    // Arrange
    state.selectedFile = "bulk.yaml";
    state.isLoading = false;
    state.loadingCount = 0;
    state.positive = [{
      id: 1, name: "g", content: "", enabled: true, weight: 1, is_group: true,
      children: [{ id: 2, name: "", content: "1girl", enabled: true, weight: 1, is_group: false }],
    }];
    state.negative = [];
    let seenText = "";
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (!seenText) seenText = state.loadingText;
      if (String(url) === "/psm/tag-categories") {
        return { ok: true, json: async () => ({ status: "success", categories: { "1girl": "subject" } }) } as Response;
      }
      return { ok: true, json: async () => ({ status: "success" }) } as Response;
    });

    // Act
    await bulkAssignCategories();

    // Assert
    expect(seenText).toBe("detectingCategories");
    expect(state.isLoading).toBe(false);
    expect(state.loadingCount).toBe(0);
  });

  it("12.20 importInfotext: translateNames指定時に名前が設定され、失敗しても取込は継続すること", async () => {
    // Arrange: 翻訳はエラー、保存は成功
    state.selectedFile = "target.yaml";
    state.translateSettings = defaultTranslateSettings();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url) === "/psm/translate") {
        return { ok: true, json: async () => ({ status: "error", message: "接続できません" }) } as Response;
      }
      return { ok: true, json: async () => ({ status: "success" }) } as Response;
    });

    // Act
    const r = await importInfotext("1girl, solo", { translateNames: true });

    // Assert: 名前は空だが取込は完了する
    expect(r.posCount).toBe(2);
    expect(r.translated).toBe(0);
    expect(state.positive.map((i) => i.content)).toEqual(["1girl", "solo"]);
  });
});

describe("importInfotext - 取込の適用", () => {
  it("12.12 現在のツリーへ上書きし、保存されること", async () => {
    // Arrange
    state.selectedFile = "target.yaml";
    state.positive = [];
    state.negative = [];
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) } as Response);

    // Act
    const r = await importInfotext(SAMPLE_INFOTEXT);

    // Assert
    expect(r.posCount).toBe(5);
    expect(r.negCount).toBe(3);
    expect(state.positive.map((i) => i.content)).toContain("masterpiece");
    expect(state.negative.map((i) => i.content)).toContain("bad anatomy");
    expect(r.params["Sampler"]).toBe("Euler a");
    expect(fetch).toHaveBeenCalledWith("/psm/save-prompts", expect.any(Object));
  });

  it("12.13 カテゴリ別グループ化を指定するとカテゴリ順のグループが生成されること", async () => {
    // Arrange
    state.selectedFile = "target.yaml";
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url) === "/psm/tag-categories") {
        return {
          ok: true,
          json: async () => ({
            status: "success",
            categories: { "masterpiece": "quality", "1girl": "subject", "smile": "general" },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ status: "success" }) } as Response;
    });

    // Act
    await importInfotext("masterpiece, 1girl, smile", { groupByCategory: true });

    // Assert: quality → subject → general の順にグループ化される
    expect(state.positive.every((g) => g.is_group)).toBe(true);
    expect(state.positive.map((g) => g.category)).toEqual(["quality", "subject", "general"]);
    expect(state.positive[0].children!.map((c) => c.content)).toEqual(["masterpiece"]);
  });

  it("12.23 subdivideGeneral指定時、一般グループがサブ分類の入れ子グループへ細分化されること", async () => {
    // Arrange: 一般タグを8件以上 (しきい値) 用意する
    state.selectedFile = "target.yaml";
    const generalTags = ["long hair", "blue eyes", "smile", "school uniform", "thighhighs", "sitting", "outdoors", "flower"];
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url) === "/psm/tag-categories") {
        return {
          ok: true,
          json: async () => ({
            status: "success",
            categories: Object.fromEntries(generalTags.map((t) => [t, "general"])),
            subcategories: {
              "long hair": "hair", "blue eyes": "face", "smile": "face",
              "school uniform": "clothing", "thighhighs": "clothing",
              "sitting": "pose", "outdoors": "background", "flower": "object",
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ status: "success" }) } as Response;
    });

    // Act
    await importInfotext(generalTags.join(", "), { groupByCategory: true, subdivideGeneral: true });

    // Assert: 一般グループ配下がサブグループ (顔・髪・服装・ポーズ・小物・背景) になる
    expect(state.positive.length).toBe(1);
    const general = state.positive[0];
    expect(general.category).toBe("general");
    expect(general.children!.every((c) => c.is_group)).toBe(true);
    // SUBCAT_ORDER の順序で並ぶこと (face → hair → clothing → pose → object → background)
    expect(general.children!.map((c) => c.name)).toEqual([
      "顔・表情", "髪", "服装", "ポーズ・動作", "小物・シンボル", "背景・場所",
    ]);
    expect(general.children![0].children!.map((c) => c.content)).toEqual(["blue eyes", "smile"]);
  });

  it("12.24 一般タグがしきい値未満の場合は細分化しないこと", async () => {
    // Arrange: 3件のみ
    state.selectedFile = "target.yaml";
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url) === "/psm/tag-categories") {
        return {
          ok: true,
          json: async () => ({
            status: "success",
            categories: { "long hair": "general", "smile": "general", "sitting": "general" },
            subcategories: { "long hair": "hair", "smile": "face", "sitting": "pose" },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ status: "success" }) } as Response;
    });

    // Act
    await importInfotext("long hair, smile, sitting", { groupByCategory: true, subdivideGeneral: true });

    // Assert: フラットなアイテムのまま
    expect(state.positive[0].children!.every((c) => !c.is_group)).toBe(true);
  });

  it("12.25 サブ分類が実質できない場合 (ほぼ未分類) は細分化しないこと", async () => {
    // Arrange: 8件すべてサブ分類なし
    state.selectedFile = "target.yaml";
    const tags = Array.from({ length: 8 }, (_, i) => `tag${i}`);
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url) === "/psm/tag-categories") {
        return {
          ok: true,
          json: async () => ({
            status: "success",
            categories: Object.fromEntries(tags.map((t) => [t, "general"])),
            subcategories: Object.fromEntries(tags.map((t) => [t, null])),
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ status: "success" }) } as Response;
    });

    // Act
    await importInfotext(tags.join(", "), { groupByCategory: true, subdivideGeneral: true });

    // Assert: 「その他」1つだけのグループを作らず、フラットのまま
    expect(state.positive[0].children!.every((c) => !c.is_group)).toBe(true);
  });

  it("12.14 タグDBが使えない場合はフラットな構成で取り込むこと (フォールバック)", async () => {
    // Arrange
    state.selectedFile = "target.yaml";
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      if (String(url) === "/psm/tag-categories") {
        return { ok: true, json: async () => ({ status: "error", message: "タグDBが見つかりません。" }) } as Response;
      }
      return { ok: true, json: async () => ({ status: "success" }) } as Response;
    });

    // Act
    await importInfotext("masterpiece, 1girl", { groupByCategory: true });

    // Assert: グループ化されず、フラットなアイテムとして取り込まれる
    expect(state.positive.every((i) => !i.is_group)).toBe(true);
    expect(state.positive.map((i) => i.content)).toEqual(["masterpiece", "1girl"]);
  });

  it("12.15 ファイル名指定時は新規ファイルとして保存されること", async () => {
    // Arrange
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "success", files: [] }) } as Response);

    // Act
    await importInfotext("1girl, solo", { fileName: "from_png" });

    // Assert
    const call = vi.mocked(fetch).mock.calls.find((c) => c[0] === "/psm/save-prompts");
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body.file).toBe("from_png.yaml");
    expect(JSON.stringify(body.positive)).toContain("1girl");
    expect(state.selectedFile).toBe("from_png.yaml");
  });
});

// -------------------------------------------------------------------------
// 15. ドラッグ&ドロップ (クローン方式) のテスト
// -------------------------------------------------------------------------
import { beginDrag, endDrag, finalizeCrossListMove } from "../src/store";

describe("ドラッグ&ドロップ (クローン方式)", () => {
  const leaf = (id: number, name: string): PsmItem => ({
    id, name, content: "tag", enabled: true, weight: 1, is_group: false,
  });
  const grp = (id: number, name: string, children: PsmItem[] = []): PsmItem => ({
    id, name, content: "", enabled: true, weight: 1, is_group: true, children,
  });

  beforeEach(() => {
    endDrag();
  });

  it("15.1 beginDrag: 対象アイテムと移動元リストを記録すること", () => {
    const list = [leaf(1, "a"), leaf(2, "b")];
    beginDrag(list, 1);
    expect(state.isDragging).toBe(true);
    expect(state.draggedItem).toBe(list[1]);
    expect(state.draggedFromList).toBe(list);
  });

  it("15.2 endDrag: 状態がすべてリセットされること", () => {
    beginDrag([leaf(1, "a")], 0);
    state.dropTargetId = 99;
    endDrag();
    expect(state.isDragging).toBe(false);
    expect(state.draggedItem).toBeNull();
    expect(state.draggedFromList).toBeNull();
    expect(state.dropTargetId).toBeNull();
  });

  it("15.3 finalizeCrossListMove: 別リストへのドロップ後、移動元から削除されること", () => {
    // Arrange: クローン方式のため、ドロップ先には既に同じアイテムが追加されている状態
    const item = leaf(1, "移動対象");
    const src = [item, leaf(2, "残る")];
    const dest = [leaf(3, "既存"), item];
    beginDrag(src, 0);

    // Act
    const moved = finalizeCrossListMove(dest);

    // Assert: 移動元から消え、ドロップ先には残る (二重登録にならない)
    expect(moved).toBe(true);
    expect(src.map((i) => i.id)).toEqual([2]);
    expect(dest.map((i) => i.id)).toEqual([3, 1]);
  });

  it("15.4 finalizeCrossListMove: 同一リスト内の並べ替えでは何もしないこと", () => {
    // Arrange: SortableJSが順序を更新済みのケース
    const list = [leaf(2, "b"), leaf(1, "a")];
    beginDrag(list, 1);

    // Act
    const moved = finalizeCrossListMove(list);

    // Assert
    expect(moved).toBe(false);
    expect(list.map((i) => i.id)).toEqual([2, 1]);
  });

  it("15.5 finalizeCrossListMove: 自身の配下への移動は取り消されること (循環参照防止)", () => {
    // Arrange: グループを自分の子リストへドロップしようとしたケース
    const inner = grp(20, "子");
    const dragged = grp(10, "親", [inner]);
    const src = [dragged];
    beginDrag(src, 0);
    // ドロップ先(自身の子リスト)へ既に追加された状態を再現
    dragged.children!.push(dragged);

    // Act
    const moved = finalizeCrossListMove(dragged.children!);

    // Assert: 追加が取り消され、移動元も変化しない
    expect(moved).toBe(false);
    expect(dragged.children!.map((c) => c.id)).toEqual([20]);
    expect(src.map((i) => i.id)).toEqual([10]);
  });

  it("15.6 finalizeCrossListMove: 孫の階層への移動も循環参照として取り消されること", () => {
    // Arrange
    const grandChild = grp(30, "孫");
    const child = grp(20, "子", [grandChild]);
    const dragged = grp(10, "親", [child]);
    beginDrag([dragged], 0);
    grandChild.children!.push(dragged);

    // Act
    const moved = finalizeCrossListMove(grandChild.children!);

    // Assert
    expect(moved).toBe(false);
    expect(grandChild.children!.length).toBe(0);
  });

  it("15.7 finalizeCrossListMove: 移動元に見つからない場合は二重登録を避けて取り消すこと", () => {
    // Arrange: 想定外の状態 (移動元に該当アイテムがない)
    const item = leaf(1, "対象");
    const src = [leaf(2, "別")];
    const dest = [item];
    beginDrag(src, 0);
    state.draggedItem = item; // 移動元に存在しないアイテムを対象にする

    // Act
    const moved = finalizeCrossListMove(dest);

    // Assert: ドロップ先からも取り除かれ、重複が発生しない
    expect(moved).toBe(false);
    expect(dest.length).toBe(0);
  });

  it("15.8 finalizeCrossListMove: ドラッグ情報がない場合は何もしないこと", () => {
    endDrag();
    const dest = [leaf(1, "a")];
    expect(finalizeCrossListMove(dest)).toBe(false);
    expect(dest.length).toBe(1);
  });
});

// -------------------------------------------------------------------------
// 14. 移動先クイック選択のテスト
// -------------------------------------------------------------------------
import {
  collectMoveTargets,
  pushRecentMoveTarget,
  openMoveDialog,
  closeMoveDialog,
  executeMoveTo,
  MoveTarget,
} from "../src/store";

describe("移動先クイック選択", () => {
  const labels = { positive: "Positive", negative: "Negative" };
  const leaf = (name: string): PsmItem => ({
    id: Math.random() * 1e9 | 0, name, content: "tag", enabled: true, weight: 1, is_group: false,
  });
  const grp = (id: number, name: string, children: PsmItem[] = []): PsmItem => ({
    id, name, content: "", enabled: true, weight: 1, is_group: true, children,
  });

  beforeEach(() => {
    state.recentMoveTargets = [];
    state.isMoveDialogOpen = false;
    state.moveDialogItem = null;
  });

  it("14.1 collectMoveTargets: ルート2件とすべてのグループを収集し、親パスを付与すること", () => {
    // Arrange
    const child = grp(20, "子グループ");
    state.positive = [grp(10, "親グループ", [child])];
    state.negative = [grp(30, "ネガ用")];
    const item = leaf("移動対象");

    // Act
    const targets = collectMoveTargets(item, labels);

    // Assert
    expect(targets.map((t) => t.path)).toEqual([
      "Positive",
      "Negative",
      "Positive > 親グループ",
      "Positive > 親グループ > 子グループ",
      "Negative > ネガ用",
    ]);
    // 移動先リストは実際の配列参照であること
    expect(targets[2].list).toBe(state.positive[0].children);
  });

  it("14.2 collectMoveTargets: 自分自身は候補から除外されること (循環参照防止)", () => {
    // Arrange: 自分自身がグループのケース
    const self = grp(10, "自分自身", [grp(20, "自分の子")]);
    state.positive = [self, grp(30, "別グループ")];
    state.negative = [];

    // Act
    const targets = collectMoveTargets(self, labels);

    // Assert: 自分自身は含まれない
    expect(targets.find((t) => t.id === 10)).toBeUndefined();
    expect(targets.find((t) => t.id === 30)).toBeDefined();
  });

  it("14.3 collectMoveTargets: 名前が空のグループは (No Name) と表示すること", () => {
    state.positive = [grp(10, "")];
    state.negative = [];
    const targets = collectMoveTargets(leaf("x"), labels);
    expect(targets[2].name).toBe("(No Name)");
  });

  it("14.4 pushRecentMoveTarget: 先頭へ追加され、重複は繰り上げ、5件で打ち切られること", () => {
    // Arrange
    const mk = (id: number): MoveTarget => ({ id, name: `g${id}`, path: `P > g${id}`, list: [], level: 0 });
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    // Act: 6件追加
    for (let i = 1; i <= 6; i++) pushRecentMoveTarget(mk(i));

    // Assert: 最新が先頭、5件で打ち切り
    expect(state.recentMoveTargets.map((r) => r.id)).toEqual([6, 5, 4, 3, 2]);

    // Act: 既存を再追加すると先頭へ繰り上がる
    pushRecentMoveTarget(mk(3));
    expect(state.recentMoveTargets.map((r) => r.id)).toEqual([3, 6, 5, 4, 2]);
    // localStorageへ保存されること
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "psm_settings",
      expect.stringContaining("recent_move_targets")
    );
  });

  it("14.5 openMoveDialog / closeMoveDialog: 状態が正しく切り替わること", () => {
    const item = leaf("対象");
    openMoveDialog(item);
    expect(state.isMoveDialogOpen).toBe(true);
    expect(state.moveDialogItem).toBe(item);

    closeMoveDialog();
    expect(state.isMoveDialogOpen).toBe(false);
    expect(state.moveDialogItem).toBeNull();
  });

  it("14.6 executeMoveTo: 移動を実行し、最近使った移動先へ記録してダイアログを閉じること", async () => {
    // Arrange
    state.selectedFile = "f.yaml";
    const item = leaf("移動対象");
    const dest = grp(10, "移動先");
    state.positive = [item, dest];
    state.negative = [];
    openMoveDialog(item);
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) } as Response);

    const target: MoveTarget = { id: 10, name: "移動先", path: "Positive > 移動先", list: dest.children!, level: 0 };

    // Act
    await executeMoveTo(target);

    // Assert
    expect(dest.children!.map((c) => c.name)).toEqual(["移動対象"]);
    expect(state.positive.includes(item)).toBe(false); // 元の位置から除去
    expect(state.recentMoveTargets[0].id).toBe(10);
    expect(state.isMoveDialogOpen).toBe(false);
    expect(fetch).toHaveBeenCalledWith("/psm/save-prompts", expect.any(Object));
  });

  it("14.7 executeMoveTo: 対象アイテムが無い場合は何もしないこと", async () => {
    closeMoveDialog();
    await executeMoveTo({ id: 1, name: "x", path: "x", list: [], level: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("14.8 loadSettingsLocal: 最近使った移動先が復元されること", () => {
    // Arrange
    mockLocalStorage.getItem.mockReturnValueOnce(JSON.stringify({
      recent_move_targets: [{ id: 7, path: "Positive > 服装" }],
    }));

    // Act
    loadSettingsLocal();

    // Assert
    expect(state.recentMoveTargets).toEqual([{ id: 7, path: "Positive > 服装" }]);
  });
});

// -------------------------------------------------------------------------
// 13. サブ分類の任意実行とAI分類のテスト
// -------------------------------------------------------------------------
import {
  subdivideGroup,
  classifyTagsWithAI,
  resolveSubcategories,
  canUseAiClassify,
} from "../src/store";

describe("サブ分類の任意実行とAI分類", () => {
  const leaf = (content: string): PsmItem => ({
    id: Math.random() * 1e9 | 0, name: "", content, enabled: true, weight: 1, is_group: false,
  });

  /** ルールベースAPIの応答を返すモック */
  const mockRuleApi = (subcategories: Record<string, string | null>) => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url) === "/psm/tag-categories") {
        return { ok: true, json: async () => ({ status: "success", categories: {}, subcategories }) } as Response;
      }
      return { ok: true, json: async () => ({ status: "success" }) } as Response;
    });
  };

  it("13.1 subdivideGroup: グループ直下の葉アイテムをサブグループへ再編成すること", async () => {
    // Arrange
    state.selectedFile = "f.yaml";
    const group: PsmItem = {
      id: 1, name: "既存グループ", content: "", enabled: true, weight: 1, is_group: true,
      children: ["long hair", "blue eyes", "smile", "school uniform", "thighhighs", "sitting", "outdoors", "flower"].map(leaf),
    };
    mockRuleApi({
      "long hair": "hair", "blue eyes": "face", "smile": "face",
      "school uniform": "clothing", "thighhighs": "clothing",
      "sitting": "pose", "outdoors": "background", "flower": "object",
    });

    // Act
    const created = await subdivideGroup(group);

    // Assert
    expect(created).toBe(6);
    expect(group.children!.every((c) => c.is_group)).toBe(true);
    expect(group.children!.map((c) => c.name)).toEqual([
      "顔・表情", "髪", "服装", "ポーズ・動作", "小物・シンボル", "背景・場所",
    ]);
    expect(fetch).toHaveBeenCalledWith("/psm/save-prompts", expect.any(Object));
  });

  it("13.2 subdivideGroup: 既存のサブグループは位置を保って残ること", async () => {
    // Arrange: 先頭に既存グループ、その後に葉アイテム8件
    state.selectedFile = "f.yaml";
    const existing: PsmItem = {
      id: 99, name: "既存サブ", content: "", enabled: true, weight: 1, is_group: true, children: [leaf("keep")],
    };
    const group: PsmItem = {
      id: 1, name: "親", content: "", enabled: true, weight: 1, is_group: true,
      children: [existing, ...["long hair", "blue eyes", "smile", "school uniform", "thighhighs", "sitting", "outdoors", "flower"].map(leaf)],
    };
    mockRuleApi({
      "long hair": "hair", "blue eyes": "face", "smile": "face",
      "school uniform": "clothing", "thighhighs": "clothing",
      "sitting": "pose", "outdoors": "background", "flower": "object",
    });

    // Act
    await subdivideGroup(group);

    // Assert: 既存グループが先頭のまま維持される
    expect(group.children![0]).toBe(existing);
    expect(group.children!.length).toBe(7); // 既存1 + サブグループ6
  });

  it("13.3 subdivideGroup: 対象が8件未満なら何もしないこと", async () => {
    // Arrange
    const group: PsmItem = {
      id: 1, name: "小グループ", content: "", enabled: true, weight: 1, is_group: true,
      children: ["long hair", "smile"].map(leaf),
    };
    const before = [...group.children!];

    // Act
    const created = await subdivideGroup(group);

    // Assert
    expect(created).toBe(0);
    expect(group.children).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("13.4 subdivideGroup: 自然言語・LoRA・BREAKは対象外で元の位置に残ること", async () => {
    // Arrange
    state.selectedFile = "f.yaml";
    const nl: PsmItem = { ...leaf("A girl stands."), isNatural: true };
    const lora = leaf("<lora:foo:0.8>");
    const group: PsmItem = {
      id: 1, name: "混在", content: "", enabled: true, weight: 1, is_group: true,
      children: [nl, lora, ...["long hair", "blue eyes", "smile", "school uniform", "thighhighs", "sitting", "outdoors", "flower"].map(leaf)],
    };
    mockRuleApi({
      "long hair": "hair", "blue eyes": "face", "smile": "face",
      "school uniform": "clothing", "thighhighs": "clothing",
      "sitting": "pose", "outdoors": "background", "flower": "object",
    });

    // Act
    await subdivideGroup(group);

    // Assert: 対象外アイテムは葉のまま残る (照会対象にも含まれない)
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.tags).not.toContain("<lora:foo:0.8>");
    expect(body.tags).not.toContain("A girl stands.");
    expect(group.children).toContain(nl);
    expect(group.children).toContain(lora);
  });

  it("13.5 classifyTagsWithAI: 番号付き応答をキーへ対応付け、不正なキーは無視すること", async () => {
    // Arrange
    state.translateSettings = defaultTranslateSettings();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", text: "1. hair\n2. INVALID_KEY\n3. other\n4. clothing" }),
    } as Response);

    // Act
    const r = await classifyTagsWithAI(["mystery tag a", "mystery tag b", "mystery tag c", "mystery tag d"]);

    // Assert: 不正キーは未設定、other は null (分類なし) として扱う
    expect(r["mystery tag a"]).toBe("hair");
    expect(r["mystery tag b"]).toBeUndefined();
    expect(r["mystery tag c"]).toBeNull();
    expect(r["mystery tag d"]).toBe("clothing");
    // 分類用のシステムプロンプトが使われること
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.config.system_prompt).toContain("classify");
  });

  it("13.6 resolveSubcategories: ルールで未分類のタグのみAIへ問い合わせること", async () => {
    // Arrange
    state.translateSettings = defaultTranslateSettings();
    const aiCalls: string[][] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (String(url) === "/psm/tag-categories") {
        return {
          ok: true,
          json: async () => ({
            status: "success", categories: {},
            subcategories: { "long hair": "hair", "mystery tag": null },
          }),
        } as Response;
      }
      // AI呼び出し
      aiCalls.push(body.text.split("\n"));
      return { ok: true, json: async () => ({ status: "success", text: "1. effect" }) } as Response;
    });

    // Act
    const r = await resolveSubcategories(["long hair", "mystery tag"], true);

    // Assert: AIへ渡されたのは未分類の1件のみ
    expect(aiCalls.length).toBe(1);
    expect(aiCalls[0]).toEqual(["1. mystery tag"]);
    expect(r["long hair"]).toBe("hair");      // ルールの結果を維持
    expect(r["mystery tag"]).toBe("effect");  // AIで補完
  });

  it("13.7 resolveSubcategories: AI失敗時はルールベースの結果のみ返すこと", async () => {
    // Arrange
    state.translateSettings = defaultTranslateSettings();
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url) === "/psm/tag-categories") {
        return {
          ok: true,
          json: async () => ({ status: "success", categories: {}, subcategories: { "long hair": "hair", "x": null } }),
        } as Response;
      }
      return { ok: true, json: async () => ({ status: "error", message: "接続できません" }) } as Response;
    });

    // Act
    const r = await resolveSubcategories(["long hair", "x"], true);

    // Assert
    expect(r["long hair"]).toBe("hair");
    expect(r["x"]).toBeNull();
  });

  it("13.8 canUseAiClassify: OpenAI互換のみ有効で、DeepLやモデル未設定では無効になること", () => {
    // Arrange & Assert: 既定 (ローカル/Ollama) は有効
    state.translateSettings = defaultTranslateSettings();
    expect(canUseAiClassify()).toBe(true);

    // モデル未設定は無効
    state.translateSettings.local.model = "";
    expect(canUseAiClassify()).toBe(false);

    // DeepLは翻訳専用のため無効
    state.translateSettings = defaultTranslateSettings();
    state.translateSettings.local.provider = "deepl";
    expect(canUseAiClassify()).toBe(false);
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
import { buildAnimaTemplate } from "../src/store";

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

// -------------------------------------------------------------------------
// 13. 生成設定プロファイル機能のテスト (Phase 6)
// -------------------------------------------------------------------------
import {
  loadGenerationProfiles,
  saveGenerationProfile,
  applyGenerationProfile,
  deleteGenerationProfile,
} from "../src/store";

describe("生成設定プロファイル機能 (Phase 6)", () => {
  beforeEach(() => {
    state.generationProfiles = [];
  });

  it("13.1 loadGenerationProfiles: サーバーから一覧を取得しstateへ反映すること", async () => {
    // Arrange
    const savedProfiles = [
      { name: "P1", fields: ["checkpoint"], settings: { checkpoint: "a.safetensors" }, updatedAt: "2026-08-01T00:00:00Z" },
    ];
    const mockResponse = { ok: true, json: async () => ({ profiles: savedProfiles }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await loadGenerationProfiles();

    // Assert
    expect(state.generationProfiles).toEqual(savedProfiles);
    expect(fetch).toHaveBeenCalledWith("/psm/generation-profiles");
  });

  it("13.2 saveGenerationProfile: 選択したフィールドのみを現在のWebUI状態から保存すること", async () => {
    // Arrange
    vi.stubGlobal("document", {
      getElementById: vi.fn().mockReturnValue({ offsetParent: null }), // txt2img と判定させる
      querySelector: vi.fn().mockImplementation((sel: string) => {
        if (sel === "#setting_sd_model_checkpoint input") return { value: "modelA.safetensors" };
        if (sel === "#txt2img_steps input") return { value: "25" };
        return null;
      }),
    });
    const mockResponse = { ok: true, json: async () => ({ status: "success" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    // Act
    await saveGenerationProfile("MyGenProfile", ["checkpoint", "steps"]);

    // Assert: 選択していない cfg_scale 等は含まれない
    expect(state.generationProfiles.length).toBe(1);
    expect(state.generationProfiles[0].name).toBe("MyGenProfile");
    expect(state.generationProfiles[0].fields).toEqual(["checkpoint", "steps"]);
    expect(state.generationProfiles[0].settings).toEqual({ checkpoint: "modelA.safetensors", steps: 25 });
    expect(fetch).toHaveBeenCalledWith("/psm/generation-profiles", expect.objectContaining({ method: "POST" }));
  });

  it("13.3 saveGenerationProfile: 同名プロファイルは新しい値で上書きされること", async () => {
    // Arrange
    state.generationProfiles = [
      { name: "MyGenProfile", fields: ["steps"], settings: { steps: 10 }, updatedAt: "2026-01-01T00:00:00Z" },
    ];
    vi.stubGlobal("document", {
      getElementById: vi.fn().mockReturnValue({ offsetParent: null }),
      querySelector: vi.fn().mockImplementation((sel: string) =>
        sel === "#txt2img_steps input" ? { value: "40" } : null
      ),
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) } as Response);

    // Act
    await saveGenerationProfile("MyGenProfile", ["steps"]);

    // Assert
    expect(state.generationProfiles.length).toBe(1);
    expect(state.generationProfiles[0].settings).toEqual({ steps: 40 });
  });

  it("13.4 applyGenerationProfile: 書き込みに成功した項目はappliedFields、要素が見つからず失敗した項目はskippedFieldsに分類されること", async () => {
    // Arrange: steps用のinput要素は存在するが、cfg_scale用は見つからない状況を再現
    const dispatchEvent = vi.fn();
    const stepsInput = { value: "", dispatchEvent };
    state.generationProfiles = [
      {
        name: "MixedProfile",
        fields: ["steps", "cfg_scale"],
        settings: { steps: 30, cfg_scale: 7 },
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];
    vi.stubGlobal("document", {
      getElementById: vi.fn().mockReturnValue({ offsetParent: null }), // txt2img
      querySelector: vi.fn().mockImplementation((sel: string) =>
        sel === "#txt2img_steps input" ? stepsInput : null
      ),
    });

    // Act
    const result = await applyGenerationProfile("MixedProfile");

    // Assert: steps は書き込み成功、cfg_scale は要素未検出のため失敗扱い
    expect(result.appliedFields).toEqual(["steps"]);
    expect(result.skippedFields).toEqual(["cfg_scale"]);
    expect(stepsInput.value).toBe("30");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("13.5 applyGenerationProfile: 存在しないプロファイル名の場合は空の結果を返すこと", async () => {
    // Act
    const result = await applyGenerationProfile("NoSuchProfile");

    // Assert
    expect(result).toEqual({ appliedFields: [], skippedFields: [] });
  });

  it("13.6 deleteGenerationProfile: 指定されたプロファイルを削除しサーバーへ反映すること", async () => {
    // Arrange
    state.generationProfiles = [
      { name: "A", fields: [], settings: {}, updatedAt: "2026-01-01T00:00:00Z" },
      { name: "B", fields: [], settings: {}, updatedAt: "2026-01-01T00:00:00Z" },
    ];
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) } as Response);

    // Act
    await deleteGenerationProfile("A");

    // Assert
    expect(state.generationProfiles.length).toBe(1);
    expect(state.generationProfiles.find((p) => p.name === "A")).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("/psm/generation-profiles", expect.objectContaining({ method: "POST" }));
  });
});

// -------------------------------------------------------------------------
// 14. グループロック機能のテスト (Phase 7)
// -------------------------------------------------------------------------
import {
  isItemLocked,
  isListLocked,
  toggleGroupLock,
  toggleGroupEnabled,
  deleteItemFromTree,
  duplicateItem,
  addItem,
} from "../src/store";

describe("グループロック機能 (Phase 7)", () => {
  // 親グループ(ロック対象) > 子グループ > 孫アイテム、という3階層のツリーを構築するヘルパー
  // state.positive へ格納した「後」の参照 (Vueのreactivityラップ後の実体) を返すことで、
  // store.ts内部の state.positive を辿る参照比較 (isListLockedの children === list など) と
  // オブジェクト参照が一致するようにする
  const buildLockedTree = (parentLocked: boolean) => {
    const grandChild: PsmItem = {
      id: 3, name: "grandchild", content: "tag", enabled: true, weight: 1.0, is_group: false,
    };
    const childGroup: PsmItem = {
      id: 2, name: "child", content: "", enabled: true, weight: 1.0, is_group: true, isOpen: true,
      children: [grandChild],
    };
    const parentGroup: PsmItem = {
      id: 1, name: "parent", content: "", enabled: true, weight: 1.0, is_group: true, isOpen: true,
      isLocked: parentLocked,
      children: [childGroup],
    };
    state.positive = [parentGroup];
    state.negative = [];
    const p = state.positive[0];
    const c = p.children![0];
    const g = c.children![0];
    return { parentGroup: p, childGroup: c, grandChild: g };
  };

  beforeEach(() => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) } as Response);
  });

  it("14.1 isItemLocked: 自身がロックされている場合はtrueを返すこと", () => {
    const { parentGroup } = buildLockedTree(true);
    expect(isItemLocked(parentGroup.id)).toBe(true);
  });

  it("14.2 isItemLocked: 祖先グループがロックされている場合、孫アイテムも継承してtrueを返すこと", () => {
    const { grandChild } = buildLockedTree(true);
    expect(isItemLocked(grandChild.id)).toBe(true);
  });

  it("14.3 isItemLocked: ロックされていない場合はfalseを返すこと", () => {
    const { grandChild, childGroup } = buildLockedTree(false);
    expect(isItemLocked(grandChild.id)).toBe(false);
    expect(isItemLocked(childGroup.id)).toBe(false);
  });

  it("14.4 isItemLocked: 存在しないIDの場合はfalseを返すこと", () => {
    buildLockedTree(false);
    expect(isItemLocked(999999)).toBe(false);
  });

  it("14.5 isListLocked: ロック中グループの children はtrueを返すこと", () => {
    const { parentGroup, childGroup } = buildLockedTree(true);
    expect(isListLocked(parentGroup.children!)).toBe(true);
    expect(isListLocked(childGroup.children!)).toBe(true); // 祖先ロックを継承
  });

  it("14.6 isListLocked: ルート配列 (state.positive/negative) は常にfalseを返すこと", () => {
    buildLockedTree(true);
    expect(isListLocked(state.positive)).toBe(false);
    expect(isListLocked(state.negative)).toBe(false);
  });

  it("14.7 toggleGroupLock: ロックされていないグループのisLockedをトグルできること", async () => {
    const { parentGroup } = buildLockedTree(false);
    await toggleGroupLock(parentGroup);
    expect(parentGroup.isLocked).toBe(true);
    await toggleGroupLock(parentGroup);
    expect(parentGroup.isLocked).toBe(false);
  });

  it("14.8 toggleGroupLock: 祖先ロック中は、配下グループ自身のロック状態を変更できないこと", async () => {
    const { parentGroup, childGroup } = buildLockedTree(true);
    await toggleGroupLock(childGroup, true);
    expect(childGroup.isLocked).toBeUndefined();
    expect(parentGroup.isLocked).toBe(true); // 親自体は変化しない
  });

  it("14.9 toggleGroupEnabled: ロック中のグループは有効/無効を切り替えられないこと", async () => {
    const { parentGroup } = buildLockedTree(true);
    const before = parentGroup.enabled;
    await toggleGroupEnabled(parentGroup);
    expect(parentGroup.enabled).toBe(before);
  });

  it("14.10 deleteItemFromTree: ロック中の孫アイテムは削除できないこと", async () => {
    const { childGroup, grandChild } = buildLockedTree(true);
    await deleteItemFromTree(grandChild, "all");
    expect(childGroup.children!.length).toBe(1);
    expect(childGroup.children![0].id).toBe(grandChild.id);
  });

  it("14.11 deleteItemFromTree: ロックされていなければ通常どおり削除できること", async () => {
    const { childGroup, grandChild } = buildLockedTree(false);
    await deleteItemFromTree(grandChild, "all");
    expect(childGroup.children!.length).toBe(0);
  });

  it("14.12 duplicateItem: ロック中の孫アイテムは複製できないこと", async () => {
    const { childGroup, grandChild } = buildLockedTree(true);
    await duplicateItem(grandChild, childGroup.children!);
    expect(childGroup.children!.length).toBe(1);
  });

  it("14.13 addItem: ロック中グループの children へは新規アイテムを追加できないこと", () => {
    const { parentGroup } = buildLockedTree(true);
    const before = parentGroup.children!.length;
    addItem(parentGroup.children!, false);
    expect(parentGroup.children!.length).toBe(before);
  });

  it("14.14 addItem: ロックされていないグループの children へは通常どおり追加できること", () => {
    const { childGroup } = buildLockedTree(false);
    const before = childGroup.children!.length;
    addItem(childGroup.children!, false);
    expect(childGroup.children!.length).toBe(before + 1);
  });
});

// -------------------------------------------------------------------------
// 15. グループ非表示機能のテスト (Phase 8)
// -------------------------------------------------------------------------
import { toggleGroupHidden, toggleShowHiddenGroups } from "../src/store";

describe("グループ非表示機能 (Phase 8)", () => {
  beforeEach(() => {
    state.showHiddenGroups = false;
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) } as Response);
  });

  const buildGroup = (isLocked = false): PsmItem => {
    const group: PsmItem = {
      id: 1, name: "group", content: "", enabled: true, weight: 1.0, is_group: true, isOpen: true,
      isLocked,
      children: [],
    };
    state.positive = [group];
    state.negative = [];
    return state.positive[0];
  };

  it("15.1 toggleGroupHidden: isHidden を新規にトグルできること (未設定 -> true -> false)", async () => {
    const group = buildGroup();
    expect(group.isHidden).toBeUndefined();
    await toggleGroupHidden(group);
    expect(group.isHidden).toBe(true);
    await toggleGroupHidden(group);
    expect(group.isHidden).toBe(false);
  });

  it("15.2 toggleGroupHidden: forceVal を指定した場合はその値になること", async () => {
    const group = buildGroup();
    await toggleGroupHidden(group, true);
    expect(group.isHidden).toBe(true);
    await toggleGroupHidden(group, true);
    expect(group.isHidden).toBe(true); // 既にtrueでも変化なし
  });

  it("15.3 toggleGroupHidden: ロック中のグループは非表示状態を変更できないこと", async () => {
    const group = buildGroup(true);
    await toggleGroupHidden(group);
    expect(group.isHidden).toBeUndefined();
  });

  it("15.4 toggleShowHiddenGroups: state.showHiddenGroups をトグルし、ローカル設定を保存すること", () => {
    expect(state.showHiddenGroups).toBe(false);
    toggleShowHiddenGroups();
    expect(state.showHiddenGroups).toBe(true);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      "psm_settings",
      expect.stringContaining('"show_hidden_groups":true')
    );
    toggleShowHiddenGroups();
    expect(state.showHiddenGroups).toBe(false);
  });

  it("15.5 show_hidden_groups のローカルストレージからの復元", () => {
    mockLocalStorage.getItem.mockReturnValueOnce(JSON.stringify({
      show_hidden_groups: true,
      ui_scale: "large",
    }));
    state.showHiddenGroups = false;
    loadSettingsLocal();
    expect(state.showHiddenGroups).toBe(true);
  });
});

// -------------------------------------------------------------------------
// 16. フィルター機能: グループ開閉状態のスナップショット/復元
// -------------------------------------------------------------------------
// 検索フィルターで自動展開されたグループが、フィルター解除後に
// フィルター適用前の開閉状態へ正しく復元されることを検証する。
// (PsmTreePane.vue が searchQuery の空<->非空遷移でこれらを呼び出す)
import { snapshotGroupOpenState, restoreGroupOpenState } from "../src/store";

describe("フィルター機能: グループ開閉状態のスナップショット/復元", () => {
  const grp = (id: number, name: string, isOpen: boolean, children: PsmItem[] = []): PsmItem => ({
    id, name, content: "", enabled: true, weight: 1.0, is_group: true, isOpen, children,
  });
  const leaf = (id: number, name: string): PsmItem => ({
    id, name, content: "tag", enabled: true, weight: 1.0, is_group: false,
  });

  it("16.1 snapshotGroupOpenState: 各グループのisOpen状態をidをキーに記録すること (非グループアイテムは含めない)", () => {
    // Arrange
    const tree: PsmItem[] = [
      grp(1, "閉じたグループ", false, [leaf(2, "leaf")]),
      grp(3, "開いたグループ", true),
    ];

    // Act
    const snapshot = snapshotGroupOpenState(tree);

    // Assert
    expect(snapshot.get(1)).toBe(false);
    expect(snapshot.get(3)).toBe(true);
    expect(snapshot.has(2)).toBe(false); // leaf(非グループ)は対象外
    expect(snapshot.size).toBe(2);
  });

  it("16.2 restoreGroupOpenState: フィルターで自動展開(isOpen=true)された後でも、保存済みの状態(false)へ復元すること", () => {
    // Arrange: フィルター適用前は閉じていた
    const group = grp(1, "対象グループ", false);
    const snapshot = snapshotGroupOpenState([group]);

    // Act: フィルター一致による自動展開 (PsmNode.vue の挙動を模擬)
    group.isOpen = true;
    // Act: フィルター解除時の復元
    restoreGroupOpenState([group], snapshot);

    // Assert: フィルター適用前の閉じた状態へ戻ること
    expect(group.isOpen).toBe(false);
  });

  it("16.3 restoreGroupOpenState: ネストしたグループ全ての開閉状態を再帰的に復元すること", () => {
    // Arrange: 親は開いたまま、子は閉じていた状態を保存
    const child = grp(2, "子グループ", false);
    const parent = grp(1, "親グループ", true, [child]);
    const snapshot = snapshotGroupOpenState([parent]);

    // Act: フィルター一致で子も強制展開される
    child.isOpen = true;
    restoreGroupOpenState([parent], snapshot);

    // Assert: 親は開いたまま、子は元の閉じた状態へ復元される
    expect(parent.isOpen).toBe(true);
    expect(child.isOpen).toBe(false);
  });

  it("16.4 restoreGroupOpenState: スナップショットに存在しないグループ(フィルター中に新規追加)は変更しないこと", () => {
    // Arrange: スナップショット後に新しいグループが追加されたケースを模擬
    const existing = grp(1, "既存グループ", false);
    const snapshot = snapshotGroupOpenState([existing]);
    const added = grp(99, "追加されたグループ", true);

    // Act
    restoreGroupOpenState([existing, added], snapshot);

    // Assert: 追加分はスナップショットにないため isOpen はそのまま
    expect(existing.isOpen).toBe(false);
    expect(added.isOpen).toBe(true);
  });
});
