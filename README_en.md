# SD WebUI Prompt Struct Manager (PSM)

An extension for Stable Diffusion WebUI (Automatic1111 / Forge) to structurally manage prompts.
Organize prompts and negative prompts in a tree structure (groups), allowing for intuitive reordering via drag-and-drop and toggling enable/disable status.

This project has been tested with "Stable Diffusion WebUI reForge".

## Key Features

*   **Structured Management**: Manage prompts in a hierarchical structure of groups (folders) and items (tags).
*   **Intuitive Operation**: Reorder and move items via drag-and-drop. Clone-based dragging keeps the source layout stable while dragging, and drop areas expand so even empty groups are easy to target.
*   **Quick Move-To**: "Move to..." in the context menu opens a searchable dialog — type a few characters to pick a destination (recent 5 destinations pinned, parent paths shown, full keyboard support).
*   **Toggle Enable/Disable**: Switch items or groups ON/OFF with a single click (or Spacebar).
*   **Bulk Toggle**: Easily enable or disable all items within a group at once using icons on the group header.
*   **Weight Adjustment (Compact Slider)**: Features a compact slider UI (`0.1` to `2.0`) next to each prompt chip. Reset instantly to `1.0` with the "↺" button. You can toggle the slider visibility in settings, and it remembers your choice (LocalStorage).
*   **Exclusive Group Selection (Single-Choice Mode)**: Toggleable via the switch on the group header (teal blue). When active, enabling one item automatically disables all other sibling items in that group.
*   **Profiles (State Snapshot)**: Save the current tree state (enable/disable, weight values) as a named profile. You can apply or delete these snapshot states instantly from the toolbar.
*   **Random Group**: Supports Dynamic Prompts `{A|B|C}` syntax to randomly select a prompt from within the group.
*   **Duplicate Detection**: Automatically detects duplicate prompts in the tree, highlights them, and can block generation based on settings.
*   **Group Map**: Displays a tree structure navigation on the right side, allowing instant jumping to target groups with a click.
*   **Tag Autocomplete Integration**: If `a1111-sd-webui-tagcomplete` is installed, tag suggestions are available during input.
*   **Apply Preview**: Before applying, review the full compiled output and a tag-level diff (added/removed) against the current WebUI prompt, including an approximate token count.
*   **Apply & Close**: Transfer constructed prompts to WebUI with one click and close the panel.
*   **Smart Formatting**: Automatically consolidates consecutive commas for cleaner prompts.
*   **File Management**: Save, load, duplicate, and rename prompt configurations as YAML files.
*   **Keyboard Navigation**: Full keyboard support including arrow keys for navigation, F2 to edit, Delete to remove, etc.
*   **Anima Model Support**: Per-file model mode switching (SD / Anima), category-based ordering following Anima's recommended tag order, and template creation (see "Anima Model Support" below).
*   **Prompt Translation (JA → EN)**: Translate Japanese natural-language prompts to English using a local LLM (Ollama / LM Studio, etc.) or a cloud API (OpenAI-compatible / DeepL).
*   **PNG Info Import**: Paste a generation parameters string to parse and import prompts as a structured tree (see "PNG Info Import" below).
*   **Auto-Grouping**: Uses the tag DB (`a1111-sd-webui-tagcomplete`) to sort tags into categories and subcategories (Hair / Clothing / Pose, etc.), with optional local-LLM assistance.

## Anima Model Support

Features for [Anima](https://huggingface.co/circlestone-labs/Anima) (the anime-focused model by CircleStone Labs × Comfy Org). Existing behavior for SD-family models is unaffected.

*   **Model Mode (per file)**: Toggle between `SD` / `Anima` in the sidebar. Stored as `model_mode` in the YAML file; existing files without it are treated as SD.
*   **Protected tokens**: Underscores in Anima score tags (`score_7`), Pony-style tags (`score_8_up`), emoticon tags (`^_^`, etc.), and extra network syntax (`<lora:name_v2:0.8>`) are protected from the underscore-to-space replacement (always on, mode-independent).
*   **Natural Language Items**: Turning on "Natural Language" in the edit modal skips underscore replacement and parenthesis escaping, outputting long-form text as-is — ideal for Anima's natural-language prompting.
*   **Category Ordering**: Assign groups a category (`Quality/Meta/Year/Safety`, `Subject`, `Character`, `Series`, `Artist`, `General`). In Anima mode only, root-level items are auto-ordered on apply following Anima's recommended order (quality → subject → character → series → artist → general). Tree display order is untouched.
*   **Anima Template**: Enable "Create with Anima template" in the new file dialog to initialize with categorized group scaffolding and officially recommended quality/negative tags.

## PNG Info Import

Use the "PNG Info" button in the toolbar to paste a generation parameters string (the contents of the PNG Info tab) and import prompts as a structured tree.

*   **Automatic parsing**: Detects the positive prompt, the `Negative prompt:` line, and the settings line (`Steps: 20, Sampler: ...`) — multi-line prompts and missing settings lines are supported.
*   **Syntax restoration**: Attention syntax `(smile:1.2)` becomes a weight; `((detailed))` and `[dark]` are approximated as `1.1^n`. Escaped parentheses `\(...\)` are restored, and `<lora:...>`, wildcards, and `BREAK` are never split. Long sentences become natural-language items.
*   **Group by category**: Sorts tags into Quality / Subject / Character / Series / Artist / General groups using the tag DB (ON by default in Anima mode).
*   **Subdivide "General"**: Automatically sorts into 13 subcategories (Hair / Face / Body / Clothing / Accessory / Pose / Composition / Object / Background / Lighting / Style / Effect / Text) plus Other.
*   **Translate tag names**: Optionally fill each item's Name field with a Japanese translation of the English tag (batched 20 at a time, with progress).

## Auto-Grouping (Tag DB / AI)

With `a1111-sd-webui-tagcomplete` installed, PSM can determine tag categories automatically (optional — a message is shown if it is missing).

*   **Auto-detect category**: A button in the group edit modal suggests a category by majority vote across the group's tags (with a breakdown).
*   **Auto-detect all**: From the sidebar (Anima mode), detect categories only for groups that have **none set**.
*   **Group by subcategory**: Right-click a group → "Group by subcategory" reorganizes its tags into Hair / Clothing / Pose, etc. Existing subgroups, natural-language items, and `<lora:...>` keep their positions.
*   **AI assistance**: When an OpenAI-compatible backend (LM Studio / Ollama) is configured, an "with AI" variant appears and sends **only the tags the rules could not classify** to the local LLM (hybrid approach that keeps request counts low).

## Prompt Translation

Natural-language items gain a "Source Text" field and a "Translate →" button in the edit modal, converting Japanese text into an English prompt.

*   **Two profiles (Local / Cloud)**: The "Translation Settings" panel keeps both a local-LLM profile and a cloud-API profile; switch with a single toggle.
*   **Supported backends**: OpenAI-compatible APIs (Ollama / LM Studio / llama.cpp server / OpenAI / OpenRouter, etc.) and the DeepL API. Presets prefill endpoints.
    *   For LM Studio, enter the model identifier (`id`) listed at `http://localhost:1234/v1/models`.
*   **Where settings live**: Translation settings including API keys are stored only in browser localStorage — never server-side or in the repository. A notice is shown when a cloud profile is active, since prompts are sent to an external service.
*   **Connection test**: Verify connectivity with a short test translation; detailed server error messages are shown inline.
*   **Source preservation**: The original text is kept as the item's `sourceText` and never included in WebUI output.

## Installation

1.  Open the `Extensions` tab in SD WebUI.
2.  Select the `Install from URL` tab.
3.  Enter the URL of this repository in `URL for extension's git repository`.
4.  Click the `Install` button.
5.  Go back to the `Installed` tab and click `Apply and restart UI` to restart the WebUI.

## Usage

Once installed, a "📂 PSM" button (or a dedicated toggle button) will appear on the WebUI.

![Basic Operations](assets/PSM_basic_operations.gif)

You can switch between Japanese and English using the "Language" toggle in the sidebar.

### Initial Setup

When you launch the extension for the first time (or if `config.json` is missing), a setup wizard will automatically appear.

1.  **Select Save Directory**: Choose a folder to store your prompt data (YAML files).
2.  **Create Initial File**: Enter a name for your first prompt file (e.g., `prompts`).

Once completed, your settings are saved, and you can start using the extension immediately.

### Basic General Operations

*   **Add**: Add "New Prompt" or "New Group" via the "ADD PROMPT" button on root/groups or the context menu.
*   **Edit**: Double-click an item, or select it and press `F2` to enter edit mode.
*   **Delete**: Select an item and press `Delete`, or use the context menu.
*   **Move**: Drag and drop items to reorder them, or use "Move to..." in the context menu to search for a destination. The search field is focused on open — type a few characters and press `Enter` (`↑` `↓` to select, `Esc` to close).
*   **Drag & drop tips**: The source layout stays stable while dragging, so your target does not shift. Hovering a collapsed group name expands it automatically, and a dedicated drop zone is shown. Empty groups expand into a drop area while dragging.
*   **Group by subcategory**: Right-click a group and choose "Group by subcategory" to sort its tags into Hair / Clothing / Pose, etc. (requires `a1111-sd-webui-tagcomplete`).
*   **Group Reorder**: Click the "▲" / "▼" buttons in the group header to reorder groups.
*   **Toggle**: Click the checkbox on the left of an item, or select it and press `Space` to toggle enable/disable.
*   **Exclusive Group Selection (Single-Choice)**: Click the toggle switch on the right side of the group header. When active, enabling an item within the group will automatically disable all other sibling items.
*   **Weight Adjustment**: Drag the slider next to the prompt chip, or click the "↺" button on the right edge of the slider to reset weight to `1.0`. You can hide the slider by turning off "Show Weight Slider" in the settings (gear icon). This setting is automatically saved.
*   **Profile Management**: Save the current state using "Save Current as Profile" from the profile dropdown on the toolbar. You can also select a saved profile to apply it, or delete it from the dropdown.
*   **Apply & Close**: Press `Ctrl + Shift + Enter` to apply prompts to WebUI and close the panel. (Does not generate)

### Keyboard Shortcuts

*   `↑` `↓`: Move focus
*   `→`: Expand group
*   `←`: Collapse group
*   `Space`: Toggle enable/disable
*   `F2`: Start edit mode
*   `Ctrl + Enter`: Confirm Edit
*   `Delete`: Confirm deletion
*   `Insert`: Add new item (Shift+Insert to add group)
*   `Shift + F10`: Show context menu
*   `Ctrl + Shift + Enter`: Apply to WebUI and Close

### File Management (Storage)

You can save the current configuration as a `.yaml` file from the sidebar file list.
In the "Storage" section, you can change the directory where YAML files are saved. Click the folder icon to browse or enter the path directly.

*   **Refresh**: Click the refresh button next to the file list to reload the files in the directory.

## License

This extension is released under the [MIT License](LICENSE).
See the [LICENSE](LICENSE) file for details.

## Documentation for Developers

For more detailed specifications, please refer to the following documents:

*   [Overview (OVERVIEW_en.md)](doc/OVERVIEW_en.md)
*   [Features (FEATURES_en.md)](doc/FEATURES_en.md)
*   [Data Structure (DATA_STRUCTURE_en.md)](doc/DATA_STRUCTURE_en.md)
*   [Developer Guide (DEVELOPMENT_en.md)](doc/DEVELOPMENT_en.md)
*   [Anima Support & Feature Design (ANIMA_SUPPORT.md, Japanese)](doc/ANIMA_SUPPORT.md)
*   [Changelog (CHANGELOG.md, Japanese)](CHANGELOG.md)

## Optional Integrations

None of these are required, but installing them unlocks additional functionality.

| Extension | Effect |
| --- | --- |
| [a1111-sd-webui-tagcomplete](https://github.com/DominikDoom/a1111-sd-webui-tagcomplete) | Tag autocomplete while typing, plus tag-DB-based category detection and subcategory auto-grouping |
| Prompt Dictionary on SDwebUI | Shows the dictionary search panel inside the edit modal so tags can be inserted directly |
| LM Studio / Ollama (local LLM) | Enables prompt translation, Japanese tag names, and AI-assisted subcategory classification (via OpenAI-compatible API) |

## Credits

This project uses the following open source libraries:

*   [Vue.js](https://vuejs.org/) (MIT License)
*   [Vuetify](https://vuetifyjs.com/) (MIT License)
*   [Material Design Icons (@mdi/font)](https://materialdesignicons.com/) (Apache 2.0 License)
*   [Vue.Draggable](https://github.com/SortableJS/Vue.Draggable) (MIT License)
*   [SortableJS](https://github.com/SortableJS/Sortable) (MIT License)

