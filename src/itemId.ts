import { PsmItem, PsmProfile, PsmProfileState } from "./types";

// -------------------------------------------------------------------------
// アイテムIDの発行と修復
// プロファイル・ロック判定・キーボードのフォーカスなど、アプリ全体が「IDはファイル内で一意」を前提にしている。
// その前提を、新しいIDの発行と、読み込んだファイルの修復の両方で守る。
// -------------------------------------------------------------------------

/** 最後に発行したID (同じミリ秒内に何度呼ばれても、前回より大きい値を返すために保持する) */
let lastIssuedId = 0;

/**
 * アイテムの新しいIDを発行する
 * 現在時刻 (ミリ秒) の1000倍を基準にし、同じミリ秒内に呼ばれた場合は前回の値に1を足して返す。
 * 以前は時刻に乱数や呼び出しごとに0から始まる連番を足していたため、グループの複製や
 * PNG Info の取り込みでまとめて発行すると、別のアイテムと同じIDになることがあった。
 */
export const createItemId = (): number => {
  lastIssuedId = Math.max(Date.now() * 1000, lastIssuedId + 1);
  return lastIssuedId;
};

/** アイテムのIDとして扱える値か (数値か空でない文字列。古い形式のファイルには文字列のIDがある) */
export const isValidItemId = (id: unknown): id is number | string =>
  (typeof id === "number" && Number.isFinite(id)) || (typeof id === "string" && id !== "");

/**
 * ツリーのノードを、親を先にして深さ優先でたどる
 * アプリの他の処理と同じく、グループの children だけをたどる (プロンプトに残っている children は画面にも出力にも使われないため)。
 */
const forEachNode = (nodes: readonly PsmItem[], visit: (node: PsmItem) => void): void => {
  for (const node of nodes) {
    if (!node) continue;
    visit(node);
    if (node.is_group && Array.isArray(node.children)) forEachNode(node.children, visit);
  }
};

/**
 * 読み込んだツリーに含まれるIDより大きい値から発行するようにする
 * 時計のずれなどで、ファイル内のIDが現在時刻より先の値になっていても、新しいIDと重ならないようにするため。
 */
export const reserveItemIds = (trees: readonly (readonly PsmItem[])[]): void => {
  for (const tree of trees) {
    forEachNode(tree, (node) => {
      const id: unknown = node.id;
      if (typeof id === "number" && Number.isSafeInteger(id) && id > lastIssuedId) lastIssuedId = id;
    });
  }
};

/** IDの修復対象 (読み込んだファイルの内容) */
export interface ItemIdRepairInput {
  positive: PsmItem[];
  negative: PsmItem[];
  profiles: PsmProfile[];
}

/** IDの修復結果 (修復の必要が無い部分は、入力と同じオブジェクトを返す) */
export interface ItemIdRepairResult {
  positive: PsmItem[];
  negative: PsmItem[];
  profiles: PsmProfile[];
  /** 先に出てきたノードとIDが重複していたため、新しいIDを振ったノードの数 */
  duplicateCount: number;
  /** IDが無かったため、新しいIDを振ったノードの数 */
  missingCount: number;
  /** IDが無く、どのノードにも対応しないため削除したプロファイルの状態の数 */
  droppedStateCount: number;
}

/** IDを振り直したノードの、元のIDと新しいID (プロファイルの引き継ぎに使う) */
interface ReassignedId {
  oldId: number | string;
  newId: number;
}

/**
 * プロファイルの状態を、IDを振り直したノードへ引き継ぐ
 * 修復前は同じIDのノードすべてに同じ状態が適用されていたため、振り直したノードにも元のIDの状態を複製する。
 * applyProfile と同じく、同じIDの状態が複数ある場合は後のものを使う。
 */
const migrateProfiles = (
  profiles: PsmProfile[],
  reassigned: readonly ReassignedId[]
): { profiles: PsmProfile[]; droppedStateCount: number } => {
  let droppedStateCount = 0;
  const migrated = profiles.map((profile) => {
    const states: PsmProfileState[] = Array.isArray(profile.states) ? profile.states : [];
    const kept = states.filter((s) => !!s && isValidItemId(s.id));
    droppedStateCount += states.length - kept.length;

    const stateById = new Map<number | string, PsmProfileState>();
    for (const s of kept) stateById.set(s.id, s);
    const copied = reassigned.flatMap(({ oldId, newId }) => {
      const source = stateById.get(oldId);
      return source ? [{ ...source, id: newId }] : [];
    });

    if (kept.length === states.length && copied.length === 0) return profile;
    return { ...profile, states: [...kept, ...copied] };
  });
  return { profiles: migrated, droppedStateCount };
};

/**
 * 読み込んだファイルの重複・欠損しているIDを修復する (入力は変更せず、修復したノードだけ新しいオブジェクトにする)
 * Positive → Negative の順に親を先にしてたどり、最初に出てきたノードはIDをそのままにする。
 * 2回目以降に出てきたノードとIDの無いノードには新しいIDを振り、プロファイルの状態も引き継ぐ。
 * 重複していない文字列のIDは、プロファイルとの対応が切れないようにそのまま残す。
 * @param issueId 新しいIDの発行関数 (テスト用に差し替えられる)
 */
export const repairItemIds = (input: ItemIdRepairInput, issueId: () => number = createItemId): ItemIdRepairResult => {
  // 新しく振るIDが、後ろに出てくるノードの既存のIDと重ならないよう、先にすべて集めておく
  const usedIds = new Set<number | string>();
  for (const tree of [input.positive, input.negative]) {
    forEachNode(tree, (node) => {
      const id: unknown = node.id;
      if (isValidItemId(id)) usedIds.add(id);
    });
  }

  const issueUnusedId = (): number => {
    let id = issueId();
    while (usedIds.has(id)) id = issueId();
    usedIds.add(id);
    return id;
  };

  const seenIds = new Set<number | string>();
  const reassigned: ReassignedId[] = [];
  let missingCount = 0;

  /** ノードのIDを決める (子より先に呼んで、ツリーの上にあるノードを優先する) */
  const resolveId = (node: PsmItem): number => {
    const current: unknown = node.id;
    if (!isValidItemId(current)) {
      missingCount++;
      return issueUnusedId();
    }
    if (seenIds.has(current)) {
      const newId = issueUnusedId();
      reassigned.push({ oldId: current, newId });
      return newId;
    }
    seenIds.add(current);
    return node.id;
  };

  const repairNode = (node: PsmItem): PsmItem => {
    if (!node) return node;
    const id = resolveId(node);
    const children = node.is_group && Array.isArray(node.children) ? repairNodes(node.children) : node.children;
    if (id === node.id && children === node.children) return node;
    return children === node.children ? { ...node, id } : { ...node, id, children };
  };

  const repairNodes = (nodes: PsmItem[]): PsmItem[] => {
    const repaired = nodes.map(repairNode);
    return repaired.every((node, index) => node === nodes[index]) ? nodes : repaired;
  };

  const positive = repairNodes(input.positive);
  const negative = repairNodes(input.negative);
  const { profiles, droppedStateCount } = migrateProfiles(input.profiles, reassigned);

  return {
    positive,
    negative,
    profiles,
    duplicateCount: reassigned.length,
    missingCount,
    droppedStateCount,
  };
};
