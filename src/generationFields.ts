/**
 * 生成設定プロファイル機能 (Phase 6) が扱うWebUI項目のレジストリ。
 * Checkpoint/Sampling Steps等、各項目のDOM読み取り・適用処理をここに集約する。
 * 項目を追加する場合はこのファイルに GenerationFieldDef を1件追加するだけでよい。
 *
 * VAE / Sampling Method / Schedule Type (単一・複数選択Dropdown) は、WebUI本体が
 * Checkpointについて直接DOM操作を避けて専用ブリッジを用意している事実から、単純な
 * DOM操作では確実に反映できないと判断し、対象項目から除外している。
 */
import { GenerationFieldId, PsmGenerationSettings } from "./types";
import { Logger } from "./log";

export type TabPrefix = "txt2img" | "img2img";

export type GenerationFieldValue = string | number;

export interface GenerationFieldDef {
  id: GenerationFieldId;
  /** i18n キー */
  labelKey: string;
  valueType: "string" | "number";
  read: (prefix: TabPrefix) => GenerationFieldValue | undefined;
  /** WebUIへ値を書き戻す (適用) 処理。要素が見つからない等の理由で失敗した場合はfalseを返す */
  apply: (prefix: TabPrefix, value: GenerationFieldValue) => boolean;
}

/**
 * 現在アクティブなタブ (txt2img / img2img) を判定する
 * getWebUIData() (store.ts) と同じロジック
 */
export const getActiveTabPrefix = (): TabPrefix =>
  document.getElementById("img2img_generate")?.offsetParent !== null
    ? "img2img"
    : "txt2img";

const dispatchInputEvent = (target: HTMLElement): void => {
  const event = new Event("input", { bubbles: true });
  target.dispatchEvent(event);
};

/** id要素配下の input (テキスト表示用) から現在値を読み取る (Textbox/Dropdown共通) */
const readInputValue = (elemId: string): string | undefined => {
  const input = document.querySelector(`#${elemId} input`) as HTMLInputElement | null;
  return input ? input.value : undefined;
};

const readNumberValue = (elemId: string): number | undefined => {
  const raw = readInputValue(elemId);
  if (raw === undefined || raw === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
};

/** id要素配下の input に値を書き込み、Gradio側へ input イベントで通知する */
const writeInputValue = (elemId: string, value: string): boolean => {
  const input = document.querySelector(`#${elemId} input`) as HTMLInputElement | null;
  if (!input) {
    Logger.warn(`[GenerationFields] #${elemId} 内のinput要素が見つからず、適用をスキップしました。`);
    return false;
  }
  input.value = value;
  dispatchInputEvent(input);
  return true;
};

/**
 * Checkpointの適用は、WebUI本体が用意している隠しブリッジ
 * (#change_checkpoint_text への値設定 + #change_checkpoint のクリック) を利用する。
 * ドロップダウンを直接DOM操作しないのは、WebUI本体自身がこのブリッジを介する実装を
 * 採用しているため (直接操作は非対応の可能性が高いと判断)。
 */
const applyCheckpoint = (_prefix: TabPrefix, value: GenerationFieldValue): boolean => {
  if (typeof value !== "string" || !value) return false;
  const textArea = document
    .getElementById("change_checkpoint_text")
    ?.querySelector("textarea") as HTMLTextAreaElement | null;
  const button = document.getElementById("change_checkpoint") as HTMLButtonElement | null;
  if (!textArea || !button) {
    Logger.warn("[GenerationFields] Checkpoint適用用の隠しブリッジ要素 (#change_checkpoint_text / #change_checkpoint) が見つかりませんでした。");
    return false;
  }
  textArea.value = value;
  dispatchInputEvent(textArea);
  button.click();
  return true;
};

const applyNumberSlider = (elemId: string, value: GenerationFieldValue): boolean => {
  if (typeof value !== "number") return false;
  return writeInputValue(elemId, String(value));
};

export const GENERATION_FIELDS: GenerationFieldDef[] = [
  {
    id: "checkpoint",
    labelKey: "genFieldCheckpoint",
    valueType: "string",
    read: () => readInputValue("setting_sd_model_checkpoint"),
    apply: applyCheckpoint,
  },
  {
    id: "steps",
    labelKey: "genFieldSteps",
    valueType: "number",
    read: (prefix) => readNumberValue(`${prefix}_steps`),
    apply: (prefix, value) => applyNumberSlider(`${prefix}_steps`, value),
  },
  {
    id: "cfg_scale",
    labelKey: "genFieldCfgScale",
    valueType: "number",
    read: (prefix) => readNumberValue(`${prefix}_cfg_scale`),
    apply: (prefix, value) => applyNumberSlider(`${prefix}_cfg_scale`, value),
  },
  {
    id: "width",
    labelKey: "genFieldWidth",
    valueType: "number",
    read: (prefix) => readNumberValue(`${prefix}_width`),
    apply: (prefix, value) => applyNumberSlider(`${prefix}_width`, value),
  },
  {
    id: "height",
    labelKey: "genFieldHeight",
    valueType: "number",
    read: (prefix) => readNumberValue(`${prefix}_height`),
    apply: (prefix, value) => applyNumberSlider(`${prefix}_height`, value),
  },
  {
    id: "seed",
    labelKey: "genFieldSeed",
    valueType: "number",
    read: (prefix) => readNumberValue(`${prefix}_seed`),
    apply: (prefix, value) => applyNumberSlider(`${prefix}_seed`, value),
  },
];

export const getGenerationField = (id: GenerationFieldId): GenerationFieldDef | undefined =>
  GENERATION_FIELDS.find((f) => f.id === id);

/**
 * 指定されたフィールドIDのみ、現在のWebUI状態からPsmGenerationSettingsを構築する
 */
export const captureGenerationSettings = (fields: GenerationFieldId[]): PsmGenerationSettings => {
  const prefix = getActiveTabPrefix();
  const settings: PsmGenerationSettings = {};
  for (const id of fields) {
    const def = getGenerationField(id);
    if (!def) continue;
    const value = def.read(prefix);
    if (value === undefined) continue;
    (settings as Record<string, GenerationFieldValue>)[id] = value;
  }
  return settings;
};
