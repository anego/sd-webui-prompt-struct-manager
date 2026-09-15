import { PsmItem } from "./types";

/** グループマップのセクション見出し (Positive/Negative) */
export type GroupMapHeader = { type: "header"; label: string };

/** グループマップに表示する1グループ分のエントリ */
export type GroupMapItem = {
  id: number;
  name: string;
  depth: number;
  enabled: boolean;
  activeCount: number;
};

export type GroupMapEntry = GroupMapHeader | GroupMapItem;

interface WalkResult {
  groups: GroupMapItem[];
  activeCount: number;
}

/**
 * ツリーを1回だけ再帰的に走査し、各グループの有効プロンプト数を
 * 子の集計結果を再利用しながらボトムアップで求める。
 * (旧実装はグループごとに個別の関数呼び出しで部分木を数え直しており、
 *  深いネストで同じ部分木を何度も数え直す O(n×深さ) の重複再帰になっていた。
 *  全プロンプトの有効/無効トグルのたびにこのマップは再計算されるため、
 *  択一選択で多数の兄弟が同時に切り替わると体感できるラグの原因になっていた)
 */
const walkGroupTree = (nodes: PsmItem[], depth = 0): WalkResult => {
  let groups: GroupMapItem[] = [];
  let activeCount = 0;
  for (const node of nodes) {
    if (!node) continue;
    if (node.is_group) {
      const childResult = walkGroupTree(node.children || [], depth + 1);
      // 親(このグループ)が無効なら、子孫の有効数に関わらずこのグループの集計は0とみなす
      const groupActiveCount = node.enabled ? childResult.activeCount : 0;
      groups.push({
        id: node.id,
        name: node.name || "(No Name)",
        depth,
        enabled: node.enabled,
        activeCount: groupActiveCount,
      });
      groups = groups.concat(childResult.groups);
      activeCount += groupActiveCount;
    } else if (node.enabled) {
      activeCount += 1;
    }
  }
  return { groups, activeCount };
};

/**
 * Positive/Negative両ツリーから、グループマップ表示用のフラットな配列を構築する。
 * 先頭にセクション見出しを挟んだ形式 (PsmGroupMap.vue の表示順と対応)。
 */
export const buildGroupMap = (positive: PsmItem[], negative: PsmItem[]): GroupMapEntry[] => {
  return [
    { type: "header", label: "Positive" },
    ...walkGroupTree(positive).groups,
    { type: "header", label: "Negative" },
    ...walkGroupTree(negative).groups,
  ];
};
