// content_utils.js – Shared utilities for content scripts
// Runs in the same isolated world context as content_ui.js and content.js.

// ── Globals for submission state ─────────────────────────────────────────────
var currentSubmission = null;
var currentDetails = null;

// ── Guard: check if Chrome extension context is still alive ──────────────────
function isChromeAlive() {
  try {
    return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

// ── Topic → Recommended Patterns mapping ────────────────────────────────────
const TOPIC_PATTERNS = {
  "array":                 ["Two Pointers", "Sliding Window", "Prefix Sum", "Kadane's Algorithm", "Binary Search", "Sorting", "HashMap", "Monotonic Stack", "Greedy"],
  "string":               ["Sliding Window", "Two Pointers", "HashMap", "KMP", "Rabin-Karp", "Palindrome", "Anagram / Frequency Map"],
  "hash table":           ["HashMap", "Counting / Frequency Map", "Two Sum Pattern", "Grouping", "Caching"],
  "dynamic programming":  ["0/1 Knapsack", "Unbounded Knapsack", "LCS", "LIS", "Matrix DP", "State Machine DP", "Interval DP", "Digit DP", "Bitmask DP"],
  "math":                 ["Prime Sieve", "GCD / LCM", "Modular Arithmetic", "Combinatorics", "Fast Exponentiation", "Number Theory"],
  "sorting":              ["Merge Sort", "Quick Sort", "Counting Sort", "Custom Comparator", "Topological Sort"],
  "greedy":               ["Activity Selection", "Interval Scheduling", "Fractional Knapsack", "Huffman Coding", "Always Best Choice"],
  "depth-first search":   ["DFS", "Backtracking", "Cycle Detection", "Connected Components", "Path Finding", "Topological Sort"],
  "breadth-first search": ["BFS", "Multi-source BFS", "0-1 BFS", "Level Order Traversal", "Shortest Path"],
  "binary search":        ["Binary Search on Answer", "Lower / Upper Bound", "Rotated Array Search", "Peak Finding"],
  "matrix":               ["DFS on Grid", "BFS on Grid", "Spiral Traversal", "2D Prefix Sum"],
  "two pointers":         ["Two Pointers", "Fast & Slow Pointers", "Sliding Window", "Merge"],
  "bit manipulation":     ["Bitmask DP", "XOR Tricks", "Brian Kernighan", "Bit Counting", "Power of Two Check"],
  "stack":                ["Monotonic Stack", "Next Greater Element", "Valid Parentheses", "Expression Evaluation"],
  "heap (priority queue)":["Top-K Elements", "Merge K Sorted Lists", "Dijkstra", "Median Finder"],
  "backtracking":         ["Combination", "Permutation", "Subset", "N-Queens", "Sudoku Solver"],
  "graph":                ["DFS", "BFS", "Dijkstra", "Bellman-Ford", "Floyd-Warshall", "Union Find", "Topological Sort", "MST (Kruskal/Prim)"],
  "tree":                 ["DFS", "BFS / Level Order", "Binary Search Tree", "LCA", "Tree DP", "Segment Tree"],
  "linked list":          ["Fast & Slow Pointers", "Reversal", "Merge", "Cycle Detection", "Two Pointers"],
  "sliding window":       ["Fixed Window", "Variable Window", "Two Pointers"],
  "trie":                 ["Insert / Search", "Prefix Search", "Word Search", "XOR Trie"],
  "union find":           ["Union Find (DSU)", "Kruskal's MST", "Connected Components", "Cycle Detection"],
};

// ── Helper: request Monaco code from injected.js ──────────────────────────────
function getCodeFromPage() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", listener);
      resolve("");
    }, 2000);

    const listener = (event) => {
      if (
        event.source === window &&
        event.data?.type === "LEETSYNC_CODE_EXTRACTED"
      ) {
        clearTimeout(timer);
        window.removeEventListener("message", listener);
        resolve(event.data.code || "");
      }
    };

    window.addEventListener("message", listener);
    window.postMessage({ type: "LEETSYNC_GET_CODE" }, "*");
  });
}

function isLeetCodeProblemPage() {
  return /leetcode\.com\/problems\/[^/]+/.test(location.href);
}

function isGFGProblemPage() {
  return /geeksforgeeks\.org\/problems\/[^/]+/.test(location.href);
}

function getProblemSlug() {
  if (isGFGProblemPage()) {
    return parseGFGUrl().slug;
  }
  const match = location.href.match(/leetcode\.com\/problems\/([^/]+)/);
  return match ? match[1] : "unknown-problem";
}

function getProblemTitle() {
  if (isGFGProblemPage()) {
    const nextDataTopics = getGFGTopicsFromNextData();
    try {
      const script = document.getElementById("__NEXT_DATA__");
      if (script) {
        const json = JSON.parse(script.textContent);
        const title = json?.props?.pageProps?.initialState?.problemData?.allData?.probData?.problem_name;
        if (title) return cleanProblemTitle(title);
      }
    } catch (_) {}
    const titleEl = document.querySelector('[class*="problems_header_content_left"] h3, .problem-title');
    return titleEl ? cleanProblemTitle(titleEl.innerText) : cleanProblemTitle(getProblemSlug());
  }

  // LeetCode title scraping selectors
  const selectors = [
    ".mr-2.text-label-1",
    ".mr-2.text-lg",
    ".mr-2.text-xl",
    ".text-title-large",
    "div[data-cy='question-title']",
    "h4"
  ];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const text = el.innerText?.trim();
      if (text) {
        // Strip problem number prefix if any
        return cleanProblemTitle(text);
      }
    }
  }
  return cleanProblemTitle(getProblemSlug());
}

function cleanProblemTitle(value = "") {
  return value.replace(/^\d+\.\s*/, "").trim();
}

function titleFromSlug(slug) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getProblemNumberFromDOM() {
  // LeetCode Selector
  const lcEl = document.querySelector(".text-title-large, div[data-cy='question-title']");
  if (lcEl) {
    const match = lcEl.innerText?.match(/^(\d+)\./);
    if (match) return match[1];
  }
  if (isGFGProblemPage()) {
    return getGFGNumber();
  }
  return "";
}

function getDifficultyFromDOM() {
  const diffClasses = ["text-difficulty-easy", "text-difficulty-medium", "text-difficulty-hard", "text-easy", "text-medium", "text-hard"];
  for (const cls of diffClasses) {
    const el = document.querySelector(`.${cls}`);
    if (el) {
      return el.innerText.trim();
    }
  }

  const difficultyTexts = ["Easy", "Medium", "Hard"];
  const allElements = document.querySelectorAll("span, div");
  for (const el of allElements) {
    if (el.childElementCount === 0) {
      const text = el.innerText?.trim();
      if (difficultyTexts.includes(text)) {
        return text;
      }
    }
  }
  return "Medium";
}

function getLanguage() {
  // 1. LeetCode v2 editor language dropdown indicator
  const trigger = document.querySelector("button[id^='headlessui-listbox-button']");
  if (trigger) {
    const text = trigger.innerText?.trim();
    if (text) return normalizeLanguage(text);
  }

  // 2. GFG Specific dropdown selectors
  if (isGFGProblemPage()) {
    const gfgEl = document.querySelector("[class*='language_dropdown'], [class*='language-dropdown'], [class*='problems_language_dropdown'], [class*='language_select'], [class*='problems_language_select']");
    if (gfgEl) {
      const text = gfgEl.innerText?.trim();
      if (text) {
        const cleanText = text.split("\n")[0].trim();
        if (cleanText) return normalizeLanguage(cleanText);
      }
    }

    // Fallback: Scan editor header elements for language names
    const editorHeader = document.querySelector("[class*='problems_editor_header'], [class*='editor_header'], .problems_editor_header");
    if (editorHeader) {
      const els = editorHeader.querySelectorAll("span, div, button");
      for (const el of els) {
        const text = el.innerText?.trim();
        if (text) {
          const norm = text.toLowerCase();
          if (norm === "c++" || norm === "java" || norm === "python" || norm === "python3" || norm.includes("javascript") || norm.includes("js")) {
            return normalizeLanguage(text);
          }
        }
      }
    }
  }

  // 3. General Fallbacks
  const select = document.querySelector("select");
  if (select) {
    return normalizeLanguage(select.value);
  }

  return "cpp";
}

function normalizeLanguage(v) {
  return v.toLowerCase().replace(/\s+/g, "");
}

function getCodeFallback() {
  const lineEls = document.querySelectorAll(".view-line");
  if (lineEls.length > 0) {
    return Array.from(lineEls).map(el => el.innerText).join("\n");
  }
  const pre = document.querySelector("pre");
  if (pre) return pre.innerText;
  return "";
}

// ── Timer State & Implementation ─────────────────────────────────────────────
var timerInterval = null;
var timerSeconds = 0;
var isTimerRunning = false;
var currentTimerSlug = "";

function initTimer() {
  injectStyles();
  
  if (!isLeetCodeProblemPage() && !isGFGProblemPage()) {
    removeTimerWidget();
    return;
  }

  const slug = getProblemSlug();

  let widget = document.getElementById("leetsync-timer-widget");
  if (!widget) {
    widget = document.createElement("div");
    widget.id = "leetsync-timer-widget";
    widget.innerHTML = `
      <span style="user-select: none;">⏱️</span>
      <span class="leetsync-timer-text" id="leetsync-timer-display">00:00</span>
      <button type="button" id="leetsync-timer-toggle" title="Pause/Play" style="margin-left: 4px;">⏸️</button>
      <button type="button" id="leetsync-timer-reset" title="Reset Timer" style="margin-left: 2px;">🔄</button>
    `;
    document.body.appendChild(widget);

    const toggleBtn = widget.querySelector("#leetsync-timer-toggle");
    const resetBtn = widget.querySelector("#leetsync-timer-reset");

    toggleBtn.addEventListener("click", toggleTimer);
    resetBtn.addEventListener("click", resetTimer);
  }

  if (slug !== currentTimerSlug) {
    currentTimerSlug = slug;
    resetTimer();
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  isTimerRunning = true;
  updateTimerToggleUI();
  timerInterval = setInterval(() => {
    timerSeconds++;
    updateTimerDisplay();
  }, 1000);
}

// Global hook so content.js can call it
window.pauseTimer = function() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isTimerRunning = false;
  updateTimerToggleUI();
};

function pauseTimer() {
  window.pauseTimer();
}

function toggleTimer() {
  if (isTimerRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function resetTimer() {
  pauseTimer();
  timerSeconds = 0;
  updateTimerDisplay();
  startTimer();
}

function updateTimerDisplay() {
  const display = document.getElementById("leetsync-timer-display");
  if (display) {
    const hrs = Math.floor(timerSeconds / 3600);
    const mins = Math.floor((timerSeconds % 3600) / 60);
    const secs = timerSeconds % 60;

    let timeStr = "";
    if (hrs > 0) {
      timeStr = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    display.textContent = timeStr;
  }
}

function updateTimerToggleUI() {
  const toggleBtn = document.getElementById("leetsync-timer-toggle");
  if (toggleBtn) {
    toggleBtn.textContent = isTimerRunning ? "⏸️" : "▶️";
  }
}

function removeTimerWidget() {
  pauseTimer();
  const widget = document.getElementById("leetsync-timer-widget");
  if (widget) widget.remove();
  currentTimerSlug = "";
}

function formatTimeSpent(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  let parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(" ");
}

// ── GFG Scraper Helpers ──────────────────────────────────────────────────────
function parseGFGUrl() {
  const parts = location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("problems");
  if (idx !== -1 && parts[idx + 1]) {
    const rawSlug = parts[idx + 1];
    const match = rawSlug.match(/-?(\d+)$/);
    if (match) {
      const id = match[1];
      let slug = rawSlug.slice(0, rawSlug.length - match[0].length).toLowerCase();
      slug = slug.replace(/-+$/, "");
      return { id, slug };
    }
    return { id: "", slug: rawSlug.toLowerCase().replace(/-+$/, "") };
  }
  return { id: "", slug: "unknown-problem" };
}

function getGFGNumber() {
  return parseGFGUrl().id;
}

function getGFGDescription() {
  const selectors = [
    '[class*="problems_problem_content"]',
    ".problem-description",
    "#problem-description",
    ".problems_problem_content__3mdx"
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      return el.innerHTML.trim() || el.textContent.trim();
    }
  }
  return "Description not available.";
}

function getGFGTopicsFromNextData() {
  try {
    const script = document.getElementById("__NEXT_DATA__");
    if (!script) return null;
    const json = JSON.parse(script.textContent);

    const probData = json?.props?.pageProps?.initialState?.problemData?.allData?.probData;
    if (probData?.tags?.topic_tags && Array.isArray(probData.tags.topic_tags)) {
      return probData.tags.topic_tags;
    }

    const queries = json?.props?.pageProps?.initialState?.problemApi?.queries;
    if (queries) {
      for (const key of Object.keys(queries)) {
        if (key.startsWith("getProblemDetails") && queries[key]?.data?.tags?.topic_tags) {
          const tags = queries[key].data.tags.topic_tags;
          if (Array.isArray(tags)) return tags;
        }
      }
    }
  } catch (err) {
    console.error("Failed to extract GFG topics from NEXT_DATA:", err);
  }
  return null;
}

function getGFGTopics() {
  const GFG_TO_LEETCODE_TOPIC_MAP = {
    "arrays": "Array",
    "array": "Array",
    "strings": "String",
    "string": "String",
    "hash": "Hash Table",
    "hashing": "Hash Table",
    "hash table": "Hash Table",
    "dynamic programming": "Dynamic Programming",
    "dp": "Dynamic Programming",
    "mathematical": "Math",
    "mathematics": "Math",
    "math": "Math",
    "sorting": "Sorting",
    "greedy": "Greedy",
    "depth-first search": "Depth-First Search",
    "dfs": "Depth-First Search",
    "breadth-first search": "Breadth-First Search",
    "bfs": "Breadth-First Search",
    "binary search": "Binary Search",
    "matrix": "Matrix",
    "matrices": "Matrix",
    "two pointers": "Two Pointers",
    "bit manipulation": "Bit Manipulation",
    "stack": "Stack",
    "stacks": "Stack",
    "heap": "Heap (Priority Queue)",
    "priority queue": "Heap (Priority Queue)",
    "backtracking": "Backtracking",
    "graph": "Graph",
    "graphs": "Graph",
    "tree": "Tree",
    "trees": "Tree",
    "linked list": "Linked List",
    "linkedlist": "Linked List",
    "sliding window": "Sliding Window",
    "trie": "Trie",
    "tries": "Trie",
    "union find": "Union Find",
    "dsu": "Union Find",
    "disjoint set": "Union Find"
  };

  const nextDataTopics = getGFGTopicsFromNextData();
  const rawTexts = [];

  if (nextDataTopics && nextDataTopics.length > 0) {
    rawTexts.push(...nextDataTopics);
  } else {
    const allEls = Array.from(document.querySelectorAll("*"));
    const topicHeading = allEls.find(el => {
      const text = el.innerText?.trim();
      return (
        text === "Topic Tags" ||
        text === "Topic Tags " ||
        text === "Topic Tags:" ||
        text === "Topics"
      );
    });

    if (topicHeading) {
      let current = topicHeading;
      for (let depth = 0; depth < 5; depth++) {
        const sibling = current.nextElementSibling;
        if (sibling) {
          sibling.querySelectorAll("button, span, a").forEach(pill => {
            if (pill.childElementCount === 0) {
              const text = pill.innerText?.trim();
              if (text && text.length > 1 && text.length < 40) {
                rawTexts.push(text);
              }
            }
          });
          if (sibling.childElementCount === 0) {
            const text = sibling.innerText?.trim();
            if (text && text.length > 1 && text.length < 40) {
              rawTexts.push(text);
            }
          }
          if (rawTexts.length > 0) {
            break;
          }
        }
        current = current.parentElement;
        if (!current || current === document.body) break;
      }
    }
  }

  const seen = new Set();
  const normalizedTags = [];

  rawTexts.forEach(t => {
    const normKey = t.trim().toLowerCase();
    const mapped = GFG_TO_LEETCODE_TOPIC_MAP[normKey];
    if (mapped) {
      if (!seen.has(mapped.toLowerCase())) {
        normalizedTags.push(mapped);
        seen.add(mapped.toLowerCase());
      }
    } else {
      const cap = t.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      if (!seen.has(cap.toLowerCase())) {
        normalizedTags.push(cap);
        seen.add(cap.toLowerCase());
      }
    }
  });

  return normalizedTags;
}

// ── History Storage Helper ────────────────────────────────────────────────────
async function saveToHistory(entry) {
  try {
    const stored = await chrome.storage.local.get("leetsyncHistory");
    let history = stored.leetsyncHistory || [];
    
    const slugEntries = history.filter((h) => h.slug === entry.slug);
    let maxRev = 0;
    let existingCustomDueDate = null;

    slugEntries.forEach((h) => {
      if (h.revisionCount && h.revisionCount > maxRev) {
        maxRev = h.revisionCount;
      }
      if (h.customRevisionDueDate) {
        existingCustomDueDate = h.customRevisionDueDate;
      }
    });

    const newRevCount = maxRev + 1;
    const nowStr = new Date().toISOString();
    const todayStrVal = nowStr.split("T")[0];

    entry.revisionCount = newRevCount;
    entry.lastRevisionAt = nowStr;

    if (existingCustomDueDate) {
      entry.customRevisionDueDate = existingCustomDueDate;
      entry.revisionCompleted = true;
      entry.revisionCompletedAt = todayStrVal;
    }

    const entryDateStr = entry.savedAt ? entry.savedAt.split("T")[0] : todayStrVal;
    const dupIndex = history.findIndex(
      (h) => h.slug === entry.slug && 
             h.approach === entry.approach && 
             (h.savedAt ? h.savedAt.split("T")[0] : "") === entryDateStr
    );

    if (dupIndex !== -1) {
      entry.isFavorite = entry.isFavorite || history[dupIndex].isFavorite;
      history.splice(dupIndex, 1);
    }

    const existingEntries = history.filter(h => h.slug === entry.slug);
    existingEntries.forEach(ex => {
      if (ex.isFavorite) entry.isFavorite = true;
      if (ex.starredLists && ex.starredLists.length > 0) {
        if (!entry.starredLists) entry.starredLists = [];
        ex.starredLists.forEach(list => {
          if (!entry.starredLists.includes(list)) entry.starredLists.push(list);
        });
      }
    });
    history = history.filter(h => !(h.slug === entry.slug && h.isStarredOnly));

    history.unshift(entry);

    history.forEach((h) => {
      if (h.slug === entry.slug) {
        h.revisionCount = newRevCount;
        h.lastRevisionAt = nowStr;
        if (existingCustomDueDate) {
          h.customRevisionDueDate = existingCustomDueDate;
          h.revisionCompleted = true;
          h.revisionCompletedAt = todayStrVal;
        }
        if (h.approach === entry.approach) {
          h.notes = entry.notes;
        }
      }
    });

    if (history.length > 5000) history.pop();
    await chrome.storage.local.set({ leetsyncHistory: history });
  } catch (err) {
    console.error("Local history save failed:", err);
    throw err;
  }
}
