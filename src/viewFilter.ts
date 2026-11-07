import { PsmItem, ViewFilterMode } from "./types";

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
 * 自身か子孫のいずれかが検索クエリに一致するか (query は小文字化済みであること)
 * 表示フィルターが「すべて」のときのペインの検索欄の絞り込みでは、グループは中身のどれかが一致すれば表示する。
 */
export const matchesQueryDeep = (node: PsmItem, lowerQuery: string): boolean =>
  matchesQuery(node, lowerQuery) ||
  (!!node.is_group && !!node.children && node.children.some((child) => !!child && matchesQueryDeep(child, lowerQuery)));

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

/** ペインの表示条件 (listNavigableItems 用) */
export interface PaneViewOptions {
  /** ツリーの表示フィルター */
  mode: ViewFilterMode;
  /** ペインの検索欄の入力 */
  query: string;
  /** 非表示グループ (isHidden) をツリーに表示する設定か */
  showHiddenGroups: boolean;
}

/** 表示する項目と、開いているグループの中身を、画面の順に並べる */
const flattenOpenNodes = (nodes: PsmItem[], isVisible: (node: PsmItem) => boolean): PsmItem[] =>
  nodes.flatMap((node) => {
    if (!node || !isVisible(node)) return [];
    const children = node.is_group && node.isOpen && node.children ? flattenOpenNodes(node.children, isVisible) : [];
    return [node, ...children];
  });

/**
 * ペインで画面に表示されている項目を、画面の順に並べる (キーボードの上下移動で、見えている項目だけをたどるため)
 * 表示の条件は PsmTreePane / PsmNode と揃える。
 * - 「有効のみ」: グループの枠なしで並ぶ、反映されるプロンプト (検索も考慮)
 * - 「有効 (グループ付き)」: 反映されるプロンプトとそれを含むグループ (検索も考慮)
 * - 「すべて」で検索中: 自身か子孫が検索に一致する項目 (非表示グループの設定は無視する)
 * - 「すべて」で検索なし: 非表示グループ (表示設定がオフの場合) とその中身を除いた項目
 * 閉じているグループの中身は含めない。
 */
export const listNavigableItems = (nodes: PsmItem[], options: PaneViewOptions): PsmItem[] => {
  if (options.mode !== "all") {
    const view = buildEnabledView(nodes, options.query);
    if (options.mode === "enabled") return view.flatLeaves.map((entry) => entry.item);
    return flattenOpenNodes(nodes, (node) => view.visibleIds.has(node.id));
  }
  const lowerQuery = options.query.toLowerCase();
  if (lowerQuery) return flattenOpenNodes(nodes, (node) => matchesQueryDeep(node, lowerQuery));
  return flattenOpenNodes(nodes, (node) => !(node.is_group && node.isHidden && !options.showHiddenGroups));
};

/**
 * アイテムが、ペインの検索欄の絞り込みで隠れているか (検索を解除すれば表示されるか)
 * 表示フィルター中は、検索なしなら表示されるのに検索ありでは表示されない場合だけ true にする
 * (無効なため表示フィルターで隠れている場合は、検索を解除しても表示されないため)。
 */
export const isHiddenBySearch = (nodes: PsmItem[], item: PsmItem, options: Pick<PaneViewOptions, "mode" | "query">): boolean => {
  if (!options.query) return false;
  if (options.mode === "all") return !matchesQueryDeep(item, options.query.toLowerCase());
  return buildEnabledView(nodes).visibleIds.has(item.id) && !buildEnabledView(nodes, options.query).visibleIds.has(item.id);
};
