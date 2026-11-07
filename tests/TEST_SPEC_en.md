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

### 2.2 Frontend Store Logic Tests (`bun test` - 264 Cases)
- **Core Operations:** Tests node addition, editing, removal, and drag placement on store states.
- **Exclusive Selection (Single-Choice):**
  - Confirms checking one item turns off all sibling elements within an exclusive group.
  - Confirms turning ON single-choice mode automatically cleans up multiple enabled items to leave only the first one enabled.
- **Profiles Snapshot:**
  - Tests snapshot capture (`saveProfile`), batch restoring of properties, and removing profiles.
- **Duplicate Checking:** Tests mode transitions between `none`, `warn`, and `error` modes. Verifies that `detectDuplicates` detects prompts that differ only by a trailing comma (`on stomach` and `on stomach,`) as duplicates, also excludes `BREAK,` and `AND,` with a trailing comma as control tokens, and does not count prompts in hidden groups (including nested groups inside them) (3 cases added).
- **Detecting Groups That Contain Duplicates:** Verifies that `containsDuplicatePrompt` (used to highlight group borders) detects a duplicate deep in nested groups from both the outer and inner groups, does not detect anything for groups without duplicates, disabled prompts, or prompts under a disabled or hidden group, matches text after trimming surrounding whitespace, and detects nothing after the highlight is cleared (6 cases added).
- **Detecting Highlighted Duplicate Prompts:** Verifies that `isDuplicateHighlighted`, shared by the prompt border and group border highlights, detects only content that matches a highlighted text after trimming surrounding whitespace and a trailing comma, and detects nothing for empty or whitespace-only content or after the highlight is cleared (4 cases added).
- **Duplicate List Dialog:** Verifies that `collectDuplicateOccurrences` collects duplicates per content in order of first appearance, with their pane and group location (including the random-group marker) and ancestor lock, and judges the same as `detectDuplicates`; that `disableDuplicateOccurrence` disables and saves one occurrence, updates the highlight to the remaining duplicates only (clearing it once all are resolved), and changes nothing for locked items; that `refreshDuplicateHighlight` does nothing while no highlight is shown; and that `revealItem` opens the ancestor groups and the pane and focuses the item (changing nothing for an ID not in the tree) (8 cases added).
- **View Filter (`viewFilter.ts`):** Verifies that `buildEnabledView` collects only prompts whose ancestors and self are all enabled, in tree order, and shows only the groups containing them; that it includes and records prompts inside hidden groups; that it returns the ancestor lock and a reference to the list containing each prompt; and its combination with the search query (name, content, memo, including a match on an ancestor group name) (`viewFilter.spec.ts`, 8 cases). Also verifies that `setViewFilterMode` is not saved to local settings, that up/down keyboard navigation visits only the items shown in each mode, and that `switchViewFilterMode`, used by the toolbar, waits for the loading indicator to be painted before switching the tree and waits for the switched tree to be painted before hiding the indicator (the chosen value is shown on the radio buttons first, only the last mode is applied if another one is chosen while waiting, nothing happens for the current mode, and it still switches after a short time in a hidden tab where `requestAnimationFrame` is not called) (8 cases added).
- **Converting Search Field Values (`inputValue.ts`):** Verifies that `toInputText` converts the `null` (and `undefined`) that the search field's clear button puts into v-model into an empty string, and that the view filter can be computed without narrowing using the converted value (`inputValue.spec.ts`, 2 cases).
- **Loading Control:** Verifies the reactive coordination of `isLoading` and `loadingText` state counters during initial file load operations, ensuring that the spinner does not lock user interactions during daily auto-saving (`savePrompts`) (2 cases).
- **Compile Formatting (Underscore Replacement):** Assures auto-replacement of underscores with spaces for prompt content, and underscore preservation for Dynamic Prompts wildcards (`__wildcard__`) (1 case added).
- **Group Map Aggregation (`groupMapUtils.ts`):** Verifies the single-pass active-prompt-count walk (reusing child results) matches the old implementation's behavior for nested groups, including that a disabled ancestor doesn't affect a descendant group's own count, and that only groups whose ancestors and self are all enabled are marked as actually reflected (`effectiveEnabled`) (`groupMapUtils.spec.ts`, 13 cases).
- **Bulk-Disable Confirmation Flow:** Verifies `requestDisableAll` changes and saves nothing by itself, `confirmDisableAll` disables and saves the target pane and clears the pending state, `cancelDisableAll` changes nothing, and that confirming with nothing pending (or a second time) does nothing (5 cases added).
- **Startup Initialization (`initializePsm`):** Verifies `get-prompts` runs exactly once at startup even when a previously selected file exists, generation profiles are loaded, and nothing is loaded when setup is incomplete or the last file no longer exists (4 cases added).
- **Save Speed (Phase C):** Verifies `createPromptFile` defaults to `.json` when no extension is given, that `duplicateCurrentFile`/`renameCurrentFile` inherit the source file's extension instead of forcing `.yaml`, and the success/error paths of `convertCurrentFileToJson`.
- **Search Filter Group Open-State Snapshot/Restore:** Verifies that each group's open/collapsed state is recorded by `id` when a filter starts, that it is correctly restored (including nested groups) after the filter auto-expands groups and is then cleared, and that groups added while filtering are excluded from restoration (4 cases added).
- **Reactive Proxy vs. Raw Array Identity:** Verifies that lock checks (`isListLocked`), descendant checks for move targets, and drag-and-drop move finalization treat a Vue reactive Proxy and its raw array as the same list.
- **Adding, Editing, Duplicating, and Deleting Items (migrated from E2E):** Verifies `addItem` appending/inserting at a given index and creating prompts vs. groups, confirming/cancelling via `startEdit`/`finishEdit`/`cancelEdit` (cancelling a new item removes the empty item; content with brackets is not escaped when saved), `duplicateItem` placing the copy right after the original with new IDs (groups are deep-cloned independently with their descendants), delete confirm → execute/cancel, and promoting children when only the group frame is deleted (14 cases added).
- **Group-Wide Enable/Disable and Duplicate Check Mode Switching (migrated from E2E):** Verifies `setGroupChildrenEnabled` toggles all descendants (including nested ones) and saves, leaves locked groups untouched, and that `setDuplicateCheckMode` switches the mode, saves it to local settings, and clears existing duplicate highlights (3 cases added).
- **Enabling Items Inside a Disabled Group:** Verifies that the shared mouse/keyboard entry point `requestToggleEnabled` toggles as before when all ancestors are enabled (also disabling siblings in an exclusive group), and that when an ancestor is disabled it follows the setting (`parentActivationMode`): "do nothing (show the reason)", "ask", or "enable automatically". Also covers enabling multiple ancestor levels from the outside in, disabling an ancestor's siblings when its parent is exclusive, counting the other prompts that become reflected, undo, doing nothing while locked, saving/restoring the setting, closing the notice when a file is loaded, and the same behavior for the `Space` key (19 cases added).

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
| A-8 | Open a file with duplicated or missing IDs (such as one imported from PNG Info), open another file, then open it again | Only the first time, a message saying that duplicated or missing IDs were reassigned and the file was saved appears at the bottom. It does not appear the second time, and the tree and profile results are the same as before the repair | 2.2 Item ID issuing and repair |
| A-9 | Open a file in another tool's format (one using `group` / `items` / `prompt`), open the Positive pane, then open another file and open it again | Only the first time, a message saying the file was converted to the PSM format and saved appears at the bottom, and the pane shows the group names, prompts, and memos (the pane does not disappear). It does not appear the second time | 2.2 Conversion from another tool's format |

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
| C-3 | Press `Space` | The focused item's enabled state toggles (in an exclusive group the others are disabled, same as with the mouse; inside a disabled group it behaves as in I-2 to I-4) | 2.2 Enabling Items Inside a Disabled Group |
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
| D-6 | Open the dialog with "Move to..." in the right-click menu, type in its search field, then press the clear button (×) | The filter is cleared and all destinations are listed again, and you can go on to pick one and move the item | 2.2 Converting Search Field Values |

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
| F-2 | Set duplicate check to "Show Warning" and apply | Duplicate prompts (the chip fill plus an outer border with a small gap and a glow) and the borders of the groups containing them are highlighted in the warning color, and the warning dialog lists the duplicates. Choosing "Apply Anyway" applies them | 2.2 Duplicate Checking, Detecting Groups That Contain Duplicates, Detecting Highlighted Duplicate Prompts |
| F-3 | Set duplicate check to "Stop with Error" and apply | Duplicate prompts (the chip fill plus an outer border with a small gap and a glow) and the borders of the groups containing them are highlighted in the error color, and the error dialog lists the duplicates. It has no apply button, only "Close"; nothing is applied, and the panel stays open | 2.2 Duplicate Checking, Detecting Groups That Contain Duplicates, Detecting Highlighted Duplicate Prompts |
| F-4 | Apply a prompt with a changed weight | It is applied to the WebUI prompt field in `(word:weight)` format | 2.2 Compile Formatting |
| F-5 | Press the pane's bulk-disable button, cancel in the confirm dialog → press it again and confirm | Cancel changes nothing; confirm disables all prompts except locked ones | 2.2 Bulk-Disable Confirmation Flow |
| F-6 | Put a duplicate prompt deep inside nested groups, collapse the outer group, and do F-2 or F-3 | Every group containing the duplicate, up to the outermost ancestor and including collapsed groups, gets a thick border in the highlight color (taking priority over the random, lock, and hidden borders). Groups without duplicates keep their normal border. Disabling one of the duplicate prompts removes the highlight from that prompt's border and from groups that contained only that prompt. Focusing a duplicate prompt shows both the inner focus outline and the outer duplicate border | 2.2 Detecting Groups That Contain Duplicates |
| F-7 | Put the same prompt in two hidden groups (with no other duplicates) and do F-2 | It is not detected as a duplicate and is applied without the warning dialog. Even with "Show Hidden Groups" ON, chips and borders inside the hidden groups are not highlighted | 2.2 Duplicate Checking, Detecting Groups That Contain Duplicates |
| F-8 | Put `BREAK,` (with a trailing comma) in two groups (with no other duplicates) and do F-2 | It is not detected as a duplicate and is applied without the warning dialog | 2.2 Duplicate Checking |
| F-9 | Put `on stomach` and `on stomach,` (with a trailing comma) in separate groups and do F-2 | They are detected as duplicates; both chips and the borders of the groups containing them are highlighted in the warning color | 2.2 Duplicate Checking, Detecting Highlighted Duplicate Prompts |
| F-10 | Put duplicates in places including nested groups and random groups, and do F-2 or F-3 | The dialog title shows the number of duplicated contents, and each content lists its locations as "Positive > Group > … > Prompt name". Random groups get a dice icon (`mdi-dice-multiple-outline`). With many duplicates only the list scrolls, and the buttons stay on screen | 2.2 Duplicate List Dialog |
| F-11 | In the F-10 dialog, press "Disable" on one occurrence | That prompt is disabled and disappears from the list, and the chip and group border highlights in the tree are updated. The dialog stays open | 2.2 Duplicate List Dialog |
| F-12 | In the F-3 dialog, press "Disable" until all duplicates are resolved | The title icon changes to the success color and "All duplicates have been resolved." is shown. "Apply (Enter)" applies the prompts (even in error mode), and the highlights in the tree disappear | 2.2 Duplicate List Dialog |
| F-13 | Look at a duplicate inside a locked group (or a locked prompt) in the list | It has a lock icon, and hovering shows "Locked, so it cannot be disabled". "Disable" cannot be pressed | 2.2 Duplicate List Dialog |
| F-14 | Press "Show Location" on a duplicate deep inside a closed group (also check with its pane collapsed and with the search field filtering) | The dialog closes, the ancestor groups and the pane open, the view scrolls to the prompt and shows its focus border. If the search was hiding it, the search field is cleared | 2.2 Duplicate List Dialog |

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

#### I. Enabling Items Inside a Disabled Group
Check with a disabled group that contains enabled and disabled prompts and child groups. Switch the setting under "Display & Check" → "When enabling an item in a disabled group" in the sidebar.
| No | Steps | Expected Result | Related unit tests |
|---|---|---|---|
| I-1 | Look at enabled prompts and child groups inside a disabled group | Both are shown in grey with an orange icon (`mdi-link-variant-off`). Prompts have no strikethrough (disabled prompts keep the strikethrough as before), and their tooltip says "Not added to the prompt because a parent group is disabled" | — |
| I-2 | With "Do nothing (show the reason)", click a disabled prompt inside a disabled group | Nothing changes, and a notice says it is not added to the prompt because the parent group "…" is disabled | 2.2 Enabling Items Inside a Disabled Group |
| I-3 | With "Ask whether to enable parent groups" (default), do the same and press "Enable parents" in the notice | Nothing changes before pressing it. After pressing, the ancestor groups and the item are enabled, and a notice says the parent group "…" was also enabled, with the count of other prompts that are now added, if any | 2.2 Enabling Items Inside a Disabled Group |
| I-4 | With "Enable parent groups automatically", do the same and press "Undo" in the notice | A single click enables the ancestor groups and the item, and "Undo" restores the previous state | 2.2 Enabling Items Inside a Disabled Group |
| I-5 | Press "Always do this" in the confirmation notice | The item is enabled along with its ancestors, and the sidebar setting switches to "Enable parent groups automatically" (kept after reload) | 2.2 Enabling Items Inside a Disabled Group |
| I-6 | Filter with the search field and enable a prompt inside a disabled group | As in I-2 to I-4, the ancestor groups can be enabled according to the setting and the prompt is added to the prompt field | 2.2 Enabling Items Inside a Disabled Group |
| I-7 | With the automatic setting, in an exclusive ancestor group where another child group is enabled, enable a prompt under a disabled child group | That child group is enabled and the other child group is disabled by the exclusive rule | 2.2 Enabling Items Inside a Disabled Group |
| I-8 | With an enabled child group inside a disabled group, open the group map on the right edge | The child group is shown in grey with the orange icon, and its active count is not shown | 2.2 Group Map Aggregation |

#### J. View Filter
Check with a file that mixes disabled prompts, disabled groups, hidden groups and nested groups. Switch the filter with the radio buttons in the top toolbar.
| No | Steps | Expected Result | Related unit tests |
|---|---|---|---|
| J-1 | With a file selected, look at the top toolbar | The filter icon and the "All / Enabled Only / Enabled (with Groups)" radio buttons fit on one line without overlapping other buttons. Hovering shows "Tree view filter (shared by Positive / Negative)" | — |
| J-2 | Select "Enabled Only" | In both Positive and Negative, group borders disappear and only prompts that are actually added (self and all ancestors enabled) are listed in tree order. Enabled prompts inside a disabled group are not shown | 2.2 View Filter |
| J-3 | Select "Enabled (with Groups)" | Only the added prompts and the borders of the groups containing them are shown, and those groups open automatically. Groups without such prompts and disabled prompts are not shown | 2.2 View Filter |
| J-4 | Do J-2 and J-3 with "Show Hidden Groups" turned OFF | Added prompts inside hidden groups (and the hidden group borders) are shown as well | 2.2 View Filter |
| J-5 | In J-2 or J-3, toggle a prompt (click or `Space`) | A prompt that is disabled disappears from the view right away. Changing the weight, editing and deleting work as usual | — |
| J-6 | In J-2, grab a drag handle | The cursor does not change to a grab cursor, and items cannot be reordered | — |
| J-7 | In J-2 or J-3, type in a pane's search field | Only items that match both the filter and the search are shown. If nothing matches, "No items to display" is shown | 2.2 View Filter |
| J-8 | In J-2 or J-3, focus a prompt and press the up/down arrow keys | Focus moves only through the items shown | 2.2 View Filter |
| J-9 | Change the open/closed state of some groups, do J-3, then switch back to "All" | Groups auto-expanded by the filter return to their open/closed state from before filtering | 2.2 Search Filter |
| J-10 | With the filter on "Enabled Only", reload the WebUI and open PSM | The filter is back to "All" (it is not saved) | 2.2 View Filter |
| J-11 | In a file with many prompts, switch the filter between the modes (especially "Enabled Only" → "All") | The radio selection changes right after the click and the "Switching the view..." loading indicator appears. It disappears once the tree has switched | 2.2 View Filter |
| J-12 | While the J-11 loading indicator is shown, click where a prompt is in the tree | The click is blocked by the loading indicator, and no prompt in the switched tree is toggled | — |
| J-13 | Type in the Positive pane's search field, clear it with the clear button (×), then switch to "Enabled Only" and "Enabled (with Groups)" | The Positive pane does not disappear and is filtered as in J-2 and J-3. The same applies to the Negative pane | 2.2 Converting Search Field Values |

---

## 3. Running the Tests
Refer to [doc/DEVELOPMENT_en.md](../doc/DEVELOPMENT_en.md) for execution commands.
- Frontend Unit: `bun run test:unit`
- Backend API: `pytest` (inside the venv: `..\..\venv\Scripts\python -m pytest tests\`)
- Manual Checks: after `bun run build`, reload the WebUI and go through the [2.3 Manual Verification Checklist](#23-manual-verification-checklist)
