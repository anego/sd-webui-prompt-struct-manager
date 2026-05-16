import { test, expect } from "@playwright/test";

test.describe("PSM Layout Test Suite", () => {
  test.beforeEach(async ({ page }) => {
    // 1. Open WebUI
    await page.goto("/", { waitUntil: "domcontentloaded" });
    
    // 2. Open PSM
    const btn = page.locator(".psm-btn-python-native").first();
    await btn.waitFor({ state: "visible", timeout: 30000 });
    await btn.click({ force: true });
    await expect(page.locator("#psm_app_root_container")).toBeVisible();
  });

  test("1. Basic Layout Elements and BEM Classes should be present", async ({ page }) => {
    // Verify App Root
    const appRoot = page.locator(".psm-app-root");
    await expect(appRoot).toBeVisible();

    // Verify Sidebar BEM
    const sidebar = page.locator(".psm-sidebar");
    await expect(sidebar).toBeVisible();

    // Verify Panes
    const openPanes = page.locator(".psm-pane--open");
    expect(await openPanes.count()).toBeGreaterThanOrEqual(1);

    // Sidebar Content visibility
    const sidebarContent = page.locator(".psm-sidebar__content");
    await expect(sidebarContent).toBeVisible();
  });

  test("2. Visual Regression Check (Snapshot)", async ({ page }) => {
    // Note: Visual regression tests require a baseline to be generated first.
    // Run `npx playwright test --update-snapshots` locally to create the baseline.
    const appRoot = page.locator("#psm_app_root_container");
    await expect(appRoot).toBeVisible();

    // Give some time for rendering to settle
    await page.waitForTimeout(500);

    // Expect the main container screenshot to match the baseline
    expect(await appRoot.screenshot()).toMatchSnapshot("psm-layout-default.png", { maxDiffPixels: 100 });
  });
});
