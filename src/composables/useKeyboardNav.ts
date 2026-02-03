/**
 * キーボードナビゲーション機能を提供するコンポーザブル
 * 矢印キーによる移動、Enter/Space/Deleteなどのショートカットを処理します。
 * 
 * @param callbacks 各種イベントコールバック (context menuなど)
 */
import { PsmItem } from "../types";
import { state, startEdit, startDeleteConfirm, toggleGroupEnabled, addItem, findParentAndItem } from "../store";

// 表示中のアイテムを再帰的にフラット化するヘルパー
const getVisibleFlatList = (nodes: PsmItem[]): PsmItem[] => {
  const list: PsmItem[] = [];
  for (const node of nodes) {
    if (!node) continue;
    list.push(node);
    if (node.is_group && node.isOpen && node.children) {
      list.push(...getVisibleFlatList(node.children));
    }
  }
  return list;
};

export const useKeyboardNav = (callbacks?: { onContextMenu?: () => void }) => {
  /**
   * 現在表示されている全てのアイテム（Positive/Negative両方）を
   * フラットなリストとして取得する
   * 開いているグループの子要素も再帰的に含まれます。
   */
  const getAllVisibleItems = () => {
    // コンテキストに応じた処理や、Positive/Negativeの結合順序を定義
    // ここでは単純に Positive -> Negative の順で結合します
    const pos = state.posOpen ? getVisibleFlatList(state.positive) : [];
    const neg = state.negOpen ? getVisibleFlatList(state.negative) : [];
    return [...pos, ...neg];
  };

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

    if (state.isEditing || state.isDeleting || !state.isVisible) return;

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
           toggleGroupEnabled(item);
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
