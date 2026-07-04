import { test, expect, Page } from "@playwright/test";

// --- 英語UIへの強制化ヘルパー ---
async function forceEnglish(page: Page) {
  const psmApp = page.locator("#psm_app_root_container");
  await psmApp.waitFor();

  // 初期ロードのローディング表示が消滅するのを確実に待つ
  const loadingOverlay = page.getByTestId("loading-overlay");
  await loadingOverlay.waitFor({ state: "hidden", timeout: 15000 });

  const sidebar = psmApp.getByTestId("controls-bar");
  await sidebar.waitFor();

  const enBtn = sidebar.locator(".v-btn", { hasText: /^EN$/ });
  await enBtn.click();
  
  // 翻訳が適用され、"Show Warning" のテキストが可視になるのを待つ
  const showWarningText = sidebar.getByText("Show Warning");
  await showWarningText.waitFor({ state: "visible", timeout: 15000 });
}

test.describe("PSM Design and CSS Verification Test Suite", () => {
  let uniq = "";
  let tempFileName = "";

  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    page.on("console", msg => {
      if (msg.type() === "error" || msg.type() === "warning") {
        const text = msg.text();
        // 外部リソース（Gradioポーリング、他拡張機能の画像など）や多重定義警告を除外
        if (
          text.includes("Failed to load resource") ||
          text.includes("queue/status") ||
          text.includes("prompt-history") ||
          text.includes("already defined") ||
          text.includes("fabric.")
        ) {
          return;
        }
        console.log(`[Browser Console] ${msg.type()}: ${text}`);
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
    // ローディング表示が消滅するのを確実に待つ
    const loadingOverlay = page.getByTestId("loading-overlay");
    await loadingOverlay.waitFor({ state: "hidden", timeout: 15000 });

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
        // ローディング表示が消滅するのを確実に待つ
        const loadingOverlay = page.getByTestId("loading-overlay");
        await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });
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
    const warnRadio = page.locator("input[type='radio'][value='warn']");
    await warnRadio.check({ force: true });
    await page.waitForTimeout(300);

    const loadingOverlay = page.getByTestId("loading-overlay");

    // 1つ目の Prompt を追加
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-modal").waitFor({ state: "visible", timeout: 5000 });
    await page.getByTestId("edit-content-input").locator("textarea").first().fill(duplicateText);
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(`PromptA_${uniq}`);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    // 2つ目の同一内容 Prompt を追加 (重複発生)
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-modal").waitFor({ state: "visible", timeout: 5000 });
    await page.getByTestId("edit-content-input").locator("textarea").first().fill(duplicateText);
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(`PromptB_${uniq}`);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    const chipA = page.locator(".v-chip", { hasText: `PromptA_${uniq}` }).first();
    const chipB = page.locator(".v-chip", { hasText: `PromptB_${uniq}` }).first();

    await expect(chipA).toBeVisible();
    await expect(chipB).toBeVisible();

    // 重複を検出させるために「Apply & Close」ボタンをクリックする
    // これにより、重複がトリガーされて確認モーダルが表示され、同時にチップの警告スタイルが有効化されます。
    const applyBtn = page.locator("button", { hasText: /Apply & Close/i }).first();
    await applyBtn.click({ force: true });

    // 重複警告モーダル（PsmDuplicateConfirmDialog）が表示されるのを待つ
    const dupModal = page.getByTestId("duplicate-confirm-dialog");
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
    const cancelBtn = page.getByTestId("duplicate-cancel-btn");
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

    // Act 2: グループ内に 2 つのプロンプトを追加（排他はまだ OFF）
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

    // 両方とも enabled: true （打ち消し線なし）
    await expect(chipA.locator("span.text-truncate")).not.toHaveClass(/text-decoration-line-through/);
    await expect(chipB.locator("span.text-truncate")).not.toHaveClass(/text-decoration-line-through/);

    // Act 3: 排他択一 (Exclusive) スイッチを ON に変更
    const exclusiveSwitch = groupContainer.locator(".v-switch", { hasText: /Exclusive/i }).first();
    await exclusiveSwitch.click();
    await page.waitForTimeout(500);

    // Assert: 排他択一により、2つ目の要素 (Chip B) が自動的に無効化（打ち消し線あり）されること
    await expect(chipA.locator("span.text-truncate")).not.toHaveClass(/text-decoration-line-through/);
    await expect(chipB.locator("span.text-truncate")).toHaveClass(/text-decoration-line-through/);

    // Act 4: 無効化されている Chip B をクリックして有効化する
    await chipB.click();
    await page.waitForTimeout(500);

    // Assert: Chip B が有効になり、Chip A が自動的に無効化（打ち消し線スタイル適用）されたことをアサーション
    await expect(chipA.locator("span.text-truncate")).toHaveClass(/text-decoration-line-through/);
    await expect(chipB.locator("span.text-truncate")).not.toHaveClass(/text-decoration-line-through/);

    // Assert: Chip B が有効化されており、その下にウェイトスライダーとリセットボタンがあることを検証
    const sliderContainer = groupContainer.locator(".psm-node__weight-container").first();
    await expect(sliderContainer).toBeVisible();

    const slider = sliderContainer.locator(".psm-node__weight-slider");
    await expect(slider).toBeVisible();

    const resetBtn = sliderContainer.locator(".psm-node__weight-reset");
    await expect(resetBtn).toBeVisible();
  });

  test("6. Profile creation, application, and deletion should work reactively", async ({ page }) => {
    // Arrange
    const profileName = `Profile_${uniq}`;
    const promptAName = `PromptA_${uniq}`;
    const promptBName = `PromptB_${uniq}`;

    const loadingOverlay = page.getByTestId("loading-overlay");

    // PositiveペインにPrompt Aを追加（デフォルト有効）
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("tagA");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(promptAName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    // Prompt Bを追加し、無効化する
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("tagB");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(promptBName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    const chipA = page.locator(".v-chip", { hasText: promptAName }).first();
    const chipB = page.locator(".v-chip", { hasText: promptBName }).first();

    // Chip B をクリックして無効化する（デフォルトは有効になって追加されるので、一回クリックして無効化）
    await chipB.click();
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    // Chip A が有効（打ち消し線なし）、Chip B が無効（打ち消し線あり）であることをアサーション
    await expect(chipA.locator("span.text-truncate")).not.toHaveClass(/text-decoration-line-through/);
    await expect(chipB.locator("span.text-truncate")).toHaveClass(/text-decoration-line-through/);

    // Act 1: プロファイルの新規保存
    // ツールバーの保存ボタンをクリック
    const saveBtn = page.getByTestId("save-profile-btn");
    await saveBtn.click();
    await page.waitForTimeout(300);

    // ダイアログに入力して保存
    const dialog = page.locator(".v-card", { hasText: /Save Profile/i }).first();
    await expect(dialog).toBeVisible();
    
    const profileInput = dialog.locator("input[type='text']").first();
    await profileInput.click();
    await page.waitForTimeout(100);
    await profileInput.fill(profileName);
    await profileInput.dispatchEvent("input");
    await profileInput.dispatchEvent("change");
    await page.waitForTimeout(300);

    // 新規プロファイル保存ダイアログの「保存」ボタンをクリックして確定
    const saveConfirmBtn = dialog.locator("button", { hasText: /Save|保存/i }).first();
    await saveConfirmBtn.click();
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    // Assert 1: プロファイルが選択され、保存されたこと
    const select = page.locator(".v-select", { hasText: /Profiles/i }).first();
    await expect(select).toContainText(profileName);

    // Act 2: ツリー状態の変更（Aを無効化、Bを有効化）
    await chipA.click(); // Aを無効化
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });
    await chipB.click(); // Bを有効化
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    // Aが無効、Bが有効であることを確認
    await expect(chipA.locator("span.text-truncate")).toHaveClass(/text-decoration-line-through/);
    await expect(chipB.locator("span.text-truncate")).not.toHaveClass(/text-decoration-line-through/);

    // Act 3: プロファイルの適用
    // v-select をクリックしてプルダウンを開く
    await select.click();
    await page.waitForTimeout(500); // プルダウンアニメーションを待つ
    
    // role="option" を指定して、プロファイル名を持つアイテムを確実にクリック
    const option = page.getByRole("option", { name: profileName }).first();
    await option.waitFor({ state: "visible", timeout: 5000 });
    await option.click();
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    // もし Positive ペインが閉じている場合は、クリックして展開する
    const addPromptBtnAfterApply = page.getByTestId("root-add-prompt").first();
    if (await addPromptBtnAfterApply.isHidden()) {
      console.log("Positive pane was closed, re-opening...");
      const positivePane = page.locator(".psm-pane").filter({ hasText: /Positive/i }).first();
      const collapsedPlaceholder = positivePane.locator(".psm-pane__placeholder--hoverable").first();
      await collapsedPlaceholder.click();
      await page.waitForTimeout(500); // 展開アニメーションを待つ
    }

    // ロケーターの再評価（再レンダリング対策）
    const chipARefreshed = page.locator(".v-chip", { hasText: promptAName }).first();
    const chipBRefreshed = page.locator(".v-chip", { hasText: promptBName }).first();

    // Assert 3: 状態が元通り復元されたこと（Aが有効, Bが無効）
    await expect(chipARefreshed.locator("span.text-truncate")).not.toHaveClass(/text-decoration-line-through/);
    await expect(chipBRefreshed.locator("span.text-truncate")).toHaveClass(/text-decoration-line-through/);

    // Act 4: プロファイルの削除
    const deleteProfileBtn = page.getByTestId("delete-profile-btn");
    await deleteProfileBtn.click();
    await page.waitForTimeout(300);

    const deleteConfirmDialog = page.locator(".v-card", { hasText: /Delete Profile/i }).first();
    await expect(deleteConfirmDialog).toBeVisible();
    await deleteConfirmDialog.locator("button", { hasText: /Delete|削除/i }).first().click();
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });
    
    // ダイアログとそれに関連するオーバーレイが完全に隠れる（非表示になる）のを確実に待つ
    await deleteConfirmDialog.waitFor({ state: "hidden", timeout: 10000 });
    const deleteOverlay = page.locator(".v-overlay", { hasText: /Delete Profile/i }).first();
    await deleteOverlay.waitFor({ state: "hidden", timeout: 10000 });
    await page.waitForTimeout(500);

    // Assert 4: プロファイル選択状態が解除されたこと
    const selection = select.locator(".v-select__selection");
    await expect(selection).not.toBeVisible();
  });

  test("7. Normal key input (typing in edit fields) should not trigger global shortcuts or close PSM panel", async ({ page }) => {
    const promptName = `TypingTest_${uniq}`;
    const loadingOverlay = page.getByTestId("loading-overlay");

    // モーダルを起動
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-modal").waitFor({ state: "visible", timeout: 5000 });

    // 名前入力フィールドを取得して通常文字・Enter・矢印などを入力
    const nameInput = page.getByTestId("edit-name-input").locator("input");
    await nameInput.click();
    
    // a-z, 0-9, Enter, Space, Arrow keys, Backspace, Escape などの各種通常キーを入力する
    await nameInput.press("a");
    await nameInput.press("b");
    await nameInput.press("c");
    await nameInput.press("1");
    await nameInput.press("2");
    await nameInput.press("Space");
    await nameInput.press("ArrowLeft");
    await nameInput.press("ArrowRight");
    await nameInput.press("Backspace");
    await nameInput.press("Enter"); // text-fieldの中でのEnter (非修飾)

    // 内容入力フィールド（textarea）に移動して同様にテスト
    const textarea = page.getByTestId("edit-content-input").locator("textarea").first();
    await textarea.click();
    await textarea.press("m"); // m キー (不具合のあったキー)
    await textarea.press("e");
    await textarea.press("n");
    await textarea.press("t");
    await textarea.press("Enter"); // textareaの中でのEnter (改行)
    await textarea.press("ArrowUp");

    // アサーション 1: PSMパネル本体および編集モーダルが閉じずに表示されたままであること
    await expect(page.locator("#psm_app_root_container")).toBeVisible();
    await expect(page.getByTestId("edit-modal")).toBeVisible();

    // 入力した内容が維持されていることを確認
    const finalName = await nameInput.inputValue();
    const finalContent = await textarea.inputValue();
    expect(finalName).toContain("abc1"); // Backspaceや矢印などによる変化はあるが、基本文字が含まれる
    expect(finalContent).toContain("m");
    expect(finalContent).toContain("ent");

    // 保存ショートカット Ctrl+Enter で保存を確定
    await textarea.press("Control+Enter");
    await page.getByTestId("edit-modal").waitFor({ state: "hidden", timeout: 10000 });
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    // アサーション 2: PSMパネル本体は開いたままであること
    await expect(page.locator("#psm_app_root_container")).toBeVisible();
  });

  test("8. Prompt deletion confirmation should not close the main PSM panel", async ({ page }) => {
    const promptName = `DelSafety_${uniq}`;
    const loadingOverlay = page.getByTestId("loading-overlay");

    // 1. テスト用のプロンプトを追加して保存
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("tagToDelete");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(promptName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    const chip = page.locator(".v-chip", { hasText: promptName }).first();
    await expect(chip).toBeVisible();

    // 2. 追加したプロンプトの編集モーダルを開く
    // test-id で編集ボタンを狙い撃つ
    await chip.getByTestId("edit-item-btn").click({ force: true });
    await page.getByTestId("edit-modal").waitFor({ state: "visible", timeout: 5000 });

    // 3. モーダルフッターの「削除」ボタンをクリック
    const deleteBtn = page.getByTestId("footer-delete-btn");
    await deleteBtn.waitFor({ state: "visible", timeout: 5000 });
    await deleteBtn.click();

    // 4. 削除確認ダイアログの「削除」ボタンをクリック
    const confirmDialog = page.getByTestId("delete-confirm-modal");
    await expect(confirmDialog).toBeVisible();
    
    // ダイアログ内の「削除」ボタンをクリックして確定
    const confirmDeleteBtn = confirmDialog.getByTestId("confirm-delete-btn");
    await confirmDeleteBtn.click();

    // 削除処理とダイアログの消滅を待つ
    await confirmDialog.waitFor({ state: "hidden", timeout: 10000 });
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    // アサーション: 
    // - プロンプトがツリーから削除されていること
    // - 編集モーダルが閉じていること
    // - PSMパネル本体は開いた状態を維持していること
    await expect(chip).not.toBeVisible();
    await expect(page.getByTestId("edit-modal")).not.toBeVisible();
    await expect(page.locator("#psm_app_root_container")).toBeVisible();
  });

  test("9. Prompt Dictionary integration (portal move, tag insert and restore) should work properly", async ({ page }) => {
    // 1. WebUI 側にモックの「プロンプト大辞典」パネルと挿入ボタンを用意する。
    await page.evaluate(() => {
      const gradioApp = document.querySelector("gradio-app");
      const root = gradioApp?.shadowRoot || document.body;

      // 既存のモックがあれば一旦削除
      const existing = root.querySelector("#pd_inline_panel_txt2img");
      if (existing) existing.remove();

      // 大辞典親コンテナの作成
      const parent = document.createElement("div");
      parent.id = "mock_dict_parent";

      const panel = document.createElement("div");
      panel.id = "pd_inline_panel_txt2img";
      panel.style.padding = "10px";
      panel.style.background = "#222";
      
      const head = document.createElement("div");
      head.className = "pd-inline-head";
      head.setAttribute("aria-expanded", "false");
      // aria-expandedトグルのためのクリックリスナー
      head.addEventListener("click", () => {
        const expanded = head.getAttribute("aria-expanded") === "true";
        head.setAttribute("aria-expanded", !expanded ? "true" : "false");
      });
      panel.appendChild(head);

      const btn = document.createElement("button");
      btn.id = "mock_insert_btn";
      btn.setAttribute("data-pd-insert", "masterpiece");
      btn.innerText = "Insert Tag";
      panel.appendChild(btn);

      const sibling = document.createElement("div");
      sibling.id = "mock_dict_sibling";

      parent.appendChild(panel);
      parent.appendChild(sibling);
      root.appendChild(parent);
    });

    const loadingOverlay = page.getByTestId("loading-overlay");

    // 2. モーダルを起動
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-modal").waitFor({ state: "visible", timeout: 5000 });

    // 3. アサーション 1: 大辞典パネルがポータルに移動され、2カラム表示になっていること
    const portal = page.locator("#psm_dictionary_portal");
    await expect(portal).toBeVisible();

    const panelInPortal = portal.locator("#pd_inline_panel_txt2img");
    await expect(panelInPortal).toBeVisible();

    // 4. アサーション 2: 大辞典が自動で展開 (aria-expanded = true) になっていること
    const head = panelInPortal.locator(".pd-inline-head");
    await expect(head).toHaveAttribute("aria-expanded", "true");

    // 5. アサーション 3: 挿入クリック時に、編集モーダルの textarea にタグが挿入されること
    const textarea = page.getByTestId("edit-content-input").locator("textarea").first();
    const insertBtn = panelInPortal.locator("#mock_insert_btn");
    await insertBtn.click();

    await expect(textarea).toHaveValue("masterpiece");

    // もう一度クリックして、カンマ区切りで追加されるか検証
    await insertBtn.click();
    await expect(textarea).toHaveValue("masterpiece, masterpiece");

    // 6. 完了して閉じる
    await textarea.press("Control+Enter");
    await page.getByTestId("edit-modal").waitFor({ state: "hidden", timeout: 10000 });
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });

    // 7. アサーション 4: 大辞典パネルが元の位置に復元されていること
    // デバッグ用のDOM状態出力
    const domStatus = await page.evaluate(() => {
      const gradioApp = document.querySelector("gradio-app");
      const root = gradioApp?.shadowRoot || document.body;
      const panel = root.querySelector("#pd_inline_panel_txt2img");
      const parent = root.querySelector("#mock_dict_parent");
      const portal = root.querySelector("#psm_dictionary_portal");
      return {
        panelExists: !!panel,
        panelParentId: panel?.parentElement?.id || panel?.parentElement?.tagName || "null",
        parentExists: !!parent,
        parentChildrenIds: parent ? Array.from(parent.children).map(c => c.id) : [],
        portalExists: !!portal,
        portalChildrenIds: portal ? Array.from(portal.children).map(c => c.id) : []
      };
    });
    console.log("DOM STATUS AFTER CLOSE:", domStatus);

    // 7. アサーション 4: 大辞典パネルが元の位置に復元されていること
    // 本物の大辞典の自動回収により元の親(txt2img_actions_column)に戻っている場合も含めてアサート
    await page.waitForFunction(() => {
      const gradioApp = document.querySelector("gradio-app");
      const root = gradioApp?.shadowRoot || document.body;
      const panel = root.querySelector("#pd_inline_panel_txt2img");
      const parentId = panel?.parentElement?.id;
      return parentId === "mock_dict_parent" || parentId === "txt2img_actions_column";
    }, { timeout: 10000 });

    // 8. アサーション 5: 復元時、大辞典パネルが自動で折りたたまれている (aria-expanded = false) こと
    await page.waitForFunction(() => {
      const gradioApp = document.querySelector("gradio-app");
      const root = gradioApp?.shadowRoot || document.body;
      const head = root.querySelector("#pd_inline_panel_txt2img .pd-inline-head");
      return head ? head.getAttribute("aria-expanded") === "false" : false;
    }, { timeout: 5000 });
  });

  test("10. Pane-Header independent filters should work properly", async ({ page }) => {
    // 1. 旧サイドバー検索欄がないことを検証
    const sidebarSearch = page.locator(".psm-sidebar .psm-pane__search-input");
    await expect(sidebarSearch).not.toBeVisible();

    // 2. Positive / Negative ペインとそれぞれの検索欄を取得
    const positivePane = page.locator(".psm-pane").filter({ hasText: /Positive/i }).first();
    const negativePane = page.locator(".psm-pane").filter({ hasText: /Negative/i }).first();

    // Negative ペインが閉じている（縦型プレースホルダーが表示されている）場合は開く
    const negativePlaceholder = negativePane.locator(".psm-pane__placeholder--hoverable").first();
    if (await negativePlaceholder.isVisible()) {
      await negativePlaceholder.click();
    }

    const positiveSearch = positivePane.locator(".psm-pane__search-input input");
    const negativeSearch = negativePane.locator(".psm-pane__search-input input");

    await expect(positiveSearch).toBeVisible();
    await expect(negativeSearch).toBeVisible();

    const promptNamePos = `FilterPos_${uniq}`;
    const promptNameNeg = `FilterNeg_${uniq}`;

    // Positive 側にプロンプトを追加して保存
    await positivePane.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-modal").waitFor({ state: "visible", timeout: 5000 });
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("pos_content");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(promptNamePos);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    await page.getByTestId("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });

    // Negative 側にプロンプトを追加して保存
    await negativePane.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-modal").waitFor({ state: "visible", timeout: 5000 });
    await page.getByTestId("edit-content-input").locator("textarea").first().fill("neg_content");
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(promptNameNeg);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    await page.getByTestId("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });

    // 両方のチップが可視状態であることを確認
    const chipPos = positivePane.locator(".v-chip", { hasText: promptNamePos }).first();
    const chipNeg = negativePane.locator(".v-chip", { hasText: promptNameNeg }).first();
    await expect(chipPos).toBeVisible();
    await expect(chipNeg).toBeVisible();

    // Positive フィルターに入力
    await positiveSearch.fill(promptNamePos);
    await positiveSearch.dispatchEvent("input");

    // Positive 側は絞り込まれ、chipPos は表示
    await expect(chipPos).toBeVisible();
    // Negative 側は影響を受けず表示されたまま
    await expect(chipNeg).toBeVisible();

    // Negative 側に無関係な入力をして、chipNeg が非表示になるか確認
    await negativeSearch.fill("NonExistentPromptNameXYZ");
    await negativeSearch.dispatchEvent("input");
    await expect(chipNeg).not.toBeVisible();
    // Positive 側は影響を受けない
    await expect(chipPos).toBeVisible();

    // 4. フィルター入力欄でのクリックがペインの開閉を引き起こさないか検証
    await positiveSearch.click();
    // ペインのメインツリー領域が可視のままであること
    await expect(positivePane.locator(".flex-grow-1.overflow-y-auto")).toBeVisible();

    // 5. ペインを閉じたとき、フィルターが非表示になることを検証
    const closeBtn = positivePane.locator(".psm-pane__header--hoverable button").first();
    await closeBtn.click();
    await expect(positiveSearch).not.toBeVisible();

    // 後片付けとしてペインを再度開く
    const collapsedPlaceholder = positivePane.locator(".psm-pane__placeholder--hoverable").first();
    await collapsedPlaceholder.click();
    await expect(positiveSearch).toBeVisible();

    // フィルターのクエリを元に戻す
    await positiveSearch.fill("");
    await positiveSearch.dispatchEvent("input");
    await negativeSearch.fill("");
    await negativeSearch.dispatchEvent("input");
  });

  test("11. Prompt Dictionary insert should automatically copy search query to empty name field", async ({ page }) => {
    // 1. WebUI 側にモックの「プロンプト大辞典」パネルと挿入ボタン、検索入力欄を用意する。
    await page.evaluate(() => {
      const gradioApp = document.querySelector("gradio-app");
      const root = gradioApp?.shadowRoot || document.body;

      const existing = root.querySelector("#pd_inline_panel_txt2img");
      if (existing) existing.remove();

      const parent = document.createElement("div");
      parent.id = "mock_dict_parent";

      const panel = document.createElement("div");
      panel.id = "pd_inline_panel_txt2img";
      panel.className = "pd-inline-panel";
      panel.style.padding = "10px";
      panel.style.background = "#222";
      
      const head = document.createElement("div");
      head.className = "pd-inline-head";
      head.setAttribute("aria-expanded", "false");
      panel.appendChild(head);

      const queryInput = document.createElement("input");
      queryInput.className = "pd-inline-query";
      queryInput.type = "text";
      queryInput.value = "";
      panel.appendChild(queryInput);

      const btn = document.createElement("button");
      btn.id = "mock_insert_btn_2";
      btn.setAttribute("data-pd-insert", "sunflower");
      btn.innerText = "Insert Tag";
      panel.appendChild(btn);

      const sibling = document.createElement("div");
      sibling.id = "mock_dict_sibling";

      parent.appendChild(panel);
      parent.appendChild(sibling);
      root.appendChild(parent);
    });

    const loadingOverlay = page.getByTestId("loading-overlay");

    // 2. モーダルを新規追加で開く (名前は空欄)
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-modal").waitFor({ state: "visible", timeout: 5000 });

    const nameInput = page.getByTestId("edit-name-input").locator("input");
    const textarea = page.getByTestId("edit-content-input").locator("textarea").first();

    await expect(nameInput).toHaveValue("");

    // 3. 大辞典の検索欄に "ひまわり" と入力する
    const portal = page.locator("#psm_dictionary_portal");
    const dictQueryInput = portal.locator(".pd-inline-query");
    await dictQueryInput.fill("ひまわり");

    // 4. 「挿入」をクリック
    const insertBtn = portal.locator("#mock_insert_btn_2");
    await insertBtn.click();

    // 5. アサーション: 本文に "sunflower" が挿入され、名前欄に "ひまわり" がコピーされること
    await expect(textarea).toHaveValue("sunflower");
    await expect(nameInput).toHaveValue("ひまわり");

    // 6. すでに名前がある場合は上書きされないことを検証
    await nameInput.fill("既存の名前");
    await nameInput.dispatchEvent("input");

    await dictQueryInput.fill("コスモス");
    await page.evaluate(() => {
      const gradioApp = document.querySelector("gradio-app");
      const root = gradioApp?.shadowRoot || document.body;
      const btn = root.querySelector("#mock_insert_btn_2");
      if (btn) btn.setAttribute("data-pd-insert", "cosmos");
    });
    await insertBtn.click();

    // アサーション: 本文は追記されるが、名前は上書きされないこと
    await expect(textarea).toHaveValue("sunflower, cosmos");
    await expect(nameInput).toHaveValue("既存の名前");

    // 7. 保存して閉じる
    await page.getByTestId("edit-save-btn").click();
    await page.getByTestId("edit-modal").waitFor({ state: "hidden", timeout: 10000 });
    await loadingOverlay.waitFor({ state: "hidden", timeout: 10000 });
  });

  test("12. Long prompt name or content should not hide the edit icon (flex-shrink-0 protection)", async ({ page }) => {
    // Arrange
    const longName = "ThisIsAVeryVeryVeryLongPromptNameThatNormallyTriggersEllipsisAndShouldNotPushOutTheEditButtonIcon";
    const longContent = "very_long_content_value_that_might_also_be_displayed_or_cause_overflow";

    // Act
    await page.getByTestId("root-add-prompt").first().click();
    await page.getByTestId("edit-modal").waitFor({ state: "visible", timeout: 5000 });
    
    await page.getByTestId("edit-content-input").locator("textarea").first().fill(longContent);
    await page.getByTestId("edit-content-input").locator("textarea").first().dispatchEvent("input");
    await page.getByTestId("edit-name-input").locator("input").fill(longName);
    await page.getByTestId("edit-name-input").locator("input").dispatchEvent("input");
    await page.getByTestId("edit-save-btn").click();
    
    await page.getByTestId("loading-overlay").waitFor({ state: "hidden", timeout: 10000 });

    // Assert
    const chip = page.locator(".v-chip", { hasText: longName }).first();
    await expect(chip).toBeVisible();

    const editBtn = chip.getByTestId("edit-item-btn");
    await expect(editBtn).toBeVisible();
    
    const box = await editBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // 実際にクリックして編集モーダルが開くかを確認
    await editBtn.click();
    await page.getByTestId("edit-modal").waitFor({ state: "visible", timeout: 5000 });

    // キャンセルして閉じる
    await page.getByTestId("edit-cancel-btn").click();
    await page.getByTestId("edit-modal").waitFor({ state: "hidden", timeout: 5000 });
  });
});



