# 📘 Prompt Struct Manager (PSM) Quality Assurance (v3.0)

**Last Updated:** 2026-10-31
**Scope:** 2 automated test suites (Frontend Unit, Backend) + pre-release manual checks

---

## 1. Test Strategy
Quality assurance in PSM covers logic with automated tests, and screen rendering and interaction with manual checks:
- **Backend API Tests (pytest):** Ensures server configurations, I/O operations, and prompt conversions are solid.
- **Frontend Store Logic Tests (`bun test`):** Unit tests that verify core business logic like tree operations, exclusive selection, profile restoring, duplicate detection, and loading overlay counter state control under mock conditions.
- **Manual Checks (checklist):** Items that can only be verified in a browser, such as appearance (colors, borders, layout), keyboard/mouse interactions, and integration with other extensions like the Prompt Dictionary, are checked before each release following the [2.3 Manual Verification Checklist](#23-manual-verification-checklist).

> Playwright E2E tests were removed in v1.6.0 (the development environment moved to Bun, and the Bun runtime is not officially supported by Playwright). Logic previously verified by E2E that can be tested without the UI was moved into unit tests, and the rest was replaced by the manual verification checklist.

---

## 2. Test Suites & Scenarios

### 2.1 Backend Tests (`pytest` - 125 Cases)
- **API Configs:** Validates `get-config` and `set-config` logic, folder paths structure, and fallback locations.
- **YAML I/O:** Assures safe YAML saving/loading, profile integration inside files, duplicating, renaming, and deleting of files.
- **String Parsing:** Tests negative/positive prompt cleanups, bracket additions for weights, and Dynamic Prompts translations.
- **Save Speed (write cache):** Verifies `save-prompts` updates only the in-memory cache without disk I/O, explicit flushing via `flush-prompts`, read-your-own-writes consistency for `get-prompts`, that duplicate/rename/delete correctly handle pending unflushed cache changes (preventing stale copies and deleted-file resurrection), and that the shutdown event flushes everything (see `test_psm_cache.py` for cache-level debounce unit tests).
- **YAML→JSON Migration:** Verifies reading/writing `.json` files, that `list-files` includes both `.yaml` and `.json` while excluding `generation_profiles.json`, `convert-to-json` behavior (reflecting unflushed pending changes, leaving the source untouched, refusing to overwrite an existing destination), and that duplicate/rename inherit the source file's format when no extension is given.

### 2.2 Frontend Store Logic Tests (`bun test` - 203 Cases)
- **Core Operations:** Tests node addition, editing, removal, and drag placement on store states.
- **Exclusive Selection (Single-Choice):**
  - Confirms checking one item turns off all sibling elements within an exclusive group.
  - Confirms turning ON single-choice mode automatically cleans up multiple enabled items to leave only the first one enabled.
- **Profiles Snapshot:**
  - Tests snapshot capture (`saveProfile`), batch restoring of properties, and removing profiles.
- **Duplicate Checking:** Tests mode transitions between `none`, `warn`, and `error` modes.
- **Loading Control:** Verifies the reactive coordination of `isLoading` and `loadingText` state counters during initial file load operations, ensuring that the spinner does not lock user interactions during daily auto-saving (`savePrompts`) (2 cases).
- **Compile Formatting (Underscore Replacement):** Assures auto-replacement of underscores with spaces for prompt content, and underscore preservation for Dynamic Prompts wildcards (`__wildcard__`) (1 case added).
- **Group Map Aggregation (`groupMapUtils.ts`):** Verifies the single-pass active-prompt-count walk (reusing child results) matches the old implementation's behavior for nested groups, including that a disabled ancestor doesn't affect a descendant group's own count (`groupMapUtils.spec.ts`, 10 cases added).
- **Bulk-Disable Confirmation Flow:** Verifies `requestDisableAll` changes and saves nothing by itself, `confirmDisableAll` disables and saves the target pane and clears the pending state, `cancelDisableAll` changes nothing, and that confirming with nothing pending (or a second time) does nothing (5 cases added).
- **Startup Initialization (`initializePsm`):** Verifies `get-prompts` runs exactly once at startup even when a previously selected file exists, generation profiles are loaded, and nothing is loaded when setup is incomplete or the last file no longer exists (4 cases added).
- **Save Speed (Phase C):** Verifies `createPromptFile` defaults to `.json` when no extension is given, that `duplicateCurrentFile`/`renameCurrentFile` inherit the source file's extension instead of forcing `.yaml`, and the success/error paths of `convertCurrentFileToJson`.
- **Search Filter Group Open-State Snapshot/Restore:** Verifies that each group's open/collapsed state is recorded by `id` when a filter starts, that it is correctly restored (including nested groups) after the filter auto-expands groups and is then cleared, and that groups added while filtering are excluded from restoration (4 cases added).
- **Reactive Proxy vs. Raw Array Identity:** Verifies that lock checks (`isListLocked`), descendant checks for move targets, and drag-and-drop move finalization treat a Vue reactive Proxy and its raw array as the same list.
- **Adding, Editing, Duplicating, and Deleting Items (migrated from E2E):** Verifies `addItem` appending/inserting at a given index and creating prompts vs. groups, confirming/cancelling via `startEdit`/`finishEdit`/`cancelEdit` (cancelling a new item removes the empty item; content with brackets is not escaped when saved), `duplicateItem` placing the copy right after the original with new IDs (groups are deep-cloned independently with their descendants), delete confirm → execute/cancel, and promoting children when only the group frame is deleted (14 cases added).
- **Group-Wide Enable/Disable and Duplicate Check Mode Switching (migrated from E2E):** Verifies `setGroupChildrenEnabled` toggles all descendants (including nested ones) and saves, leaves locked groups untouched, and that `setDuplicateCheckMode` switches the mode, saves it to local settings, and clears existing duplicate highlights (3 cases added).

### 2.3 Manual Verification Checklist
Before each release (and after any UI-related change), reload the WebUI and check the following. Preparing a file that contains groups, nested groups, and a prompt with `__wildcard__` makes this faster. For items with a "Related unit tests" entry, the logic is already covered by automated tests, so only check that it is reflected on screen and the interaction works.

#### A. File Operations & Initial Setup
| No | Steps | Expected Result | Related unit tests |
|---|---|---|---|
| A-1 | Open PSM with no save folder configured | The setup screen appears; after setting a folder and saving, it switches to the normal screen | — |
| A-2 | Create a file with "New File" in the sidebar | It is added to the list and becomes the selected file | 2.2 Save Speed (Phase C) |
| A-3 | Rename the file with "Rename" | The name in the list changes and the content stays the same | 2.2 Save Speed (Phase C) |
| A-4 | Duplicate the file with "Duplicate" | A new file with the same content is added to the list | 2.2 Save Speed (Phase C) |
| A-5 | Delete a file | After confirmation it disappears from the list, and another file (or an empty state) is shown | — |
| A-6 | Open a YAML file and run "Convert to JSON (faster)" | A completion message appears and a `.json` file is added to the list (the original `.yaml` remains) | 2.2 Save Speed (Phase C) |
| A-7 | Look near the panel title | The extension version is displayed | — |

#### B. Adding, Editing, and Deleting Items
| No | Steps | Expected Result | Related unit tests |
|---|---|---|---|
| B-1 | Click "Add Group" / "Add Prompt" | The edit modal opens, and saving adds the item to the tree | 2.2 Adding, Editing... |
| B-2 | Add a prompt using the inline add inside an open group | It is added as a child of that group | 2.2 Adding, Editing... |
| B-3 | Double-click an item | The edit modal opens with that item's content | — |
| B-4 | Enter `test (escape)` as the content, save, and open the editor again | It is shown exactly as `test (escape)` (not escaped) | 2.2 Adding, Editing... |
| B-5 | Type `m`, `Enter`, and arrow keys in the name and content fields of the edit modal | Only text input, line breaks, and cursor movement happen; the modal and panel do not close | — |
| B-6 | Press `Ctrl+Enter` in the edit modal | The content is saved and the modal closes | — |
| B-7 | Click the delete button at the bottom of the edit modal → "Delete" in the confirm dialog | The item is deleted; the dialog closes but the main PSM panel stays open | 2.2 Adding, Editing... |
| B-8 | Display an item with an extremely long name/content | The edit (pencil) icon is not pushed off screen and is visible and clickable | — |
| B-9 | In the edit modal, use the weight slider and the `-`/`+` buttons, then press the reset button (`mdi-refresh`) | The weight changes in 0.1 steps, and reset returns it to 1.0 | — |

#### C. Keyboard Operations
Check with an item focused by clicking it.
| No | Steps | Expected Result | Related unit tests |
|---|---|---|---|
| C-1 | Press the up/down arrow keys | Focus moves to the previous/next item and a 2px solid orange (`#FF9800`) outline is shown | — |
| C-2 | Focus a group and press the left/right arrow keys | Right opens the group, left closes it | — |
| C-3 | Press `Space` | The focused item's enabled state toggles | — |
| C-4 | Press `Enter` | Nothing happens (the edit modal does not open) | — |
| C-5 | Press `F2` | The edit modal for the focused item opens | — |
| C-6 | Press `Insert` / `Shift+Insert` | The new prompt / group modal opens (added as the first child of an open group, otherwise right after the item) | 2.2 Adding, Editing... (`addItem` index) |
| C-7 | Press `Delete` | The delete confirm dialog opens | 2.2 Adding, Editing... (delete confirm) |
| C-8 | With a modal open, press `Esc`, then press `Esc` again | The first press closes only the modal; the second closes the main panel | — |

#### D. Drag & Drop / Moving
| No | Steps | Expected Result | Related unit tests |
|---|---|---|---|
| D-1 | Reorder items within the same list using the drag handle | The order changes and persists after reload | 2.2 Core Operations (drag placement) |
| D-2 | Drag an item into another group or the other pane | It moves to the drop target | 2.2 Core Operations, Reactive Proxy vs. Raw Array Identity |
| D-3 | Drop an item onto the "Open / Drop" zone of a closed group | It is added as a child of the group | 2.2 Core Operations (drag placement) |
| D-4 | Drag an item into a locked group | It cannot be dropped | 2.2 Reactive Proxy vs. Raw Array Identity |
| D-5 | Drag a group into one of its own descendant groups | The move is cancelled and the group stays in its original place | 2.2 Reactive Proxy vs. Raw Array Identity |

#### E. Group Features & Appearance
| No | Steps | Expected Result | Related unit tests |
|---|---|---|---|
| E-1 | Turn on "Randomize Group" for a group | The group is shown with a dashed purple (`#E040FB`) border and a translucent background | 2.2 Core Operations |
| E-2 | Press "Disable All in Group" / "Enable All in Group" | All descendants (including nested ones) toggle at once | 2.2 Group-Wide Enable/Disable |
| E-3 | Turn on "Exclusive Selection (Single)" for a group with several enabled items, then enable a different item | When turned on, all but the first are disabled; afterwards enabling one item automatically disables the others | 2.2 Exclusive Selection |
| E-4 | Display a prompt containing `__wildcard__` | It is shown in cyan italics with the wildcard icon (`mdi-auto-fix`) | 2.2 Compile Formatting |
| E-5 | Hover over an item | A tooltip shows its content and memo | — |

#### F. Apply, Duplicate Check, and Bulk Disable
| No | Steps | Expected Result | Related unit tests |
|---|---|---|---|
| F-1 | Set duplicate check to "No Check" and apply with duplicate prompts present | They are applied to the WebUI prompt fields as is | 2.2 Duplicate Checking |
| F-2 | Set duplicate check to "Show Warning" and apply | Duplicates are highlighted in the warning color; choosing apply in the warning dialog applies them | 2.2 Duplicate Checking |
| F-3 | Set duplicate check to "Stop with Error" and apply | Duplicates are highlighted in the error color, an error dialog appears, nothing is applied, and the panel stays open | 2.2 Duplicate Checking |
| F-4 | Apply a prompt with a changed weight | It is applied to the WebUI prompt field in `(word:weight)` format | 2.2 Compile Formatting |
| F-5 | Press the pane's bulk-disable button, cancel in the confirm dialog → press it again and confirm | Cancel changes nothing; confirm disables all prompts except locked ones | 2.2 Bulk-Disable Confirmation Flow |

#### G. Search Filters & Profiles
| No | Steps | Expected Result | Related unit tests |
|---|---|---|---|
| G-1 | Type in the search field in each of the Positive / Negative pane headers | Each pane is filtered independently, and typing or clicking does not toggle the pane | 2.2 Search Filter |
| G-2 | Collapse a pane | That pane's search field is hidden | — |
| G-3 | After the filter auto-expands closed groups, clear the filter | Groups return to their open/closed state from before filtering | 2.2 Search Filter |
| G-4 | "Save Profile" → change the state → apply the profile → "Delete Profile" | Applying restores the saved enabled/disabled state; deleting removes it from the list | 2.2 Profiles Snapshot |
| G-5 | Save a generation profile and select it from the toolbar dropdown | The saved Checkpoint, Sampling Steps, etc. are applied to the WebUI | — |

#### H. Prompt Dictionary Integration (only when the extension is installed)
| No | Steps | Expected Result | Related unit tests |
|---|---|---|---|
| H-1 | Open the edit modal | The dictionary panel moves into the modal and expands automatically | — |
| H-2 | Press "Insert" in the dictionary | Tags are inserted into the content field, comma-separated | — |
| H-3 | With the name field empty, enter a keyword in the dictionary's search field and press "Insert" | The search keyword is copied to the name field (an existing name is not overwritten) | — |
| H-4 | Close the edit modal | The dictionary panel returns to its original place (`txt2img_actions_column`, etc.) and collapses | — |

---

## 3. Running the Tests
Refer to [doc/DEVELOPMENT_en.md](../doc/DEVELOPMENT_en.md) for execution commands.
- Frontend Unit: `bun run test:unit`
- Backend API: `pytest` (inside the venv: `..\..\venv\Scripts\python -m pytest tests\`)
- Manual Checks: after `bun run build`, reload the WebUI and go through the [2.3 Manual Verification Checklist](#23-manual-verification-checklist)
