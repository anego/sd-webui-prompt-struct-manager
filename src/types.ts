/**
 * プロンプト構造管理マネージャーの基底となるアイテム定義
 * グループとプロンプト（葉ノード）の両方を表現します。
 */
export interface PsmItem {
  /** ユニークID (Date.now() + Math.random()) */
  id: number;
  /** 表示名 (グループ名やプロンプトの別名) */
  name: string;
  /** プロンプト内容 (タグ) */
  content: string; // グループの場合は空文字の場合が多いが、便宜上存在
  /** 有効/無効フラグ (無効時はプロンプト生成に含まれない) */
  enabled: boolean;
  /** 重み (Attention) 係数 (1.0が標準) */
  weight: number;
  /** ユーザー用のメモ書き */
  memo: string;
  /** trueならグループ（フォルダ）、falseならプロンプト（葉） */
  is_group: boolean;
  /** UI上の開閉状態 (グループの場合のみ有効) */
  isOpen?: boolean; // UI状態制御用
  /** 子要素のリスト (グループの場合のみ存在) */
  children?: PsmItem[];
}
