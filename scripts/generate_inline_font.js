const fs = require('fs');
const path = require('path');

const fontPath = path.join('node_modules', '@mdi', 'font', 'fonts', 'materialdesignicons-webfont.woff2');
const outputPath = path.join('src', 'mdi-font.css');

if (!fs.existsSync(fontPath)) {
  console.error('Font file not found:', fontPath);
  process.exit(1);
}

const fontBuffer = fs.readFileSync(fontPath);
const base64Font = fontBuffer.toString('base64');

const cssContent = `@font-face {
  font-family: "Material Design Icons";
  src: url("data:font/woff2;base64,${base64Font}") format("woff2");
  font-weight: normal;
  font-style: normal;
}

.mdi:before, .mdi-set {
  display: inline-block;
  font: normal normal normal 24px/1 "Material Design Icons";
  font-size: inherit;
  text-rendering: auto;
  line-height: inherit;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}`;

// Create assets dir if not exists
if (!fs.existsSync(path.dirname(outputPath))) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
}

fs.writeFileSync(outputPath, cssContent);
console.log('Generated inlined CSS at:', outputPath);
