import { reactive, watch } from "vue";
import { PsmItem } from "./types";
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
  /** 検索クエリ文字列 */
  searchQuery: "",
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
});

/**
 * ノードを再帰的にディープコピーし、新しいIDを付与するヘルパー関数
 * 複製時に使用されます。
 */
const cloneNodeRecursive = (node: PsmItem): PsmItem => {
  const newNode = {
    ...JSON.parse(JSON.stringify(node)),
    id: Date.now() + Math.random(),
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
    id: Date.now() + Math.random(),
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
    Logger.error("Failed to finish edit:", e);
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
  group.enabled = !group.enabled;
  await savePrompts();
};

/**
 * グループ内の子要素すべての enabled 状態を一括変更する
 * @param group 対象グループ
 * @param enabled true: 有効化, false: 無効化
 */
export const setGroupChildrenEnabled = async (group: PsmItem, enabled: boolean) => {
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
 * サーバーからYAMLファイル一覧を取得する
 * 取得後、選択中のファイルがなければ自動的に最初のファイルを選択する
 */
export const listFiles = async () => {
  try {
    const res = await fetch("/psm/list-files");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.yamlFiles = data.files;
    
    // last_fileがあればそれを選択
    if (!state.selectedFile) {
       if ((state as any).lastFile && state.yamlFiles.includes((state as any).lastFile)) {
         state.selectedFile = (state as any).lastFile;
         await loadPrompts();
       }
       // Fallback removed to allow unselected state on directory change
    }
    Logger.debug("Files listed:", state.yamlFiles);
  } catch (e) {
    Logger.error("Failed to list files:", e);
  }
};

/**
 * 選択中のYAMLファイルからプロンプト構造を読み込む
 */
export const loadPrompts = async () => {
  if (!state.selectedFile) return;
  try {
    Logger.debug(`Loading prompts from ${state.selectedFile}...`);
    const res = await fetch(`/psm/get-prompts?file=${state.selectedFile}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.positive = (data.positive || []).filter((i: PsmItem) => i != null);
    state.negative = (data.negative || []).filter((i: PsmItem) => i != null);
    
    // last_fileを保存
    if (state.selectedFile !== (state as any).lastFile) {
      (state as any).lastFile = state.selectedFile;
      saveSettingsLocal();
    }
    Logger.debug("Prompts loaded successfully.");
  } catch (e) {
    Logger.error("Failed to load prompts:", e);
  }
};

/**
 * 現在の状態（Positive/Negativeツリー）をYAMLファイルに保存する
 */
export const savePrompts = async () => {
  if (!state.selectedFile) return;
  try {
    Logger.debug(`Saving prompts to ${state.selectedFile}...`);
    const res = await fetch("/psm/save-prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: state.selectedFile,
        positive: state.positive,
        negative: state.negative,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    Logger.debug("Prompts saved successfully.");
  } catch (e) {
    Logger.error("Failed to save prompts:", e);
    // UI notification would be good here
  }
};

/**
 * 新しい空のYAMLファイルを作成し、それを選択状態にする
 * @param name ファイル名 (拡張子なしでも可)
 */
export const createYamlFile = async (name: string) => {
  const filename = name.endsWith(".yaml") ? name : `${name}.yaml`;
  await fetch("/psm/save-prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: filename, positive: [], negative: [] }),
  });
  await listFiles();
  state.selectedFile = filename;
  await loadPrompts();
};

/**
 * 現在のファイルを別名で複製保存する
 * @param n 新しいファイル名
 */
export const duplicateCurrentFile = async (n: string) => {
  const fn = n.endsWith(".yaml") ? n : `${n}.yaml`;
  await fetch("/psm/duplicate-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ src: state.selectedFile, dst: fn }),
  });
  await listFiles();
  state.selectedFile = fn;
  await loadPrompts();
};

/**
 * 現在のファイルをリネームする
 * @param n 新しいファイル名
 */
export const renameCurrentFile = async (n: string) => {
  const fn = n.endsWith(".yaml") ? n : `${n}.yaml`;
  await fetch("/psm/rename-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ src: state.selectedFile, dst: fn }),
  });
  await listFiles();
  state.selectedFile = fn;
};

/**
 * 現在のファイルを削除する
 */
export const deleteCurrentFile = async () => {
  await fetch(`/psm/delete-file?file=${state.selectedFile}`, {
    method: "DELETE",
  });
  state.selectedFile = "";
  await listFiles();
  await loadPrompts();
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
        (state as any).lastFile = data.last_file;
        // ファイルリスト取得前なのでセットだけしておく
        // listFiles内で反映される
      }
      if (data.sidebar_open !== undefined) state.isSidebarOpen = data.sidebar_open;
      if (data.toggle_shortcut) state.toggleShortcut = data.toggle_shortcut;
    } catch (e) {
      Logger.error("Failed to load local settings", e);
    }
  }
};

export const saveSettingsLocal = () => {
  const data = {
    ui_scale: state.uiScale,
    lang: state.lang,
    last_file: state.selectedFile || (state as any).lastFile,
    sidebar_open: state.isSidebarOpen,
    toggle_shortcut: state.toggleShortcut,
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
    Logger.info(`Config loaded. configured=${state.isConfigured}, dev=${state.isDevMode}`);
  } catch (e) {
    Logger.error("Failed to load global config:", e);
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
    (state as any).lastFile = ""; // Clear last file memory
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
    Logger.info("Config saved and file list refreshed.");
  } catch (e) {
    Logger.error("Failed to save config:", e);
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
    Logger.error("Failed to pick directory:", e);
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
      id: Date.now() + Math.random(),
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
