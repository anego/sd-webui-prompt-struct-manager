import { test, expect, Page, Locator } from "@playwright/test";

// --- Helper Functions ---

async function forceEnglish(page: Page) {
  const psmApp = page.locator("#psm_app_root_container");
  await psmApp.waitFor();

  // Scope to sidebar to avoid matching "Language" texts in WebUI footer/descriptions
  const sidebar = psmApp.getByTestId("controls-bar");
  await sidebar.waitFor();

  const enBtn = sidebar.locator(".v-btn", { hasText: /^EN$/ });
  await enBtn.click({ force: true });
  await page.waitForTimeout(500); // Wait for reactivity
}

async function startDrag(page: Page, source: Locator) {
  const sourceHandle = source.locator(".drag-handle").first();
  const sourceBox = await sourceHandle.boundingBox();
  if (!sourceBox) throw new Error("Source handle not found");

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);

  // Shake to trigger Sortable.js
  const cx = sourceBox.x + sourceBox.width / 2;
  const cy = sourceBox.y + sourceBox.height / 2;
  const steps = 5;
  await page.mouse.move(cx + 10, cy, { steps });
  await page.mouse.move(cx, cy, { steps });

  // Wait for drag state (check for drop zones appearing)
  await page.locator(".drop-into-zone").first().waitFor({ state: "visible", timeout: 2000 });
}

async function dragAndDropToZone(page: Page, source: Locator, zoneLocatorFunc: () => Locator) {
  await startDrag(page, source);

  const zone = zoneLocatorFunc();
  await zone.waitFor({ state: "visible", timeout: 3000 });
  await zone.dispatchEvent("drop", { bubbles: true });

  await page.mouse.up();
  await page.waitForTimeout(500);
}

// --- Tests ---

test.describe("PSM E2E Test Suite", () => {
  const uniq = Date.now().toString().slice(-4);

  test.beforeEach(async ({ page }) => {
    // 1. Open WebUI
    await page.goto("/", { waitUntil: "domcontentloaded" });
    
    // 2. Open PSM
    const btn = page.locator(".psm-btn-python-native").first();
    await btn.waitFor({ state: "visible", timeout: 30000 });
    await btn.click({ force: true });
    await expect(page.locator("#psm_app_root_container")).toBeVisible();

    // 3. Setup Test Environment
    // Force English for consistent assertions
    await forceEnglish(page);

    // Set temp save directory if wizard appears
    const setupGuide = page.getByTestId("setup-guide");
    try {
      if (await setupGuide.isVisible({ timeout: 2000 })) {
        // Step 1: Directory (Readonly input, set via JS)
        const dirInput = page.getByTestId("setup-dir-input").locator("input");
        await dirInput.evaluate((el: HTMLInputElement) => {
            el.value = "/tmp/psm_e2e_test";
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.getByTestId("setup-next-btn").click();

        // Step 2: Filename
        const fileInput = page.getByTestId("setup-filename-input").locator("input");
        await fileInput.waitFor({ state: "visible" });
        await fileInput.fill("e2e_initial");
        await fileInput.blur();
        
        await page.getByTestId("setup-finish-btn").click();
        
        // Wait for wizard to disappear (config saved)
        await setupGuide.waitFor({ state: "hidden", timeout: 10000 });
      }
    } catch (e) {
      console.log("Setup wizard not found or failed, continuing...", e);
    }
  });

  test("1. Basic File Operations (Create, Rename, Delete)", async ({ page }) => {
    const fileName = `E2E_File_${uniq}`;
    const renamedFile = `E2E_Renamed_${uniq}`;

    // Create
    await page.getByTestId("new-file-btn").click();
    await page.getByTestId("yaml-modal").waitFor();
    await page.getByTestId("yaml-modal").getByLabel("New File Name (.yaml)").fill(fileName);
    // Force validation
    await page.getByTestId("yaml-modal").getByLabel("New File Name (.yaml)").press("Tab");
    await page.getByTestId("create-file-btn").click();
    
    // Verify created
    await expect(page.getByText(fileName)).toBeVisible();

    // Rename
    await page.locator("button[title='Rename']").click();
    await page.getByLabel("New File Name (.yaml)").fill(renamedFile);
    await page.getByLabel("New File Name (.yaml)").press("Tab");
    await page.getByRole("button", { name: "Execute" }).click();

    // Verify renamed
    await expect(page.getByText(renamedFile)).toBeVisible();

    // Delete
    // Setup listener BEFORE action
    page.once('dialog', dialog => dialog.accept());
    await page.locator("button[title='Delete']").click();
    
    // Verify deletion (Wait for element to disappear)
    await expect(page.getByText(renamedFile)).not.toBeVisible();
  });

  test("2. Tree Operations (Add, Edit, Inline Add)", async ({ page }) => {
    const groupName = `Group_${uniq}`;
    const promptName = `Prompt_${uniq}`;
    const childPrompt = `Child_${uniq}`;

    // Add Group to Root
    await page.locator(".psm-pane-open").first().getByTestId("root-add-group").click();
    await page.getByTestId("edit-name-input").locator("input").fill(groupName);
    // Explicitly trigger input event for Vuetify/validation
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    // Add Prompt to Root
    await page.locator(".psm-pane-open").first().getByTestId("root-add-prompt").click();
    // Prompt content
    const textarea = page.getByTestId("edit-content-input").locator("textarea").first();
    await textarea.fill("masterpiece");
    await textarea.dispatchEvent("input");
    
    // Prompt name
    const nameInput = page.getByTestId("edit-name-input").locator("input");
    await nameInput.fill(promptName);
    await nameInput.dispatchEvent("input");
    
    await page.getByTestId("edit-save-btn").click();

    // Verify presence
    const group = page.locator(".group-container", { hasText: groupName }).first();
    const prompt = page.locator(".v-chip", { hasText: promptName }).first();
    await expect(group).toBeVisible();
    await expect(prompt).toBeVisible();

    // Inline Add to Group
    await group.hover(); // Show hover actions
    await group.getByTestId("inline-add-prompt").click();
    
    // Fix: Fill CONTENT for Prompt validation
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("child content");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    
    await page.getByTestId("edit-name-input").locator("input").fill(childPrompt);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    
    // Verify child
    await expect(group.locator(".v-chip", { hasText: childPrompt })).toBeVisible();
  });

  test("3. Drag and Drop (Item into Group)", async ({ page }) => {
    const groupName = `DnD_Group_${uniq}`;
    const itemName = `DnD_Item_${uniq}`;

    // Setup
    await page.locator(".psm-pane-open").first().getByTestId("root-add-group").click();
    await page.getByTestId("edit-name-input").locator("input").fill(groupName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    await page.locator(".psm-pane-open").first().getByTestId("root-add-prompt").click();
    
    // Fix: Fill CONTENT
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("item content");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");

    await page.getByTestId("edit-name-input").locator("input").fill(itemName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    const group = page.locator(".group-container", { hasText: groupName }).first();
    const item = page.locator(".v-chip", { hasText: itemName }).first();

    // Close group to test "Open / Drop" zone
    if (await group.getByTestId("inline-add-prompt").isVisible()) {
        await group.getByTestId("group-label").click();
    }

    // Drag item to "Open / Drop" zone inside the group container
    await dragAndDropToZone(page, item, () => 
      group.locator(".drop-into-zone", { hasText: "Open / Drop" }).first()
    );

    // Verify group opens and contains item
    await expect(group.getByTestId("inline-add-prompt")).toBeVisible();
    await expect(group.locator(".v-chip", { hasText: itemName })).toBeVisible();
  });

  test("4. Keyboard Navigation (Insert, F2, ESC)", async ({ page }) => {
    const pane = page.locator(".psm-pane-open").first();
    await pane.click();
    
    const itemName = `Key_Item_${uniq}`;
    await pane.getByTestId("root-add-prompt").click();
    
    // Fix: Fill CONTENT
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("key content");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");

    await page.getByTestId("edit-name-input").locator("input").fill(itemName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    
    const item = page.locator(".v-chip", { hasText: itemName }).first();
    await item.click(); // Focus
    
    // Insert new prompt via key (Insert adds prompt to current list/group)
    await page.keyboard.press("Insert");
    await expect(page.getByTestId("edit-modal")).toBeVisible();
    await page.keyboard.press("Escape"); // Close modal
    await expect(page.getByTestId("edit-modal")).not.toBeVisible();

    // Verify Enter does NOT open edit modal (Toggle behavior)
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("edit-modal")).not.toBeVisible();
    
    // Verify F2 opens edit modal
    await page.keyboard.press("F2");
    await expect(page.getByTestId("edit-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("edit-modal")).not.toBeVisible();

    // Verify ESC closes main panel
    await page.keyboard.press("Escape");
    await expect(page.locator("#psm_app_root_container")).not.toBeVisible();
  });
  
  test("5. Mouse Operations (Double Click)", async ({ page }) => {
    const itemName = `Mouse_Item_${uniq}`;
    
    // Create Item
    await page.locator(".psm-pane-open").first().getByTestId("root-add-prompt").click();
    const textarea = page.getByTestId("edit-content-input").locator("textarea").first();
    await textarea.fill("mouse content");
    await textarea.dispatchEvent("input"); // Vue model
    const nameInput = page.getByTestId("edit-name-input").locator("input");
    await nameInput.fill(itemName);
    await nameInput.dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    // Test Double Click
    const item = page.locator(".v-chip", { hasText: itemName }).first();
    await item.dblclick();
    
    // Verify Edit Modal Opens
    await expect(page.getByTestId("edit-modal")).toBeVisible();
    // Verify correct item loaded
    await expect(page.getByTestId("edit-name-input").locator("input")).toHaveValue(itemName);
    
    await page.getByTestId("edit-cancel-btn").click();
  });

  test("6. New Features (Random, Bulk, Escape)", async ({ page }) => {
    const groupName = `Feat_Group_${uniq}`;
    const p1Name = `P1_${uniq}`;
    const p2Name = `P2_${uniq}`;

    // 1. Create Group
    await page.locator(".psm-pane-open").first().getByTestId("root-add-group").click();
    await page.getByTestId("edit-name-input").locator("input").fill(groupName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    
    const group = page.locator(".group-container", { hasText: groupName }).first();
    await expect(group).toBeVisible();

    // 2. Random Group Toggle
    // Verify initial state (not random)
    await expect(group).not.toHaveClass(/random-mode-group/);
    
    // Toggle Switch (Find v-switch within group header)
    const randomSwitch = group.locator(".v-switch").first();
    await randomSwitch.click();
    
    // Verify Random Mode Style applied
    await expect(group).toHaveClass(/random-mode-group/);

    // 3. Bulk Toggle
    // Add two items
    // Item 1
    await group.hover();
    await group.getByTestId("inline-add-prompt").click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("c1");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(p1Name);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    // Item 2
    await group.hover();
    await group.getByTestId("inline-add-prompt").click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("c2");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(p2Name);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    const p1 = group.locator(".v-chip", { hasText: p1Name }).first();
    const p2 = group.locator(".v-chip", { hasText: p2Name }).first();

    // Disable All
    await group.hover(); // Restore hover to show buttons
    const disableAllBtn = group.locator("button[title='Disable All in Group']");
    await disableAllBtn.click();
    await page.waitForTimeout(200); // Wait for store update

    // Verify both disabled (using class check or opacity expectation)
    await expect(p1.locator(".text-decoration-line-through")).toBeVisible();
    await expect(p2.locator(".text-decoration-line-through")).toBeVisible();

    // Enable All
    await group.hover();
    const enableAllBtn = group.locator("button[title='Enable All in Group']");
    await enableAllBtn.click();
    await page.waitForTimeout(200);

    // Verify both enabled
    await expect(p1.locator(".text-decoration-line-through")).not.toBeVisible();
    await expect(p2.locator(".text-decoration-line-through")).not.toBeVisible();

    // 4. Prompt Escaping (UI Persistence Check)
    // Add item with parentheses
    const escapeContent = "test (escape)";
    const escapeName = `Esc_${uniq}`;
    
    await group.hover();
    await group.getByTestId("inline-add-prompt").click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill(escapeContent);
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(escapeName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    // Re-open edit to verify it wasn't double escaped or modified in storage view
    const escItem = group.locator(".v-chip", { hasText: escapeName }).first();
    await escItem.dblclick();

    // Value in textarea should remain "test (escape)", NOT "test \(escape\)"
    // Escaping happens ONLY during compilation/generation, not in storage/UI.
    await expect(page.getByTestId("edit-content-input").locator("textarea").first()).toHaveValue(escapeContent);
    await page.getByTestId("edit-cancel-btn").click();
  });
});
