# Prompt Struct Manager - Features

## 1. Prompt Management

### 1.1 Tree Structure
- **Positive / Negative:** Manage prompts in two independent trees.
- **Grouping:** Create folders to categorize prompts.
- **Infinite Nesting:** Create groups within groups (no depth limit).
- **Reorder:** Drag-and-drop handles (two columns of dots) are added to the left of groups and prompts for precise and intuitive reordering.
- **Long Text Protection (Edit Icon Protection):** When prompt names or contents are extremely long, the maximum width of the chip text is automatically scaled down (110px) and the flex-shrink properties are optimized to keep the edit (pencil) icon visible and clickable.

### 1.2 Prompt Editing & Adjustment
- **Enable/Disable:** Temporarily disable prompts via checkboxes without deleting them. Disabling a parent group excludes all child elements from output.
- **Weighting:** Features a compact slider UI (`0.1` to `2.0`) next to each prompt chip for intuitive adjustments. Reset instantly to `1.0` with the "↺" button on the right edge of the slider.
- **Toggle Slider Visibility:** You can turn the weight slider ON/OFF in settings (gear icon). The choice is remembered (LocalStorage) even after reloading the page.
- **Underscore to Space Auto-Replacement:** If prompt content contains underscores (e.g., `sway_back`), they are automatically replaced with single spaces (e.g., `sway back`) when compiling and reflecting to the WebUI. The following tokens are protected and keep their underscores intact (checked per comma-separated token, so mixed multi-tag items are handled correctly):
  - Dynamic Prompts wildcards (e.g., `__character__`)
  - Score tags (`score_7`, `score_8_up`, etc. — used by Anima / Pony models)
  - 3-character emoticon tags (`^_^`, `>_<`, `@_@`, `0_0`, etc.)
  - Extra network syntax (`<lora:name_v2:0.8>`, `<hypernet:...>`, etc.)
- **Tag Autocomplete Integration:** If `a1111-sd-webui-tagcomplete` is enabled, tag suggestions are available when typing prompts.
- **Memo:** Attach memos to each prompt, viewable via tooltips.

### 1.3 Exclusive Group Selection (Single-Choice Mode)
- **Feature Overview:** A toggle switch (teal blue) is placed on the right side of group headers.
- **Exclusive Logic:** When active, enabling (checking) one prompt inside the group automatically disables (unchecks) all other sibling prompts.
- **Auto-Cleanup:** If you activate the single-choice mode on a group that already has multiple enabled items, it automatically disables all but the first enabled item.
- **Dynamic Prompts Syntax:** Supports `{A|B|C}` syntax to select one prompt randomly from the group.
- **Toggle Switch:** Easily toggle ON/OFF via the "Randomize Group" switch next to the group name.
- **Visibility:** The group is highlighted with a purple dashed border when in Random Mode.

### 1.4 Bulk Toggle
- **Hover Actions:** Bulk action icons appear when hovering over the group header.
- **Enable All:** Click `[☑☑]` to enable all items within the group.
- **Disable All:** Click `[☒]` to disable all items within the group.

### 1.5 Duplicate Detection
- **Auto Detection:** Automatically detects and highlights duplicate prompts that have the exact same text within the tree.
- **Validation Modes:** Choose from 3 validation modes in the settings: `None` (Disabled), `Warn` (Highlight warning only), or `Error` (Blocks generation/output when duplicates exist).
- **Special Tokens Exclusion:** Structural keywords like `BREAK` that are intentionally used multiple times are excluded from duplicate checks.

### 1.6 Prompt Dictionary Dual-way Integration
- **Portal Teleportation:** Upon opening the prompt editing modal, the DOM element of the "Prompt Dictionary on SDwebUI" extension is immediately detected and teleported (appendChild) into the modal's portal placeholder without any lag.
- **Click Interception & Tag Insertion:** While editing, clicking the dictionary's "Insert" button will safely append the selected tags as comma-separated values into the PSM modal's text area instead of pasting them into the main WebUI prompt fields.
- **Two-Column Layout with Independent Scroll:** When the dictionary integration is active, the modal width automatically expands to `1100px` (2 columns: PSM Edit form on the left, Dictionary search on the right). The dictionary area has independent vertical scrolling, preventing the modal action buttons (Save/Cancel/Delete) from being hidden at the bottom.
- **Clean Restoration:** When the editing modal is closed, the dictionary panel is seamlessly teleported back to its original parent (`txt2img_actions_column`, etc.) and automatically collapsed.
- **Search Keyword Auto-Copy:** When tags are inserted, the text currently entered in the dictionary's search input field (`input.pd-inline-query`) is automatically copied to the editing prompt's name field (only works if the name field is currently empty, protecting existing inputs).
- **Graceful Fallback:** If the dictionary extension is not installed (or not found in the DOM), the modal falls back to a clean 1-column layout (width `600px`), and the portal section is hidden (`display: none`). No JS errors or console warnings will occur.

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
- **Dynamic Prompts:** Automatically detects `__name__` format prompts and highlights them with Cyan color + Italic + dedicated icon. The button shape is also changed to a rounded design for easy distinction.

### 2.4 Initial Setup Wizard
- Displays a wizard on first launch (or when config is missing) to guide the user in selecting a save directory and creating the initial file.
- If legacy settings (WebUI side) exist, it automatically suggests that path for a smooth transition.

### 2.5 Mouse Operations
- **Double-click Edit:** Quickly open the edit mode (modal) by double-clicking on a group or prompt item.
- **Context Menu:** Right-clicking on an item opens a context menu for advanced operations (Duplicate, Delete, Move, etc.).

### 2.6 Search Filter
- **Pane-Independent Filter:** The shared global search filter in the sidebar has been removed, and independent search filters have been added inside the Positive and Negative pane headers.
- **Pane Collapse Linkage:** The search input field automatically hides when the corresponding pane is clicked and collapsed.
- **Accidental Trigger Prevention:** Event propagation (bubbling) is prevented for clicks and key inputs inside the filter field, ensuring that typing inside the field does not toggle the pane's open/collapsed state.

## 3. File, Settings & Profiles Management

### 3.1 YAML Persistence
- Prompt data is saved in YAML format in a local directory.
- **Multi-file Management:** Create multiple YAML files for different purposes and switch between them via a dropdown.
- **File Operations:** Create New, Duplicate, Rename, Delete.

### 3.2 Profiles (State Snapshot)
- **Feature Overview:** Save the active/inactive (`enabled`) status and `weight` configurations of all prompts in the current tree as a named snapshot ("Profile").
- **Batch Application:** Select a saved profile from the dropdown in the toolbar to immediately restore all items to their saved states.
- **Storage Schema:** Profiles are persisted in the `profiles` field of the respective YAML file.
- **Delete Feature:** Unnecessary profiles can be deleted individually from the dropdown.

### 3.3 Global Settings
- **UI Scale:** 3-stage adjustment: Small / Medium / Large.
- **Language:** Switch between Japanese / English.
- **Save Location (Storage):** Change the YAML file save directory in the "Shortcut & Storage" group.
- **File List Refresh:** Reload the file structure via the refresh button.
- **Sidebar Grouping & Scroll:** Settings other than "File Operations" and "Model Mode" are organized into collapsible panels ("Display & Check", "Shortcut & Storage", "Translation Settings"). A vertical scrollbar appears automatically when the content exceeds the sidebar height.

### 3.4 Asynchronous Loading Indicator
- **Loading Overlay:** Displays a full-screen, pointer-blocking loading overlay (`v-overlay`) during initial YAML loading, file list retrieval, and file operations (creating, duplicating, renaming, and deleting files).
- **No-Lock on Auto-Save:** Does not display the loading spinner during auto-saving (`savePrompts`) triggered by prompt toggles or weight slider adjustments, preventing user interactions from being locked.
- **Operation Interlock:** Blocks all mouse and keyboard interactions during loading to prevent data corruption and race conditions caused by double clicks or concurrent updates.
- **Reactive Progress Text:** Displays a central spinner (`v-progress-circular`) alongside localized messages such as "Loading..." or "Saving..." depending on the active operation.

## 4. Anima Model Support & Translation

### 4.1 Model Mode
- **Per-file switching:** Toggle between `SD` / `Anima` via the "Model Mode" control in the sidebar. The setting is stored at the YAML root (`model_mode`) independently per file.
- **Backward compatible:** Existing YAML files without `model_mode` are treated as `SD`.

### 4.2 Natural Language Items
- **Purpose:** An item type for long-form prompts targeting natural-language-capable models such as Anima.
- **Behavior:** Turning on the "Natural Language" switch in the edit modal skips underscore replacement, parenthesis escaping, and trailing-comma trimming, outputting the text as-is (weight `(text:w)` still applies).

### 4.3 Prompt Translation (Japanese → English)
- **Translate button:** When editing a natural-language item, a "Source Text" field and "Translate →" button appear. The source is translated to English via a local LLM or cloud API and written into the content field. The source is kept as `sourceText` and never included in output.
- **Two profiles:** The "Translation Settings" panel keeps both `Local` and `Cloud` profiles at all times; switch with a toggle (no re-entry needed).
- **Supported backends:** OpenAI-compatible APIs (Ollama / LM Studio / llama.cpp server / OpenAI / OpenRouter, etc.) and the DeepL API. Presets prefill endpoints.
- **Where settings live:** Translation settings including API keys are stored only in browser `localStorage` (`psm_translate_settings`), never server-side. A notice is shown when a cloud profile is active.
- **Connection test:** The "Test Connection" button runs a fixed short translation and shows the result or detailed error (including server messages such as model-not-found) inline.

### 4.4 Category Ordering (Anima Recommended Tag Order)
- **Category attribute:** Groups can be assigned a category — `Quality/Meta/Year/Safety`, `Subject`, `Character`, `Series`, `Artist`, `General` — in the group edit modal.
- **Category badge:** The assigned category is shown as a color-coded badge next to the group name in the header (hidden for `General` and unset).
- **Header background color:** Set a group header background color in the edit modal — 8 dark-theme-friendly presets, a custom color picker, and a "None" option to clear. Stored as `headerColor` in the YAML.
- **Output-time ordering:** In Anima mode only, root-level nodes are stable-sorted by category priority when applying to the WebUI. Tree display and saved order are untouched, and relative order within the same category is preserved.
- **Backward compatible:** Unset categories are treated as `General`, so existing YAML output order does not change. No sorting occurs in SD mode.

### 4.5 Anima Template
- **New-file option:** Turning on "Create with Anima template" in the new file dialog initializes the file with categorized group scaffolding (Quality / Year / Subject / Character / Series / Artist / General), Anima's officially recommended quality and negative tags, and Anima mode.

## 5. Developer Features (Dev Mode)
- **Debug Log:** Detailed debug info is output to the console only in Dev Mode via `src/log.ts`.
- **Import:** An external import feature (experimental) is displayed in the UI only when in developer mode.
