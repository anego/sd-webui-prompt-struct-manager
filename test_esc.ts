import { PsmItem } from "./src/types";

// Mock getCompiledPrompts from store.ts (simplified for testing logic)
// I will copy the logic here to test it in isolation first, or I can import if environment allows.
// Since store.ts has many dependencies (Vue, etc.), I will extract the logic to testing.

const getCompiledPrompts = (nodes: PsmItem[], separator = ", "): string => {
  const raw = nodes
    .filter((n) => n.enabled)
    .map((n) => {
      // Logic from store.ts
      if (n.is_group && n.children) {
        if (n.isRandom) {
          const content = getCompiledPrompts(n.children, "|");
          return content ? `{${content}}` : "";
        } else {
          return getCompiledPrompts(n.children, ", ");
        }
      } else {
        // --- TARGET LOGIC ---
        // Current:
        // return n.weight !== 1.0 ? `(${n.content}:${n.weight})` : n.content;
        
        // Proposed (to be implemented):
        let content = n.content.replace(/\(/g, "\\(").replace(/\)/g, "\\)");
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

// Test Cases
const runTest = () => {
    const cases = [
        {
            name: "Basic Text",
            item: { id: 1, name:"", content: "nahida", enabled: true, weight: 1.0, is_group: false } as PsmItem,
            expected: "nahida"
        },
        {
            name: "Parentheses",
            item: { id: 2, name:"", content: "nahida (genshin impact)", enabled: true, weight: 1.0, is_group: false } as PsmItem,
            expected: "nahida \\(genshin impact\\)"
        },
        {
            name: "Weight",
            item: { id: 3, name:"", content: "masterpiece", enabled: true, weight: 1.2, is_group: false } as PsmItem,
            expected: "(masterpiece:1.2)"
        },
        {
            name: "Weight + Parentheses",
            item: { id: 4, name:"", content: "(masterpiece)", enabled: true, weight: 1.2, is_group: false } as PsmItem,
            expected: "(\\(masterpiece\\):1.2)"
        }
    ];

    console.log("Running Tests...");
    let failed = 0;
    cases.forEach(c => {
        const result = getCompiledPrompts([c.item]);
        if (result === c.expected) {
            console.log(`[PASS] ${c.name}: ${result}`);
        } else {
            console.error(`[FAIL] ${c.name}\n  Expected: ${c.expected}\n  Actual:   ${result}`);
            failed++;
        }
    });

    if (failed === 0) console.log("All tests passed!");
    else console.error(`${failed} tests failed.`);
};

runTest();
