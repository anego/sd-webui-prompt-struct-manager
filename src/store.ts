import { reactive, watch } from "vue";
import { PsmItem, DuplicateCheckMode, PsmProfile, PsmProfileState, ModelMode, TranslateSettings, TranslateProfile, PsmCategory, GenerationFieldId, PsmGenerationProfile } from "./types";
import { Logger, setDebugMode } from "./log";
import { GENERATION_FIELDS, getActiveTabPrefix, captureGenerationSettings } from "./generationFields";

/**
 * アプリケーション全体のリアクティブな状態管理オブジェクト
 */
export const state = reactive({
  /** メインパネルの表示状態 */
  isVisible: false,
  /** 編集モーダルの表示状態 */
  isEditing: false,
  /** 削除確認モード（後方互換用、現在はisDeletingが主） */
  isDeleteConfirmMode: false,
  /** 新規アイテム作成中かどうか */
  isNewItem: false,
  /** 現在編集中のアイテム */
  editingItem: null as PsmItem | null,
  /** Positiveプロンプトのツリーデータ */
  positive: [] as PsmItem[],
  /** Negativeプロンプトのツリーデータ */
  negative: [] as PsmItem[],
  /** 検出されたYAMLファイル一覧 */
  yamlFiles: [] as string[],
  /** 現在選択中のYAMLファイル名 */
  selectedFile: "",

  /** 設定保存ディレクトリパス */
  configDir: "",
  /** 初期設定済みかどうか */
  isConfigured: false,
  width: 600,
  height: 800,
  top: 50,
  left: 50,
  /** Positiveツリーのペイン開閉状態 */
  posOpen: true,
  /** Negativeツリーのペイン開閉状態 */
  negOpen: false,
  isMoving: false,
  movingItem: null as PsmItem | null,
  /** 削除対象の親リスト参照（削除後の更新用） */
  deleteTargetParent: null as PsmItem[] | null,
  isDragging: false, 
  draggedItem: null as PsmItem | null, // Track currently dragged item
  /** 削除確認ダイアログの表示状態 */
  isDeleting: false,
  /** 現在削除確認中のアイテム */
  deletingItem: null as PsmItem | null,
  /** UIのスケーリング設定 ("small" | "medium" | "large") */
  uiScale: "medium" as "small" | "medium" | "large",
  /** 現在キーボードフォーカスが当たっているアイテムID */
  focusedItemId: null as number | null,
  /** 開発者モードフラグ (trueの場合のみインポート機能などを表示) */
  isDevMode: false,
  /** サイドバーの開閉状態 */
  isSidebarOpen: true,
  /** 言語設定 ("ja" | "en") */
  lang: "ja" as "ja" | "en",
  /** パネル開閉ショートカットキー (例: "Ctrl+B") */
  toggleShortcut: "",
  /** 重複プロンプトチェックモード */
  duplicateCheckMode: "none" as DuplicateCheckMode,
  /** 重複と判定されたプロンプトのテキストコレクション */
  duplicateTexts: new Set<string>(),
  /** 現在のハイライトレベル（色分け用） */
  duplicateHighlightLevel: null as "warn" | "error" | null,
  /** 最後に選択されていたファイル名 */
  lastFile: "",
  /** 重みスライダーを表示するかどうか */
  showWeightSlider: true,
  /** 非表示グループ (isHidden) をツリーに表示するかどうか */
  showHiddenGroups: false,
  /** 保存されているプロファイル（ツリースナップショット） */
  profiles: [] as PsmProfile[],
  /** 現在選択（適用）されているプロファイル名 */
  selectedProfileName: "",
  /** 保存されている生成設定プロファイル (Checkpoint/Sampler等、プロンプトYAMLとは別ファイルで管理) */
  generationProfiles: [] as PsmGenerationProfile[],
  /** 直近に適用（選択）した生成設定プロファイル名 */
  selectedGenerationProfileName: "",
  /** 非同期処理実行中フラグ */
  isLoading: false,
  /** ローディングテキストの翻訳キー */
  loadingText: "",
  /** プロンプト大辞典が検出・マウントされているかどうかのフラグ */
  hasDictionary: false,
  /** 対象モデルのモード (YAMLファイル単位で保存: "sd" | "anima") */
  modelMode: "sd" as ModelMode,
  /** 翻訳設定 (localStorage "psm_translate_settings" に保存) */
  translateSettings: null as TranslateSettings | null,
  /** 翻訳リクエスト実行中フラグ */
  isTranslating: false,
  /** バッチ翻訳の進捗 (タグ名の日本語化用) */
  translateProgress: { done: 0, total: 0 },
  /** 移動先クイック選択ダイアログの表示状態 */
  isMoveDialogOpen: false,
  /** 移動対象のアイテム */
  moveDialogItem: null as PsmItem | null,
  /** 最近使った移動先 (localStorageに保存) */
  recentMoveTargets: [] as { id: number | string; path: string }[],
  /** ドラッグ中にドロップ先としてハイライトするグループID */
  dropTargetId: null as number | null,
  /** ドラッグ元のリスト参照 (クローン方式のため、ドロップ後に元を削除するのに使う) */
  draggedFromList: null as PsmItem[] | null,
  /** ローディング多重度カウンタ */
  loadingCount: 0,
});

/**
 * ノードを再帰的にディープコピーし、新しいIDを付与するヘルパー関数
 * 複製時に使用されます。
 */
const cloneNodeRecursive = (node: PsmItem): PsmItem => {
  const newNode = {
    ...JSON.parse(JSON.stringify(node)),
    id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
  };
  if (newNode.is_group && newNode.children) {
    newNode.children = newNode.children.map((child: PsmItem) =>
      cloneNodeRecursive(child),
    );
  }
  return newNode;
};

/**
 * ID指定でアイテムとその親リスト、およびインデックスを探索する
 * @param targetId 探したいアイテムのID
 * @param nodes 探索対象のノードリスト
 * @param parent nodes自体が属する親リスト（再帰呼び出し用）
 * @returns { item, parent, index } または null
 */
export const findParentAndItem = (targetId: number, nodes: PsmItem[], parent: PsmItem[]): { item: PsmItem; parent: PsmItem[]; index: number } | null => {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i] && nodes[i].id === targetId) {
      return { item: nodes[i], parent, index: i };
    }
    if (nodes[i] && nodes[i].is_group && nodes[i].children) {
      const found = findParentAndItem(targetId, nodes[i].children!, nodes[i].children!);
      if (found) return found;
    }
  }
  return null;
};

/**
 * 指定IDのアイテムが、自身またはいずれかの祖先グループの isLocked によって
 * 編集不可になっているかを判定する (グループロック機能)
 */
export const isItemLocked = (targetId: number): boolean => {
  const search = (nodes: PsmItem[], lockedAncestor: boolean): boolean | null => {
    for (const node of nodes) {
      if (!node) continue;
      const effectiveLocked = lockedAncestor || !!node.isLocked;
      if (node.id === targetId) return effectiveLocked;
      if (node.is_group && node.children) {
        const found = search(node.children, effectiveLocked);
        if (found !== null) return found;
      }
    }
    return null;
  };
  return search(state.positive, false) ?? search(state.negative, false) ?? false;
};

/**
 * 指定の children 配列（参照一致）を保持するグループが、自身またはいずれかの
 * 祖先でロックされているかを判定する (グループロック機能)。
 * list がルート配列 (state.positive/negative) の場合は常に false。
 */
export const isListLocked = (list: PsmItem[]): boolean => {
  if (list === state.positive || list === state.negative) return false;
  const search = (nodes: PsmItem[], lockedAncestor: boolean): boolean | null => {
    for (const node of nodes) {
      if (!node) continue;
      const effectiveLocked = lockedAncestor || !!node.isLocked;
      if (node.is_group && node.children === list) return effectiveLocked;
      if (node.is_group && node.children) {
        const found = search(node.children, effectiveLocked);
        if (found !== null) return found;
      }
    }
    return null;
  };
  return search(state.positive, false) ?? search(state.negative, false) ?? false;
};

/**
 * グループのロック状態をトグルする (グループロック機能)
 * 祖先グループがロック中の場合、自身の isLocked は変更できない
 * （ロック解除は必ず祖先から順に行う必要がある）
 */
export const toggleGroupLock = async (group: PsmItem, forceVal?: boolean) => {
  const ancestorLocked = isItemLocked(group.id) && !group.isLocked;
  if (ancestorLocked) {
    Logger.warn(`[Store/Lock] グループ「${group.name}」は祖先グループがロック中のため、ロック状態を変更できません。`);
    return;
  }
  state.selectedProfileName = "";
  if (forceVal !== undefined) {
    group.isLocked = forceVal;
  } else {
    group.isLocked = !group.isLocked;
  }
  await savePrompts();
};

/**
 * グループの非表示状態をトグルする (グループ非表示機能)
 * ロック中のグループは変更できない (他のグループ設定変更と同様の扱い)
 */
export const toggleGroupHidden = async (group: PsmItem, forceVal?: boolean) => {
  if (isItemLocked(group.id)) return;
  state.selectedProfileName = "";
  if (forceVal !== undefined) {
    group.isHidden = forceVal;
  } else {
    group.isHidden = !group.isHidden;
  }
  await savePrompts();
};

/**
 * アイテムを複製し、元のアイテムのすぐ下に追加する
 * クリップボードを経由せず即座に反映されます。
 */
export const duplicateItem = async (item: PsmItem, parentChildren: PsmItem[]) => {
  if (isItemLocked(item.id)) return;
  state.selectedProfileName = "";
  const idx = parentChildren.indexOf(item);
  if (idx === -1) return;
  const newItem = cloneNodeRecursive(item);
  if (newItem.is_group) {
    newItem.name = newItem.name ? `${newItem.name} (copy)` : "New Group (copy)";
  } else {
    newItem.name = newItem.name ? `${newItem.name} (copy)` : "";
    if (!newItem.name && newItem.content)
      newItem.memo = newItem.memo ? `${newItem.memo} (cloned)` : "(cloned)";
  }
  parentChildren.splice(idx + 1, 0, newItem);
  await savePrompts();
};

/**
 * 削除確認モーダルを表示（開始）する
 * @param item 削除対象のアイテム
 * @param parentList 親リスト（削除後のリスト更新に用いる）
 */
export const startDeleteConfirm = (item: PsmItem, parentList?: PsmItem[]) => {
  if (isItemLocked(item.id)) return;
  state.deletingItem = JSON.parse(JSON.stringify(item));
  state.deleteTargetParent = parentList || null;
  state.isDeleteConfirmMode = true; // Still keeping for backward compat if needed, but mainly using isDeleting
  state.isDeleting = true;
  // フォーカスはコンポーネント側のwatchで制御されるためここでは設定しない
};

/**
 * 削除処理をキャンセルし、モーダルを閉じる
 */
export const cancelDelete = () => {
  state.isDeleting = false;
  state.deletingItem = null;
  state.deleteTargetParent = null;
  state.isDeleteConfirmMode = false;
};

/**
 * 新規アイテム（グループまたはプロンプト）をリストに追加し、編集モードを開始する
 * @param list 追加先のリスト
 * @param is_group グループを作成する場合はtrue
 * @param atIndex 指定がある場合、そのインデックスに挿入。省略時は末尾に追加。
 */
export const addItem = (list: PsmItem[], is_group: boolean, atIndex?: number) => {
  if (isListLocked(list)) return;
  const newItem: PsmItem = {
    id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
    name: "",
    content: "",
    enabled: true,
    weight: 1.0,
    memo: "",
    is_group,
    isOpen: true,
    children: is_group ? [] : undefined,
  };
  if (typeof atIndex === "number") list.splice(atIndex, 0, newItem);
  else list.push(newItem);
  startEdit(newItem);
};

/**
 * 既存アイテムの編集を開始する（モーダルを表示）
 * @param item 編集対象のアイテム
 */
export const startEdit = (item: PsmItem) => {
  if (isItemLocked(item.id)) return;
  state.isDeleteConfirmMode = false;
  state.isNewItem = !item.name && !item.content;
  state.editingItem = JSON.parse(JSON.stringify(item));
  state.isEditing = true;
};

/**
 * 編集内容を確定し、ツリーに反映して保存する
 * 成功時にはモーダルを閉じる
 */
export const finishEdit = async () => {
  if (!state.editingItem) return;
  if (isItemLocked(state.editingItem.id)) return;
  state.selectedProfileName = "";
  try {
    const updateTree = (nodes: PsmItem[]) => {
      for (let i = 0; i < nodes.length; i++) {
        if (!nodes[i]) continue; // ガード句: null除外
        if (nodes[i].id == state.editingItem!.id) {
          nodes[i] = JSON.parse(JSON.stringify(state.editingItem));
          return true;
        }
        if (nodes[i].is_group && nodes[i].children && updateTree(nodes[i].children!)) return true;
      }
      return false;
    };
    updateTree(state.positive);
    updateTree(state.negative);
    
    // 同期的な非楽観的更新に戻す (削除ロジックとの整合性)
    await savePrompts();

    // 成功後に閉じる
    state.isEditing = false;
    // 成功後に閉じる
    state.isEditing = false;
  } catch (e) {
    Logger.error("[Store/Edit] 編集内容の保存処理中にエラーが発生しました。", e);
    // 保存失敗時は閉じないことでユーザーに気付きを与える
    alert("Failed to save changes. Check console for details.");
  }
};

/**
 * 編集をキャンセルする
 * 新規作成中にキャンセルされた場合は、作成した空ノードを削除する
 */
export const cancelEdit = () => {
  if (state.isNewItem && state.editingItem) {
    const walk = (nodes: PsmItem[]): boolean => {
      const idx = nodes.findIndex((n) => n && n.id === state.editingItem!.id);
      if (idx !== -1) {
        nodes.splice(idx, 1);
        return true;
      }
      return nodes.some((n) => n && n.is_group && n.children && walk(n.children));
    };
    walk(state.positive);
    walk(state.negative);
  }
  state.isEditing = false;
};

/**
 * 指定されたアイテムをツリーから削除し、その後永続化する
 * @param item 削除対象のアイテム
 * @param mode "all": アイテムごと削除, "only": グループ枠のみ削除し子は親に昇格
 */
export const deleteItemFromTree = async (item: PsmItem, mode: "all" | "only") => {
  if (isItemLocked(item.id)) return;
  state.selectedProfileName = "";
  const findAndRemove = (list: PsmItem[]): boolean => {
    // Use loose equality just in case of type drift
    const idx = list.findIndex(n => n && n.id == item.id);
    if (idx !== -1) {
      if (mode === "only" && item.is_group && item.children) {
        list.splice(idx, 1, ...item.children); // Promote children
      } else {
        list.splice(idx, 1); // Delete completely
      }
      return true;
    }
    // Recursive search in children
    for (const node of list) {
      if (!node) continue; // ガード句: null除外
      if (node.is_group && node.children) {
        if (findAndRemove(node.children)) return true;
      }
    }
    return false;
  };

  const foundPos = findAndRemove(state.positive);
  if (!foundPos) {
    findAndRemove(state.negative);
  }

  await savePrompts();
  state.isEditing = false; // Just in case
  cancelDelete(); // Reset delete state
};



// グループの有効無効切り替え（子要素自体のenabledは変更せず、親の状態が計算プロパティで反映される）
export const toggleGroupEnabled = async (group: PsmItem) => {
  if (isItemLocked(group.id)) return;
  state.selectedProfileName = "";
  group.enabled = !group.enabled;
  await savePrompts();
};

/**
 * アイテムの有効/無効状態をトグルする
 * 親グループが排他選択（isExclusive）の場合は、他の兄弟要素をすべて無効化する
 */
export const toggleItemEnabled = async (item: PsmItem, parentChildren: PsmItem[], parentGroup?: PsmItem) => {
  if (isItemLocked(item.id)) return;
  state.selectedProfileName = "";
  item.enabled = !item.enabled;
  
  if (item.enabled && parentGroup?.isExclusive) {
    // 他のすべての兄弟要素を無効化
    for (const sibling of parentChildren) {
      if (sibling.id !== item.id) {
        sibling.enabled = false;
      }
    }
  }
  await savePrompts();
};

/**
 * グループの排他選択（isExclusive）のトグルを処理する
 * ONにされた場合、すでに複数有効なものがあれば最初の1つだけを残して無効化する
 */
export const toggleGroupExclusive = async (group: PsmItem, forceVal?: boolean) => {
  if (isItemLocked(group.id)) return;
  state.selectedProfileName = "";
  if (forceVal !== undefined) {
    group.isExclusive = forceVal;
  } else {
    group.isExclusive = !group.isExclusive;
  }
  
  if (group.isExclusive && group.children) {
    let hasEnabled = false;
    for (const child of group.children) {
      if (child.enabled) {
        if (hasEnabled) {
          child.enabled = false;
        } else {
          hasEnabled = true;
        }
      }
    }
  }
  await savePrompts();
};

/**
 * プロンプトアイテムの重み（weight）を 1.0 にリセットする
 */
export const resetWeight = async (item: PsmItem) => {
  if (isItemLocked(item.id)) return;
  state.selectedProfileName = "";
  item.weight = 1.0;
  await savePrompts();
};

/**
 * ツリー全体から各アイテムの状態（id, enabled, weight）を収集するヘルパー関数
 */
const collectStates = (nodes: PsmItem[]): PsmProfileState[] => {
  const result: PsmProfileState[] = [];
  const walk = (items: PsmItem[]) => {
    for (const item of items) {
      if (!item) continue;
      result.push({
        id: item.id,
        enabled: item.enabled,
        weight: item.weight
      });
      if (item.is_group && item.children) {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return result;
};

/**
 * 現在の状態のスナップショットを指定の名前でプロファイルとして保存する
 */
export const saveProfile = async (name: string) => {
  if (!name.trim()) return;
  const states = [
    ...collectStates(state.positive),
    ...collectStates(state.negative)
  ];
  
  const existingIdx = state.profiles.findIndex(p => p.name === name);
  if (existingIdx !== -1) {
    state.profiles[existingIdx].states = states;
  } else {
    state.profiles.push({ name, states });
  }
  state.selectedProfileName = name;
  await savePrompts();
};

/**
 * 保存されている状態スナップショット（プロファイル）をツリー全体に高速適用する
 */
export const applyProfile = async (name: string) => {
  console.debug(`[PSM][Store/Profile] プロファイル「${name}」の適用処理を開始します。`);
  const profile = state.profiles.find(p => p.name === name);
  if (!profile) {
    console.warn(`[PSM][Store/Profile] 指定されたプロファイル「${name}」が見つかりませんでした。適用をスキップします。`);
    return;
  }
  
  // 適用されるプロファイル定義の詳細情報を折りたたんでテーブル表示
  console.groupCollapsed(`[PSM][Store/Profile] プロファイル「${name}」からロードされた状態定義の詳細情報を展開します。`);
  console.debug(`[PSM] 状態定義数: ${profile.states.length} 件`);
  console.table(profile.states);
  console.groupEnd();
  
  const stateMap = new Map<number, { enabled: boolean; weight: number }>();
  for (const s of profile.states) {
    stateMap.set(s.id, { enabled: s.enabled, weight: s.weight });
  }
  
  let appliedCount = 0;
  const walk = (items: PsmItem[]) => {
    for (const item of items) {
      if (!item) continue;
      const snap = stateMap.get(item.id);
      if (snap) {
        item.enabled = snap.enabled;
        item.weight = snap.weight;
        appliedCount++;
      }
      if (item.is_group && item.children) {
        walk(item.children);
      }
    }
  };
  
  walk(state.positive);
  walk(state.negative);
  
  console.debug(`[PSM][Store/Profile] プロファイル「${name}」の適用が完了しました。（適用ノード数: ${appliedCount} 件）`);
  
  state.selectedProfileName = name;
  await savePrompts();
};

/**
 * 指定された名前のプロファイルを削除する
 */
export const deleteProfile = async (name: string) => {
  const idx = state.profiles.findIndex(p => p.name === name);
  if (idx !== -1) {
    state.profiles.splice(idx, 1);
    if (state.selectedProfileName === name) {
      state.selectedProfileName = "";
    }
    await savePrompts();
  }
};

// -------------------------------------------------------------------------
// 生成設定プロファイル (Phase 6: Checkpoint/VAE/Sampler等のWebUI生成設定)
// プロンプトのメインYAMLとは独立した generation_profiles.json に保存される
// -------------------------------------------------------------------------

/**
 * サーバーから生成設定プロファイル一覧を読み込む (アプリ起動時に一度呼び出す)
 */
export const loadGenerationProfiles = async () => {
  try {
    const res = await fetch("/psm/generation-profiles");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.generationProfiles = Array.isArray(data.profiles) ? data.profiles : [];
    Logger.debug(`[Store/GenerationProfile] 生成設定プロファイルを読み込みました。(${state.generationProfiles.length} 件)`);
  } catch (e) {
    Logger.error("[Store/GenerationProfile] 生成設定プロファイルの読み込みに失敗しました。", e);
  }
};

const saveGenerationProfilesToServer = async () => {
  try {
    const res = await fetch("/psm/generation-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profiles: state.generationProfiles }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    Logger.error("[Store/GenerationProfile] 生成設定プロファイルの保存に失敗しました。", e);
  }
};

/**
 * 現在のWebUIの状態から、指定されたフィールドのみを名前を付けて保存する
 * @param name プロファイル名
 * @param fields 保存対象として選択されたフィールドID一覧
 */
export const saveGenerationProfile = async (name: string, fields: GenerationFieldId[]) => {
  if (!name.trim() || fields.length === 0) return;
  const settings = captureGenerationSettings(fields);
  const profile: PsmGenerationProfile = {
    name,
    fields,
    settings,
    updatedAt: new Date().toISOString(),
  };

  const existingIdx = state.generationProfiles.findIndex(p => p.name === name);
  if (existingIdx !== -1) {
    state.generationProfiles[existingIdx] = profile;
  } else {
    state.generationProfiles.push(profile);
  }
  await saveGenerationProfilesToServer();
  Logger.info(`[Store/GenerationProfile] 生成設定プロファイル「${name}」を保存しました。(項目: ${fields.join(", ")})`);
};

/**
 * 生成設定プロファイルをWebUIへ適用する。
 * 各項目のDOM要素が見つからない等の理由で書き換えに失敗した場合は
 * skippedFields として返すため、呼び出し側で「適用に失敗した」等のメッセージに利用できる。
 */
export const applyGenerationProfile = async (name: string): Promise<{ appliedFields: GenerationFieldId[]; skippedFields: GenerationFieldId[] }> => {
  const profile = state.generationProfiles.find(p => p.name === name);
  const result = { appliedFields: [] as GenerationFieldId[], skippedFields: [] as GenerationFieldId[] };
  if (!profile) {
    Logger.warn(`[Store/GenerationProfile] 指定された生成設定プロファイル「${name}」が見つかりませんでした。`);
    return result;
  }

  const prefix = getActiveTabPrefix();
  for (const id of profile.fields) {
    const def = GENERATION_FIELDS.find(f => f.id === id);
    const value = profile.settings[id];
    if (!def || value === undefined) continue;
    const ok = def.apply(prefix, value);
    if (ok) {
      result.appliedFields.push(id);
    } else {
      result.skippedFields.push(id);
    }
  }

  Logger.info(`[Store/GenerationProfile] 生成設定プロファイル「${name}」を適用しました。(適用: ${result.appliedFields.join(", ") || "なし"} / 失敗: ${result.skippedFields.join(", ") || "なし"})`);
  state.selectedGenerationProfileName = name;
  return result;
};

/**
 * 指定された名前の生成設定プロファイルを削除する
 */
export const deleteGenerationProfile = async (name: string) => {
  const idx = state.generationProfiles.findIndex(p => p.name === name);
  if (idx !== -1) {
    state.generationProfiles.splice(idx, 1);
    if (state.selectedGenerationProfileName === name) {
      state.selectedGenerationProfileName = "";
    }
    await saveGenerationProfilesToServer();
  }
};


/**
 * グループ内の子要素すべての enabled 状態を一括変更する
 * @param group 対象グループ
 * @param enabled true: 有効化, false: 無効化
 */
export const setGroupChildrenEnabled = async (group: PsmItem, enabled: boolean) => {
  if (isItemLocked(group.id)) return;
  state.selectedProfileName = "";
  if (!group.children) return;
  const walk = (nodes: PsmItem[]) => {
    for (const node of nodes) {
      if (!node) continue;
      node.enabled = enabled;
      // 再帰的に設定するか？一旦直下だけでなく全子孫に適用するのが「一括」として自然
      if (node.is_group && node.children) {
        walk(node.children);
      }
    }
  };
  walk(group.children);
  await savePrompts();
};

/**
 * ローディング表示を開始するヘルパー関数
 */
export const startLoading = (textKey: string) => {
  if (state.loadingCount === 0) {
    state.loadingText = textKey;
    state.isLoading = true;
  }
  state.loadingCount++;
};

/**
 * ローディング表示を終了するヘルパー関数
 */
export const stopLoading = () => {
  state.loadingCount--;
  if (state.loadingCount <= 0) {
    state.loadingCount = 0;
    state.isLoading = false;
    state.loadingText = "";
  }
};

/**
 * サーバーからYAMLファイル一覧を取得する
 * 取得後、選択中のファイルがなければ自動的に最初のファイルを選択する
 */
export const listFiles = async () => {
  startLoading("loading");
  try {
    const res = await fetch("/psm/list-files");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.yamlFiles = data.files;
    
    // last_fileがあればそれを選択
    if (!state.selectedFile) {
       if (state.lastFile && state.yamlFiles.includes(state.lastFile)) {
         state.selectedFile = state.lastFile;
         await loadPrompts();
       }
       // Fallback removed to allow unselected state on directory change
    }
    Logger.debug("[Store/Data] サーバーから取得したYAMLファイルの一覧を読み込みました。", state.yamlFiles);
  } catch (e) {
    Logger.error("[Store/Data] サーバーからのYAMLファイル一覧取得処理に失敗しました。", e);
  } finally {
    stopLoading();
  }
};

/**
 * 選択中のYAMLファイルからプロンプト構造を読み込む
 */
export const loadPrompts = async () => {
  if (!state.selectedFile) return;
  startLoading("loading");
  try {
    Logger.debug(`[Store/Data] ファイル「${state.selectedFile}」からのプロンプト読み込み処理を開始します。`);
    const res = await fetch(`/psm/get-prompts?file=${state.selectedFile}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.positive = (data.positive || []).filter((i: PsmItem) => i != null);
    state.negative = (data.negative || []).filter((i: PsmItem) => i != null);
    state.profiles = data.profiles || [];
    state.modelMode = data.model_mode === "anima" ? "anima" : "sd"; // 未定義は "sd" (後方互換)
    state.selectedProfileName = "";
    
    // 読み込まれたプロンプトデータの要約をテーブルとグループで可視化
    console.groupCollapsed(`[PSM][Store/Data] ファイル「${state.selectedFile}」から読み込まれたプロンプトツリー構造の要約を展開します。`);
    console.debug(`[PSM][Store/Data] 読み込まれたPositiveプロンプトのノード数: ${state.positive.length} 件`);
    console.debug(`[PSM][Store/Data] 読み込まれたNegativeプロンプトのノード数: ${state.negative.length} 件`);
    if (state.profiles.length > 0) {
      console.debug(`[PSM][Store/Data] ファイル内から検出されたプロファイルの一覧です。`);
      console.table(state.profiles.map(p => ({ "プロファイル名": p.name, "定義状態数": p.states.length })));
    }
    console.groupEnd();

    // last_fileを保存
    if (state.selectedFile !== state.lastFile) {
      state.lastFile = state.selectedFile;
      saveSettingsLocal();
    }
    Logger.info(`[Store/Data] ファイル「${state.selectedFile}」からプロンプトデータを正常に読み込みました。`);
  } catch (e) {
    Logger.error("[Store/Data] 選択されたYAMLファイルからのプロンプト読み込みに失敗しました。", e);
  } finally {
    stopLoading();
  }
};

/**
 * 現在の状態（Positive/Negativeツリー）をYAMLファイルに保存する
 */
export const savePrompts = async () => {
  if (!state.selectedFile) return;
  try {
    Logger.debug(`[Store/Data] 現在のプロンプト状態をファイル「${state.selectedFile}」へ保存する処理を開始します。`);
    const res = await fetch("/psm/save-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: state.selectedFile,
        positive: state.positive,
        negative: state.negative,
        profiles: state.profiles,
        model_mode: state.modelMode,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    Logger.debug("[Store/Data] プロンプトデータをファイルへ正常に書き込みました。");
  } catch (e) {
    Logger.error("[Store/Data] プロンプトデータのファイル保存に失敗しました。", e);
  }
};

/**
 * Anima向けの初期テンプレートツリーを生成する (Phase 3)
 * カテゴリ設定済みのグループ雛形と、Anima公式推奨の品質タグ/ネガティブを含む
 */
export const buildAnimaTemplate = (): { positive: PsmItem[]; negative: PsmItem[] } => {
  let seq = 0;
  const nextId = () => Date.now() * 1000 + (seq++); // 連番で同ミリ秒内の衝突を防止
  const item = (content: string): PsmItem => ({
    id: nextId(), name: "", content, enabled: true, weight: 1.0, memo: "", is_group: false,
  });
  const group = (name: string, category: PsmCategory, children: PsmItem[]): PsmItem => ({
    id: nextId(), name, content: "", enabled: true, weight: 1.0, memo: "",
    is_group: true, isOpen: true, category, children,
  });

  return {
    positive: [
      group("品質", "quality", [item("masterpiece"), item("best quality"), item("score_7"), item("safe")]),
      group("年代", "quality", [item("newest")]),
      group("主体", "subject", [item("1girl")]),
      group("キャラクター", "character", []),
      group("作品", "series", []),
      group("絵師 (@付き)", "artist", []),
      group("一般", "general", []),
    ],
    negative: [
      group("品質 (Negative)", "quality", [
        item("worst quality"), item("low quality"),
        item("score_1"), item("score_2"), item("score_3"),
        item("artist name"),
      ]),
    ],
  };
};

/**
 * 新しいYAMLファイルを作成し、それを選択状態にする
 * @param name ファイル名 (拡張子なしでも可)
 * @param withAnimaTemplate trueの場合、Animaテンプレート(model_mode: anima + 雛形ツリー)で初期化する
 */
export const createYamlFile = async (name: string, withAnimaTemplate = false) => {
  startLoading("saving");
  try {
    const filename = name.endsWith(".yaml") ? name : `${name}.yaml`;
    const template = withAnimaTemplate ? buildAnimaTemplate() : { positive: [], negative: [] };
    const payload: Record<string, unknown> = {
      file: filename,
      positive: template.positive,
      negative: template.negative,
    };
    if (withAnimaTemplate) {
      payload.model_mode = "anima";
    }
    await fetch("/psm/save-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await listFiles();
    state.selectedFile = filename;
    await loadPrompts();
  } finally {
    stopLoading();
  }
};

/**
 * 現在のファイルを別名で複製保存する
 * @param n 新しいファイル名
 */
export const duplicateCurrentFile = async (n: string) => {
  startLoading("saving");
  try {
    const fn = n.endsWith(".yaml") ? n : `${n}.yaml`;
    await fetch("/psm/duplicate-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src: state.selectedFile, dst: fn }),
    });
    await listFiles();
    state.selectedFile = fn;
    await loadPrompts();
  } finally {
    stopLoading();
  }
};

/**
 * 現在のファイルをリネームする
 * @param n 新しいファイル名
 */
export const renameCurrentFile = async (n: string) => {
  startLoading("saving");
  try {
    const fn = n.endsWith(".yaml") ? n : `${n}.yaml`;
    await fetch("/psm/rename-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src: state.selectedFile, dst: fn }),
    });
    await listFiles();
    state.selectedFile = fn;
  } finally {
    stopLoading();
  }
};

/**
 * 現在のファイルを削除する
 */
export const deleteCurrentFile = async () => {
  startLoading("saving");
  try {
    await fetch(`/psm/delete-file?file=${state.selectedFile}`, {
      method: "DELETE",
    });
    state.selectedFile = "";
    await listFiles();
    await loadPrompts();
  } finally {
    stopLoading();
  }
};



/**
 * グローバル設定をサーバから読み込む（初期化時）
 */
// ローカルストレージキー
const LS_KEY = "psm_settings";

export const loadSettingsLocal = () => {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data.ui_scale) state.uiScale = data.ui_scale;
      if (data.lang) state.lang = data.lang;
      if (data.last_file) {
        state.lastFile = data.last_file;
        // ファイルリスト取得前なのでセットだけしておく
        // listFiles内で反映される
      }
      if (data.sidebar_open !== undefined) state.isSidebarOpen = data.sidebar_open;
      if (data.toggle_shortcut) state.toggleShortcut = data.toggle_shortcut;
      if (data.duplicate_check_mode) state.duplicateCheckMode = data.duplicate_check_mode;
      if (data.show_weight_slider !== undefined) state.showWeightSlider = data.show_weight_slider;
      if (data.show_hidden_groups !== undefined) state.showHiddenGroups = data.show_hidden_groups;
      if (Array.isArray(data.recent_move_targets)) {
        state.recentMoveTargets = data.recent_move_targets.slice(0, RECENT_MOVE_LIMIT);
      }
    } catch (e) {
      Logger.error("[Store/Settings] ローカル設定（LocalStorage）の読み込みに失敗しました。", e);
    }
  }
};

export const saveSettingsLocal = () => {
  const data = {
    ui_scale: state.uiScale,
    lang: state.lang,
    last_file: state.selectedFile || state.lastFile,
    sidebar_open: state.isSidebarOpen,
    toggle_shortcut: state.toggleShortcut,
    duplicate_check_mode: state.duplicateCheckMode,
    show_weight_slider: state.showWeightSlider,
    show_hidden_groups: state.showHiddenGroups,
    recent_move_targets: state.recentMoveTargets,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(data));
};

// -------------------------------------------------------------------------
// 翻訳設定 (Phase 2.5)
// APIキーを含むため psm_settings とはキーを分離し、エクスポート系機能に巻き込まない
// -------------------------------------------------------------------------

/**
 * PSM APIのHTTPエラーを分かりやすいメッセージに変換する
 * 404は「バックエンド未登録 = WebUI再起動が必要」を意味することが多いため明示する
 */
const apiHttpError = (status: number, endpoint: string): Error => {
  if (status === 404) {
    return new Error(
      `APIが見つかりません (404: ${endpoint})。Python側の更新を反映するにはWebUIの再起動が必要です。`
    );
  }
  return new Error(`HTTP ${status} (${endpoint})`);
};

const TRANSLATE_LS_KEY = "psm_translate_settings";

/** 翻訳プロファイルの既定値を生成する */
const defaultTranslateProfile = (kind: "local" | "cloud"): TranslateProfile => {
  if (kind === "local") {
    return {
      provider: "openai",
      endpoint: "http://localhost:11434/v1",
      model: "qwen3:4b",
      api_key: "",
      timeout_sec: 30,
      system_prompt: "",
    };
  }
  return {
    provider: "openai",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    api_key: "",
    timeout_sec: 30,
    system_prompt: "",
  };
};

/** 翻訳設定の既定値を生成する */
export const defaultTranslateSettings = (): TranslateSettings => ({
  active: "local",
  local: defaultTranslateProfile("local"),
  cloud: defaultTranslateProfile("cloud"),
});

/** UIプリセット定義 (選択中プロファイルへ反映する部分設定) */
export const TRANSLATE_PRESETS: Record<string, Partial<TranslateProfile>> = {
  ollama:     { provider: "openai", endpoint: "http://localhost:11434/v1", model: "qwen3:4b" },
  // LM Studio はロード済みモデルの識別子が必須 (GET /v1/models の "id" を入力する)
  lmstudio:   { provider: "openai", endpoint: "http://localhost:1234/v1", model: "" },
  openai:     { provider: "openai", endpoint: "https://api.openai.com/v1", model: "gpt-5-mini" },
  openrouter: { provider: "openai", endpoint: "https://openrouter.ai/api/v1", model: "" },
  deepl:      { provider: "deepl", endpoint: "https://api-free.deepl.com/v2", model: "" },
};

/** 翻訳設定を localStorage から読み込む (欠損キーは既定値で補完) */
export const loadTranslateSettings = () => {
  const defaults = defaultTranslateSettings();
  try {
    const raw = localStorage.getItem(TRANSLATE_LS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.translateSettings = {
        active: data.active === "cloud" ? "cloud" : "local",
        local: { ...defaults.local, ...(data.local || {}) },
        cloud: { ...defaults.cloud, ...(data.cloud || {}) },
      };
      return;
    }
  } catch (e) {
    Logger.error("[Store/Translate] 翻訳設定 (LocalStorage) の読み込みに失敗しました。既定値を使用します。", e);
  }
  state.translateSettings = defaults;
};

/** 翻訳設定を localStorage へ保存する */
export const saveTranslateSettings = () => {
  if (!state.translateSettings) return;
  try {
    localStorage.setItem(TRANSLATE_LS_KEY, JSON.stringify(state.translateSettings));
  } catch (e) {
    Logger.error("[Store/Translate] 翻訳設定 (LocalStorage) の保存に失敗しました。", e);
  }
};

/** 現在アクティブな翻訳プロファイルを返す */
export const getActiveTranslateProfile = (): TranslateProfile => {
  if (!state.translateSettings) loadTranslateSettings();
  const s = state.translateSettings!;
  return s[s.active];
};

/**
 * 原文を英語へ翻訳する (Phase 2.5)
 * バックエンド /psm/translate へアクティブプロファイルの設定を同送する
 * @returns 翻訳結果テキスト
 * @throws Error 失敗時 (message はUI表示用)
 */
export const translateText = async (text: string): Promise<string> => {
  const profile = getActiveTranslateProfile();
  state.isTranslating = true;
  try {
    const res = await fetch("/psm/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, config: profile }),
    });
    if (!res.ok) throw apiHttpError(res.status, "/psm/translate");
    const data = await res.json();
    if (data.status !== "success" || !data.text) {
      throw new Error(data.message || "翻訳に失敗しました。");
    }
    Logger.debug("[Store/Translate] 翻訳が完了しました。", { in: text.length, out: data.text.length });
    return data.text;
  } finally {
    state.isTranslating = false;
  }
};

// -------------------------------------------------------------------------
// タグ名の日本語化 (英語 → 日本語のバッチ翻訳)
// -------------------------------------------------------------------------

/** タグ名翻訳用のシステムプロンプト (プロファイルのsystem_promptを上書きして使用) */
const NAME_TRANSLATE_SYSTEM_PROMPT =
  "You translate English image-generation tags into Japanese. " +
  "The user gives a numbered list. Output ONLY the translations, one per line, " +
  "in the exact format 'N. 翻訳' keeping the same numbering and order. " +
  "Keep each translation short (a noun phrase). No explanations, no extra lines.";

/** 1リクエストあたりのタグ数 (多すぎると番号ズレ・欠落が起きやすいため小分けにする) */
const NAME_TRANSLATE_CHUNK = 20;

/**
 * 英語タグの配列を日本語へバッチ翻訳する
 * 番号付きリストで一括依頼し、行頭番号で元の配列に対応付ける。
 * 対応が取れなかった要素は空文字を返す (呼び出し側でスキップする)
 */
export const translateTagNames = async (tags: string[]): Promise<string[]> => {
  const profile = getActiveTranslateProfile();
  const result: string[] = new Array(tags.length).fill("");

  state.translateProgress = { done: 0, total: tags.length };
  state.isTranslating = true;
  try {
    for (let start = 0; start < tags.length; start += NAME_TRANSLATE_CHUNK) {
      const chunk = tags.slice(start, start + NAME_TRANSLATE_CHUNK);
      const numbered = chunk.map((t, i) => `${i + 1}. ${t}`).join("\n");

      const res = await fetch("/psm/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: numbered,
          config: {
            ...profile,
            // タグ名は英語→日本語なので、翻訳方向を上書きする
            system_prompt: NAME_TRANSLATE_SYSTEM_PROMPT,
            target_lang: "JA",
          },
        }),
      });
      if (!res.ok) throw apiHttpError(res.status, "/psm/translate");
      const data = await res.json();
      if (data.status !== "success" || !data.text) {
        throw new Error(data.message || "翻訳に失敗しました。");
      }

      // 行頭の番号で対応付ける (番号が無い/ズレた行は無視する)
      for (const line of String(data.text).split("\n")) {
        const m = line.match(/^\s*(\d+)\s*[.):、]?\s*(.+?)\s*$/);
        if (!m) continue;
        const idx = parseInt(m[1], 10) - 1;
        if (idx >= 0 && idx < chunk.length && !result[start + idx]) {
          result[start + idx] = m[2].trim();
        }
      }

      state.translateProgress = {
        done: Math.min(start + chunk.length, tags.length),
        total: tags.length,
      };
    }
  } finally {
    state.isTranslating = false;
    state.translateProgress = { done: 0, total: 0 };
  }

  return result;
};

/**
 * アイテム配列のタグを日本語訳して name (表示用) に設定する
 * 既に名前があるアイテム・自然言語アイテム・特殊構文はスキップする
 */
export const applyTranslatedNames = async (items: PsmItem[]): Promise<number> => {
  const isSpecial = (c: string) =>
    /^<.+>$/.test(c) || /^__.+__$/.test(c) || /^break$/i.test(c);

  // 対象アイテムを収集 (グループ配下も対象)
  const targets: PsmItem[] = [];
  const walk = (nodes: PsmItem[]) => {
    for (const n of nodes) {
      if (!n) continue;
      if (n.is_group && n.children) walk(n.children);
      else if (!n.is_group && !n.isNatural && !n.name?.trim() && n.content && !isSpecial(n.content.trim())) {
        targets.push(n);
      }
    }
  };
  walk(items);
  if (!targets.length) return 0;

  const names = await translateTagNames(targets.map((t) => t.content.trim()));
  let applied = 0;
  targets.forEach((item, i) => {
    const name = names[i];
    if (name) {
      item.name = name;
      applied++;
    }
  });
  Logger.info(`[Store/Translate] タグ名の日本語化を適用しました。(${applied}/${targets.length}件)`);
  return applied;
};

/**
 * グローバル設定をサーバから読み込む（初期化時）
 */
export const loadConfig = async () => {
  try {
    const res = await fetch("/psm/get-config");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.configDir = data.save_dir || "";
    state.isConfigured = data.is_configured;
    // 開発モード設定の読み込み
    if(data.dev_mode !== undefined) {
      state.isDevMode = data.dev_mode;
      setDebugMode(state.isDevMode);
    }
    
    // LocalStorageからも読み込む
    loadSettingsLocal();
    loadTranslateSettings();
    Logger.info(`[Store/Config] サーバーからグローバル設定を読み込みました。(セットアップ完了状況: ${state.isConfigured}, デバッグモード: ${state.isDevMode})`);
  } catch (e) {
    Logger.error("[Store/Config] サーバーからのグローバル設定読み込みに失敗しました。", e);
  }
};

/**
 * 設定（保存ディレクトリ等）を保存する
 * @param dir 保存先ディレクトリ
 */
export const saveConfig = async (dir: string) => {
  try {
    // ディレクトリ変更時は状態をリセットする
    state.selectedFile = "";
    state.positive = [];
    state.negative = [];
    state.yamlFiles = [];
    state.lastFile = ""; // Clear last file memory
    saveSettingsLocal(); // Persist

    await fetch("/psm/set-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        save_dir: dir, 
        dev_mode: state.isDevMode
      }),
    });
    // Update debug mode immediately
    setDebugMode(state.isDevMode);
    await loadConfig();
    await listFiles(); // 新しいディレクトリの内容を反映
    Logger.info("[Store/Config] 新しい設定をサーバーへ保存し、YAMLファイル一覧を再読み込みしました。");
  } catch (e) {
    Logger.error("[Store/Config] サーバーへの設定保存に失敗しました。", e);
  }
};

/**
 * サイドバーの開閉状態を切り替え、保存する
 */
export const toggleSidebar = async () => {
  state.isSidebarOpen = !state.isSidebarOpen;
  saveSettingsLocal();
};

/**
 * 「非表示グループの表示」設定をトグルし、即時保存する
 * Positive/Negative両ペインで共有されるグローバル設定
 */
export const toggleShowHiddenGroups = () => {
  state.showHiddenGroups = !state.showHiddenGroups;
  saveSettingsLocal();
};

/**
 * UIのスケールを設定し、即時保存する
 * @param scale "small" | "medium" | "large"
 */
export const setUiScale = async (scale: "small" | "medium" | "large") => {
  state.uiScale = scale;
  saveSettingsLocal();
};

export const pickDirectory = async () => {
  try {
    const res = await fetch("/psm/pick-dir");
    const data = await res.json();
    if (data.path) {
      state.configDir = data.path;
      await saveConfig(state.configDir);
      // listFiles is strictly called within saveConfig now
    }
  } catch (e) {
    Logger.error("[Store/Config] フォルダ選択ダイアログの起動、またはパスの取得に失敗しました。", e);
  }
};



// WebUI (Automatic1111/Forge) のテキストエリアからプロンプトを取得
/**
 * WebUI (Automatic1111/Forge) の画面上から現在のプロンプトを取得する
 * メインのtxt2img/img2img画面からDOM経由で値を取得
 */
export const getWebUIData = () => {
  const prefix = getActiveTabPrefix();
  const getVal = (id: string) =>
    (
      document
        .querySelector(`#${prefix}_${id}`)
        ?.querySelector("textarea") as HTMLTextAreaElement
    )?.value || "";
  return {
    positive: parsePrompts(getVal("prompt")),
    negative: parsePrompts(getVal("neg_prompt")),
  };
};

const parsePrompts = (raw: string): PsmItem[] => {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s)
    .map((s) => ({
      id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
      name: "",
      content: s,
      enabled: true,
      weight: 1.0,
      memo: "",
      is_group: false,
    }));
};

// -------------------------------------------------------------------------
// PNG Info / infotext の取込
// -------------------------------------------------------------------------

export interface ParsedInfotext {
  positive: string;
  negative: string;
  /** Steps / Sampler / CFG scale などの生成パラメータ */
  params: Record<string, string>;
}

/** 生成パラメータ行と判定するためのキー (この語で始まる行はパラメータ扱い) */
const INFOTEXT_PARAM_HEAD = /^(Steps|Sampler|Schedule type|CFG scale|Seed|Size|Model|Denoising strength|Clip skip|Distilled CFG Scale|Hires|Version)\s*:/i;

/**
 * PNG Info (infotext) 文字列を解析する (純関数)
 *
 * 想定フォーマット:
 *   <positive prompt (複数行可)>
 *   Negative prompt: <negative prompt (複数行可)>
 *   Steps: 20, Sampler: Euler a, CFG scale: 7, ...
 *
 * Negative prompt 行・パラメータ行はいずれも省略可能。
 */
export const parseInfotext = (raw: string): ParsedInfotext => {
  const result: ParsedInfotext = { positive: "", negative: "", params: {} };
  if (!raw || !raw.trim()) return result;

  const lines = raw.replace(/\r\n?/g, "\n").split("\n");

  // 末尾からパラメータ行を探す (最終行がパラメータ形式であれば分離する)
  let paramLine = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (INFOTEXT_PARAM_HEAD.test(line)) {
      paramLine = line;
      lines.splice(i, 1);
    }
    break; // 空行以外を1つ見た時点で終了 (プロンプト途中の行は誤検出しない)
  }

  // Negative prompt 行で分割
  const negIdx = lines.findIndex((l) => /^Negative prompt\s*:/i.test(l.trim()));
  if (negIdx >= 0) {
    result.positive = lines.slice(0, negIdx).join("\n").trim();
    const firstNeg = lines[negIdx].replace(/^Negative prompt\s*:/i, "");
    result.negative = [firstNeg, ...lines.slice(negIdx + 1)].join("\n").trim();
  } else {
    result.positive = lines.join("\n").trim();
  }

  // パラメータ行をパース (値内のカンマを含む "Size: 512x512" 等に配慮し key: value 単位で抽出)
  if (paramLine) {
    const re = /([A-Za-z][A-Za-z0-9 _.\-/]*?)\s*:\s*("[^"]*"|[^,]*)(?:,|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(paramLine)) !== null) {
      const key = m[1].trim();
      const value = m[2].trim().replace(/^"|"$/g, "");
      if (key) result.params[key] = value;
    }
  }

  return result;
};

/**
 * プロンプト文字列をPSMアイテム配列へ変換する (純関数)
 *
 * 対応:
 * - 強調構文 `(tag:1.2)` → weight に反映 / `((tag))` `[tag]` → 1.1^n で概算
 * - エスケープされた括弧 `\(` `\)` → 通常の括弧へ復元 (出力時に再エスケープされるため)
 * - `<lora:...>` / `__wildcard__` / `BREAK` はそのまま1アイテムとして保持
 * - 長文 (単語数が多い/句点で終わる) は自然言語アイテム (isNatural) として取り込む
 */
export const parsePromptToItems = (raw: string): PsmItem[] => {
  if (!raw || !raw.trim()) return [];

  let seq = 0;
  const nextId = () => Date.now() * 1000 + ((seq++) % 1000);
  const items: PsmItem[] = [];

  for (const segment of raw.replace(/\r\n?/g, "\n").split(",")) {
    let text = segment.trim().replace(/\n+/g, " ");
    if (!text) continue;

    let weight = 1.0;

    // 保護対象 (LoRA・ワイルドカード・BREAK) はそのまま追加
    const isSpecial = /^<.+>$/.test(text) || /^__.+__$/.test(text) || /^break$/i.test(text);

    if (!isSpecial) {
      // 明示的な重み指定 (tag:1.2)
      const explicit = text.match(/^\((.+):\s*([\d.]+)\)$/);
      if (explicit) {
        text = explicit[1].trim();
        weight = parseFloat(explicit[2]);
      } else {
        // 括弧の重ねがけ: ( ) は 1.1倍、[ ] は 1/1.1倍
        let boost = 0;
        let brackets = 0;
        while (/^\((.*)\)$/.test(text) && !/\\\(/.test(text.slice(0, 2))) {
          text = text.slice(1, -1).trim();
          boost++;
        }
        while (/^\[(.*)\]$/.test(text)) {
          text = text.slice(1, -1).trim();
          brackets++;
        }
        if (boost || brackets) {
          weight = Math.pow(1.1, boost) * Math.pow(1 / 1.1, brackets);
          weight = Math.min(2.0, Math.max(0.1, Math.round(weight * 100) / 100));
        }
      }

      // エスケープされた括弧を復元 (getCompiledPrompts が出力時に再エスケープする)
      text = text.replace(/\\([()])/g, "$1");
    }

    if (!text) continue;

    // 自然言語判定: 句点で終わる、または単語数が多い長文
    const wordCount = text.split(/\s+/).length;
    const isNatural = !isSpecial && (/[.!?]$/.test(text) || wordCount >= 6);

    items.push({
      id: nextId(),
      name: "",
      content: text,
      enabled: true,
      weight,
      memo: "",
      is_group: false,
      ...(isNatural ? { isNatural: true } : {}),
    });
  }

  return items;
};

/** 一般タグのサブグループ表示名 (バックエンドのSUBCATEGORY_RULESのキーに対応) */
const SUBCAT_LABELS: Record<string, string> = {
  hair: "髪",
  face: "顔・表情",
  body: "体・体型",
  clothing: "服装",
  accessory: "装飾品・小物",
  pose: "ポーズ・動作",
  composition: "構図・視点",
  background: "背景・場所",
  lighting: "光・色",
  style: "画風・画材",
  effect: "効果・演出",
  object: "小物・シンボル",
  text: "文字・注記",
};

/** サブグループの並び順 (未定義キーは末尾の「その他」へ) */
const SUBCAT_ORDER = [
  "composition", "face", "hair", "body", "clothing", "accessory",
  "pose", "object", "background", "lighting", "style", "effect", "text",
];

/** 一般グループを細分化する最小件数 (これ未満なら細分化しない) */
const SUBDIVIDE_THRESHOLD = 8;

/**
 * 一般カテゴリのアイテム群を、サブ分類ごとの入れ子グループへ再編成する
 * 件数がしきい値未満、またはサブ分類が1種類しか無い場合はそのまま返す
 */
const subdivideGeneralItems = (
  items: PsmItem[],
  subcategories: Record<string, string | null>,
  nextId: () => number
): PsmItem[] => {
  if (items.length < SUBDIVIDE_THRESHOLD) return items;

  const buckets = new Map<string, PsmItem[]>();
  for (const item of items) {
    const key = subcategories[item.content] || "other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }

  // 分類が実質できていない場合 (全て「その他」など) は細分化しない
  const classified = [...buckets.keys()].filter((k) => k !== "other");
  if (classified.length < 2) return items;

  const order = [...SUBCAT_ORDER, "other"];
  return order
    .filter((k) => buckets.has(k))
    .map((k) => ({
      id: nextId(),
      name: k === "other" ? "その他" : (SUBCAT_LABELS[k] || k),
      content: "",
      enabled: true,
      weight: 1.0,
      memo: "",
      is_group: true,
      isOpen: true,
      children: buckets.get(k)!,
    }));
};

/** AI分類で許可するサブ分類キー (バックエンドのSUBCATEGORY_RULESと対応) */
export const SUBCAT_KEYS = [
  "composition", "face", "hair", "body", "clothing", "accessory",
  "pose", "object", "background", "lighting", "style", "effect", "text",
];

/** AIによるサブ分類のシステムプロンプト */
const AI_CLASSIFY_SYSTEM_PROMPT =
  "You classify image-generation tags into exactly one category. " +
  `Allowed categories: ${SUBCAT_KEYS.join(", ")}, other. ` +
  "The user gives a numbered list of tags. Output ONLY lines in the format 'N. category' " +
  "keeping the same numbering and order. Use the exact category words above. " +
  "Use 'other' when nothing fits. No explanations.";

/** AI分類が利用可能か (OpenAI互換プロバイダのみ。DeepLは翻訳専用のため不可) */
export const canUseAiClassify = (): boolean => {
  const p = getActiveTranslateProfile();
  return p.provider === "openai" && !!p.endpoint && !!p.model;
};

/**
 * AI (ローカルLLM等) でタグをサブ分類する
 * 20件ずつ番号付きリストで問い合わせ、許可キー以外の応答は null として扱う
 */
export const classifyTagsWithAI = async (tags: string[]): Promise<Record<string, string | null>> => {
  const profile = getActiveTranslateProfile();
  const result: Record<string, string | null> = {};
  const allowed = new Set([...SUBCAT_KEYS, "other"]);

  state.translateProgress = { done: 0, total: tags.length };
  state.isTranslating = true;
  try {
    for (let start = 0; start < tags.length; start += NAME_TRANSLATE_CHUNK) {
      const chunk = tags.slice(start, start + NAME_TRANSLATE_CHUNK);
      const numbered = chunk.map((t, i) => `${i + 1}. ${t}`).join("\n");

      const res = await fetch("/psm/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: numbered,
          config: { ...profile, system_prompt: AI_CLASSIFY_SYSTEM_PROMPT },
        }),
      });
      if (!res.ok) throw apiHttpError(res.status, "/psm/translate");
      const data = await res.json();
      if (data.status !== "success" || !data.text) {
        throw new Error(data.message || "AI分類に失敗しました。");
      }

      for (const line of String(data.text).split("\n")) {
        const m = line.match(/^\s*(\d+)\s*[.):、]?\s*([a-zA-Z]+)\s*$/);
        if (!m) continue;
        const idx = parseInt(m[1], 10) - 1;
        const key = m[2].trim().toLowerCase();
        if (idx >= 0 && idx < chunk.length && allowed.has(key)) {
          result[chunk[idx]] = key === "other" ? null : key;
        }
      }

      state.translateProgress = {
        done: Math.min(start + chunk.length, tags.length),
        total: tags.length,
      };
    }
  } finally {
    state.isTranslating = false;
    state.translateProgress = { done: 0, total: 0 };
  }

  return result;
};

/**
 * タグのサブ分類を解決する (ルールベース + 任意でAI補完)
 * まずタグDBのルールで判定し、未分類のみAIへ問い合わせることでリクエストを最小化する
 */
export const resolveSubcategories = async (
  tags: string[],
  useAI = false
): Promise<Record<string, string | null>> => {
  const subcategories: Record<string, string | null> = {};

  // 1. ルールベース (オフライン・高速)
  try {
    const res = await fetch("/psm/tag-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.status === "success") {
        Object.assign(subcategories, data.subcategories || {});
      }
    }
  } catch (e) {
    Logger.warn("[Store/Subcategory] ルールベースのサブ分類取得に失敗しました。", e);
  }

  // 2. 未分類のみAIで補完
  if (useAI && canUseAiClassify()) {
    const unresolved = tags.filter((t) => !subcategories[t]);
    if (unresolved.length) {
      try {
        const aiResult = await classifyTagsWithAI(unresolved);
        for (const [tag, key] of Object.entries(aiResult)) {
          if (key) subcategories[tag] = key;
        }
        Logger.info(`[Store/Subcategory] AIで${Object.values(aiResult).filter(Boolean).length}/${unresolved.length}件を補完しました。`);
      } catch (e) {
        Logger.warn("[Store/Subcategory] AIによるサブ分類に失敗したため、ルールベースの結果のみ使用します。", e);
      }
    }
  }

  return subcategories;
};

/**
 * 既存グループの直下アイテムをサブ分類で入れ子グループへ再編成する (取込以外からの実行用)
 * 直下のグループはそのままの位置に残す
 * @returns 作成したサブグループ数 (0なら細分化しなかった)
 */
export const subdivideGroup = async (group: PsmItem, useAI = false): Promise<number> => {
  if (!group.is_group || !group.children?.length) return 0;
  if (isItemLocked(group.id)) return 0;

  const isSpecial = (c: string) =>
    /^<.+>$/.test(c) || /^__.+__$/.test(c) || /^break$/i.test(c);

  // 対象は直下の葉アイテム (自然言語・特殊構文は対象外)
  const leaves = group.children.filter(
    (c) => c && !c.is_group && !c.isNatural && c.content && !isSpecial(c.content.trim())
  );
  if (leaves.length < SUBDIVIDE_THRESHOLD) return 0;

  startLoading(useAI ? "classifyingAi" : "detectingCategories");
  let created = 0;
  try {
    const subcategories = await resolveSubcategories(leaves.map((l) => l.content.trim()), useAI);

    let seq = 0;
    const nextId = () => Date.now() * 1000 + 700 + ((seq++) % 300);
    // content のキーで引けるよう、trim済みキーに揃えたマップを作る
    const byContent: Record<string, string | null> = {};
    for (const l of leaves) byContent[l.content] = subcategories[l.content.trim()] || null;

    const subgroups = subdivideGeneralItems(leaves, byContent, nextId);
    if (subgroups === leaves || subgroups.length === 0) return 0; // 細分化されなかった

    // 元の並び順を保ちつつ、葉アイテムのあった位置にサブグループを差し込む
    const newChildren: PsmItem[] = [];
    let inserted = false;
    for (const child of group.children) {
      if (child && !child.is_group && leaves.includes(child)) {
        if (!inserted) {
          newChildren.push(...subgroups);
          inserted = true;
        }
        continue; // 葉アイテムはサブグループ側へ移動済み
      }
      newChildren.push(child);
    }
    if (!inserted) newChildren.push(...subgroups);

    group.children = newChildren;
    group.isOpen = true;
    created = subgroups.length;
    state.selectedProfileName = "";
    await savePrompts();
  } finally {
    stopLoading();
  }
  return created;
};

/**
 * アイテム配列をカテゴリ別グループへ再編成する (Phase 5Bのタグ判定APIを利用)
 * 判定できないタグ・特殊アイテムは「一般」グループへまとめる
 * @param subdivideGeneral trueの場合、一般グループ内をさらにサブ分類で細分化する
 * @param useAI trueの場合、ルールで未分類だったタグをAIで補完する
 */
export const groupItemsByCategory = async (items: PsmItem[], subdivideGeneral = false, useAI = false): Promise<PsmItem[]> => {
  const tagItems = items.filter((i) => !i.isNatural && !/^<.+>$/.test(i.content) && !/^__.+__$/.test(i.content) && !/^break$/i.test(i.content));
  if (!tagItems.length) return items;

  let categories: Record<string, string> = {};
  let subcategories: Record<string, string | null> = {};
  const res = await fetch("/psm/tag-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags: tagItems.map((i) => i.content) }),
  });
  if (!res.ok) throw apiHttpError(res.status, "/psm/tag-categories");
  const data = await res.json();
  if (data.status !== "success") throw new Error(data.message || "Tag DB unavailable");
  categories = data.categories || {};
  subcategories = data.subcategories || {};

  // 一般グループを細分化する場合のみ、未分類タグをAIで補完する
  if (subdivideGeneral && useAI && canUseAiClassify()) {
    const generalTags = tagItems
      .filter((i) => (categories[i.content] || "general") === "general" && !subcategories[i.content])
      .map((i) => i.content);
    if (generalTags.length) {
      try {
        const aiResult = await classifyTagsWithAI(generalTags);
        for (const [tag, key] of Object.entries(aiResult)) {
          if (key) subcategories[tag] = key;
        }
      } catch (e) {
        Logger.warn("[Store/Infotext] AIによるサブ分類に失敗したため、ルールベースの結果のみ使用します。", e);
      }
    }
  }

  const CAT_LABELS: Record<PsmCategory, string> = {
    quality: "品質・メタ",
    subject: "主体",
    character: "キャラクター",
    series: "作品",
    artist: "絵師",
    general: "一般",
  };

  let seq = 0;
  const nextId = () => Date.now() * 1000 + 500 + ((seq++) % 500);
  const buckets = new Map<PsmCategory, PsmItem[]>();

  for (const item of items) {
    const cat = (categories[item.content] || "general") as PsmCategory;
    const key: PsmCategory = CATEGORY_ORDER.includes(cat) ? cat : "general";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }

  // カテゴリ優先度順にグループを生成する
  return CATEGORY_ORDER
    .filter((c) => buckets.has(c))
    .map((c) => {
      const children = buckets.get(c)!;
      return {
        id: nextId(),
        name: CAT_LABELS[c],
        content: "",
        enabled: true,
        weight: 1.0,
        memo: "",
        is_group: true,
        isOpen: true,
        category: c,
        // 「一般」は肥大化しやすいため、指定時のみサブ分類で細分化する
        children: (subdivideGeneral && c === "general")
          ? subdivideGeneralItems(children, subcategories, nextId)
          : children,
      };
    });
};

/**
 * infotextを取り込み、現在のツリーへ反映または新規ファイルとして保存する
 * @param text 貼り付けられたPNG Info文字列
 * @param opts groupByCategory: カテゴリ別グループ化 / translateNames: タグ名を日本語訳して名前に設定 / fileName: 指定時は新規ファイル作成
 */
export const importInfotext = async (
  text: string,
  opts: { groupByCategory?: boolean; subdivideGeneral?: boolean; useAiSubdivide?: boolean; translateNames?: boolean; fileName?: string } = {}
): Promise<{ params: Record<string, string>; posCount: number; negCount: number; translated: number }> => {
  const parsed = parseInfotext(text);
  let positive = parsePromptToItems(parsed.positive);
  let negative = parsePromptToItems(parsed.negative);
  const posCount = positive.length;
  const negCount = negative.length;
  let translated = 0;

  // 翻訳を含む場合は時間がかかるため、操作不可のローディングオーバーレイを表示する
  startLoading(opts.translateNames ? "translatingNames" : "importing");
  try {
    if (opts.translateNames) {
      // 翻訳に失敗しても取込自体は継続する (名前が空のままになるだけ)
      try {
        translated = await applyTranslatedNames([...positive, ...negative]);
      } catch (e) {
        Logger.warn("[Store/Infotext] タグ名の日本語化に失敗したため、名前を空のまま取り込みます。", e);
      }
    }

    if (opts.groupByCategory) {
      // カテゴリ判定に失敗した場合はグループ化せずフラットなまま取り込む
      try {
        positive = await groupItemsByCategory(positive, opts.subdivideGeneral, opts.useAiSubdivide);
        negative = await groupItemsByCategory(negative, opts.subdivideGeneral, opts.useAiSubdivide);
      } catch (e) {
        Logger.warn("[Store/Infotext] カテゴリ別グループ化に失敗したため、フラットな構成で取り込みます。", e);
      }
    }

    if (opts.fileName) {
      await createYamlWithData(opts.fileName, positive, negative);
    } else {
      state.positive = positive;
      state.negative = negative;
      state.selectedProfileName = "";
      await savePrompts();
    }
  } finally {
    stopLoading();
  }

  return { params: parsed.params, posCount, negCount, translated };
};

export const createYamlWithData = async (n: string, pos: PsmItem[], neg: PsmItem[]) => {
  const fn = n.endsWith(".yaml") ? n : `${n}.yaml`;
  await fetch("/psm/save-prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: fn, positive: pos, negative: neg, model_mode: state.modelMode }),
  });
  await listFiles();
  state.selectedFile = fn;
  await loadPrompts();
};

/**
 * アンダースコアをスペースに置換してはいけないトークンのパターン集
 * - ワイルドカード: Dynamic Prompts の __character__ 形式
 * - スコアタグ: Anima の score_7 や Pony系の score_8_up 形式(アンダースコア必須)
 * - 顔文字タグ: ^_^, >_<, @_@, 0_0 などの3文字タグ
 */
const PRESERVE_UNDERSCORE_PATTERNS: RegExp[] = [
  /^__.+__$/,          // ワイルドカード (__character__)
  /^score_\d(_up)?$/i, // スコアタグ (score_7, score_8_up)
  /^._.$/,             // 3文字顔文字タグ (^_^, >_<, @_@, 0_0 など)
  /^<.+>$/,            // 拡張ネットワーク構文 (<lora:name_v2:0.8>, <hypernet:...> など)
];

/**
 * アンダースコア置換から保護すべきトークンかどうかを判定する
 */
const shouldPreserveUnderscore = (token: string): boolean =>
  PRESERVE_UNDERSCORE_PATTERNS.some((re) => re.test(token.trim()));

/**
 * コンテンツ内のアンダースコアをスペースに置換する
 * コンテンツがカンマ区切りで複数タグを含む場合はトークン単位で判定し、
 * 保護対象トークン(score_7等)はそのまま維持する
 */
const replaceUnderscores = (content: string): string => {
  if (shouldPreserveUnderscore(content)) return content;
  return content
    .split(",")
    .map((part) => (shouldPreserveUnderscore(part) ? part : part.replace(/_/g, " ")))
    .join(",");
};

/**
 * カテゴリの出力優先度 (Anima推奨タグ順序・Phase 3)
 * 未指定・不明なカテゴリは "general" と同順位
 */
export const CATEGORY_ORDER: PsmCategory[] = ["quality", "subject", "character", "series", "artist", "general"];

const categoryPriority = (item: PsmItem): number => {
  const idx = CATEGORY_ORDER.indexOf(item.category as PsmCategory);
  return idx === -1 ? CATEGORY_ORDER.indexOf("general") : idx;
};

/**
 * animaモード時にルート直下のノードをカテゴリ優先度で安定ソートする
 * (同一カテゴリ内の相対順序は維持。ツリー表示は変更せず出力時のみ)
 */
const sortRootByCategory = (nodes: PsmItem[]): PsmItem[] => {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => {
      const diff = categoryPriority(a.node) - categoryPriority(b.node);
      return diff !== 0 ? diff : a.index - b.index; // 安定性の明示的保証
    })
    .map((e) => e.node);
};

export const getCompiledPrompts = (nodes: PsmItem[], separator = ", ", applyCategoryOrder = false): string => {
  // animaモードかつルート呼び出しの場合のみカテゴリ整列 (再帰呼び出しには適用しない)
  if (applyCategoryOrder && state.modelMode === "anima") {
    nodes = sortRootByCategory(nodes);
  }
  const raw = nodes
    .filter((n) => n.enabled)
    .map((n) => {
      if (n.is_group && n.children) {
        if (n.isRandom) {
          // ランダムグループ: {A|B|C}
          const content = getCompiledPrompts(n.children, "|");
          return content ? `{${content}}` : "";
        } else {
          // 通常グループ: A, B, C
          return getCompiledPrompts(n.children, ", ");
        }
      } else {
        // アイテム
        let content = n.content;

        if (n.isNatural) {
          // 自然言語アイテム: 置換・エスケープを行わず原文のまま出力 (前後空白のみ除去)
          content = content.trim();
        } else {
          // ワイルドカード・スコアタグ・顔文字タグを保護しつつアンダーバーをスペースに置換
          content = replaceUnderscores(content);

          // コンテンツ内の () をエスケープする
          content = content.replace(/\(/g, "\\(").replace(/\)/g, "\\)");

          // 末尾のカンマや空白を除去 (例: "foo, " -> "foo")
          content = content.replace(/,\s*$/, "").trim();
        }

        return n.weight !== 1.0 ? `(${content}:${n.weight})` : content;
      }
    })
    .filter((s) => s)
    .join(separator);
    
  // 重複区切り文字の整理 (separatorがカンマの場合のみ調整が必要だが、パイプの場合は単純結合で良いはず)
  // ただしパイプの場合も空要素があると || になる可能性があるのでfilter(s=>s)で排除済み
  if (separator === ", ") {
      return raw.replace(/,\s*,/g, ", ");
  }
  return raw;
};

// -------------------------------------------------------------------------
// 反映前プレビュー (Phase 5A)
// -------------------------------------------------------------------------

// -------------------------------------------------------------------------
// トークン数の概算 (プレビュー表示用)
// -------------------------------------------------------------------------

/** SD系 (CLIP) の1チャンクあたりのトークン上限 */
export const CLIP_CHUNK_SIZE = 75;

export interface TokenEstimate {
  /** 概算トークン数 (BREAKによるパディングを含まない実トークン数) */
  tokens: number;
  /** 75トークンチャンク数 (BREAKによる強制改チャンクを考慮) */
  chunks: number;
  /** BREAKの出現回数 */
  breaks: number;
}

/**
 * プロンプト文字列のトークン数を概算する (純関数)
 *
 * 注意: 正確なトークン数はモデルのトークナイザに依存するため、あくまで目安。
 * CLIP系 (SD1/SDXL) のBPEを単語長ベースで近似している。
 * Anima等 (Qwen3系) は別トークナイザのため参考値として扱う。
 *
 * 除外・特殊処理:
 * - 拡張ネットワーク構文 `<lora:...>` はエンコード前に除去されるためカウントしない
 * - 強調構文の括弧・重み (`(tag:1.2)`) はカウントしない
 * - カンマは1トークンとして数える
 * - `BREAK` はチャンク境界を強制する (現チャンクを75までパディング)
 */
export const estimateTokenCount = (text: string): TokenEstimate => {
  if (!text || !text.trim()) return { tokens: 0, chunks: 1, breaks: 0 };

  // 拡張ネットワーク構文を除去 (エンコード対象外)
  let s = text.replace(/<[^>]*>/g, " ");

  let tokens = 0;
  let breaks = 0;
  let chunkUsed = 0; // 現チャンクの使用トークン数
  let completedChunks = 0;

  const addTokens = (n: number) => {
    tokens += n;
    chunkUsed += n;
    while (chunkUsed > CLIP_CHUNK_SIZE) {
      chunkUsed -= CLIP_CHUNK_SIZE;
      completedChunks++;
    }
  };

  for (const rawSegment of s.split(",")) {
    const segment = rawSegment.trim();

    if (/^break$/i.test(segment)) {
      // BREAK: 現チャンクを閉じる (パディング)
      breaks++;
      if (chunkUsed > 0) {
        completedChunks++;
        chunkUsed = 0;
      }
      continue;
    }

    if (segment) {
      // 強調構文の記号と重み指定を除去してから単語を数える
      const cleaned = segment
        .replace(/\\[()[\]]/g, " ")   // エスケープ済みの括弧
        .replace(/[()[\]]/g, " ")     // 強調用の括弧
        .replace(/:\s*[\d.]+/g, " ")  // 重み指定 (:1.2)
        .trim();

      for (const word of cleaned.split(/\s+/)) {
        if (!word) continue;
        // CLIP BPEの近似: 短い一般語は1トークン、長い語は分割されやすい
        const len = word.length;
        addTokens(len <= 6 ? 1 : 1 + Math.ceil((len - 6) / 4));
      }
      // 区切りのカンマ自体も1トークン
      addTokens(1);
    }
  }

  const chunks = Math.max(1, completedChunks + (chunkUsed > 0 ? 1 : 0));
  return { tokens, chunks, breaks };
};

export interface PromptDiffToken {
  text: string;
  kind: "added" | "removed" | "common";
}

export interface PromptDiffResult {
  tokens: PromptDiffToken[];
  added: number;
  removed: number;
  common: number;
}

/**
 * 2つのプロンプト文字列をカンマ区切りトークン単位で比較する (純関数)
 * 重複タグは出現回数で比較。共通/追加トークンは新文字列の順で並び、削除トークンは末尾に付く
 */
export const computePromptDiff = (oldStr: string, newStr: string): PromptDiffResult => {
  const tokenize = (s: string) => (s || "").split(",").map((t) => t.trim()).filter((t) => t);
  const oldTokens = tokenize(oldStr);
  const newTokens = tokenize(newStr);

  const remaining = new Map<string, number>();
  oldTokens.forEach((t) => remaining.set(t, (remaining.get(t) || 0) + 1));

  const tokens: PromptDiffToken[] = [];
  let added = 0;
  let common = 0;

  for (const t of newTokens) {
    const c = remaining.get(t) || 0;
    if (c > 0) {
      remaining.set(t, c - 1);
      tokens.push({ text: t, kind: "common" });
      common++;
    } else {
      tokens.push({ text: t, kind: "added" });
      added++;
    }
  }

  let removed = 0;
  for (const t of oldTokens) {
    const c = remaining.get(t) || 0;
    if (c > 0) {
      remaining.set(t, c - 1);
      tokens.push({ text: t, kind: "removed" });
      removed++;
    }
  }

  return { tokens, added, removed, common };
};

/**
 * WebUIのプロンプトテキストエリアの現在値を加工せずに取得する (プレビューの比較元)
 */
export const getWebUIRawPrompts = (): { positive: string; negative: string } => {
  const prefix =
    document.getElementById("img2img_generate")?.offsetParent !== null
      ? "img2img"
      : "txt2img";
  const getVal = (id: string) =>
    (
      document
        .querySelector(`#${prefix}_${id}`)
        ?.querySelector("textarea") as HTMLTextAreaElement
    )?.value || "";
  return { positive: getVal("prompt"), negative: getVal("neg_prompt") };
};

// -------------------------------------------------------------------------
// カテゴリ自動判定 (Phase 5B / tagcomplete のタグDBを利用)
// -------------------------------------------------------------------------

export interface CategorySuggestion {
  /** 多数決で選ばれたカテゴリ (判定不能ならnull) */
  suggested: PsmCategory | null;
  /** カテゴリ別の判定数 */
  counts: Record<string, number>;
  /** 照会したタグ総数 */
  total: number;
  /** タグDBに存在しなかったタグ数 */
  unknown: number;
}

/**
 * グループ配下から判定対象のタグを収集する
 * (自然言語アイテム・ワイルドカード・LoRA構文・制御トークンは除外)
 */
const collectGroupTags = (group: PsmItem): string[] => {
  const tags: string[] = [];
  const walk = (nodes: PsmItem[]) => {
    for (const n of nodes) {
      if (!n) continue;
      if (n.is_group && n.children) {
        walk(n.children);
      } else if (!n.is_group && !n.isNatural) {
        for (const tok of (n.content || "").split(",")) {
          const t = tok.trim();
          if (!t) continue;
          if (/^__.+__$/.test(t) || /^<.+>$/.test(t) || /^(BREAK|AND)$/i.test(t)) continue;
          tags.push(t);
        }
      }
    }
  };
  walk(group.children || []);
  return tags;
};

/**
 * グループのカテゴリをタグDBの多数決で提案する
 * @throws Error タグDB未検出・通信失敗時 (messageはUI表示用)
 */
export const suggestCategoryForGroup = async (group: PsmItem): Promise<CategorySuggestion> => {
  const tags = collectGroupTags(group);
  if (!tags.length) {
    return { suggested: null, counts: {}, total: 0, unknown: 0 };
  }

  const res = await fetch("/psm/tag-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) throw apiHttpError(res.status, "/psm/tag-categories");
  const data = await res.json();
  if (data.status !== "success") {
    throw new Error(data.message || "Tag DB unavailable");
  }

  const counts: Record<string, number> = {};
  let unknown = 0;
  for (const t of tags) {
    const c = data.categories?.[t] || "unknown";
    if (c === "unknown") {
      unknown++;
    } else {
      counts[c] = (counts[c] || 0) + 1;
    }
  }

  let suggested: PsmCategory | null = null;
  let best = 0;
  for (const [c, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      suggested = c as PsmCategory;
    }
  }
  return { suggested, counts, total: tags.length, unknown };
};

/**
 * ルート直下のカテゴリ未設定グループへ自動判定結果を一括適用する
 * (設定済みグループは変更しない)
 */
export const bulkAssignCategories = async (): Promise<{ applied: number; skipped: number; counts: Record<string, number> }> => {
  let applied = 0;
  let skipped = 0;
  const counts: Record<string, number> = {};

  const roots = [...state.positive, ...state.negative].filter((n) => n && n.is_group);

  // グループ数に応じて複数回APIを呼ぶため、操作不可のローディングを表示する
  startLoading("detectingCategories");
  try {
    for (const g of roots) {
      if (g.category || isItemLocked(g.id)) {
        skipped++;
        continue;
      }
      const s = await suggestCategoryForGroup(g);
      if (s.suggested) {
        g.category = s.suggested;
        counts[s.suggested] = (counts[s.suggested] || 0) + 1;
        applied++;
      } else {
        skipped++;
      }
    }

    if (applied > 0) {
      await savePrompts();
    }
  } finally {
    stopLoading();
  }
  return { applied, skipped, counts };
};

export const setAllGroupsOpen = (open: boolean) => {
  const walk = (nodes: PsmItem[]) =>
    nodes.forEach((n) => {
      if (n.is_group && n.children) {
        n.isOpen = open;
        walk(n.children);
      }
    });
  walk(state.positive);
  walk(state.negative);
};



// -------------------------------------------------------------------------
// 移動先クイック選択 (グループが多い環境での移動を高速化する)
// -------------------------------------------------------------------------

export interface MoveTarget {
  /** ルートは "root-pos" / "root-neg"、グループはそのID */
  id: number | string;
  /** グループ名 */
  name: string;
  /** 親からのパス表示 (例: "Positive > キャラクター") */
  path: string;
  /** 移動先の配列 (この配列へpushする) */
  list: PsmItem[];
  /** 階層の深さ */
  level: number;
}

/** 最近使った移動先の保持数 */
const RECENT_MOVE_LIMIT = 5;

/**
 * 移動先の候補を収集する (循環参照を防ぐため、自分自身とその子孫は除外)
 * @param item 移動するアイテム
 * @param rootLabels ルートの表示名 (i18n解決済みの文字列を渡す)
 */
export const collectMoveTargets = (
  item: PsmItem,
  rootLabels: { positive: string; negative: string }
): MoveTarget[] => {
  const targets: MoveTarget[] = [
    { id: "root-pos", name: rootLabels.positive, path: rootLabels.positive, list: state.positive, level: 0 },
    { id: "root-neg", name: rootLabels.negative, path: rootLabels.negative, list: state.negative, level: 0 },
  ];

  const collect = (nodes: PsmItem[], level: number, parentPath: string, lockedAncestor: boolean) => {
    for (const node of nodes) {
      if (!node || node.id === item.id) continue; // 自分自身とその子孫は除外
      if (node.is_group) {
        const nodeLocked = lockedAncestor || !!node.isLocked;
        if (nodeLocked) continue; // ロック中グループとその配下は移動先候補から除外
        const name = node.name || "(No Name)";
        const path = `${parentPath} > ${name}`;
        targets.push({ id: node.id, name, path, list: node.children || [], level });
        if (node.children) collect(node.children, level + 1, path, nodeLocked);
      }
    }
  };

  collect(state.positive, 0, rootLabels.positive, false);
  collect(state.negative, 0, rootLabels.negative, false);
  return targets;
};

/** 最近使った移動先を先頭へ追加して保存する (重複は繰り上げ。読み込みは loadSettingsLocal 側) */
export const pushRecentMoveTarget = (target: MoveTarget) => {
  const entry = { id: target.id, path: target.path };
  state.recentMoveTargets = [
    entry,
    ...state.recentMoveTargets.filter((r) => r.id !== target.id),
  ].slice(0, RECENT_MOVE_LIMIT);
  saveSettingsLocal();
};

/** 移動ダイアログを開く */
export const openMoveDialog = (item: PsmItem) => {
  if (isItemLocked(item.id)) return;
  state.moveDialogItem = item;
  state.isMoveDialogOpen = true;
};

/** 移動ダイアログを閉じる */
export const closeMoveDialog = () => {
  state.isMoveDialogOpen = false;
  state.moveDialogItem = null;
};

/** 選択された移動先へアイテムを移動する */
export const executeMoveTo = async (target: MoveTarget) => {
  const item = state.moveDialogItem;
  if (!item) return;
  if (isItemLocked(item.id) || isListLocked(target.list)) return;
  pushRecentMoveTarget(target);
  closeMoveDialog();
  await teleportItem(item, target.list, "move-dialog");
};

// -------------------------------------------------------------------------
// ドラッグ&ドロップ (クローン方式) の共通処理
// -------------------------------------------------------------------------

/** ドラッグ開始: 対象アイテムと元のリストを記録する */
export const beginDrag = (list: PsmItem[], index?: number) => {
  const item = typeof index === "number" ? list[index] : null;
  if (item && isItemLocked(item.id)) return;
  state.isDragging = true;
  state.draggedItem = item;
  state.draggedFromList = list;
};

/** ドラッグ終了: 状態をリセットする (保存は呼び出し側) */
export const endDrag = () => {
  state.isDragging = false;
  state.draggedItem = null;
  state.draggedFromList = null;
  state.dropTargetId = null;
};

/**
 * 別リストへドロップされた際に、移動元から元のアイテムを削除して移動を確定する
 *
 * クローン方式 (pull: "clone") では移動元から自動削除されないため、
 * ドロップ先への追加後にこの処理で元を取り除く。
 * 同一リスト内の並べ替えでは何もしない (SortableJSが順序を更新済み)。
 *
 * @param destList ドロップ先のリスト (vuedraggableが既に追加済み)
 * @returns 移動元から削除したかどうか
 */
export const finalizeCrossListMove = (destList: PsmItem[]): boolean => {
  const src = state.draggedFromList;
  const item = state.draggedItem;
  if (!src || !item || src === destList) return false;

  // ロック中のアイテム、またはロック中グループへのドロップは取り消す
  if (isItemLocked(item.id) || isListLocked(destList)) {
    const dup = destList.findIndex((n) => n && n.id === item.id);
    if (dup !== -1) destList.splice(dup, 1);
    Logger.warn("[Store/Drag] ロック中のため、移動を取り消しました。");
    return false;
  }

  // 自分自身の配下への移動は循環参照になるため、追加を取り消す
  if (isDescendantList(item, destList)) {
    const dup = destList.findIndex((n) => n && n.id === item.id);
    if (dup !== -1) destList.splice(dup, 1);
    Logger.warn("[Store/Drag] 自身の配下へは移動できないため、移動を取り消しました。");
    return false;
  }

  const idx = src.findIndex((n) => n && n.id === item.id);
  if (idx === -1) {
    // 想定外: 移動元に見つからない場合は二重登録を避けるため追加分を取り消す
    const dup = destList.findIndex((n) => n && n.id === item.id);
    if (dup !== -1) destList.splice(dup, 1);
    Logger.warn("[Store/Drag] 移動元にアイテムが見つからなかったため、移動を取り消しました。", item);
    return false;
  }

  src.splice(idx, 1);
  state.selectedProfileName = "";
  return true;
};

/** 指定のリストが、そのアイテムの子孫のリストかどうかを判定する (循環参照チェック用) */
const isDescendantList = (item: PsmItem, list: PsmItem[]): boolean => {
  if (!item.is_group || !item.children) return false;
  if (item.children === list) return true;
  return item.children.some((c) => c && isDescendantList(c, list));
};

export const teleportItem = async (item: PsmItem, dest: PsmItem[], type: string) => {
  if (isItemLocked(item.id) || isListLocked(dest)) return;
  const walk = (nodes: PsmItem[]): boolean => {
    const idx = nodes.findIndex((n) => n.id === item.id);
    if (idx !== -1) {
      nodes.splice(idx, 1);
      return true;
    }
    return nodes.some((n) => n.is_group && n.children && walk(n.children));
  };
  walk(state.positive);
  walk(state.negative);
  dest.push(item);
  state.isMoving = false;
  state.movingItem = null;
  await savePrompts();
};

/** 
 * 言語を設定し、即時保存する
 * @param lang "ja" | "en"
 */
export const setLang = async (lang: "ja" | "en") => {
  state.lang = lang;
  saveSettingsLocal();
};

/**
 * モデルモード ("sd" | "anima") を設定し、現在のYAMLファイルに即時保存する
 * @param mode 設定するモード
 */
export const setModelMode = async (mode: ModelMode) => {
  state.modelMode = mode;
  await savePrompts();
};

/**
 * トグルショートカットキーを設定し、保存する
 * @param shortcut "Ctrl+B" など
 */
export const setToggleShortcut = async (shortcut: string) => {
  state.toggleShortcut = shortcut;
  saveSettingsLocal();
};

/**
 * 有効なプロンプトの中で重複しているテキストを抽出する
 * ポジティブ・ネガティブ全体を走査して判定。
 */
export const detectDuplicates = (): Set<string> => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  // 複数回出現しても意味的に重複とは見なさない制御用キーワードを定義
  const IGNORED_TOKENS = new Set(["BREAK", "AND"]);

  const walk = (nodes: PsmItem[], parentDisabled: boolean) => {
    for (const node of nodes) {
      if (!node) continue;
      const effectiveEnabled = node.enabled && !parentDisabled;
      
      if (node.is_group && node.children) {
        walk(node.children, !effectiveEnabled);
      } else if (!node.is_group && effectiveEnabled) {
        const text = (node.content || "").trim();
        // 制御キーワードは重複チェックの対象外とする
        if (text && !IGNORED_TOKENS.has(text.toUpperCase())) {
          if (seen.has(text)) {
            duplicates.add(text);
          } else {
            seen.add(text);
          }
        }
      }
    }
  };

  walk(state.positive, false);
  walk(state.negative, false);
  return duplicates;
};

/**
 * 重複の強調表示をクリアする
 */
export const clearDuplicateHighlight = () => {
  state.duplicateTexts.clear();
  state.duplicateHighlightLevel = null;
};

/**
 * 重複プロンプトチェックモードを設定し、保存する
 * @param mode "none" | "warn" | "error"
 */
export const setDuplicateCheckMode = async (mode: DuplicateCheckMode) => {
  state.duplicateCheckMode = mode;
  saveSettingsLocal();
  clearDuplicateHighlight();
};


