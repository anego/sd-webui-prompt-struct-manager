# Prompt Struct Manager - Features

## 1. Prompt Management

### 1.1 Tree Structure
- **Positive / Negative:** Manage prompts in two independent trees.
- **Grouping:** Create folders to categorize prompts.
- **Infinite Nesting:** Create groups within groups (no depth limit).
- **Reorder:** Intuitive reordering via Drag & Drop.

### 1.2 Prompt Editing
- **Enable/Disable:** Temporarily disable prompts via checkboxes without deleting them. Disabling a parent group excludes all child elements from output.
- **Weighting:** GUI adjustment for weights (e.g., `(word:1.2)` in SD WebUI format). Includes a reset button to restore `1.0`.
- **Memo:** Attach memos to each prompt, viewable via tooltips.

## 2. User Interface (UI/UX)

### 2.1 Group Map
- A navigation bar permanently displayed on the right side of the screen.
- **Func:** Lists the current tree structure (groups only).
- **Click Jump:** Automatically scrolls to the corresponding group position by clicking on an item.
- **Visibility:** Visual indentation guides (vertical lines) are displayed to visualize parent-child relationships for deep hierarchical structures.
- **Prompt Count:** Displays the total count of enabled prompts within each group next to the group name.

### 2.2 shortcuts
- **Global Toggle:** Customizable via settings (Default: None). Toggles PSM panel visibility.
- **Apply & Close:** `Ctrl + Shift + Enter` applies the current prompt to WebUI and closes the panel.
- **Keyboard Navigation:** Move items with arrow keys, Edit with Enter, Toggle Enable/Disable with Space.

### 2.3 Theme and Style
- **Dark Mode:** Adopts a design that blends well with the WebUI dark theme.
- **Vuetify 3:** Uses Material Design based components.
- **Embedded Icons:** MDI icon fonts are embedded inline to prevent rendering issues.

## 3. File & Settings Management

### 3.1 YAML Persistence
- Prompt data is saved in YAML format in a local directory.
- **Multi-file Management:** Create multiple YAML files for different purposes and switch between them via a dropdown.
- **File Operations:** Create New, Duplicate, Rename, Delete.

### 3.2 Global Settings
- **UI Scale:** 3-stage adjustment: Small / Medium / Large.
- **Language:** Switch between Japanese / English.
- **Save Location (Storage):** Change the YAML file save directory at the bottom of the sidebar.
- **File List Refresh:** Reload the file structure via the refresh button.

## 4. Developer Features (Dev Mode)
- **Debug Log:** Detailed debug info is output to the console only in Dev Mode via `src/log.ts`.
- **Import:** An external import feature (experimental) is displayed in the UI only when in developer mode.
