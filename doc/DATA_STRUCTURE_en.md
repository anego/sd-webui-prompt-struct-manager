# Prompt Struct Manager - Data Structure

## 1. TypeScript Types (`src/types.ts`)

### `PsmItem`
Basic unit representing a prompt or a group. Has a recursive structure.
```typescript
export interface PsmItem {
  id: number;           // Unique identifier (Current Impl: Date.now() + Math.random())
  name: string;         // Display name (Group name or Prompt alias)
  content: string;      // Actual prompt string (e.g., "1girl, solo")
  enabled: boolean;     // Enable/Disable flag
  weight: number;       // Emphasis weight (Standard: 1.0)
  memo?: string;        // User memo
  
  is_group: boolean;    // Is group or not
  isOpen?: boolean;     // Expansion state for group (UI)
  children?: PsmItem[]; // Children array (if is_group: true)
  
  depth?: number;       // For display: Hierarchy depth (Computed or temp attached)
}
```

## 2. YAML File Structure
Saved YAML files have the following root structure.

```yaml
positive:
  - id: 1234567890.123
    name: "Character"
    content: ""
    enabled: true
    is_group: true
    children:
      - id: 1234567890.456
        name: "Main Character"
        content: "1girl, silver hair"
        enabled: true
        weight: 1.2
        is_group: false

negative:
  - id: 9876543210.123
    name: "Low Quality"
    content: "lowres, bad anatomy"
    enabled: true
    is_group: false
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
  "toggle_shortcut": "Ctrl+Q"
}
```
