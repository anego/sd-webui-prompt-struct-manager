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
  
  depth?: number;       // For display: Hierarchy depth (Computed or temp attached)
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
