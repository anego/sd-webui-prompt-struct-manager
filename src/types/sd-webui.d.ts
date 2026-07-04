declare global {
  interface Window {
    onUiLoaded?: (fn: () => void | Promise<void>) => void;
    addAutocompleteToArea?: (textArea: HTMLTextAreaElement) => void;
  }
}

export {};
