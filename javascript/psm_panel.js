(function () {
  console.log("[PSM Debug] psm_panel.js execution started.");
  const getExtensionPath = () => {
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src;
      if (src.includes("psm_panel.js")) {
        const parts = src.split("/");
        const extIndex = parts.indexOf("extensions");
        if (extIndex !== -1 && parts[extIndex + 1]) {
          return `/file=extensions/${parts[extIndex + 1]}`;
        }
      }
    }
    return "/file=extensions/sd-webui-prompt-struct-manager";
  };

  const basePath = getExtensionPath();

  // 1. JSロード
  const script = document.createElement("script");
  script.src = `${basePath}/dist/index.js?t=${Date.now()}`;
  script.type = "module";
  console.log(`[PSM Debug] Dynamic loading main bundle: ${script.src}`);
  script.onerror = () => {
    console.error(
      `[PSM Debug] 404: ${script.src} が見つかりません。ビルドしてください。`,
    );
  };
  document.head.appendChild(script);

  // 2. CSSロード (Viteの設定でJSにインジェクトされるため不要)
  // const link = document.createElement("link");
  // link.rel = "stylesheet";
  // link.href = `${basePath}/dist/style.css`;
  // document.head.appendChild(link);

  // 3. 起動ボタン用スタイル
  const style = document.createElement("style");
  style.innerHTML = `
        .psm-python-row-container { margin-top: 8px !important; }
        .psm-btn-python-native {
            color: #ffffff !important; font-weight: bold !important;
            border: 1px solid #ff5722 !important; background: #2b2b2b !important;
            min-height: 42px !important; transition: all 0.2s ease !important;
        }
        .psm-btn-python-native:hover {
            background: #3a3a3a !important; box-shadow: 0 0 10px rgba(255, 87, 34, 0.4) !important;
        }
        .psm-btn-python-native::before { content: "📂 "; color: #ff5722; }
    `;
  document.head.appendChild(style);
})();
