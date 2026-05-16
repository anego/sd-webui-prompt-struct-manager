# Prompt Struct Manager - Developer Guide

## 1. Build Environment Setup

### Requirements
- Node.js (v18 or higher recommended)
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

## 4. Testing (E2E)
E2E testing environment using Playwright is configured.
```bash
npx playwright test
```

## 5. Debugging
Filter by `[PSM]` in the browser console to isolate extension logs.
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
