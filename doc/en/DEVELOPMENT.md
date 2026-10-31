# Prompt Struct Manager - Developer Guide

## 1. Build Environment Setup

### Requirements
- [Bun](https://bun.com/) (1.3 or higher; install on Windows with `scoop install bun`). Node.js is not required.

### Installation
```bash
cd extensions/sd-webui-prompt-struct-manager
bun install
```

## 2. Build Process

### Production Build
```bash
bun run build
```
This command internally executes the following steps:
1. `bun scripts/embed_font.js`: Converts MDI font to Base64 and generates CSS (`src/mdi-embedded.css`).
2. `bun --bun vite build`: Builds the Vue application and outputs to `dist/` directory.

### Watch Build
```bash
bun run dev
```
*Note: Rebuilds into `dist/` when sources change. Reload the WebUI to see the changes.*

## 3. Directory Structure & Key Files

### `scripts/embed_font.js`
Critical script to prevent MDI icon (`@mdi/font`) display issues.
- Reads `node_modules/@mdi/font/fonts/materialdesignicons-webfont.woff2`.
- Base64 encodes it and creates `@font-face` definition.
- Outputs as `src/mdi-embedded.css`, imported by `main.ts`.

### `src/log.ts`
Unified Logger module.
- `Logger.info()`: Always output.
- `Logger.debug()`: Output only if `state.isDevMode` is `true`.
- Automatically adds `[PSM]` prefix.

## 4. Testing
Unit tests run with `bun test`. Playwright E2E tests were removed in v1.6.0 and replaced by manual checks (see [tests/TEST_SPEC_en.md](../../tests/TEST_SPEC_en.md)).
```bash
bun run test:unit
```

## 5. Debugging
Filter by `[PSM]` in the browser console to isolate extension logs.
If detailed logs are needed, set `dev_mode` to `true` in the configuration file (`config.json`) or enable developer mode via the UI (if implemented).
