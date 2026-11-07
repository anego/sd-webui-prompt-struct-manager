import { describe, it, expect, afterEach } from "bun:test";
import { stubGlobal, unstubAllGlobals } from "./helpers/globals";
import { getWebUiRoot, findNodeElement } from "../src/webUiRoot";

// -------------------------------------------------------------------------
// WebUI の画面要素を探す起点 (getWebUiRoot / findNodeElement) のテスト
// -------------------------------------------------------------------------
// gradio-app が shadowRoot を持つ環境では、ツリーの要素も shadowRoot の中にあるため、
// document ではなく shadowRoot から探す必要がある (重複の一覧の「場所を表示」などのスクロールに使う)。

/** getElementById で探した id を記録し、登録済みの id にだけ要素を返す、探索の起点の代わり */
const createSearchRoot = (label: string, ids: string[]) => {
  const requested: string[] = [];
  return {
    label,
    requested,
    getElementById: (id: string): { id: string; root: string } | null => {
      requested.push(id);
      return ids.includes(id) ? { id, root: label } : null;
    },
  };
};

/** gradio-app の有無と shadowRoot の有無を指定して、document の代わりを作る */
const createDocument = (options: { hasGradioApp: boolean; shadowRoot: ReturnType<typeof createSearchRoot> | null }, ids: string[] = []) => {
  const doc = createSearchRoot("document", ids);
  return {
    ...doc,
    querySelector: (selector: string) =>
      selector === "gradio-app" && options.hasGradioApp ? { shadowRoot: options.shadowRoot } : null,
  };
};

describe("getWebUiRoot / findNodeElement - WebUI の画面要素を探す起点", () => {
  afterEach(() => {
    unstubAllGlobals();
  });

  it("1.1 gradio-app が shadowRoot を持つ場合は、shadowRoot からアイテムの要素を探すこと", () => {
    // Arrange
    const shadowRoot = createSearchRoot("shadowRoot", ["node-12"]);
    const doc = createDocument({ hasGradioApp: true, shadowRoot });
    stubGlobal("document", doc);

    // Act
    const root: unknown = getWebUiRoot();
    const element: unknown = findNodeElement(12);

    // Assert
    expect(root).toBe(shadowRoot);
    expect(element).toEqual({ id: "node-12", root: "shadowRoot" });
    expect(doc.requested).toEqual([]);
  });

  it("1.2 gradio-app が無い、または shadowRoot を持たない場合は、document から探すこと", () => {
    // Arrange
    const withoutApp = createDocument({ hasGradioApp: false, shadowRoot: null }, ["node-3"]);
    const withoutShadow = createDocument({ hasGradioApp: true, shadowRoot: null }, ["node-3"]);

    // Act
    stubGlobal("document", withoutApp);
    const fromNoApp: unknown = findNodeElement(3);
    stubGlobal("document", withoutShadow);
    const fromNoShadow: unknown = findNodeElement(3);

    // Assert
    expect(fromNoApp).toEqual({ id: "node-3", root: "document" });
    expect(fromNoShadow).toEqual({ id: "node-3", root: "document" });
  });

  it("1.3 該当する要素が無い場合は null を返すこと", () => {
    // Arrange
    const shadowRoot = createSearchRoot("shadowRoot", []);
    stubGlobal("document", createDocument({ hasGradioApp: true, shadowRoot }));

    // Act
    const element = findNodeElement(999);

    // Assert
    expect(element).toBeNull();
    expect(shadowRoot.requested).toEqual(["node-999"]);
  });
});
