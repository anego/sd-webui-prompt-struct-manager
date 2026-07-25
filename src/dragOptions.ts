/**
 * ドラッグ&ドロップ (SortableJS / vuedraggable) の共通オプション
 *
 * PSMは gradio-app の shadowRoot 内にマウントされるため、HTML5ネイティブDnDは
 * イベント伝播が不安定になる。そのため forceFallback (SortableJSのマウス駆動モード)
 * に統一し、ネイティブの dragover/drop ハンドラは使用しない。
 *
 * ドロップ精度に直結するオプションを1箇所へ集約している。
 */
export const DRAG_OPTIONS = {
  /**
   * pull: "clone" にすることで、他リストへドラッグしている間も移動元から要素が抜けない。
   *
   * 既定 (pull: true) では移動元から要素が即座に抜かれるためレイアウトが詰まり、
   * 下にあるグループが上へずれてドロップ先がカーソルから逃げてしまう。
   * クローン方式では移動元の見た目が保たれるため、狙った位置が動かない。
   * 移動元からの削除はドロップ確定後に finalizeCrossListMove() が行う。
   */
  group: { name: "psm-tree", pull: "clone" as const, put: true },
  /** ドロップ後に残る視覚上のクローンを元へ戻す (データはVue側で再描画されるため見た目のみ) */
  revertClone: true,

  handle: ".psm-node__drag-handle",
  animation: 150,

  /** shadowRoot内でのネイティブDnD不安定性を避けるためフォールバックを強制 */
  forceFallback: true,
  fallbackTolerance: 3,
  /** ドラッグ中のクローンをbody直下に出し、スクロールコンテナでのクリッピングを防ぐ */
  fallbackOnBody: true,

  /** 空・短いリストへ入れやすくする (閉じたグループのドロップゾーン対策, px) */
  emptyInsertThreshold: 14,
  /** flex-wrapで折り返す横並びレイアウトでの挿入位置のブレを抑える */
  swapThreshold: 0.65,
  invertSwap: true,

  /** ドラッグ中の自動スクロール (遠い位置のグループへ届くようにする) */
  scroll: true,
  scrollSensitivity: 80,
  scrollSpeed: 12,
  bubbleScroll: true,

  /** 視覚フィードバック用のクラス */
  ghostClass: "psm-drag-ghost",
  chosenClass: "psm-drag-chosen",
  dragClass: "psm-drag-active",
} as const;
