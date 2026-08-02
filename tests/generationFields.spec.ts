import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  GENERATION_FIELDS,
  getActiveTabPrefix,
  captureGenerationSettings,
  getGenerationField,
} from "../src/generationFields";

// -------------------------------------------------------------------------
// テスト前処理とモック設定
// -------------------------------------------------------------------------
// vitest.config.ts は environment: "node" のため実DOMが存在しない。
// document.getElementById / querySelector をテストごとに差し替えて検証する。
// -------------------------------------------------------------------------

let getElementByIdMock: ReturnType<typeof vi.fn>;
let querySelectorMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getElementByIdMock = vi.fn().mockReturnValue(null);
  querySelectorMock = vi.fn().mockReturnValue(null);
  vi.stubGlobal("document", {
    getElementById: getElementByIdMock,
    querySelector: querySelectorMock,
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// -------------------------------------------------------------------------
// 1. getActiveTabPrefix - タブ判定
// -------------------------------------------------------------------------

describe("getActiveTabPrefix - txt2img/img2img判定", () => {
  it("1.1 #img2img_generate が非表示 (offsetParent: null) の場合、txt2imgと判定すること", () => {
    // Arrange
    getElementByIdMock.mockReturnValue({ offsetParent: null });

    // Act & Assert
    expect(getActiveTabPrefix()).toBe("txt2img");
  });

  it("1.2 #img2img_generate が表示中 (offsetParent: 非null) の場合、img2imgと判定すること", () => {
    // Arrange
    getElementByIdMock.mockReturnValue({ offsetParent: {} });

    // Act & Assert
    expect(getActiveTabPrefix()).toBe("img2img");
  });
});

// -------------------------------------------------------------------------
// 2. 各フィールドのread処理
// -------------------------------------------------------------------------

describe("GENERATION_FIELDS - read処理", () => {
  it("2.1 checkpoint: #setting_sd_model_checkpoint 配下のinput値を読み取れること", () => {
    // Arrange
    querySelectorMock.mockImplementation((sel: string) =>
      sel === "#setting_sd_model_checkpoint input" ? { value: "animagineXL.safetensors" } : null
    );

    // Act
    const def = getGenerationField("checkpoint")!;
    const result = def.read("txt2img");

    // Assert
    expect(result).toBe("animagineXL.safetensors");
  });

  it("2.2 steps: 数値inputを数値型に変換して読み取れること", () => {
    // Arrange
    querySelectorMock.mockImplementation((sel: string) =>
      sel === "#txt2img_steps input" ? { value: "28" } : null
    );

    // Act
    const def = getGenerationField("steps")!;
    const result = def.read("txt2img");

    // Assert
    expect(result).toBe(28);
  });

  it("2.3 steps: input要素が見つからない場合はundefinedを返すこと", () => {
    // Arrange (querySelectorMock は常にnullを返す)

    // Act
    const def = getGenerationField("steps")!;
    const result = def.read("img2img");

    // Assert
    expect(result).toBeUndefined();
  });

  it("2.4 cfg_scale/width/height/seed は img2img プレフィックスで正しいセレクタを参照すること", () => {
    // Arrange
    querySelectorMock.mockImplementation((sel: string) => {
      if (sel === "#img2img_cfg_scale input") return { value: "6.5" };
      if (sel === "#img2img_width input") return { value: "832" };
      if (sel === "#img2img_height input") return { value: "1216" };
      if (sel === "#img2img_seed input") return { value: "-1" };
      return null;
    });

    // Act & Assert
    expect(getGenerationField("cfg_scale")!.read("img2img")).toBe(6.5);
    expect(getGenerationField("width")!.read("img2img")).toBe(832);
    expect(getGenerationField("height")!.read("img2img")).toBe(1216);
    expect(getGenerationField("seed")!.read("img2img")).toBe(-1);
  });
});

// -------------------------------------------------------------------------
// 3. apply処理
// -------------------------------------------------------------------------

describe("GENERATION_FIELDS - apply処理", () => {
  it("3.1 全項目に apply 関数が定義されていること (適用不可の項目は登録しない方針)", () => {
    for (const f of GENERATION_FIELDS) {
      expect(typeof f.apply).toBe("function");
    }
  });

  it("3.2 steps: input要素へ値を書き込みinputイベントを発火すること", () => {
    // Arrange
    const dispatchEvent = vi.fn();
    const inputEl = { value: "", dispatchEvent };
    querySelectorMock.mockImplementation((sel: string) =>
      sel === "#txt2img_steps input" ? inputEl : null
    );

    // Act
    const ok = getGenerationField("steps")!.apply("txt2img", 30);

    // Assert
    expect(ok).toBe(true);
    expect(inputEl.value).toBe("30");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("3.3 steps: input要素が見つからない場合はfalseを返し警告を出すこと", () => {
    // Arrange (querySelectorMock は常にnullを返す)

    // Act
    const ok = getGenerationField("steps")!.apply("txt2img", 30);

    // Assert
    expect(ok).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it("3.4 checkpoint: 隠しブリッジ (textarea + button) 経由で適用されること", () => {
    // Arrange
    const dispatchEvent = vi.fn();
    const textArea = { value: "", dispatchEvent };
    const click = vi.fn();
    getElementByIdMock.mockImplementation((id: string) => {
      if (id === "change_checkpoint_text") return { querySelector: vi.fn().mockReturnValue(textArea) };
      if (id === "change_checkpoint") return { click };
      return null;
    });

    // Act
    const ok = getGenerationField("checkpoint")!.apply("txt2img", "newModel.safetensors");

    // Assert
    expect(ok).toBe(true);
    expect(textArea.value).toBe("newModel.safetensors");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("3.5 checkpoint: 隠しブリッジ要素が見つからない場合はfalseを返しクリックしないこと", () => {
    // Arrange (getElementByIdMock は常にnullを返す)

    // Act
    const ok = getGenerationField("checkpoint")!.apply("txt2img", "newModel.safetensors");

    // Assert
    expect(ok).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
// 4. captureGenerationSettings - 選択フィールドのみのスナップショット構築
// -------------------------------------------------------------------------

describe("captureGenerationSettings - 選択項目のみ現在値を収集", () => {
  it("4.1 選択されたフィールドのみが結果オブジェクトに含まれること", () => {
    // Arrange
    getElementByIdMock.mockReturnValue({ offsetParent: null }); // txt2img
    querySelectorMock.mockImplementation((sel: string) => {
      if (sel === "#setting_sd_model_checkpoint input") return { value: "modelA.safetensors" };
      if (sel === "#txt2img_steps input") return { value: "25" };
      return null;
    });

    // Act
    const result = captureGenerationSettings(["checkpoint", "steps", "cfg_scale"]);

    // Assert: cfg_scale は読み取れなかった (undefined) ため含まれない
    expect(result).toEqual({ checkpoint: "modelA.safetensors", steps: 25 });
  });

  it("4.2 全項目のIDが GENERATION_FIELDS に定義された6項目 (自動適用可能な項目のみ) と一致すること", () => {
    const ids = GENERATION_FIELDS.map((f) => f.id).sort();
    expect(ids).toEqual(
      ["cfg_scale", "checkpoint", "height", "seed", "steps", "width"].sort()
    );
  });
});
