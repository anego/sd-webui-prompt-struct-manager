import { computed } from "vue";
import { state } from "../store";
import { messages } from "../i18n/messages";

export const useI18n = () => {
  const t = (key: string, params?: Record<string, string>): string => {
    const lang = state.lang as "ja" | "en";
    const dict = messages[lang] || messages["ja"];
    // @ts-ignore
    let text = dict[key] || key;
    
    if (params) {
      Object.keys(params).forEach(k => {
        text = text.replace(`{${k}}`, params[k]);
      });
    }
    return text;
  };

  return { t };
};
