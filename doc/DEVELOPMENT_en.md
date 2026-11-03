# Prompt Struct Manager - Developer Guide

## 1. Build Environment Setup

### Requirements
- [Bun](https://bun.com/) (1.3 or higher)
  - Bun handles package management, builds, and unit tests. Node.js is not required.
- Python (the SD WebUI venv) — only needed to run the backend tests

### Installing Bun (Windows)
Install it with [Scoop](https://scoop.sh/):
```bash
scoop install bun
bun --version
```
Update it through Scoop as well (do not use `bun upgrade`, which updates outside Scoop's management):
```bash
scoop update bun
```

### Installing Dependencies
```bash
cd extensions/sd-webui-prompt-struct-manager
bun install
```
Versions are locked in `bun.lock`.

## 2. Build Process

### Production Build
```bash
bun run build
```
This command internally executes the following steps:
1. `bun scripts/embed_font.js`: Converts MDI font to Base64 and generates CSS (`src/mdi-embedded.css`).
2. `bun --bun vite build`: Builds the Vue application and outputs to `dist/` directory.

The build output (`dist/index.js`) is committed to the repository. The WebUI only loads this file, so end users need neither Bun nor Node.js.

### Watch Build
```bash
bun run dev
```
Rebuilds into `dist/` when sources change. Reload the WebUI to see the changes.

### About the `--bun` Flag
The `package.json` scripts invoke `vite` as `bun --bun vite ...`. On a machine with Node.js installed, omitting `--bun` makes Bun follow the `#!/usr/bin/env node` shebang at the top of `vite` and run it with Node.js. When adding scripts or tools, make sure they do not run on Node.js (see "4.4 Verifying Node.js Independence").

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

### `src/dragOptions.ts`
Centralized drag & drop (SortableJS / vuedraggable) options.
- **`forceFallback: true`**: PSM is mounted inside the `gradio-app` shadowRoot, where HTML5 native DnD event propagation is unreliable. Everything is unified on SortableJS's mouse-driven fallback mode (do **not** add native `dragover` / `drop` handlers).
- **`pull: "clone"`**: Keeps the item in its source list while dragging to another list. Otherwise the source collapses, shifting the layout so the drop target escapes the cursor. Removal from the source is performed by `finalizeCrossListMove()` after the drop is committed.
- Drop-accuracy settings (`fallbackOnBody` / `emptyInsertThreshold` / `swapThreshold` / `invertSwap` / `scroll`) are also managed here.

### `scripts/psm/translate.py`
Translation backend with provider abstraction.
- `PROVIDERS` registers `openai` (OpenAI-compatible API) and `deepl`. To add a provider, implement `_translate_<name>()` and register it.
- Stateless by design: translation settings are sent from the frontend (localStorage) with each request.
- `sanitize_response()` strips Qwen-style `<think>` blocks, prefixes, and surrounding quotes.

### `scripts/psm/tagdb.py`
Tag DB lookup and subcategory classification.
- Auto-discovers `extensions/*/tags/danbooru*.csv` (tagcomplete) with lazy loading and an in-process cache (measured: ~170k entries in 0.14s).
- `lookup()` maps Danbooru tag types to PSM categories; `subcategory()` applies keyword rules for the 13 subcategories.
- `SUBCATEGORY_RULES` is **evaluated in order**, so put more specific rules first (e.g. `hair ornament` before `hair`). Keys must stay in sync with `SUBCAT_LABELS` / `SUBCAT_ORDER` in `store.ts`.

## 4. Automated Testing

This project covers logic with two automated test suites, frontend unit tests (`bun test`) and backend unit tests (pytest), and covers screen rendering and interaction with manual checks before each release. See [tests/TEST_SPEC_en.md](../tests/TEST_SPEC_en.md) for details.

### 4.1 Frontend Unit Tests (`bun test`)
Tests frontend store logic (`store.ts`): state management, duplicate detection, exclusive selection, profile snapshots,
prompt compilation (underscore protection / category ordering), translation, diffing, token estimation,
PNG Info import, quick move-to, drag & drop move finalization, and adding/editing/duplicating/deleting items.
- **Test files:**
  - `tests/store_prompt.spec.ts` — store logic in general
  - `tests/groupMapUtils.spec.ts` — group map aggregation
  - `tests/generationFields.spec.ts` — reading/applying generation setting fields
- **Total Tests:** 238
- **Command:**
  ```bash
  bun run test:unit
  ```
- **Note:** The runner is `bun:test`, and test collection is limited to `tests/` via `bunfig.toml`. Since `vi` in `bun:test` has no `stubGlobal` / `unstubAllGlobals`, use `stubGlobal()` / `unstubAllGlobals()` from `tests/helpers/globals.ts` to replace globals such as `fetch` (`bun test` runs all test files in a single process, so always restore them in `afterEach`).

### 4.2 Backend Unit Tests (pytest)
Tests Python API endpoints, configuration file I/O, YAML storage schemas, translation providers, and tag DB classification.
- **Test files:**
  - `tests/test_psm_extension.py` — API, config, YAML persistence
  - `tests/test_psm_cache.py` — write cache debounce behavior
  - `tests/test_psm_translate.py` — translation providers, response sanitization, error mapping
  - `tests/test_psm_tagdb.py` — tag DB loading, category mapping, subcategory rules
- **Total Tests:** 125 (after `parametrize` expansion)
- **Command:**
  ```bash
  ..\..\venv\Scripts\python -m pytest tests\
  ```

### 4.3 Manual Checks
Playwright E2E tests were removed in v1.6.0. Appearance (colors, borders, layout), keyboard/mouse interactions, and Prompt Dictionary integration are checked before each release (and after any UI-related change) following the [manual verification checklist in tests/TEST_SPEC_en.md](../tests/TEST_SPEC_en.md#23-manual-verification-checklist).
1. Run `bun run build`
2. Reload the WebUI (no restart is needed if nothing changed on the Python side)
3. Go through the checklist items in order

### 4.4 Verifying Node.js Independence
To confirm that development works with Bun alone on a machine that has Node.js installed, temporarily remove Node.js from PATH in PowerShell before running the commands (this only affects that window, not other terminals):
```powershell
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notmatch 'nodejs|volta' }) -join ';'
node --version  # make sure it is not found
bun install; bun run build; bun run test:unit
```
If a script is missing the `--bun` flag, it fails because `node` cannot be found.

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
