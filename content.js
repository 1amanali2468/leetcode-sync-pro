// content.js – Runs in ISOLATED world
// Listens for messages from injected.js (MAIN world) and shows the modal.
// All fetch interception and Monaco access happens in injected.js.
// ─────────────────────────────────────────────────────────────────────────────

let currentSubmission = null;
let currentDetails = null;

// ── Guard: check if Chrome extension context is still alive ──────────────────
// This can become false if the extension is reloaded without refreshing the page.
function isChromeAlive() {
  try {
    return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  } catch (_) {
    return false;
  }
}

// ── Topic → Recommended Patterns mapping ────────────────────────────────────
// Keys match LeetCode topicTag names (lowercase)
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

// ── Listen for Accepted signal from injected.js ───────────────────────────────
window.addEventListener("message", async (event) => {
  if (
    event.source !== window ||
    !event.data ||
    event.data.type !== "LEETSYNC_SUBMISSION_ACCEPTED"
  ) {
    return;
  }

  if (!isLeetCodeProblemPage()) return;

  const { runtime, memory, language, code, submissionId } = event.data;

  // If injected.js already captured the code, use it; otherwise request it
  let finalCode = code;
  if (!finalCode) {
    finalCode = await getCodeFromPage();
  }
  if (!finalCode) {
    finalCode = getCodeFallback();
  }

  const submissionPayload = {
    title: getProblemTitle(),
    slug: getProblemSlug(),
    url: location.href,
    language: language || getLanguage(),
    code: finalCode,
    runtime,
    memory,
    submissionId,
    capturedAt: new Date().toISOString(),
  };

  // 1. Build fallback details immediately using DOM values
  const fallbackDetails = {
    questionFrontendId: getProblemNumberFromDOM() || "",
    title: submissionPayload.title,
    titleSlug: submissionPayload.slug,
    difficulty: getDifficultyFromDOM() || "Medium",
    content: "",
    topicTags: [],
  };

  // 1.5 Pause the timer on accept and format time spent
  pauseTimer();
  const timeSpentStr = formatTimeSpent(timerSeconds);

  // 2. Show the modal instantly
  showModal(submissionPayload, fallbackDetails, timeSpentStr);

  // 3. Asynchronously fetch full problem details (GraphQL) in the background to enrich the save payload and update UI
  if (isChromeAlive()) {
    chrome.runtime.sendMessage(
      {
        type: "LEETSYNC_FETCH_PROBLEM_DETAILS",
        payload: { titleSlug: submissionPayload.slug },
      },
      (response) => {
        if (chrome.runtime.lastError) return; // ignore stale context errors silently
        if (response && response.ok && response.details) {
          currentDetails = response.details;

          // Update modal UI dynamically if it's still open
          const overlay = document.getElementById("leetsync-modal-overlay");
          if (overlay) {
            // Update title
            const titleEl = overlay.querySelector(".leetsync-prob-title");
            if (titleEl) {
              titleEl.textContent = `${currentDetails.questionFrontendId ? currentDetails.questionFrontendId + ". " : ""}${currentDetails.title}`;
            }
            // Update difficulty badge
            const badgeEl = overlay.querySelector(".leetsync-badge");
            if (badgeEl) {
              const diffClass = (currentDetails.difficulty || "medium").toLowerCase();
              badgeEl.className = `leetsync-badge ${diffClass}`;
              badgeEl.textContent = currentDetails.difficulty || "Medium";
            }
            // Populate topic dropdown with all tags
            const topicSelect = overlay.querySelector("#leetsync-topic-select");
            const folderPreview = overlay.querySelector("#leetsync-folder-preview");
            if (topicSelect) {
              const tags = currentDetails.topicTags || [];
              topicSelect.innerHTML = "";
              // First option: no topic folder
              const noneOpt = document.createElement("option");
              noneOpt.value = "";
              noneOpt.textContent = "📂 No topic folder (save in base)";
              topicSelect.appendChild(noneOpt);
              // Add all tags
              tags.forEach((tag, idx) => {
                const opt = document.createElement("option");
                opt.value = tag.name;
                opt.textContent = `🏷 ${tag.name}`;
                if (idx === 0) opt.selected = true; // auto-select first tag
                topicSelect.appendChild(opt);
              });
              // Show folder preview
              const updatePreview = () => {
                const selected = topicSelect.value;
                folderPreview.textContent = selected
                  ? `📁 .../${selected}/${currentDetails.questionFrontendId || "?"}-${currentDetails.title || ""}/`
                  : `📁 .../${currentDetails.questionFrontendId || "?"}-${currentDetails.title || ""}/`;
              };
              topicSelect.addEventListener("change", updatePreview);
              updatePreview();

              // Populate pattern dropdown based on first selected topic
              const patternSelect = overlay.querySelector("#leetsync-pattern-select");
              if (patternSelect) {
                populatePatternDropdown(patternSelect, topicSelect.value, overlay);
                // Cascade: when topic changes, refresh patterns
                topicSelect.addEventListener("change", () => {
                  populatePatternDropdown(patternSelect, topicSelect.value, overlay);
                });
              }
            }
          }
        }
      }
    );
  }
});

// ── Helper: request Monaco code from injected.js ──────────────────────────────
// injected.js listens for LEETSYNC_GET_CODE and replies with LEETSYNC_CODE_EXTRACTED
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
    // Ask injected.js (MAIN world) to read Monaco and reply
    window.postMessage({ type: "LEETSYNC_GET_CODE" }, "*");
  });
}

// ── Helper functions ──────────────────────────────────────────────────────────

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
  const match = location.pathname.match(/\/problems\/([^/]+)/);
  return match?.[1] || "unknown-problem";
}

function getProblemTitle() {
  if (isGFGProblemPage()) {
    const slug = getProblemSlug();
    if (slug && slug !== "unknown-problem") {
      const cleanSlug = slug.replace(/\d+$/, "");
      return cleanSlug.split("-")
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
    const h3 = document.querySelector("h3");
    if (h3 && h3.innerText) return h3.innerText.trim();

    const titleHeader = document.querySelector('[class*="problems_parameter_heading"]');
    if (titleHeader && titleHeader.innerText) return titleHeader.innerText.trim();

    let docTitle = document.title;
    if (docTitle.includes("-")) {
      docTitle = docTitle.split("-")[0].trim();
    }
    return docTitle || "GFG Problem";
  }

  const selectors = [
    '[data-cy="question-title"]',
    "a[href^='/problems/']",
    "div.text-title-large",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent) return cleanProblemTitle(el.textContent);
  }
  return cleanProblemTitle(document.title) || titleFromSlug(getProblemSlug());
}

function cleanProblemTitle(value = "") {
  return value
    .replace(/\s+-\s+LeetCode.*$/i, "")
    .replace(/^\d+\.\s*/, "")
    .trim();
}

function titleFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function getProblemNumberFromDOM() {
  if (isGFGProblemPage()) return "";
  const text =
    document.querySelector('[data-cy="question-title"]')?.textContent ||
    document.title;
  const match = text.match(/^(\d+)\./);
  return match?.[1] || "";
}

function getDifficultyFromDOM() {
  if (isGFGProblemPage()) {
    const text = document.body.innerText;
    const diffs = ["School", "Basic", "Easy", "Medium", "Hard"];
    let rawDiff = "Medium";
    for (const d of diffs) {
      const regex = new RegExp(`Difficulty\\s*:\\s*${d}`, "i");
      if (regex.test(text)) {
        rawDiff = d;
        break;
      }
    }
    if (rawDiff === "Medium") {
      for (const d of diffs) {
        const el = Array.from(document.querySelectorAll("*")).find(e => 
          e.children.length === 0 && e.innerText && e.innerText.trim() === d
        );
        if (el) {
          rawDiff = d;
          break;
        }
      }
    }
    if (rawDiff === "School" || rawDiff === "Basic") return "Easy";
    return rawDiff;
  }

  const text = document.body.innerText;
  if (/easy/i.test(text)) return "Easy";
  if (/medium/i.test(text)) return "Medium";
  if (/hard/i.test(text)) return "Hard";
  return "Medium";
}

function getLanguage() {
  if (isGFGProblemPage()) {
    const supportedLangs = ["c++", "cpp", "java", "python", "python3", "javascript", "js", "c#", "csharp"];
    const controls = document.querySelectorAll(".compiler-control, .editor-control, [class*='language'], [class*='compiler']");
    for (const ctrl of controls) {
      const txt = ctrl.innerText?.toLowerCase().trim();
      if (txt) {
        for (const l of supportedLangs) {
          if (txt === l || txt.includes(l)) {
            if (l === "c++" || l === "cpp") return "cpp";
            if (l === "java") return "java";
            if (l === "python" || l === "python3") return "python3";
            if (l === "javascript" || l === "js") return "javascript";
            if (l === "c#") return "csharp";
            return l;
          }
        }
      }
    }
    const selects = document.querySelectorAll("select");
    for (const s of selects) {
      const val = s.value?.toLowerCase();
      if (val) {
        for (const l of supportedLangs) {
          if (val.includes(l)) return l === "c++" ? "cpp" : l;
        }
      }
    }
    return "cpp";
  }

  const btn = document.querySelector(
    '[data-cy="lang-select"], button[id*="headlessui-listbox-button"], button[aria-haspopup="listbox"]'
  );
  const txt = btn?.textContent?.trim();
  if (txt && txt.length < 30) return normalizeLanguage(txt);

  const text = document.body?.innerText || "";
  const m = text.match(
    /\b(JavaScript|TypeScript|Python3?|Java|C\+\+|C#|C|Go|Ruby|Rust|Swift|Kotlin|Scala|PHP)\b/i
  );
  return normalizeLanguage(m?.[1] || "");
}

function normalizeLanguage(v) {
  return v.replace(/\s+/g, "").replace(/^python$/i, "Python").trim();
}

function getCodeFallback() {
  const lines = [...document.querySelectorAll(".view-lines .view-line")]
    .map((l) => l.textContent)
    .join("\n")
    .trim();
  if (lines) return lines;

  const textareas = [...document.querySelectorAll("textarea")]
    .map((n) => n.value.trim())
    .filter(Boolean);
  if (textareas.length)
    return textareas.sort((a, b) => b.length - a.length)[0];

  const blocks = [...document.querySelectorAll("pre, code")]
    .map((n) => n.textContent.trim())
    .filter((t) => t.length > 20);
  return blocks.sort((a, b) => b.length - a.length)[0] || "";
}

// ── In-Page Modal ─────────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById("leetsync-styles")) return;
  const style = document.createElement("style");
  style.id = "leetsync-styles";
  style.textContent = `
    #leetsync-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 999999;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    #leetsync-modal-overlay.show { opacity: 1; }
 
    .leetsync-modal {
      background: #ffffff;
      border-radius: 10px;
      width: 375px;
      max-width: 90vw;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
      border: 1px solid #e2e8f0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
    }
    #leetsync-modal-overlay.show .leetsync-modal { transform: scale(1); }
 
    .leetsync-modal-header {
      padding: 7px 12px;
      background: linear-gradient(135deg, #1e3a5f 0%, #185abc 100%);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .leetsync-modal-header h3 {
      margin: 0;
      font-size: 12.5px;
      font-weight: 700;
      color: #ffffff;
    }
    .leetsync-close-btn {
      background: rgba(255,255,255,0.15);
      border: 0;
      font-size: 11px;
      color: #ffffff;
      cursor: pointer;
      border-radius: 4px;
      padding: 2px 5px;
      transition: background 0.2s;
    }
    .leetsync-close-btn:hover { background: rgba(255,255,255,0.3); }
 
    .leetsync-modal-body {
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .leetsync-prob-info {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .leetsync-prob-title { font-size: 13px; font-weight: 700; color: #1e293b; }
    .leetsync-badge {
      font-size: 9.5px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 4px;
      text-transform: capitalize;
    }
    .leetsync-badge.easy   { color: #166534; background: #dcfce7; }
    .leetsync-badge.medium { color: #854d0e; background: #fef9c3; }
    .leetsync-badge.hard   { color: #991b1b; background: #fee2e2; }
 
    .leetsync-label {
      font-size: 10.5px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 2px;
      display: block;
    }
    .leetsync-segmented {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      background: #f1f5f9;
      padding: 3px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .leetsync-segmented label { cursor: pointer; text-align: center; margin: 0; }
    .leetsync-segmented input { position: absolute; opacity: 0; pointer-events: none; }
    .leetsync-segmented span {
      display: block;
      padding: 3px 0;
      font-size: 10.5px;
      font-weight: 600;
      color: #64748b;
      border-radius: 4px;
      transition: all 0.2s ease;
    }
    .leetsync-segmented input:checked + span {
      background: #185abc;
      color: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
 
    .leetsync-input, .leetsync-textarea, .leetsync-select {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 11.5px;
      color: #1e293b;
      background: #ffffff;
      box-sizing: border-box;
      font-family: inherit;
    }
    .leetsync-input:focus, .leetsync-textarea:focus, .leetsync-select:focus {
      outline: 2px solid #185abc;
      outline-offset: -1px;
    }
    .leetsync-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .leetsync-textarea { resize: vertical; min-height: 32px; }
 
    .leetsync-modal-footer {
      padding: 8px 12px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 6px;
    }
    .leetsync-btn {
      padding: 4.5px 10px;
      font-size: 11.5px;
      font-weight: 600;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 0;
    }
    .leetsync-btn-secondary { background: #ffffff; color: #475569; border: 1px solid #cbd5e1; }
    .leetsync-btn-secondary:hover { background: #f1f5f9; }
    .leetsync-btn-primary { background: #185abc; color: #ffffff; }
    .leetsync-btn-primary:hover { background: #154f9f; }
    .leetsync-btn-primary:disabled { opacity: 0.65; cursor: not-allowed; }
 
    .leetsync-result { font-size: 10.5px; text-align: center; margin-top: 0px; min-height: 12px; font-weight: 500; }
    .leetsync-result.success { color: #166534; }
    .leetsync-result.error   { color: #991b1b; }
    .leetsync-hidden { display: none !important; }
 
    .leetsync-folder-preview {
      font-size: 9px;
      color: #64748b;
      margin-top: 1px;
      font-family: monospace;
      background: #f1f5f9;
      padding: 1.5px 4px;
      border-radius: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .leetsync-fav-btn {
      transition: transform 0.2s;
    }
    .leetsync-fav-btn:hover {
      transform: scale(1.15);
    }
    #leetsync-timer-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 30px;
      color: #f8fafc;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: transform 0.2s, opacity 0.2s;
    }
    #leetsync-timer-widget:hover {
      transform: scale(1.05);
    }
    #leetsync-timer-widget button {
      background: none;
      border: 0;
      color: #38bdf8;
      cursor: pointer;
      font-size: 11px;
      padding: 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;
    }
    #leetsync-timer-widget button:hover {
      color: #0ea5e9;
    }
    .leetsync-timer-text {
      font-family: monospace;
      font-size: 12.5px;
      color: #f8fafc;
      min-width: 38px;
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

function showModal(submission, details, timeSpentStr) {
  currentSubmission = submission;
  currentDetails = details;

  injectStyles();

  const oldOverlay = document.getElementById("leetsync-modal-overlay");
  if (oldOverlay) oldOverlay.remove();

  const overlay = document.createElement("div");
  overlay.id = "leetsync-modal-overlay";

  const diffClass = (details.difficulty || "medium").toLowerCase();

  overlay.innerHTML = `
    <div class="leetsync-modal">
      <div class="leetsync-modal-header">
        <h3>⚡ LeetSync Pro – Solution Saved</h3>
        <button type="button" class="leetsync-close-btn" id="leetsync-close-modal">✕</button>
      </div>

      <div class="leetsync-modal-body">
        <div class="leetsync-prob-info" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="leetsync-prob-title">${details.questionFrontendId ? details.questionFrontendId + ". " : ""}${details.title}</span>
            <span class="leetsync-badge ${diffClass}">${details.difficulty}</span>
          </div>
          <button type="button" id="leetsync-fav-btn" class="leetsync-fav-btn" title="Toggle Favorite" style="background: none; border: none; cursor: pointer; font-size: 20px; padding: 0 4px; line-height: 1; transition: transform 0.2s;">🤍</button>
        </div>

        <div>
          <span class="leetsync-label">Approach</span>
          <div class="leetsync-segmented">
            <label><input type="radio" name="leetsync-approach" value="bf"><span>Brute</span></label>
            <label><input type="radio" name="leetsync-approach" value="ba"><span>Better</span></label>
            <label><input type="radio" name="leetsync-approach" value="oa" checked><span>Optimal</span></label>
            <label><input type="radio" name="leetsync-approach" value="custom"><span>Custom</span></label>
          </div>
        </div>

        <div id="leetsync-custom-name-container" class="leetsync-hidden">
          <label class="leetsync-label">Custom Approach Name</label>
          <input type="text" id="leetsync-custom-name" class="leetsync-input" placeholder="e.g. two-pointer">
        </div>

        <div class="leetsync-grid-2">
          <div>
            <span class="leetsync-label">Topic</span>
            <select id="leetsync-topic-select" class="leetsync-select">
              <option value="">⏳ Loading topics...</option>
            </select>
          </div>
          <div>
            <span class="leetsync-label">Pattern Used</span>
            <div id="leetsync-pattern-select-wrap">
              <select id="leetsync-pattern-select" class="leetsync-select">
                <option value="">⏳ Loading patterns...</option>
              </select>
            </div>
            <div id="leetsync-other-pattern-wrap" class="leetsync-hidden" style="position: relative;">
              <input type="text" id="leetsync-other-pattern" class="leetsync-input" placeholder="Custom Pattern (e.g. Kadane's)" style="padding-right:30px;">
              <button type="button" id="leetsync-pattern-reset" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#ef4444;font-weight:bold;font-size:14px;padding:0;">✕</button>
            </div>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: -6px;">
          <div class="leetsync-folder-preview" id="leetsync-folder-preview">📁 Loading...</div>
        </div>

        <div class="leetsync-grid-2">
          <div>
            <label class="leetsync-label">Time Complexity</label>
            <div id="leetsync-time-select-wrap">
              <select id="leetsync-time-select" class="leetsync-select">
                <option value="O(1)">O(1)</option>
                <option value="O(log n)">O(log n)</option>
                <option value="O(n)" selected>O(n)</option>
                <option value="O(n log n)">O(n log n)</option>
                <option value="O(n^2)">O(n²)</option>
                <option value="O(n^3)">O(n³)</option>
                <option value="O(2^n)">O(2ⁿ)</option>
                <option value="O(n!)">O(n!)</option>
                <option value="__other__">✏️ Custom...</option>
              </select>
            </div>
            <div id="leetsync-time-custom-wrap" class="leetsync-hidden" style="position:relative;">
              <input type="text" id="leetsync-time-custom" class="leetsync-input" placeholder="e.g. O(n log k)" style="padding-right:30px;">
              <button type="button" id="leetsync-time-reset" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#ef4444;font-weight:bold;font-size:14px;padding:0;">✕</button>
            </div>
          </div>
          <div>
            <label class="leetsync-label">Space Complexity</label>
            <div id="leetsync-space-select-wrap">
              <select id="leetsync-space-select" class="leetsync-select">
                <option value="O(1)" selected>O(1)</option>
                <option value="O(log n)">O(log n)</option>
                <option value="O(n)">O(n)</option>
                <option value="O(n log n)">O(n log n)</option>
                <option value="O(n^2)">O(n²)</option>
                <option value="__other__">✏️ Custom...</option>
              </select>
            </div>
            <div id="leetsync-space-custom-wrap" class="leetsync-hidden" style="position:relative;">
              <input type="text" id="leetsync-space-custom" class="leetsync-input" placeholder="e.g. O(k)" style="padding-right:30px;">
              <button type="button" id="leetsync-space-reset" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#ef4444;font-weight:bold;font-size:14px;padding:0;">✕</button>
            </div>
          </div>
        </div>

        <div class="leetsync-grid-2">
          <div>
            <span class="leetsync-label">Time Spent</span>
            <input type="text" id="leetsync-time-spent" class="leetsync-input" placeholder="e.g. 15m 30s" value="${timeSpentStr || ''}">
          </div>
        </div>

        <div id="leetsync-sheet-section" style="margin-top:2px;">
          <div id="leetsync-sheet-loading" style="font-size:11px; color:var(--clr-muted, #94a3b8); padding:4px 0;">⏳ Checking sheets...</div>
        </div>

        <div>
          <label class="leetsync-label">Notes (optional)</label>
          <textarea id="leetsync-notes" class="leetsync-textarea" placeholder="e.g. HashMap use kiya..."></textarea>
        </div>

        <div class="leetsync-result" id="leetsync-res-msg"></div>
      </div>

      <div class="leetsync-modal-footer">
        <button type="button" class="leetsync-btn leetsync-btn-secondary" id="leetsync-cancel-btn">Cancel</button>
        <button type="button" class="leetsync-btn leetsync-btn-primary" id="leetsync-save-btn">Save to GitHub</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add("show"), 10);

  if (isGFGProblemPage()) {
    populateTopicsAndPatternsForGFG(overlay, details);
  }

  const favBtn = overlay.querySelector("#leetsync-fav-btn");
  let isFavorite = false;
  if (favBtn) {
    favBtn.addEventListener("click", () => {
      isFavorite = !isFavorite;
      favBtn.textContent = isFavorite ? "❤️" : "🤍";
      favBtn.style.transform = "scale(1.2)";
      setTimeout(() => { favBtn.style.transform = "scale(1)"; }, 150);
    });
  }

  // ── Sheet Status Section ──────────────────────────────────────────────────
  const sheetSection = overlay.querySelector("#leetsync-sheet-section");
  const currentSlug = getProblemSlug();
  const currentPlatform = isGFGProblemPage() ? "gfg" : "leetcode";
  const defaultSheetKey = currentPlatform;
  const defaultSheetName = currentPlatform === "gfg" ? "GFG" : "LeetCode";

  if (sheetSection && currentSlug) {
    chrome.runtime.sendMessage(
      { type: "LEETSYNC_GET_SHEET_STATUS", payload: { slug: currentSlug, platform: currentPlatform } },
      (resp) => {
        const sheets = (resp?.sheets || []).filter(s => s !== defaultSheetName);
        // Also check if it's already in the platform sheet — included via customSheets check in bg
        const allSheets = resp?.sheets || [];

        if (allSheets.length > 0) {
          // Problem IS in sheets — just show info
          sheetSection.innerHTML = `
            <div style="font-size:11.5px; color:var(--clr-muted,#94a3b8); line-height:1.6;">
              <span style="font-weight:700; color:var(--clr-text,#f1f5f9);">📋 In sheets:</span>
              ${allSheets.map(s => `<span style="display:inline-block; margin:2px 4px 2px 0; padding:2px 7px; border-radius:10px; background:rgba(99,102,241,0.18); color:#a5b4fc; font-size:10.5px; font-weight:600;">${s}</span>`).join("")}
            </div>`;
        } else {
          // Problem NOT in any sheet — show add UI
          sheetSection.innerHTML = `
            <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
              <span class="leetsync-label" style="margin:0; white-space:nowrap;">➕ Add to sheet</span>
              <select id="leetsync-sheet-add-select" class="leetsync-select" style="flex:1; min-width:130px; max-width:200px;">
              </select>
            </div>
            <div id="leetsync-sheet-new-wrap" style="display:none; gap:6px; margin-top:5px; align-items:center;">
              <input type="text" id="leetsync-sheet-new-name" class="leetsync-input" placeholder="Sheet name..." style="flex:1; font-size:12px;">
              <button type="button" id="leetsync-sheet-create-btn" class="leetsync-btn leetsync-btn-primary" style="padding:4px 12px; font-size:11.5px; white-space:nowrap;">Create &amp; Add</button>
            </div>
            <div id="leetsync-sheet-add-msg" style="font-size:11px; min-height:14px; margin-top:3px;"></div>`;

          // Builtin sheet keys — never show in user dropdown
          const BUILTIN_KEYS = new Set([
            "apnacollege_dsa_sheet", "collegewallah_dsa_master_sheet", "fraz_dsa_sheet",
            "leetcode_75", "leetcode_top_100_liked", "love_babbar_dsa_sheet",
            "neetcode_150", "striver_a2z_sheet", "top_interview_150", "gfg_160",
            "gfg", "leetcode"
          ]);

          const sel = sheetSection.querySelector("#leetsync-sheet-add-select");
          const msgEl = sheetSection.querySelector("#leetsync-sheet-add-msg");
          const newWrap = sheetSection.querySelector("#leetsync-sheet-new-wrap");

           function doAdd(sheetKey, sheetName) {
            msgEl.textContent = "⏳ Adding...";
            msgEl.style.color = "#94a3b8";

            // Find selected topic from dropdown `#leetsync-topic-select`
            const topicSelect = overlay.querySelector("#leetsync-topic-select");
            const selectedTopic = topicSelect ? topicSelect.value.trim() : "";

            chrome.runtime.sendMessage({
              type: "LEETSYNC_ADD_TO_SHEET",
              payload: {
                sheetKey,
                sheetName,
                problem: {
                  slug: currentSlug,
                  title: details.title || currentSlug,
                  difficulty: details.difficulty || "Medium",
                  url: window.location.href,
                  platform: currentPlatform,
                  topic: selectedTopic || "General"
                }
              }
            }, (res) => {
              if (res?.ok) {
                msgEl.textContent = res.alreadyExisted ? `ℹ️ Already in "${sheetName}"` : `✅ Added to "${sheetName}"!`;
                msgEl.style.color = res.alreadyExisted ? "#94a3b8" : "#4ade80";
              } else {
                msgEl.textContent = "❌ Failed: " + (res?.error || "Unknown error");
                msgEl.style.color = "#f87171";
              }
            });
          }

          // Populate dropdown
          chrome.storage.local.get(["customSheets"], (st) => {
            const customSheets = st.customSheets || {};

            // 0. Placeholder prompt option
            const placeholderOpt = document.createElement("option");
            placeholderOpt.value = "";
            placeholderOpt.disabled = true;
            placeholderOpt.selected = true;
            placeholderOpt.textContent = "Select sheet...";
            sel.appendChild(placeholderOpt);

            // 1. Platform default first
            const defOpt = document.createElement("option");
            defOpt.value = defaultSheetKey;
            defOpt.textContent = defaultSheetName;
            defOpt.dataset.sheetName = defaultSheetName;
            sel.appendChild(defOpt);

            // 2. Only true user custom sheets
            let hasCustom = false;
            for (const [key, obj] of Object.entries(customSheets)) {
              if (BUILTIN_KEYS.has(key)) continue;
              if (!hasCustom) {
                const sepEl = document.createElement("option");
                sepEl.disabled = true;
                sepEl.textContent = "── Your Sheets ──";
                sel.appendChild(sepEl);
                hasCustom = true;
              }
              const opt = document.createElement("option");
              opt.value = key;
              opt.textContent = "⭐ " + (obj.name || key);
              opt.dataset.sheetName = obj.name || key;
              sel.appendChild(opt);
            }

            // 3. Create new at bottom
            const sepEl2 = document.createElement("option");
            sepEl2.disabled = true;
            sepEl2.textContent = "──────────";
            sel.appendChild(sepEl2);
            const newOpt = document.createElement("option");
            newOpt.value = "__new__";
            newOpt.textContent = "+ Create New Sheet...";
            sel.appendChild(newOpt);
          });

          // Auto-add on select change (no button needed)
          sel.addEventListener("change", () => {
            msgEl.textContent = "";
            if (sel.value === "__new__") {
              newWrap.style.display = "flex";
            } else {
              newWrap.style.display = "none";
              const chosenKey = sel.value;
              const chosenName = sel.options[sel.selectedIndex]?.dataset?.sheetName || chosenKey;
              doAdd(chosenKey, chosenName);
            }
          });

          // Create new sheet confirm
          sheetSection.querySelector("#leetsync-sheet-create-btn")?.addEventListener("click", () => {
            const nameInput = sheetSection.querySelector("#leetsync-sheet-new-name");
            const newName = nameInput?.value.trim();
            if (!newName) { msgEl.textContent = "⚠️ Enter a sheet name."; msgEl.style.color = "#fbbf24"; return; }
            const newKey = newName.toLowerCase().replace(/[^a-z0-9]/g, "_");
            newWrap.style.display = "none";
            doAdd(newKey, newName);
            if (nameInput) nameInput.value = "";
          });
        }
      }
    );
  }

  const closeBtn = overlay.querySelector("#leetsync-close-modal");
  const cancelBtn = overlay.querySelector("#leetsync-cancel-btn");
  const saveBtn = overlay.querySelector("#leetsync-save-btn");
  const resMsg = overlay.querySelector("#leetsync-res-msg");
  const radios = overlay.querySelectorAll('input[name="leetsync-approach"]');
  const customContainer = overlay.querySelector("#leetsync-custom-name-container");
  const customInput = overlay.querySelector("#leetsync-custom-name");

  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.value === "custom") {
        customContainer.classList.remove("leetsync-hidden");
        customInput.focus();
      } else {
        customContainer.classList.add("leetsync-hidden");
      }
    });
  });

  // Toggle custom time input (collection-style: select hides, input appears with X)
  const timeSelect = overlay.querySelector("#leetsync-time-select");
  const timeSelectWrap = overlay.querySelector("#leetsync-time-select-wrap");
  const timeCustomWrap = overlay.querySelector("#leetsync-time-custom-wrap");
  const timeCustomInput = overlay.querySelector("#leetsync-time-custom");
  const timeReset = overlay.querySelector("#leetsync-time-reset");
  if (timeSelect && timeSelectWrap && timeCustomWrap) {
    timeSelect.addEventListener("change", () => {
      if (timeSelect.value === "__other__") {
        timeSelectWrap.classList.add("leetsync-hidden");
        timeCustomWrap.classList.remove("leetsync-hidden");
        if (timeCustomInput) { timeCustomInput.value = ""; timeCustomInput.focus(); }
      }
    });
    if (timeReset) {
      timeReset.addEventListener("click", () => {
        if (timeCustomInput) timeCustomInput.value = "";
        timeCustomWrap.classList.add("leetsync-hidden");
        timeSelectWrap.classList.remove("leetsync-hidden");
        timeSelect.value = "O(n)";
      });
    }
  }

  // Toggle custom space input (collection-style)
  const spaceSelect = overlay.querySelector("#leetsync-space-select");
  const spaceSelectWrap = overlay.querySelector("#leetsync-space-select-wrap");
  const spaceCustomWrap = overlay.querySelector("#leetsync-space-custom-wrap");
  const spaceCustomInput = overlay.querySelector("#leetsync-space-custom");
  const spaceReset = overlay.querySelector("#leetsync-space-reset");
  if (spaceSelect && spaceSelectWrap && spaceCustomWrap) {
    spaceSelect.addEventListener("change", () => {
      if (spaceSelect.value === "__other__") {
        spaceSelectWrap.classList.add("leetsync-hidden");
        spaceCustomWrap.classList.remove("leetsync-hidden");
        if (spaceCustomInput) { spaceCustomInput.value = ""; spaceCustomInput.focus(); }
      }
    });
    if (spaceReset) {
      spaceReset.addEventListener("click", () => {
        if (spaceCustomInput) spaceCustomInput.value = "";
        spaceCustomWrap.classList.add("leetsync-hidden");
        spaceSelectWrap.classList.remove("leetsync-hidden");
        spaceSelect.value = "O(1)";
      });
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      closeModal();
    } else if (e.key === "Enter" && document.activeElement?.id !== "leetsync-notes") {
      e.preventDefault();
      saveBtn.click();
    }
  };

  const closeModal = () => {
    document.removeEventListener("keydown", handleKeyDown);
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 250);
  };

  document.addEventListener("keydown", handleKeyDown);

  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  saveBtn.addEventListener("click", async () => {
    resMsg.textContent = "";
    resMsg.className = "leetsync-result";
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    // Helper to reset the button on any failure
    const resetBtn = (msg) => {
      resMsg.textContent = msg;
      resMsg.classList.add("error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Save to GitHub";
    };

    try {
      // Guard: if extension context is invalid (page not refreshed after reload)
      if (!isChromeAlive()) {
        resetBtn("Extension context lost. Please refresh the page and try again.");
        return;
      }

      const selectedRadio = overlay.querySelector('input[name="leetsync-approach"]:checked').value;
      const customName = customInput.value.trim();

      // Resolve time complexity
      const timeSelect = overlay.querySelector("#leetsync-time-select");
      let timeComplexity = timeSelect ? timeSelect.value : "";
      if (timeComplexity === "__other__") {
        const timeCustom = overlay.querySelector("#leetsync-time-custom");
        timeComplexity = timeCustom ? timeCustom.value.trim() : "";
      }

      // Resolve space complexity
      const spaceSelect = overlay.querySelector("#leetsync-space-select");
      let spaceComplexity = spaceSelect ? spaceSelect.value : "";
      if (spaceComplexity === "__other__") {
        const spaceCustom = overlay.querySelector("#leetsync-space-custom");
        spaceComplexity = spaceCustom ? spaceCustom.value.trim() : "";
      }
      const notes = overlay.querySelector("#leetsync-notes").value.trim();

      if (selectedRadio === "custom" && !customName) {
        resetBtn("Please enter a custom approach name.");
        return;
      }

      const stored = await chrome.storage.local.get("githubSettings");
      const settings = stored.githubSettings;

      if (!settings || !settings.token || !settings.owner || !settings.repo) {
        resetBtn("Setup your GitHub settings in extension popup first.");
        return;
      }

      const topicSelect = overlay.querySelector("#leetsync-topic-select");
      const selectedTopic = topicSelect ? topicSelect.value : "";

      const submissionPayload = {
        ...currentSubmission,
        questionFrontendId: currentDetails.questionFrontendId,
        difficulty: currentDetails.difficulty,
        content: currentDetails.content,
        topicTags: selectedTopic ? [{ name: selectedTopic }] : (currentDetails.topicTags || []),
        title: currentDetails.title,
        titleSlug: currentDetails.titleSlug,
      };

      // Resolve the final pattern value
      const patternSelect = overlay.querySelector("#leetsync-pattern-select");
      const otherPatternInput = overlay.querySelector("#leetsync-other-pattern");
      let selectedPattern = patternSelect ? patternSelect.value : "";
      if (selectedPattern === "__other__") {
        selectedPattern = otherPatternInput ? otherPatternInput.value.trim() : "";
      }

      // Collection field kept for backwards compat with history storage (now unused in UI)
      const selectedCollection = "";

      // Retrieve history to compute version count and merge notes
      const storedHistory = await chrome.storage.local.get("leetsyncHistory");
      const hist = storedHistory.leetsyncHistory || [];
      const slug = submissionPayload.titleSlug || submissionPayload.slug;
      const targetApproach = selectedRadio === "custom" ? customName : selectedRadio;

      // Find all existing solves for this approach
      const approachSolves = hist.filter(h => h.slug === slug && h.approach === targetApproach);
      
      const nowStr = new Date().toISOString();
      const todayStrVal = nowStr.split("T")[0];
      const sameDayEntry = approachSolves.find(s => {
        const dateStr = s.savedAt ? s.savedAt.split("T")[0] : "";
        return dateStr === todayStrVal;
      });

      let version;
      if (sameDayEntry) {
        // If we are replacing/overwriting a solve on the same day, keep the same version
        version = sameDayEntry.version || 1;
      } else {
        // Increment the maximum version previously saved
        const maxVersion = approachSolves.reduce((max, s) => Math.max(max, s.version || 1), 0);
        version = maxVersion + 1;
      }

      let mergedNotes = notes.trim();
      if (approachSolves.length > 0) {
        const sortedSolves = [...approachSolves].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
        const latestExistingSolve = sortedSolves.find(s => s.notes && s.notes.trim() !== "");
        if (latestExistingSolve) {
          const prevNotes = latestExistingSolve.notes.trim();
          if (mergedNotes !== "" && prevNotes !== mergedNotes && !prevNotes.includes(mergedNotes)) {
            mergedNotes = prevNotes + "\n\n---\n\n" + mergedNotes;
          } else if (mergedNotes === "") {
            mergedNotes = prevNotes;
          }
        }
      }

      const saveOptions = {
        approach: selectedRadio,
        customName,
        timeComplexity,
        spaceComplexity,
        notes: mergedNotes,
        selectedTopic,
        pattern: selectedPattern,
        collection: selectedCollection,
        timeSpent: overlay.querySelector("#leetsync-time-spent") ? overlay.querySelector("#leetsync-time-spent").value.trim() : "",
        version: version
      };

      chrome.runtime.sendMessage(
        {
          type: "LEETSYNC_SAVE_TO_GITHUB",
          payload: { settings, submission: submissionPayload, saveOptions },
        },
        async (response) => {
          try {
            if (chrome.runtime.lastError) {
              resetBtn("Extension context lost. Please refresh the page.");
              return;
            }
            if (response && response.ok) {
              let localSaved = true;
              let localError = "";
              try {
                await saveToHistory({
                  id: submissionPayload.questionFrontendId || "0",
                  title: submissionPayload.title,
                  slug: submissionPayload.titleSlug || submissionPayload.slug,
                  url: submissionPayload.url || "",
                  difficulty: submissionPayload.difficulty || "Medium",
                  approach: saveOptions.approach === "custom" ? saveOptions.customName : saveOptions.approach,
                  language: submissionPayload.language,
                  topic: saveOptions.selectedTopic || "",
                  pattern: saveOptions.pattern || "",
                  notes: saveOptions.notes || "",
                  githubUrl: response.result?.solutionUrl || "",
                  savedAt: new Date().toISOString(),
                  isFavorite: isFavorite,
                  collection: saveOptions.collection || "",
                  timeSpent: saveOptions.timeSpent || "",
                  readmePath: response.result?.readmePath || "",
                  version: version
                });
              } catch (historyErr) {
                localSaved = false;
                localError = historyErr.message || "Storage error";
              }

              if (localSaved) {
                resMsg.textContent = "✅ Saved to GitHub successfully!";
                resMsg.className = "leetsync-result success";
                saveBtn.textContent = "Saved!";
              } else {
                resMsg.textContent = `⚠️ Saved to GitHub, but local history failed: ${localError}`;
                resMsg.className = "leetsync-result warning";
                saveBtn.textContent = "Saved (Warning)";
              }

              setTimeout(closeModal, localSaved ? 1500 : 4000);
            } else {
              resetBtn(response?.error || "Save failed. Try again.");
            }
          } catch (innerErr) {
            resetBtn(innerErr.message || "Unexpected error. Try again.");
          }
        }
      );
    } catch (err) {
      resetBtn(err.message || "Unexpected error. Please refresh the page.");
    }
  });
}

// ── History Storage Helper ────────────────────────────────────────────────────
async function saveToHistory(entry) {
  try {
    const stored = await chrome.storage.local.get("leetsyncHistory");
    const history = stored.leetsyncHistory || [];
    
    // Find all existing entries for this slug to check revisions
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

    // If there was an active scheduled revision, automatically mark it completed!
    if (existingCustomDueDate) {
      entry.customRevisionDueDate = existingCustomDueDate;
      entry.revisionCompleted = true;
      entry.revisionCompletedAt = todayStrVal;
    }

    // Overwrite exact duplicate approach on the SAME calendar day if exists
    const entryDateStr = entry.savedAt ? entry.savedAt.split("T")[0] : todayStrVal;
    const dupIndex = history.findIndex(
      (h) => h.slug === entry.slug && 
             h.approach === entry.approach && 
             (h.savedAt ? h.savedAt.split("T")[0] : "") === entryDateStr
    );

    if (dupIndex !== -1) {
      // Preserve isFavorite state if it was already marked as favorite
      entry.isFavorite = entry.isFavorite || history[dupIndex].isFavorite;
      // Remove it from current position to move to top
      history.splice(dupIndex, 1);
    }

    // Prepend new/updated entry
    history.unshift(entry);

    // Update revisionCount, lastRevisionAt, and mark revision complete for all other approaches of the same slug
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
// ── Populate pattern dropdown based on selected topic ─────────────────────────
function populatePatternDropdown(selectEl, topicName, overlay) {
  const patternSelectWrap = overlay.querySelector("#leetsync-pattern-select-wrap");
  const otherWrap = overlay.querySelector("#leetsync-other-pattern-wrap");
  const otherInput = overlay.querySelector("#leetsync-other-pattern");
  const patternReset = overlay.querySelector("#leetsync-pattern-reset");

  // Ensure custom input is hidden and select is visible by default
  if (otherWrap) otherWrap.classList.add("leetsync-hidden");
  if (patternSelectWrap) patternSelectWrap.classList.remove("leetsync-hidden");

  selectEl.innerHTML = "";

  const normTopic = (topicName || "").toLowerCase().trim();
  const patterns = TOPIC_PATTERNS[normTopic] || [];

  if (patterns.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— Select topic to see patterns —";
    selectEl.appendChild(opt);
  } else {
    const def = document.createElement("option");
    def.value = "";
    def.textContent = "— Choose a pattern —";
    selectEl.appendChild(def);

    patterns.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = `🧩 ${p}`;
      selectEl.appendChild(opt);
    });
  }

  // Always append "Other..." at the end
  const otherOpt = document.createElement("option");
  otherOpt.value = "__other__";
  otherOpt.textContent = "✏️ Other...";
  selectEl.appendChild(otherOpt);

  // Toggle: collection-style — select hides, input appears with X reset
  selectEl.addEventListener("change", () => {
    if (selectEl.value === "__other__") {
      if (patternSelectWrap) patternSelectWrap.classList.add("leetsync-hidden");
      if (otherWrap) { otherWrap.classList.remove("leetsync-hidden"); }
      if (otherInput) { otherInput.value = ""; otherInput.focus(); }
    }
  });

  if (patternReset) {
    patternReset.addEventListener("click", () => {
      if (otherInput) otherInput.value = "";
      if (otherWrap) otherWrap.classList.add("leetsync-hidden");
      if (patternSelectWrap) patternSelectWrap.classList.remove("leetsync-hidden");
      selectEl.value = "";
    });
  }
}

// ── Timer State & Implementation ─────────────────────────────────────────────
let timerInterval = null;
let timerSeconds = 0;
let isTimerRunning = false;
let currentTimerSlug = "";

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

function pauseTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isTimerRunning = false;
  updateTimerToggleUI();
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

// ── GFG Scraper & Dropdown Helpers ───────────────────────────────────────────
function parseGFGUrl() {
  const parts = location.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("problems");
  if (idx !== -1 && parts[idx + 1]) {
    const rawSlug = parts[idx + 1];
    const match = rawSlug.match(/-?(\d+)$/);
    if (match) {
      const id = match[1];
      const slug = rawSlug.slice(0, rawSlug.length - match[0].length).toLowerCase();
      return { id, slug };
    }
    return { id: "", slug: rawSlug.toLowerCase() };
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

    // Path 1: pageProps.initialState.problemData.allData.probData.tags.topic_tags
    const probData = json?.props?.pageProps?.initialState?.problemData?.allData?.probData;
    if (probData?.tags?.topic_tags && Array.isArray(probData.tags.topic_tags)) {
      return probData.tags.topic_tags;
    }

    // Path 2: pageProps.initialState.problemApi.queries cache
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
    // Strategy 2: Fallback to DOM traversal
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

  // Deduplicate and normalize to standard LeetCode naming conventions
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
      // Capitalize other tags
      const cap = t.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      if (!seen.has(cap.toLowerCase())) {
        normalizedTags.push(cap);
        seen.add(cap.toLowerCase());
      }
    }
  });

  return normalizedTags;
}

function populateTopicsAndPatternsForGFG(overlay, details) {
  const topicSelect = overlay.querySelector("#leetsync-topic-select");
  const patternSelect = overlay.querySelector("#leetsync-pattern-select");
  const folderPreview = overlay.querySelector("#leetsync-folder-preview");
  
  if (!topicSelect || !patternSelect) return;

  topicSelect.innerHTML = "";
  
  // "No topic" option first
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "📂 No topic folder (save in base)";
  topicSelect.appendChild(noneOpt);

  // Only add tags that GFG provides on this page (e.g. Stack, Data Structures)
  const scrapedTopics = getGFGTopics();
  scrapedTopics.forEach((t, idx) => {
    const norm = t.trim();
    if (!norm) return;
    const opt = document.createElement("option");
    opt.value = norm;
    opt.textContent = `🏷️ ${norm}`;
    if (idx === 0) opt.selected = true;
    topicSelect.appendChild(opt);

  });

  // Custom entry option
  const customOpt = document.createElement("option");
  customOpt.value = "__other__";
  customOpt.textContent = "✏️ Custom...";
  topicSelect.appendChild(customOpt);

  const updatePreview = () => {
    const selected = topicSelect.value;
    if (selected === "__other__") {
      folderPreview.textContent = `📁 .../[Custom Topic]/${details.title || ""}/`;
    } else {
      folderPreview.textContent = selected
        ? `📁 .../${selected}/${details.title || ""}/`
        : `📁 .../${details.title || ""}/`;
    }
  };

  topicSelect.addEventListener("change", updatePreview);
  updatePreview();

  populatePatternDropdown(patternSelect, topicSelect.value, overlay);
  topicSelect.addEventListener("change", () => {
    populatePatternDropdown(patternSelect, topicSelect.value, overlay);
  });
}

// ── GFG Mutation Observer & Scraping Logic ───────────────────────────────────
let gfgObserver = null;
let gfgSubmissionProcessed = false;
let gfgSubmitClicked = false;

// Track clicks to identify if user clicked GFG submit button
document.addEventListener("click", (e) => {
  const target = e.target;
  if (target) {
    const isSubmit = target.id === "submit-btn" || 
                     (target.textContent && target.textContent.trim().toLowerCase() === "submit") ||
                     target.classList.contains("problems_submit_button") ||
                     (typeof target.className === "string" && target.className.includes("submit"));
    if (isSubmit) {
      gfgSubmitClicked = true;
      gfgSubmissionProcessed = false;
    }
  }
});

// Track Ctrl+Enter keyboard submission shortcuts
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    gfgSubmitClicked = true;
    gfgSubmissionProcessed = false;
  }
});

function initGFGObserver() {
  if (!isGFGProblemPage()) {
    if (gfgObserver) {
      gfgObserver.disconnect();
      gfgObserver = null;
    }
    return;
  }

  if (gfgObserver) return;

  gfgObserver = new MutationObserver(() => {
    const text = document.body.innerText;
    const hasSuccess = text.includes("Problem Solved Successfully") || text.includes("Correct Answer");
    
    if (hasSuccess && gfgSubmitClicked) {
      if (!gfgSubmissionProcessed) {
        gfgSubmissionProcessed = true;
        gfgSubmitClicked = false; // Reset click tracker
        handleGFGSuccess();
      }
    } else if (!hasSuccess) {
      gfgSubmissionProcessed = false;
    }
  });

  gfgObserver.observe(document.body, { childList: true, subtree: true });
}

async function handleGFGSuccess() {
  const text = document.body.innerText;
  
  // Parse GFG metrics
  const timeMatch = text.match(/(?:Time\s*Taken|Time)\s*[:\-]?\s*([0-9.]+\s*(?:s|sec|ms)?)/i);
  const runtime = timeMatch ? timeMatch[1].trim() : "";

  const memMatch = text.match(/(?:Memory|Space\s*Used)\s*[:\-]?\s*([0-9.]+\s*(?:mb|kb|bytes)?)/i);
  const memory = memMatch ? memMatch[1].trim() : "";

  // Request editor code from page (MAIN world injected monaco/ace instance)
  const code = await getCodeFromPage();

  const submissionPayload = {
    title: getProblemTitle(),
    slug: getProblemSlug(),
    url: location.href,
    language: getLanguage(),
    code: code || getCodeFallback(),
    runtime: runtime,
    memory: memory,
    submissionId: "gfg-" + Date.now(),
    capturedAt: new Date().toISOString(),
  };

  const fallbackDetails = {
    questionFrontendId: "",   // GFG has no public-facing problem number
    title: submissionPayload.title,
    titleSlug: submissionPayload.slug,
    difficulty: getDifficultyFromDOM() || "Medium",
    content: getGFGDescription(),
    topicTags: [],
  };

  pauseTimer();
  const timeSpentStr = formatTimeSpent(timerSeconds);

  showModal(submissionPayload, fallbackDetails, timeSpentStr);
}

// ── SPA URL Observer & Timer Boot ────────────────────────────────────────────
if (isLeetCodeProblemPage() || isGFGProblemPage()) {
  initTimer();
}
initGFGObserver();

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (isLeetCodeProblemPage() || isGFGProblemPage()) {
      initTimer();
    } else {
      removeTimerWidget();
    }
    initGFGObserver();
  }
}, 1000);

