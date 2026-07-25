# Prompt Struct Manager - Features

## 1. Prompt Management

### 1.1 Tree Structure
- **Positive / Negative:** Manage prompts in two independent trees.
- **Grouping:** Create folders to categorize prompts.
- **Infinite Nesting:** Create groups within groups (no depth limit).
- **Reorder (Drag & Drop):** Drag handles (two columns of dots) are added to the left of groups and prompts for reordering and moving between levels.
  - **Unified on SortableJS.** Because PSM is mounted inside the `gradio-app` shadowRoot, HTML5 native DnD is unreliable; previously non-functional native handlers were mixed in. Shared settings now live in `src/dragOptions.ts`.
  - **Source layout is preserved (clone mode):** With `pull: "clone"`, the item is not removed from its source list while dragging to another group. With the default behavior the source collapses immediately, shifting the layout upward so the intended drop target escapes the cursor. Removal from the source happens after the drop is committed, and moves into the item's own descendants (cycles) or duplicate insertions are automatically reverted.
  - Drop-accuracy settings: `fallbackOnBody` (prevents clipping inside scroll containers), `emptyInsertThreshold` (easier drops into collapsed groups), `swapThreshold` / `invertSwap` (stabilizes insertion in wrapping layouts), and `scroll` (auto-scroll while dragging).
  - **Visual feedback:** The dragged item lifts up, the insertion point is shown as a ghost, and the target group is outlined with a dashed border.
  - **Auto-expand:** Hovering a collapsed group name while dragging expands it after ~0.4s. Collapsed groups show a dedicated drop zone; dropping there appends into that group.
  - **Dropping into empty/narrow groups:** Empty groups normally have almost no height, making them impossible to target. While dragging, child areas are given a minimum height, and empty groups in particular are rendered as a dashed drop area with an "Add to ..." hint label.
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
- **BREAK Divider Styling:** Items whose content is just `BREAK` are rendered as a **full-width divider** (orange dashed line with a centered label) instead of a normal chip, making prompt separation points obvious at a glance. Dragging, double-click editing, and enable/disable all work as with normal items (disabled state shows a grey dashed line with strikethrough).
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

### 1.5 Apply Preview
- **Preview button:** The "Preview" button next to "Apply & Close" in the toolbar lets you inspect the output before sending it to the WebUI.
- **Full compiled output:** Shows the final output string for both Positive and Negative. In Anima mode, the actual category-ordered result is displayed.
- **Tag-level diff:** Compares against the current WebUI textarea content, showing added tags in green, removed tags in red (struck through), and unchanged tags as outlined chips. Duplicate tags are compared by occurrence count.
- **Statistics:** Displays tag count, character count, and added/removed counts (`+3 / -1`). Shows "No changes" when there is no difference.
- **Approximate token count:** Shown as `≈30 tokens (1×75)`. A live-updating estimate also appears in the pane headers (Positive / Negative), turning a warning color in SD mode when the prompt crosses a 75-token chunk boundary.
  - Extra network syntax (`<lora:...>`), attention parentheses, and weight values are not counted since they are stripped before encoding. `BREAK` is treated as forcing a chunk boundary.
  - This is an estimate only (exact counts depend on the model's tokenizer). Anima uses a different tokenizer (Qwen3) with no chunk concept, so chunk info is omitted.
- **Apply from preview:** The "Apply Now" button runs the normal apply flow (including duplicate checking).

### 1.6 Subcategory Auto-Grouping (on demand)
- **How to run:** Right-click a group → "Group by subcategory". The tag items **directly under** that group are reorganized into Hair / Clothing / Pose / etc. subgroups (the same 13 categories + Other used on import; see §3.2).
- **Existing structure is preserved:** Existing subgroups stay in place; only leaf items are grouped. Natural language items, `<lora:...>`, wildcards, and `BREAK` are excluded and keep their positions.
- **Conditions:** Reorganization happens only when there are at least 8 target tags directly under the group and at least 2 distinct subcategories are detected (otherwise a message is shown and nothing changes).
- **AI assistance:** When an OpenAI-compatible backend (LM Studio / Ollama, etc.) is configured in the translation settings, an additional "Group by subcategory (with AI)" entry appears.
  - **Hybrid approach:** Rules run first, and **only the tags they could not classify** are sent to the local LLM (in batches of 20), keeping requests and latency low while covering tags the rules miss.
  - Only allowed category keys are accepted from the AI; invalid responses or failures fall back to the rule-based results (processing is never aborted).
  - A blocking loading overlay with progress is shown while running.
- The PNG Info import dialog offers the same AI option ("Use AI for unclassified tags").

### 1.7 Duplicate Detection
- **Auto Detection:** Automatically detects and highlights duplicate prompts that have the exact same text within the tree.
- **Validation Modes:** Choose from 3 validation modes in the settings: `None` (Disabled), `Warn` (Highlight warning only), or `Error` (Blocks generation/output when duplicates exist).
- **Special Tokens Exclusion:** Structural keywords like `BREAK` that are intentionally used multiple times are excluded from duplicate checks.

### 1.8 Prompt Dictionary Dual-way Integration
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

### 2.7 Quick Move-To
- **Searchable dialog:** "Move to..." in the context menu opens a dialog where destinations can be filtered by typing, so you can reach the right group in a few keystrokes even with many groups (replaces the previous submenu).
- **Recent destinations:** The last 5 destinations are pinned to the top of the list — useful when repeatedly moving items to the same place. Stored in LocalStorage.
- **Parent path display:** Each candidate shows its path (e.g. `Positive > Character > Clothing`), making same-named groups distinguishable.
- **Keyboard:** The search field is focused on open; use `↑` `↓` to select, `Enter` to move, `Esc` to close.
- **Cycle prevention:** The item being moved is excluded from the candidate list.

### 2.6 Search Filter
- **Pane-Independent Filter:** The shared global search filter in the sidebar has been removed, and independent search filters have been added inside the Positive and Negative pane headers.
- **Pane Collapse Linkage:** The search input field automatically hides when the corresponding pane is clicked and collapsed.
- **Accidental Trigger Prevention:** Event propagation (bubbling) is prevented for clicks and key inputs inside the filter field, ensuring that typing inside the field does not toggle the pane's open/collapsed state.

## 3. File, Settings & Profiles Management

### 3.1 YAML Persistence
- Prompt data is saved in YAML format in a local directory.
- **Multi-file Management:** Create multiple YAML files for different purposes and switch between them via a dropdown.
- **File Operations:** Create New, Duplicate, Rename, Delete.

### 3.2 PNG Info (infotext) Import
- **Overview:** Use the image icon in the toolbar to paste a generation parameters string (the contents of the PNG Info tab) and import it as a structured prompt tree.
- **Automatic parsing:** Detects the positive prompt, the `Negative prompt:` line, and the settings line (`Steps: 20, Sampler: ...`). Multi-line prompts and inputs without a negative/settings line are supported.
- **Syntax parsing and restoration:**
  - Attention syntax `(smile:1.2)` is imported as a weight value. Nested brackets such as `((detailed))` and `[dark]` are approximated as `1.1^n`.
  - Escaped parentheses `\(...\)` are restored to plain parentheses (they are re-escaped on output, so the original text round-trips).
  - `<lora:...>`, wildcards `__name__`, and `BREAK` are preserved as single items without being split.
  - Sentences ending with punctuation or containing many words are imported as "natural language items" automatically.
- **Group by category:** Enabling "Group by category" sorts tags into Quality / Subject / Character / Series / Artist / General groups using the tag DB (tagcomplete). Defaults to ON in Anima mode; falls back to a flat structure when the tag DB is unavailable.
- **Subdividing the "General" group:** Since most Danbooru tags fall under `general`, that group grows large. The "Subdivide General into hair, clothing, etc." option (ON by default) sorts them into subgroups.
  - Subcategories: Composition / Face & Expression / Hair / Body / Clothing / Accessory / Pose / Object & Symbol / Background / Lighting & Color / Style & Medium / Effect / Text — plus "Other" (13 + 1).
  - Classification is keyword-based on the tag text, with word-boundary checks (so `chair` does not match `hair`) and plural handling (`earrings` resolves). Emoticon tags such as `^_^` and `:d` are classified as Face & Expression.
  - No subdivision occurs when there are fewer than 8 general tags, or when effectively only one subcategory is detected.
  - Measured classification rate on the top 1000 Danbooru general tags is roughly 75% (most of the remainder are count/subject tags handled by the top-level categories).
- **Translate tag names:** Enabling "Translate tag names into the Name field" uses the translation backend (settings from §4.3) to translate English tags and store the result in each item's display Name.
  - Tags are translated in numbered batches of 20, keeping request counts low even for large prompts.
  - While running, the same blocking loading overlay used for file loading is shown, including translation progress (`12 / 45` with a progress bar).
  - The translation direction switches to English→Japanese automatically (`target_lang=JA` for DeepL, a dedicated system prompt for OpenAI-compatible backends).
  - Only tag items with an empty name are targeted. Items that already have a name, natural language items, `<lora:...>`, wildcards, and `BREAK` are skipped.
  - If translation fails or a numbered line cannot be matched, that item's name is left empty and the import still completes.
- **Import target:** Choose between overwriting the current file or creating a new one. Tag counts and generation parameters are previewed live inside the dialog.

### 3.3 Profiles (State Snapshot)
- **Feature Overview:** Save the active/inactive (`enabled`) status and `weight` configurations of all prompts in the current tree as a named snapshot ("Profile").
- **Batch Application:** Select a saved profile from the dropdown in the toolbar to immediately restore all items to their saved states.
- **Storage Schema:** Profiles are persisted in the `profiles` field of the respective YAML file.
- **Delete Feature:** Unnecessary profiles can be deleted individually from the dropdown.

### 3.4 Global Settings
- **UI Scale:** 3-stage adjustment: Small / Medium / Large.
- **Language:** Switch between Japanese / English.
- **Save Location (Storage):** Change the YAML file save directory in the "Shortcut & Storage" group.
- **File List Refresh:** Reload the file structure via the refresh button.
- **Sidebar Grouping & Scroll:** Settings other than "File Operations" and "Model Mode" are organized into collapsible panels ("Display & Check", "Shortcut & Storage", "Translation Settings"). A vertical scrollbar appears automatically when the content exceeds the sidebar height.

### 3.5 Asynchronous Loading Indicator
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
- **Auto category detection:** Uses the tag database from `a1111-sd-webui-tagcomplete` (`tags/danbooru.csv`) to determine a group's category by majority vote across its tags.
  - "Auto-detect Category" button in the group edit modal: applies the result to the category field and shows a breakdown (e.g. "of 12: Char8 / General3 / unknown1"). Nothing is saved until you press Done.
  - "Auto-detect All" button in the sidebar (Anima mode only): applies detection to root groups with **no category set**; existing assignments are left untouched.
  - Danbooru tag types (general / artist / copyright / character / meta) are mapped to PSM categories, and count/subject tags such as `1girl` and `solo` are assigned to `Subject`. Aliases (e.g. `longhair` → `long_hair`) also resolve.
  - If tagcomplete is not installed, an explanatory message is shown (the feature is optional).
- **Header background color:** Set a group header background color in the edit modal — 8 dark-theme-friendly presets, a custom color picker, and a "None" option to clear. Stored as `headerColor` in the YAML.
- **Output-time ordering:** In Anima mode only, root-level nodes are stable-sorted by category priority when applying to the WebUI. Tree display and saved order are untouched, and relative order within the same category is preserved.
- **Backward compatible:** Unset categories are treated as `General`, so existing YAML output order does not change. No sorting occurs in SD mode.

### 4.5 Anima Template
- **New-file option:** Turning on "Create with Anima template" in the new file dialog initializes the file with categorized group scaffolding (Quality / Year / Subject / Character / Series / Artist / General), Anima's officially recommended quality and negative tags, and Anima mode.

## 5. Developer Features (Dev Mode)
- **Debug Log:** Detailed debug info is output to the console only in Dev Mode via `src/log.ts`.
- **Import:** An external import feature (experimental) is displayed in the UI only when in developer mode.
