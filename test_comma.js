
// Mock logic from store.ts (with recent escape fix included)
const getCompiledPrompts = (nodes, separator = ", ") => {
  const raw = nodes
    .filter((n) => n.enabled)
    .map((n) => {
      if (n.is_group && n.children) {
        if (n.isRandom) {
          const content = getCompiledPrompts(n.children, "|");
          return content ? `{${content}}` : "";
        } else {
          return getCompiledPrompts(n.children, ", ");
        }
      } else {
        // Current logic + escape fix
        const content = n.content.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
        return n.weight !== 1.0 ? `(${content}:${n.weight})` : content;
      }
    })
    .filter((s) => s)
    .join(separator);
    
  if (separator === ", ") {
      return raw.replace(/,\s*,/g, ", ");
  }
  return raw;
};

const runTest = () => {
    // Case 1: Trailing comma in content
    const item1 = { id: 1, content: "Chiseled Abs,", enabled: true, weight: 1.3, is_group: false };
    const res1 = getCompiledPrompts([item1]);
    
    // Check if it produces (Chiseled Abs,:1.3) or (Chiseled Abs:1.3)
    console.log(`Input: "Chiseled Abs,", Weight: 1.3`);
    console.log(`Result: "${res1}"`);
    
    if (res1 === "(Chiseled Abs,:1.3)") {
        console.log("-> Reproduced: Comma is inside the parenthesis.");
    } else {
        console.log("-> Not Reproduced? Result is good?");
    }
};

runTest();
