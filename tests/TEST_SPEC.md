# 📘 Prompt Struct Manager (PSM) Quality Assurance (v2.0)

**Last Updated:** 2026-01-26
**Scope:** E2E Testing using Playwright

---

## 1. Test Strategy
We have consolidated all automated tests into a single E2E suite (`tests/e2e.spec.ts`) to ensure robust verification of the "real" user experience, including:
- Vuetify UI interactions
- Drag and Drop operations
- Multi-language support (I18n)

## 2. Test Scenarios (Implements in `e2e.spec.ts`)

### 2.1 Basic Operations
- **Startup & Wizard**: Verify Setup Wizard appears on fresh start and completes successfully (Directory -> Filename).
- **Startup**: Verify panel opens.
- **I18n**: Force English mode (`en`) to ensure consistent text assertions.
- **CRUD**: Create, Rename, and Delete files.

### 2.2 Tree Operations
- **Node Management**: Add Prompt/Group to root.
- **Inline Actions**: Add items inside groups.
- **Editing**: Verify modal interactions.

### 2.3 Drag and Drop
- **Drop Zones**: Verify "Open / Drop" and "Add to {name}" zones appear during drag.
- **Logic**: Verify items are actually moved into groups.

### 2.4 Keyboard Shortcuts
- **Navigation**: Verify `Insert` to add items.
- **Closing**: Verify `Escape` closes modals and the panel.

### 2.5 Mouse Operations
- **Double Click**: Verify double-clicking an item/group opens the edit modal.

## 3. Execution
```bash
npx playwright test
```
