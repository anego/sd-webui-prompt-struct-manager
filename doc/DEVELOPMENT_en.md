# Prompt Struct Manager - Developer Guide

## 1. Build Environment Setup

### Requirements
- Node.js (v24 or higher recommended, locked to v24.13.0 via Volta)
- npm

### Installation
```bash
cd extensions/sd-webui-prompt-struct-manager
npm install
```

## 2. Build Process

### Production Build
```bash
npm run build
```
This command internally executes the following steps:
1. `node scripts/embed_font.js`: Converts MDI font to Base64 and generates CSS (`src/mdi-embedded.css`).
2. `vite build`: Builds the Vue application and outputs to `dist/` directory.

### Development Server
```bash
npm run dev
```
*Note: To verify integration with WebUI, build files usually need to be in place. Use `npm run build -- --watch` or set up a hot-reload environment.*

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

## 4. Automated Testing

To ensure quality and reliability, this project utilizes a 3-layered automated test suite consisting of frontend unit tests (Vitest), backend unit tests (pytest), and end-to-end browser tests (Playwright).

### 4.1 Frontend Unit Tests (Vitest)
Tests frontend store logic (`store.ts`), state management, duplicate detection, exclusive selection, and profile snapshots.
- **Test file:** `tests/store_prompt.spec.ts`
- **Total Tests:** 22 passed
- **Command:**
  ```bash
  npm run test:unit
  ```

### 4.2 Backend Unit Tests (pytest)
Tests Python API endpoints, configuration file I/O, and YAML storage schemas.
- **Test file:** `tests/test_psm_extension.py`
- **Total Tests:** 16 passed
- **Command:**
  ```bash
  pytest
  ```

### 4.3 E2E Tests (Playwright)
Simulates user interaction in a real browser to verify the Setup Wizard, drag & drop, keyboard shortcuts, weight sliders, and profile UI states.
- **Test file:** `tests/design.spec.ts` etc.
- **Total Tests:** 9 passed
- **Command:**
  ```bash
  # Ensure the WebUI server is running locally (default: http://localhost:7860)
  npx playwright test
  ```
- **Local Test Script (Windows):**
  You can run `test_local.bat` in the root folder to install dependencies and run Playwright tests in one go.
  ```bash
  .\test_local.bat
  ```

## 5. Debugging
Filter by `[PSM]` in the browser console to isolate extension logs.

This extension adheres to the browser's standard console log level conventions. Detailed trace logs for development are output using `console.debug()`, standard application milestones using `console.info()`, and errors or warnings using `console.error()` / `console.warn()`.
As a consequence, the default console view (Info level and above) is kept clean in production. You can inspect detailed trace logs by enabling the "Verbose" or "Debug" log level in your browser's developer tools.

If detailed logs are needed, set `dev_mode` to `true` in the configuration file (`config.json`) or enable developer mode via the UI (if implemented).

## 6. Styling & CSS Architecture

To ensure high maintainability and scalability, this project adheres to the following styling guidelines:

### 6.1 SCSS & BEM Methodology
- **SCSS** is used for styling, and class names must strictly follow the **BEM (Block, Element, Modifier)** methodology.
- This prevents style collisions between components and clarifies the visual structure (e.g., `.psm-node`, `.psm-node__add-zone`, `.psm-node--focused`).

### 6.2 Centralized Variables
- Hardcoded magic numbers for colors, sizes, and Z-indexes are strictly prohibited.
- All global constants are defined in `src/styles/_variables.scss` and accessed using `@use` in each component.
- This allows for global theme or layout adjustments from a single source of truth.

### 6.3 Prohibition of `!important`
- Using `!important` to override Vuetify's default styles is **strictly prohibited**.
- Instead, override styles safely by **increasing CSS Specificity**, such as prefixing with parent selectors (e.g., `html body .psm-app-root`) or tag names (e.g., `div.psm-node`).
