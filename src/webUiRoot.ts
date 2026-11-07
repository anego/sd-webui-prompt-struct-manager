/**
 * WebUI (Gradio) の画面要素を探す起点を返す
 * gradio-app が shadowRoot を持つ環境では、WebUI の要素も PSM の要素 (main.ts でその中にマウントする) も shadowRoot の中にあり、
 * document.getElementById では見つからない。shadowRoot が無い環境では document を返す。
 */
export const getWebUiRoot = (): Document | ShadowRoot => {
  const gradioApp = document.querySelector("gradio-app");
  return gradioApp?.shadowRoot || document;
};

/** ツリー上のアイテムの要素を探す (PsmNode は `node-<ID>` の id を付けている) */
export const findNodeElement = (itemId: number): HTMLElement | null => getWebUiRoot().getElementById(`node-${itemId}`);
