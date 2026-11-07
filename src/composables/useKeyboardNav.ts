/**
 * キーボードナビゲーション機能を提供するコンポーザブル
 * 矢印キーによる移動、Enter/Space/Deleteなどのショートカットを処理します。
 * 
 * @param callbacks 各種イベントコールバック (context menuなど)
 */
import { PaneName, PsmItem } from "../types";
import { state, startEdit, startDeleteConfirm, requestToggleEnabled, addItem, findParentAndItem } from "../store";
import { listNavigableItems } from "../viewFilter";

/** ツリーのキー操作を受け付けるかの判定に使う状態 */
export type TreeKeyboardState = Pick<typeof state, "isEditing" | "isDeleting" | "disableAllConfirm" | "isVisible" | "isLoading">;

/**
 * ツリーのキー操作を受け付けない状態か
 * 編集・削除確認・一括無効の確認のダイアログ表示中と、画面が非表示の間に加えて、
 * ファイルの読み込み中も受け付けない (読み込みで差し替わる前のツリーを操作して、保存で上書きしてしまうため)。
 */
export const isTreeKeyboardBlocked = (s: TreeKeyboardState): boolean =>
  s.isEditing || s.isDeleting || !!s.disableAllConfirm || !s.isVisible || s.isLoading;

/** 1つのペインで、画面に表示中のアイテムを画面の順に並べる (表示フィルターと検索欄の絞り込みを考慮する) */
const listPaneItems = (pane: PaneName): PsmItem[] =>
  listNavigableItems(state[pane], {
    mode: state.viewFilterMode,
    query: state.paneSearchQuery[pane],
    showHiddenGroups: state.showHiddenGroups,
  });

/**
 * キーボード操作の対象になる、画面に表示中の全アイテム (Positive → Negative の順)
 * 閉じているペインと、閉じているグループの中身は含めない。
 */
export const listKeyboardTargets = (): PsmItem[] => [
  ...(state.posOpen ? listPaneItems("positive") : []),
  ...(state.negOpen ? listPaneItems("negative") : []),
];

export const useKeyboardNav = (callbacks?: { onContextMenu?: () => void }) => {
  const getAllVisibleItems = listKeyboardTargets;

  /**
   * フォーカスを移動する
   * @param direction "up" | "down"
   */
  const moveFocus = (direction: "up" | "down") => {
    const all = getAllVisibleItems();
    if (all.length === 0) return;

    if (state.focusedItemId === null) {
      state.focusedItemId = all[0].id;
      return;
    }

    const idx = all.findIndex((i) => i.id === state.focusedItemId);
    if (idx === -1) {
      state.focusedItemId = all[0].id;
      return;
    }

    const nextIdx = direction === "down" ? idx + 1 : idx - 1;
    if (nextIdx >= 0 && nextIdx < all.length) {
      state.focusedItemId = all[nextIdx].id;
      // DOM要素へのスクロール処理は必要であれば追加 (現在は監視側などで処理)
    }
  };

  /**
   * IDからアイテムオブジェクトを検索する
   */
  const findItem = (id: number | null): PsmItem | null => {
    if (id === null) return null;
    const all = getAllVisibleItems();
    return all.find((i) => i.id === id) || null;
  };

  /**
   * グローバルなキーダウンイベントハンドラ
   * App.vueなどでwindowに対して登録して使用する
   */
  const handleGlobalKeydown = (e: KeyboardEvent) => {
    // IME入力中はイベントを処理しない
    if (e.isComposing) return;

    // 標準的な入力要素にフォーカスがある場合はナビゲーションを無効化
    const target = e.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.classList.contains("psm-tree-container")) {
       return;
    }

    if (isTreeKeyboardBlocked(state)) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveFocus("down");
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus("up");
        break;
      case "ArrowRight": {
        const item = findItem(state.focusedItemId);
        if (item && item.is_group && !item.isOpen) {
          e.preventDefault();
          item.isOpen = true;
        }
        break;
      }
      case "ArrowLeft": {
        const item = findItem(state.focusedItemId);
        if (item && item.is_group && item.isOpen) {
          e.preventDefault();
          item.isOpen = false;
        }
        break;
      }
      case " ": // Space
      case "Spacebar": {
        e.preventDefault();
        const item = findItem(state.focusedItemId);
        if (item) {
          // マウス操作と同じ入口を使い、択一グループの兄弟の無効化や、親グループが無効な場合の扱いを揃える
          requestToggleEnabled(item);
        }
        break;
      }
      case "F2": {
        if (state.focusedItemId === null) return;
        e.preventDefault();
        const item = findItem(state.focusedItemId);
        if (item) startEdit(item);
        break;
      }
      case "Enter": {
        // Enterキーでの編集は廃止 (F2へ移行)
        // 必要であればここで有効/無効のトグルなどを行うことも可能だが、
        // 競合回避のためデフォルトでは何もしない（またはSpaceと同じトグルにする）
        // ここでは安全に break するのみとする（Ctrl+Enter生成はApp.vueで処理される）
        break;
      }
      case "Delete": {
        e.preventDefault();
        const item = findItem(state.focusedItemId);
        if (item) startDeleteConfirm(item);
        break;
      }
      case "Insert": {
        e.preventDefault();
        if (state.focusedItemId === null) return;
        
        let found = findParentAndItem(state.focusedItemId, state.positive, state.positive);
        if (!found) found = findParentAndItem(state.focusedItemId, state.negative, state.negative);

        if (found) {
          const { item, parent, index } = found;
          const isGroupToAdd = e.shiftKey;

          // 戦略:
          // 開いているグループの場合 -> 子供の先頭に追加
          // それ以外 -> 現在のアイテムの後ろ（兄弟）に追加
          if (item.is_group && item.isOpen && item.children) {
             addItem(item.children, isGroupToAdd, 0); // 子の先頭へ
          } else {
             // 兄弟として追加
             addItem(parent, isGroupToAdd, index + 1);
          }
        }
        break;
      }
      case "ContextMenu":
      case "F10": {
        if (e.key === "F10" && !e.shiftKey) return; // Shift+F10のみ
        if (state.focusedItemId) {
          e.preventDefault();
          callbacks?.onContextMenu?.();
        }
        break;
      }
    }
  };

  return {
    handleGlobalKeydown,
  };
};
