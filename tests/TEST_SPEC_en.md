# 📘 Prompt Struct Manager (PSM) Quality Assurance (v2.0)

**Last Updated:** 2026-06-20
**Scope:** 3-Tier Automated Testing Suite (Unit, Backend, and E2E)

---

## 1. Test Strategy
Quality assurance in PSM Ver2 is built on a 3-layered hierarchical test architecture to guarantee regression prevention, UI consistency, and API stability:
- **Backend API Tests (pytest):** Ensures server configurations, I/O operations, and prompt conversions are solid.
- **Frontend Store Logic Tests (Vitest):** Unit tests that verify core business logic like exclusive selection, profile restoring, duplicate detection, and loading overlay counter state control under mock conditions.
- **End-to-End Tests (Playwright):** Orchestrates headless browsers to verify real user interactions, drag-and-drop mechanics, widget renders (like the compact weight slider), keyboard shortcut mappings, dual-way prompt dictionary portal integration, typing safety, and deletion safety.

---

## 2. Test Suites & Scenarios

### 2.1 Backend Tests (`pytest` - 16 Cases)
- **API Configs:** Validates `get-config` and `set-config` logic, folder paths structure, and fallback locations.
- **YAML I/O:** Assures safe YAML saving/loading, profile integration inside files, duplicating, renaming, and deleting of files.
- **String Parsing:** Tests negative/positive prompt cleanups, bracket additions for weights, and Dynamic Prompts translations.

### 2.2 Frontend Store Logic Tests (`Vitest` - 23 Cases)
- **Core Operations:** Tests node addition, editing, removal, and drag placement on store states.
- **Exclusive Selection (Single-Choice):**
  - Confirms checking one item turns off all sibling elements within an exclusive group.
  - Confirms turning ON single-choice mode automatically cleans up multiple enabled items to leave only the first one enabled.
- **Profiles Snapshot:**
  - Tests snapshot capture (`saveProfile`), batch restoring of properties, and removing profiles.
- **Duplicate Checking:** Tests mode transitions between `none`, `warn`, and `error` modes.
- **Loading Control:** Verifies the reactive coordination of `isLoading` and `loadingText` state counters during initial file load operations, ensuring that the spinner does not lock user interactions during daily auto-saving (`savePrompts`) (2 cases).
- **Compile Formatting (Underscore Replacement):** Assures auto-replacement of underscores with spaces for prompt content, and underscore preservation for Dynamic Prompts wildcards (`__wildcard__`) (1 case added).

### 2.3 E2E Tests (`Playwright` - 12 Cases)
- **Setup Wizard:** Checks if first-time folder config screen shows and submits successfully.
- **CRUD Files:** Creates files, renames them, and deletes them through sidebar buttons.
- **Slider Interaction:** Drags the compact slider, asserts the resulting weight values update in real-time and compiles to `(word:weight)` format.
- **Profile UI Workflow:** Creates a new profile snapshot from the toolbar, applies it, validates state changes, and deletes the profile.
- **Drag & Drop (DaD) Recovery:** Validates adaptation to the new class `.psm-node__drag-handle`, group/folder drag handle feature, and node nesting/sorting across folders.
- **Keyboard Shortcuts:** Verifies standard keyboard mappings like `F2` for edit, `Space` for toggles, and `Insert` for prompt creation.
- **Keyboard Typing Safety:** Verifies typing characters like `m` or pressing `Enter` inside prompt edit fields does not trigger global hotkeys or close the PSM modal.
- **Deletion Confirm Safety:** Verifies that confirming deletion in the `delete-confirm-modal` closes the dialog but keeps the main PSM panel open.
- **Prompt Dictionary Integration:** Verifies that the dictionary panel immediately teleports (mounts) into the modal portal upon opening, safely inserts tags as comma-separated values, and properly restores to its original parent (`txt2img_actions_column`, etc.) and collapses upon modal closure.
- **Independent Search Filters:** Verifies that the sidebar global filter is removed and independent search inputs are added inside Positive/Negative pane headers, ensuring that typing inside the fields does not toggle the panes, and the filters hide when panes are collapsed.
- **Dictionary Search-Term Copy:** Verifies that when tags are inserted from the Prompt Dictionary, the search keyword entered in the dictionary's input field is automatically copied to the prompt's name field if it is currently empty, and is not overwritten if a name already exists.
- **Edit Icon Visibility Protection:** Verifies that even with extremely long prompt names or contents, layout constraints (reduced text max-width, `flex-shrink-1` on text, and `flex-shrink-0` on icons) keep the edit (pencil) icon visible and clickable without being pushed off the screen (1 case added).

---

## 3. Running the Tests
Refer to [doc/DEVELOPMENT_en.md](../doc/DEVELOPMENT_en.md) for execution commands.
- Frontend Unit: `npm run test:unit`
- Backend API: `pytest`
- E2E Integration: `npx playwright test`
- All-in-one local script: `.\test_local.bat`

