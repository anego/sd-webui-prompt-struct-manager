# Prompt Struct Manager - Data Structure

## 1. TypeScript Types (`src/types.ts`)

### `PsmItem`
Basic unit representing a prompt or a group. Has a recursive structure.
```typescript
export interface PsmItem {
  id: number;           // Unique identifier (Current Impl: complete integer generated via Date.now() * 1000 + Math.floor(Math.random() * 1000))
  name: string;         // Display name (Group name or Prompt alias)
  content: string;      // Actual prompt string (e.g., "1girl, solo")
  enabled: boolean;     // Enable/Disable flag
  weight: number;       // Emphasis weight (Standard: 1.0)
  memo?: string;        // User memo
  
  is_group: boolean;    // Is group or not
  isRandom?: boolean;   // Random group (Output in Dynamic Prompts {A|B} format)
  isExclusive?: boolean;// Exclusive group selection (single-choice mode) flag
  isOpen?: boolean;     // Expansion state for group (UI)
  children?: PsmItem[]; // Children array (if is_group: true)

  isNatural?: boolean;  // Natural-language item (skips replacement/escaping, output as-is)
  sourceText?: string;  // Source text before translation (never included in output)
  category?: PsmCategory; // Group tag category (used for output ordering in anima mode)
  headerColor?: string;   // Group header background color (CSS color string; default when omitted)

  depth?: number;       // For display: Hierarchy depth (Computed or temp attached)
}

// Tag category (Anima recommended order: quality → subject → character → series → artist → general)
export type PsmCategory = "quality" | "subject" | "character" | "series" | "artist" | "general";

// Model mode (per YAML file; undefined falls back to "sd")
export type ModelMode = "sd" | "anima";

// Translation provider / profile / settings (Phase 2.5)
export type TranslateProvider = "openai" | "deepl";

export interface TranslateProfile {
  provider: TranslateProvider;
  endpoint: string;     // e.g. http://localhost:11434/v1
  model: string;        // used by OpenAI-compatible only (ignored by DeepL)
  api_key: string;
  timeout_sec: number;
  system_prompt: string; // empty = built-in default
}

export interface TranslateSettings {
  active: "local" | "cloud"; // currently active profile
  local: TranslateProfile;
  cloud: TranslateProfile;
}

export interface PsmProfileState {
  id: number;           // Target prompt ID
  enabled: boolean;     // Enable/Disable flag at snapshot
  weight: number;       // Weight value at snapshot
}

export interface PsmProfile {
  name: string;         // Profile name
  states: PsmProfileState[]; // State list for each item
}
```

## 2. YAML File Structure
Saved YAML files have the following root structure.

```yaml
model_mode: anima   # "sd" | "anima" (defaults to "sd" when omitted; added in Phase 2)
positive:
  - id: 1780190551195
    name: "Character"
    content: ""
    enabled: true
    is_group: true
    children:
      - id: 1780190551200
        name: "Main Character"
        content: "1girl, silver hair"
        enabled: true
        weight: 1.2
        is_group: false

negative:
  - id: 1780190551300
    name: "Low Quality"
    content: "lowres, bad anatomy"
    enabled: true
    is_group: false

profiles:
  - name: "MyProfile"
    states:
      - id: 1780190551200
        enabled: true
        weight: 1.2
```

- **positive:** Root array for the Positive prompt tree.
- **negative:** Root array for the Negative prompt tree.
- **model_mode:** Target model mode. Undefined or invalid values fall back to `sd` (backward compatible).
- **Unknown key preservation:** On save, unknown root keys found in the existing file are carried over (forward compatibility with future versions).

## 3. Configuration Data (`localStorage` / `config.json`)

### `config.json` (Server-side)
Configuration file managed by the Python backend.
```json
{
  "save_dir": "C:/Path/To/Prompts",
  "is_configured": true,
  "dev_mode": false
}
```

### `psm_settings` (LocalStorage)
Browser-specific UI settings.
```json
{
  "ui_scale": "medium",
  "lang": "en",
  "last_file": "my_prompts.yaml",
  "sidebar_open": true,
  "toggle_shortcut": "Ctrl+Q",
  "duplicate_check_mode": "none",
  "show_weight_slider": true
}
```

### `psm_translate_settings` (LocalStorage)
Translation settings (Phase 2.5). Kept in a separate key from `psm_settings` because it contains API keys.
Never persisted server-side; the active profile is sent to the backend with each translation request.
```json
{
  "active": "local",
  "local": {
    "provider": "openai",
    "endpoint": "http://localhost:11434/v1",
    "model": "qwen3:4b",
    "api_key": "",
    "timeout_sec": 30,
    "system_prompt": ""
  },
  "cloud": {
    "provider": "openai",
    "endpoint": "https://api.openai.com/v1",
    "model": "gpt-5-mini",
    "api_key": "sk-...",
    "timeout_sec": 30,
    "system_prompt": ""
  }
}
```
