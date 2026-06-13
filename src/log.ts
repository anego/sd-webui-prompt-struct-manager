/**
 * Logger utility for Prompt Struct Manager
 * Prefixes all logs with [PSM] for easy filtering.
 */

let isDebugMode = false;

export const setDebugMode = (enabled: boolean) => {
  isDebugMode = enabled;
};

export const Logger = {
  info: (msg: string, ...args: unknown[]) => {
    console.info(`[PSM] ${msg}`, ...args);
  },

  warn: (msg: string, ...args: unknown[]) => {
    console.warn(`[PSM] ${msg}`, ...args);
  },

  error: (msg: string, ...args: unknown[]) => {
    console.error(`[PSM] ${msg}`, ...args);
  },

  debug: (msg: string, ...args: unknown[]) => {
    if (isDebugMode) {
      console.debug(`[PSM] [Debug] ${msg}`, ...args);
    }
  }
};

