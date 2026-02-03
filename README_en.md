# SD WebUI Prompt Struct Manager (PSM)

An extension for Stable Diffusion WebUI (Automatic1111 / Forge) to structurally manage prompts.
Organize prompts and negative prompts in a tree structure (groups), allowing for intuitive reordering via drag-and-drop and toggling enable/disable status.

This project has been tested with "Stable Diffusion WebUI reForge".

## Key Features

*   **Structured Management**: Manage prompts in a hierarchical structure of groups (folders) and items (tags).
*   **Intuitive Operation**: Reorder and move items via drag-and-drop.
*   **Toggle Enable/Disable**: Switch items or groups ON/OFF with a single click (or Spacebar).
*   **Weight Adjustment**: Adjust prompt weights using sliders.
*   **Apply & Close**: Transfer constructed prompts to WebUI with one click and close the panel.
*   **Smart Formatting**: Automatically consolidates consecutive commas for cleaner prompts.
*   **File Management**: Save, load, duplicate, and rename prompt configurations as YAML files.
*   **Keyboard Navigation**: Full keyboard support including arrow keys for navigation, F2 to edit, Delete to remove, etc.

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
*   **Move**: Drag and drop items to reorder them, or use the "Move to..." context menu to move them to a specific group. (Use Right Arrow/Hover to open submenu, Left Arrow to close)
*   **Group Reorder**: Click the "▲" / "▼" buttons in the group header to reorder groups.
*   **Toggle**: Click the checkbox on the left of an item, or select it and press `Space` to toggle enable/disable.
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

### File Management

## File Management (Storage)

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

## Credits

This project uses the following open source libraries:

*   [Vue.js](https://vuejs.org/) (MIT License)
*   [Vuetify](https://vuetifyjs.com/) (MIT License)
*   [Material Design Icons (@mdi/font)](https://materialdesignicons.com/) (Apache 2.0 License)
*   [Vue.Draggable](https://github.com/SortableJS/Vue.Draggable) (MIT License)
*   [SortableJS](https://github.com/SortableJS/Sortable) (MIT License)

