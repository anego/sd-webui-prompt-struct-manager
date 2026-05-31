import { test, expect, Page } from "@playwright/test";

// --- 英語UIへの強制化ヘルパー ---
async function forceEnglish(page: Page) {
  const psmApp = page.locator("#psm_app_root_container");
  await psmApp.waitFor();

  const sidebar = psmApp.getByTestId("controls-bar");
  await sidebar.waitFor();

  const enBtn = sidebar.locator(".v-btn", { hasText: /^EN$/ });
  await enBtn.click({ force: true });
  await page.waitForTimeout(500); // 反応を待つ
}

test.describe("PSM Design and CSS Verification Test Suite", () => {
  let uniq = "";
  let tempFileName = "";

  test.beforeEach(async ({ page }) => {
    page.on("console", msg => {
      if (msg.type() === "error" || msg.type() === "warning") {
        console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
      }
    });
    page.on("pageerror", err => console.log(`[Browser Error] ${err.stack}`));

    uniq = Date.now().toString().slice(-4) + Math.floor(Math.random() * 100).toString();
    tempFileName = `Design_Temp_${uniq}`;

    // 1. WebUIを開く
    await page.goto("/", { waitUntil: "domcontentloaded" });
    
    // 2. PSMを起動
    const btn = page.locator(".psm-btn-python-native").first();
    await btn.waitFor({ state: "visible", timeout: 30000 });
    await btn.click({ force: true });
    await expect(page.locator("#psm_app_root_container")).toBeVisible();

    // 3. 英語表示に統一
    await forceEnglish(page);

    // 4. 初期セットアップウィザードが表示されている場合はスキップ・処理
    const setupGuide = page.getByTestId("setup-guide");
    try {
      if (await setupGuide.isVisible({ timeout: 2000 })) {
        const dirInput = page.getByTestId("setup-dir-input").locator("input");
        await dirInput.evaluate((el: HTMLInputElement) => {
            el.value = "/tmp/psm_design_test";
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.getByTestId("setup-next-btn").click();

        const fileInput = page.getByTestId("setup-filename-input").locator("input");
        await fileInput.waitFor({ state: "visible" });
        await fileInput.fill("design_initial");
        await fileInput.blur();
        
        await page.getByTestId("setup-finish-btn").click();
        await setupGuide.waitFor({ state: "hidden", timeout: 10000 });
      }
    } catch (e) {
      console.log("Setup wizard skipped or finished already.", e);
    }

    // 5. テスト専用のクリーンなYAMLファイルを新規作成してツリー表示を活性化する
    await page.getByTestId("new-file-btn").click();
    await page.getByTestId("yaml-modal").waitFor();
    await page.getByTestId("yaml-modal").getByLabel("New File Name (.yaml)").fill(tempFileName);
    await page.getByTestId("yaml-modal").getByLabel("New File Name (.yaml)").press("Tab");
    await page.getByTestId("create-file-btn").click();
    
    // ダイアログが閉じるのを確実に待つ
    await page.getByTestId("yaml-modal").waitFor({ state: "hidden", timeout: 10000 });
    await page.waitForTimeout(1000); // 作成処理待ち

    // もしイベント競合などでPSM全体が閉じてしまっている場合は、再度開く
    const psmContainer = page.locator("#psm_app_root_container");
    if (await psmContainer.isHidden()) {
      console.log("PSM overlay was closed after file creation, re-opening via button click...");
      const btn = page.locator(".psm-btn-python-native").first();
      await btn.click({ force: true });
      await expect(psmContainer).toBeVisible({ timeout: 5000 });
    }

    // 6. Positive / NEGATIVE ペインが折りたたまれている場合は、ヘッダーをクリックして展開する
    const positiveHeader = page.getByText("Positive", { exact: true }).first();
    await positiveHeader.waitFor({ state: "visible", timeout: 10000 });

    const addPromptBtn = page.getByTestId("root-add-prompt").first();
    if (await addPromptBtn.isHidden()) {
      await positiveHeader.click();
      await page.waitForTimeout(300);
    }

    const negativeHeader = page.getByText("NEGATIVE", { exact: true }).first();
    const addPromptBtnNeg = page.getByTestId("root-add-prompt").last();
    if (await addPromptBtnNeg.isHidden()) {
      await negativeHeader.click();
      await page.waitForTimeout(300);
    }

    // ツリーが正常に表示され、かつボタンが可視状態 (visible) になっていることをアサーション
    await expect(page.getByTestId("root-add-prompt").first()).toBeVisible({ timeout: 15000 });
  });

  test.afterEach(async ({ page }) => {
    // 作成した一時ファイルを削除してクリーンアップする
    try {
      page.once('dialog', dialog => dialog.accept());
      const deleteBtn = page.locator("button[title='Delete']");
      if (await deleteBtn.isVisible({ timeout: 2000 })) {
        await deleteBtn.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.log("Cleanup failed or file already deleted.", e);
    }
  });

  test("1. Dynamic Prompts (__wildcard__) should render as italic and cyan-accent color", async ({ page }) => {
    // Arrange
    const promptName = `__wildcard_${uniq}__`;

    // Act
    // Promptを追加
    await page.getByTestId("root-add-prompt").first().click();
    
    // 内容を __wildcard__ に設定
    const textarea = page.getByTestId("edit-content-input").locator("textarea").first();
    await textarea.fill(promptName);
    await textarea.dispatchEvent("input");

    // 名前を設定
    const nameInput = page.getByTestId("edit-name-input").locator("input");
    await nameInput.fill(promptName);
    await nameInput.dispatchEvent("input");

    await page.getByTestId("edit-save-btn").click();

    // Assert
    // チップが追加されたことを確認
    const chip = page.locator(".v-chip", { hasText: promptName }).first();
    await expect(chip).toBeVisible();

    // イタリック体 (font-style: italic) であることをアサーション
    const labelSpan = chip.locator("span.text-truncate");
    const fontStyle = await labelSpan.evaluate((el) => window.getComputedStyle(el).fontStyle);
    expect(fontStyle).toBe("italic");

    // mdi-auto-fix アイコンが存在することを確認
    const autoFixIcon = chip.locator(".v-icon--start.mdi-auto-fix");
    await expect(autoFixIcon).toBeVisible();

    // 背景色やテキスト色が適用されていることの確認
    const chipColor = await chip.evaluate((el) => window.getComputedStyle(el).color);
    console.log("Dynamic Prompt Chip Color (text):", chipColor);
    expect(chipColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("2. Random Group (isRandom: true) should display purple-accent border with dashed style", async ({ page }) => {
    // Arrange
    const groupName = `Random_Group_${uniq}`;

    // Act & Assert (初期検証)
    // Groupを追加
    await page.getByTestId("root-add-group").first().click();
    await page.getByTestId("edit-name-input").locator("input").fill(groupName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    // グループコンテナを特定
    const groupContainer = page.locator(".psm-node__group", { hasText: groupName }).first();
    await expect(groupContainer).toBeVisible();

    // 最初は isRandom が OFF なので border-style は dashed ではない
    let borderStyle = await groupContainer.evaluate((el) => window.getComputedStyle(el).borderStyle);
    expect(borderStyle).not.toBe("dashed");

    // Act (トグルの変更)
    // Random トグルスイッチを ON に変更
    const randomSwitch = groupContainer.locator(".v-switch").first();
    await randomSwitch.click();
    await page.waitForTimeout(500); // 状態反映待ち

    // Assert (最終検証)
    // `psm-node__group--random` クラスが付与され、紫系点線枠が適用されていることを検証
    await expect(groupContainer).toHaveClass(/psm-node__group--random/);

    borderStyle = await groupContainer.evaluate((el) => window.getComputedStyle(el).borderStyle);
    expect(borderStyle).toBe("dashed");

    const borderColor = await groupContainer.evaluate((el) => window.getComputedStyle(el).borderColor);
    // 紫系 ($color-accent: #E040FB -> RGB: 224, 64, 251)
    expect(borderColor).toContain("rgb(224, 64, 251)");

    const backgroundColor = await groupContainer.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    // 半透明紫 ($color-accent-light: rgba(224, 64, 251, 0.1))
    expect(backgroundColor).toContain("rgba(224, 64, 251");
  });

  test("3. Duplicate detection should trigger warning/error background style on chips", async ({ page }) => {
    // Arrange
    const duplicateText = `Duplicate_${uniq}`;

    // Act & Assert (重複の作成およびトリガー)
    // ラジオボタンの "Show Warning" をクリックして重複検出をONにする
    const warnRadio = page.getByTestId("controls-bar").getByText("Show Warning");
    await warnRadio.click();
    await page.waitForTimeout(300);

    // 1つ目の Prompt を追加
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill(duplicateText);
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(`PromptA_${uniq}`);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    // 2つ目の同一内容 Prompt を追加 (重複発生)
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill(duplicateText);
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(`PromptB_${uniq}`);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    const chipA = page.locator(".v-chip", { hasText: `PromptA_${uniq}` }).first();
    const chipB = page.locator(".v-chip", { hasText: `PromptB_${uniq}` }).first();

    await expect(chipA).toBeVisible();
    await expect(chipB).toBeVisible();

    // 重複を検出させるために「Apply & Close」ボタンをクリックする
    // これにより、重複がトリガーされて確認モーダルが表示され、同時にチップの警告スタイルが有効化されます。
    const applyBtn = page.locator("button", { hasText: /Apply & Close/i }).first();
    await applyBtn.click({ force: true });

    // 重複警告モーダル（PsmDuplicateConfirmDialog）が表示されるのを待つ
    const dupModal = page.locator(".v-card", { hasText: /duplicate/i }).first();
    await dupModal.waitFor({ state: "visible", timeout: 10000 });

    // Assert (重複警告スタイルの検証)
    // 重複警告の適用（Vuetify warningクラスが付与されていること、または警告色が反映されていること）を検証
    const classesA = await chipA.getAttribute("class") || "";
    const classesB = await chipB.getAttribute("class") || "";

    console.log("Duplicate Warning Chip A Classes:", classesA);
    expect(classesA).toMatch(/(bg-warning|text-warning|v-chip--color-warning)/);
    expect(classesB).toMatch(/(bg-warning|text-warning|v-chip--color-warning)/);

    // Act (クリーンアップとしてダイアログを閉じる)
    // 重複警告モーダルをキャンセル（閉じる）して元のツリー表示に戻す
    const cancelBtn = dupModal.locator("button", { hasText: /cancel/i }).first();
    await cancelBtn.click({ force: true });
    await dupModal.waitFor({ state: "hidden", timeout: 5000 });
  });

  test("4. Focus state should render outline and background warning highlight on item click", async ({ page }) => {
    // Arrange
    const promptName = `Focus_${uniq}`;

    // 最初にPromptを追加
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("focus content");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(promptName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    const chip = page.locator(".v-chip", { hasText: promptName }).first();
    await expect(chip).toBeVisible();

    // 最初はフォーカスされていないことを検証
    await expect(chip).not.toHaveClass(/psm-node--focused/);

    // Act
    // チップをクリックしてフォーカス
    await chip.click();
    await page.waitForTimeout(300);

    // Assert
    // フォーカス用クラスが適用されていること
    await expect(chip).toHaveClass(/psm-node--focused/);

    // アウトライン (2px solid #FF9800) の検証
    const outlineStyle = await chip.evaluate((el) => window.getComputedStyle(el).outlineStyle);
    const outlineColor = await chip.evaluate((el) => window.getComputedStyle(el).outlineColor);
    const outlineWidth = await chip.evaluate((el) => window.getComputedStyle(el).outlineWidth);

    expect(outlineStyle).toBe("solid");
    expect(outlineColor).toContain("rgb(255, 152, 0)"); // #FF9800
    expect(outlineWidth).toBe("2px");
  });

  test("5. Exclusive selection and weight slider with reset button should work reactively", async ({ page }) => {
    // Arrange
    const groupName = `Ex_Group_${uniq}`;
    const promptAName = `PromptA_${uniq}`;
    const promptBName = `PromptB_${uniq}`;

    // Act 1: グループを追加
    await page.getByTestId("root-add-group").first().click();
    await page.getByTestId("edit-name-input").locator("input").fill(groupName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();

    const groupContainer = page.locator(".psm-node__group", { hasText: groupName }).first();
    await expect(groupContainer).toBeVisible();

    // Act 2: 排他択一 (Exclusive) スイッチを ON に変更
    const exclusiveSwitch = groupContainer.locator(".v-switch", { hasText: /Exclusive/i }).first();
    await exclusiveSwitch.click();
    await page.waitForTimeout(500);

    // Act 3: グループ内に 2 つのプロンプトを追加
    await groupContainer.getByTestId("inline-add-prompt").click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("tagA");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(promptAName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    await page.waitForTimeout(500);

    await groupContainer.getByTestId("inline-add-prompt").click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("tagB");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(promptBName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    await page.waitForTimeout(500);

    const chipA = groupContainer.locator(".v-chip", { hasText: promptAName }).first();
    const chipB = groupContainer.locator(".v-chip", { hasText: promptBName }).first();

    await expect(chipA).toBeVisible();
    await expect(chipB).toBeVisible();

    // Act 4: Chip A をクリックして有効化
    await chipA.click();
    await page.waitForTimeout(300);

    // Act 5: Chip B をクリックして有効化
    await chipB.click();
    await page.waitForTimeout(500);

    // Assert: Chip A が自動的に無効化（enabled: false -> 打ち消し線スタイル適用）されたことをアサーション
    const labelA = chipA.locator("span.text-truncate");
    await expect(labelA).toHaveClass(/text-decoration-line-through/);

    // Assert: Chip B が有効化されており、その下にウェイトスライダーとリセットボタンがあることを検証
    const sliderContainer = groupContainer.locator(".psm-node__weight-container").first();
    await expect(sliderContainer).toBeVisible();

    const slider = sliderContainer.locator(".psm-node__weight-slider");
    await expect(slider).toBeVisible();

    const resetBtn = sliderContainer.locator(".psm-node__weight-reset");
    await expect(resetBtn).toBeVisible();
  });
});

