/**
 * bun:test には vitest の vi.stubGlobal / vi.unstubAllGlobals に相当する機能が無いため、
 * グローバル変数 (fetch, document, localStorage など) の差し替えと復元を行うヘルパー。
 *
 * bun test は全テストファイルを同一プロセスで実行するため、差し替えたままにすると
 * 別ファイルのテストへ漏れる。各ファイルの afterEach で unstubAllGlobals() を呼んで元に戻すこと。
 */

/** 差し替え前のプロパティ記述子 (元から存在しなかった場合は undefined) */
const originals = new Map<string, PropertyDescriptor | undefined>();

/**
 * グローバル変数を指定の値に差し替える。
 * 同じ名前を複数回差し替えても、復元時には最初の差し替え前の状態に戻る。
 */
export const stubGlobal = (name: string, value: unknown): void => {
  if (!originals.has(name)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
};

/** stubGlobal で差し替えたグローバル変数をすべて差し替え前の状態に戻す */
export const unstubAllGlobals = (): void => {
  for (const [name, descriptor] of originals) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  }
  originals.clear();
};
