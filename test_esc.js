
// Mock PsmItem structure
// interface PsmItem {
//   id: number;
//   name: string;
//   content: string;
//   enabled: boolean;
//   weight: number;
//   is_group: boolean;
//   children?: PsmItem[];
//   isRandom?: boolean;
// }

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
        // --- TARGET LOGIC ---
        // Escape parentheses ( and ) with backslash
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
            item: { id: 1, name:"", content: "nahida", enabled: true, weight: 1.0, is_group: false },
            expected: "nahida"
        },
        {
            name: "Parentheses",
            item: { id: 2, name:"", content: "nahida (genshin impact)", enabled: true, weight: 1.0, is_group: false },
            expected: "nahida \\(genshin impact\\)"
        },
        {
            name: "Weight",
            item: { id: 3, name:"", content: "masterpiece", enabled: true, weight: 1.2, is_group: false },
            expected: "(masterpiece:1.2)"
        },
        {
            name: "Weight + Parentheses",
            item: { id: 4, name:"", content: "(masterpiece)", enabled: true, weight: 1.2, is_group: false },
            expected: "(\\(masterpiece\\):1.2)"
        }
    ];

    console.log("Running Tests...");
    let failed = 0;
    cases.forEach(c => {
        // Wrap single item in array to match function signature
        const result = getCompiledPrompts([c.item]);
        if (result === c.expected) {
            console.log(`[PASS] ${c.name}: ${result}`);
        } else {
            console.error(`[FAIL] ${c.name}\n  Expected: ${c.expected}\n  Actual:   ${result}`);
            failed++;
        }
    });

    if (failed === 0) console.log("All tests passed!");
    else {
        console.error(`${failed} tests failed.`);
        process.exit(1);
    }
};

runTest();
