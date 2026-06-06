# 📘 Prompt Struct Manager (PSM) Quality Assurance (v2.0)

**Last Updated:** 2026-06-06
**Scope:** 3-Tier Automated Testing Suite (Unit, Backend, and E2E)

---

## 1. Test Strategy
Quality assurance in PSM Ver2 is built on a 3-layered hierarchical test architecture to guarantee regression prevention, UI consistency, and API stability:
- **Backend API Tests (pytest):** Ensures server configurations, I/O operations, and prompt conversions are solid.
- **Frontend Store Logic Tests (Vitest):** Unit tests that verify core business logic like exclusive selection, profile restoring, and duplicate detection under mock conditions.
- **End-to-End Tests (Playwright):** Orchestrates headless browsers to verify real user interactions, drag-and-drop mechanics, widget renders (like the compact weight slider), and keyboard shortcut mappings.

---

## 2. Test Suites & Scenarios

### 2.1 Backend Tests (`pytest` - 16 Cases)
- **API Configs:** Validates `get-config` and `set-config` logic, folder paths structure, and fallback locations.
- **YAML I/O:** Assures safe YAML saving/loading, profile integration inside files, duplicating, renaming, and deleting of files.
- **String Parsing:** Tests negative/positive prompt cleanups, bracket additions for weights, and Dynamic Prompts translations.

### 2.2 Frontend Unit Tests (`Vitest` - 20 Cases)
- **Core Operations:** Tests node addition, editing, removal, and drag placement on store states.
- **Exclusive Selection (Single-Choice):**
  - Confirms checking one item turns off all sibling elements within an exclusive group.
  - Confirms turning ON single-choice mode automatically cleans up multiple enabled items to leave only the first one enabled.
- **Profiles Snapshot:**
  - Tests snapshot capture (`saveProfile`), batch restoring of properties, and removing profiles.
- **Duplicate Checking:** Tests mode transitions between `none`, `warn`, and `error` modes.

### 2.3 E2E Tests (`Playwright` - 6 Cases)
- **Setup Wizard:** Checks if first-time folder config screen shows and submits successfully.
- **CRUD Files:** Creates files, renames them, and deletes them through sidebar buttons.
- **Slider Interaction:** Drags the compact slider, asserts the resulting weight values update in real-time and compiles to `(word:weight)` format.
- **Profile UI Workflow:** Creates a new profile snapshot from the toolbar, applies it, validates state changes, and deletes the profile.
- **Drag & Drop:** Drags nodes across folders and validates node nesting and sibling sorting.
- **Keyboard Shortcuts:** Verifies standard keyboard mappings like `F2` for edit, `Space` for toggles, and `Insert` for prompt creation.

---

## 3. Running the Tests
Refer to [doc/DEVELOPMENT_en.md](../doc/DEVELOPMENT_en.md) for execution commands.
- Frontend Unit: `npm run test:unit`
- Backend API: `pytest`
- E2E Integration: `npx playwright test`
- All-in-one local script: `.\test_local.bat`
