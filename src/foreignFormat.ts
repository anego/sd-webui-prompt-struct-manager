import { PsmItem } from "./types";
import { createItemId } from "./itemId";

// -------------------------------------------------------------------------
// 別のツールで作られたプロンプトファイル (group / items / prompt 形式) を PSM の形式へ変換する
// グループ: { group: "主題", items: [...], open: true, enabled: true, weight: 1 }
// プロンプト: { prompt: "1girl" または ["1girl", "solo"], memo: "...", enabled: true, weight: 1, star: false }
// PSM のノードが持つ name / content / is_group / children が無いため、そのままでは表示できない。
// -------------------------------------------------------------------------

/** 変換結果 */
export interface ForeignConvertResult {
  nodes: PsmItem[];
  /** 別形式から変換したノードの数 (入れ子を含む) */
  convertedCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 別形式のノードか (PSM のノードが持つ is_group / content が無く、別形式の group / items / prompt がある) */
export const isForeignNode = (value: Record<string, unknown>): boolean =>
  !("is_group" in value) && !("content" in value) && ("group" in value || "items" in value || "prompt" in value);

/** PSM のノードとして扱うか (別形式以外のオブジェクトは、これまでどおり PSM のノードとして扱う) */
const isPsmNode = (value: unknown): value is PsmItem => isRecord(value) && !isForeignNode(value);

/** 文字列か文字列の配列を、プロンプトの文字列にする (配列はカンマ区切りでつなぐ) */
const toText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").join(", ");
  return "";
};

const toBoolean = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);

const toWeight = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 1.0);

/** 数値のIDは残し、無ければ新しく振る (重複していた場合は、このあとの repairItemIds が振り直す) */
const toId = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : createItemId());

/**
 * ツリー内の別形式のノードを PSM の形式に変換する (入力は変更せず、変換したノードだけ新しいオブジェクトにする)
 * PSM のノードはそのまま残す。star など PSM に対応する項目が無い値は引き継がない。
 * オブジェクトでない要素 (null など) は、表示も出力もできないため取り除く。
 */
export const convertForeignNodes = (nodes: readonly unknown[]): ForeignConvertResult => {
  let convertedCount = 0;

  const convertNode = (value: unknown): PsmItem[] => {
    if (!isRecord(value)) return [];
    if (isPsmNode(value)) {
      if (!value.is_group || !Array.isArray(value.children)) return [value];
      const children = convertList(value.children);
      return [children === value.children ? value : { ...value, children }];
    }

    convertedCount++;
    const common = {
      id: toId(value.id),
      enabled: toBoolean(value.enabled, true),
      weight: toWeight(value.weight),
      memo: toText(value.memo),
    };
    if ("group" in value || Array.isArray(value.items)) {
      return [{
        ...common,
        name: toText(value.group),
        content: "",
        is_group: true,
        isOpen: toBoolean(value.open, true),
        children: convertList(Array.isArray(value.items) ? value.items : []),
      }];
    }
    return [{ ...common, name: "", content: toText(value.prompt), is_group: false }];
  };

  /** 変換の必要が無いリストは、同じ配列のまま返す */
  const convertList = (list: readonly unknown[]): PsmItem[] => {
    const converted = list.flatMap(convertNode);
    const unchanged = converted.length === list.length && converted.every((node, index) => node === list[index]);
    return unchanged && isPsmList(list) ? list : converted;
  };

  return { nodes: convertList(nodes), convertedCount };
};

/** すべての要素が PSM のノードの配列か (変換が不要だった配列を、そのまま返すための判定) */
const isPsmList = (list: readonly unknown[]): list is PsmItem[] => list.every(isPsmNode);
