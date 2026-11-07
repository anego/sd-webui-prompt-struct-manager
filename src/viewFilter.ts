import { PsmItem } from "./types";

/**
 * 表示フィルター (有効のみ / 有効(グループ付き)) で表示するプロンプトの1件
 * グループの枠なしで並べる「有効のみ」では、ツリー上の位置の情報をここから PsmNode へ渡す。
 */
export interface FlatLeafEntry {
  item: PsmItem;
  /** 自身を含むリスト (右クリックメニューの複製・移動などに使う) */
  parentChildren: PsmItem[];
  /** 祖先グループがロック中かどうか */
  locked: boolean;
  /** 祖先に非表示グループがあるかどうか */
  inHiddenGroup: boolean;
}

/** 表示フィルターの計算結果 */
export interface EnabledView {
  /** 表示するプロンプトと、それを含むグループのID (「有効(グループ付き)」の表示判定に使う) */
  visibleIds: Set<number>;
  /** 表示するプロンプトをツリーの順に並べたもの (「有効のみ」の表示に使う) */
  flatLeaves: FlatLeafEntry[];
}

/** 名前・内容・メモのいずれかに検索クエリを含むか (大文字小文字は区別しない。query は小文字化済みであること) */
export const matchesQuery = (node: PsmItem, lowerQuery: string): boolean =>
  [node.name, node.content, node.memo].some((s) => !!s && s.toLowerCase().includes(lowerQuery));

/**
 * 実際にプロンプトへ反映される (自身と祖先がすべて有効な) プロンプトと、それを含むグループを求める
 * 非表示グループの配下も対象にする (非表示でも出力には含まれるため)。
 * 検索クエリがある場合は、プロンプト自身か祖先グループのいずれかが一致するものに絞り込む。
 */
export const buildEnabledView = (nodes: PsmItem[], query = ""): EnabledView => {
  const lowerQuery = query.toLowerCase();
  const visibleIds = new Set<number>();
  const flatLeaves: FlatLeafEntry[] = [];

  /** @returns 配下に表示するプロンプトがあれば true */
  const walk = (list: PsmItem[], locked: boolean, inHiddenGroup: boolean, ancestorMatched: boolean): boolean => {
    let hasVisible = false;
    for (const node of list) {
      if (!node || !node.enabled) continue;
      const matched = ancestorMatched || !lowerQuery || matchesQuery(node, lowerQuery);
      if (node.is_group) {
        const childLocked = locked || !!node.isLocked;
        const childHidden = inHiddenGroup || !!node.isHidden;
        if (node.children && walk(node.children, childLocked, childHidden, matched)) {
          visibleIds.add(node.id);
          hasVisible = true;
        }
        continue;
      }
      if (!matched) continue;
      visibleIds.add(node.id);
      flatLeaves.push({ item: node, parentChildren: list, locked, inHiddenGroup });
      hasVisible = true;
    }
    return hasVisible;
  };

  walk(nodes, false, false, false);
  return { visibleIds, flatLeaves };
};
