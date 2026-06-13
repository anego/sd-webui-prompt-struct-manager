import { reactive, watch } from "vue";
import { PsmItem, DuplicateCheckMode, PsmProfile, PsmProfileState } from "./types";
import { Logger, setDebugMode } from "./log";

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
  /** 保存されているプロファイル（ツリースナップショット） */
  profiles: [] as PsmProfile[],
  /** 現在選択（適用）されているプロファイル名 */
  selectedProfileName: "",
  /** 非同期処理実行中フラグ */
  isLoading: false,
  /** ローディングテキストの翻訳キー */
  loadingText: "",
  /** プロンプト大辞典が検出・マウントされているかどうかのフラグ */
  hasDictionary: false,
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
 * アイテムを複製し、元のアイテムのすぐ下に追加する
 * クリップボードを経由せず即座に反映されます。
 */
export const duplicateItem = async (item: PsmItem, parentChildren: PsmItem[]) => {
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
  state.selectedProfileName = "";
  group.enabled = !group.enabled;
  await savePrompts();
};

/**
 * アイテムの有効/無効状態をトグルする
 * 親グループが排他選択（isExclusive）の場合は、他の兄弟要素をすべて無効化する
 */
export const toggleItemEnabled = async (item: PsmItem, parentChildren: PsmItem[], parentGroup?: PsmItem) => {
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
  console.info(`[PSM][Store/Profile] プロファイル「${name}」の適用処理を開始します。`);
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
  
  console.info(`[PSM][Store/Profile] プロファイル「${name}」の適用が完了しました。（適用ノード数: ${appliedCount} 件）`);
  
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


/**
 * グループ内の子要素すべての enabled 状態を一括変更する
 * @param group 対象グループ
 * @param enabled true: 有効化, false: 無効化
 */
export const setGroupChildrenEnabled = async (group: PsmItem, enabled: boolean) => {
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
  startLoading("saving");
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
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    Logger.debug("[Store/Data] プロンプトデータをファイルへ正常に書き込みました。");
  } catch (e) {
    Logger.error("[Store/Data] プロンプトデータのファイル保存に失敗しました。", e);
  } finally {
    stopLoading();
  }
};

/**
 * 新しい空のYAMLファイルを作成し、それを選択状態にする
 * @param name ファイル名 (拡張子なしでも可)
 */
export const createYamlFile = async (name: string) => {
  startLoading("saving");
  try {
    const filename = name.endsWith(".yaml") ? name : `${name}.yaml`;
    await fetch("/psm/save-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: filename, positive: [], negative: [] }),
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
  };
  localStorage.setItem(LS_KEY, JSON.stringify(data));
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

export const createYamlWithData = async (n: string, pos: PsmItem[], neg: PsmItem[]) => {
  const fn = n.endsWith(".yaml") ? n : `${n}.yaml`;
  await fetch("/psm/save-prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: fn, positive: pos, negative: neg }),
  });
  await listFiles();
  state.selectedFile = fn;
  await loadPrompts();
};

export const getCompiledPrompts = (nodes: PsmItem[], separator = ", "): string => {
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
        // コンテンツ内の () をエスケープする
        let content = n.content.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        
        // 末尾のカンマや空白を除去 (例: "foo, " -> "foo")
        content = content.replace(/,\s*$/, "").trim();

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



export const teleportItem = async (item: PsmItem, dest: PsmItem[], type: string) => {
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


