/**
 * Vuetify のテキスト入力 (v-text-field) の値を文字列に変換する
 * clearable のクリアボタンを押すと v-model に null が入るため、空文字列として扱う。
 * 検索欄の値は toLowerCase などの文字列操作に渡すため、状態には常に文字列を保つこと。
 */
export const toInputText = (value: string | null | undefined): string => value ?? "";
