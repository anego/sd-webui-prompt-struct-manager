const fs = require('fs');
const path = require('path');

// Paths
const cssPath = path.join('node_modules', '@mdi', 'font', 'css', 'materialdesignicons.min.css');
const fontPath = path.join('node_modules', '@mdi', 'font', 'fonts', 'materialdesignicons-webfont.woff2');
const outputPath = path.join('src', 'mdi-embedded.css');

console.log(`[PSM Build] Embed Script Started`);
console.log(`[PSM Build] Reading CSS from: ${cssPath}`);
console.log(`[PSM Build] Reading Font from: ${fontPath}`);

if (!fs.existsSync(cssPath) || !fs.existsSync(fontPath)) {
  console.error('[PSM Build] Error: Source files not found!');
  process.exit(1);
}

try {
    let cssContent = fs.readFileSync(cssPath, 'utf8');
    console.log(`[PSM Build] Original CSS size: ${cssContent.length} chars`);
    
    const fontBuffer = fs.readFileSync(fontPath);
    const base64Font = fontBuffer.toString('base64');
    
    console.log(`[PSM Build] Font loaded (${(fontBuffer.length / 1024).toFixed(1)} KB). Embedding...`);

    const newFontFace = `@font-face {
  font-family: "Material Design Icons";
  src: url("data:font/woff2;base64,${base64Font}") format("woff2");
  font-weight: normal;
  font-style: normal;
}`;

    // Robustly replace @font-face
    // Scan for "@font-face" and the matching closing "}".
    // Minified CSS might have no spaces: @font-face{...}
    
    let originalClasses = cssContent;
    const fontFaceStart = cssContent.indexOf("@font-face");
    
    if (fontFaceStart !== -1) {
        // Find the closing brace for this block
        let openBraces = 0;
        let closeIndex = -1;
        let started = false;
        
        for (let i = fontFaceStart; i < cssContent.length; i++) {
            if (cssContent[i] === '{') {
                openBraces++;
                started = true;
            } else if (cssContent[i] === '}') {
                openBraces--;
            }
            
            if (started && openBraces === 0) {
                closeIndex = i;
                break;
            }
        }
        
        if (closeIndex !== -1) {
            console.log(`[PSM Build] Found original @font-face block from index ${fontFaceStart} to ${closeIndex}. Removing.`);
            // Remove the block
            originalClasses = cssContent.substring(0, fontFaceStart) + cssContent.substring(closeIndex + 1);
        } else {
             console.log(`[PSM Build] WARNING: Could not find closing brace for @font-face.`);
        }
    } else {
        console.log(`[PSM Build] WARNING: No original @font-face block found in CSS.`);
    }

    // Prepend our new block and append classes
    const finalCss = `/* PSM Embedded Icons (Base64) */
${newFontFace}

/* Original Classes (Mappings) */
${originalClasses}`;

    fs.writeFileSync(outputPath, finalCss);
    console.log(`[PSM Build] Successfully generated: ${outputPath} (${(finalCss.length / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`[PSM Build] Script Finished OK.`);

} catch (e) {
    console.error('[PSM Build] Error processing font:', e);
    process.exit(1);
}
