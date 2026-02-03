# Prompt Struct Manager (PSM) - Overview

## 1. Project Overview
**Prompt Struct Manager (PSM)** is an extension for Stable Diffusion WebUI (Automatic1111 / Forge).
It aims to provide an efficient image generation workflow by managing potentially complex prompts in a "structured" way.

### Key Solutions
- Block management of prompts (categorize outfits, backgrounds, styles, etc. into folders).
- Visual organization via hierarchical structures.
- Quick switching of presets.
- One-click application to the standard WebUI text area.

## 2. Architecture
This extension has a hybrid structure consisting of a backend (Python/Gradio) and a frontend (Vue.js/TypeScript).

### Frontend
- **Framework:** Vue.js 3 (Composition API)
- **UI Library:** Vuetify 3 (Material Design)
- **Build Tool:** Vite
- **Language:** TypeScript
- **State Management:** Reactive Store (`src/store.ts`)
- **Overlay Method:** Mounted as an overlay on the WebUI DOM via `javascript/psm_panel.js`.

### Backend
- **Framework:** Python (Stable Diffusion WebUI Extension API)
- **API:** Custom API endpoints implementation using FastAPI (internal to WebUI)
- **Persistence:** YAML file storage on the local file system.

## 3. File Structure
```
extensions/sd-webui-prompt-struct-manager/
├── doc/                # Documentation
├── javascript/         # WebUI entry point (psm_panel.js)
├── scripts/            # Build scripts (embed_font.js)
├── src/                # Vue.js Frontend Source Code
│   ├── components/     # UI Components (GroupMap, TreePane, etc.)
│   ├── composables/    # Shared Logic (useKeyboardNav, etc.)
│   ├── App.vue         # Main Component
│   ├── main.ts         # Entry Point
│   ├── store.ts        # State Management
│   ├── log.ts          # Logger
│   └── types.ts        # Type Definitions
├── dist/               # Build Artifacts (index.js)
├── vite.config.ts      # Vite Config
└── package.json        # Dependencies
```

## 4. Key Technical Decisions
- **CSS Injected by JS:** To avoid load order and caching issues in the WebUI environment, CSS is injected within the JS bundle or embedded via Base64.
- **Font Embedding:** MDI icons are embedded as Base64 in CSS (`.woff2`) to ensure reliable operation in offline or restricted network environments.
- **Dev Mode:** Debug logs and import features for developers are controlled by global configuration flags.
