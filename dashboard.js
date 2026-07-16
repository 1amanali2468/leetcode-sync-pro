// dashboard.js – Companion Dashboard Controller
import { FIREBASE_CONFIG, getFirestoreApiUrl } from "./firebase-config.js";
import { loadSheet, populateSheetDropdown as populateSheetDropdownHelper, getCrossSheetMap, clearSheetCache } from "./sheet-loader.js";
import { getDailyPOTD } from "./potd-fetcher.js";

const STORAGE_KEYS = {
  history: "leetsyncHistory",
  settings: "leetsyncSettings",
  streak:  "leetsyncStreak"
};

// Global State
let currentScreen = "overview";
let activeTopicName = null;
let currentYear = new Date().getFullYear();

// NeetCode UI State & Filter Configurations
let sheetViewMode = "group"; // "group" or "list"
let sheetSearchQuery = "";
let selectedTopicPill = "all";
let selectedSidebarList = null;
let selectedSidebarListIsSmart = false;
let currentCrossSheetMap = {};
let sheetSortDirection = "none"; // Kept for backwards compatibility
let currentSortColumn = "none"; // "none", "status", "star", "problem", "practice", "notes", "github", "difficulty"
let currentSortDirection = "none"; // "none", "asc", "desc" (for difficulty: "none", "easy", "medium", "hard")

function getSheetCount(problem) {
  if (Array.isArray(problem.sheetsIn)) return problem.sheetsIn.length;
  const slug = problem.slug?.trim().toLowerCase();
  return slug ? (currentCrossSheetMap?.[slug]?.length || 0) : 0;
}

function sortProblems(problemsArray, solvedMap) {
  if (currentSortColumn === "none" || currentSortDirection === "none") {
    // Default fallback to frequency sort if sheetSortDirection is set
    if (sheetSortDirection !== "none") {
      return [...problemsArray].sort((a, b) => {
        const countA = getSheetCount(a);
        const countB = getSheetCount(b);
        if (sheetSortDirection === "desc") return countB - countA;
        return countA - countB;
      });
    }
    return problemsArray;
  }

  return [...problemsArray].sort((a, b) => {
    let valA, valB;

    switch (currentSortColumn) {
      case "status": {
        const solvesA = solvedMap[a.slug?.trim().toLowerCase()] || [];
        const solvesB = solvedMap[b.slug?.trim().toLowerCase()] || [];
        valA = solvesA.length > 0 ? 1 : 0;
        valB = solvesB.length > 0 ? 1 : 0;
        break;
      }
      case "star": {
        const solvesA = solvedMap[a.slug?.trim().toLowerCase()] || [];
        const solvesB = solvedMap[b.slug?.trim().toLowerCase()] || [];
        valA = solvesA.some(s => s.isFavorite) ? 1 : 0;
        valB = solvesB.some(s => s.isFavorite) ? 1 : 0;
        break;
      }
      case "problem": {
        valA = getSheetCount(a);
        valB = getSheetCount(b);
        break;
      }
      case "practice": {
        const urlA = a.leetcodeUrl || a.url || "";
        const urlB = b.leetcodeUrl || b.url || "";
        valA = urlA.includes("geeksforgeeks.org") ? "gfg" : "leetcode";
        valB = urlB.includes("geeksforgeeks.org") ? "gfg" : "leetcode";
        break;
      }
      case "notes": {
        const solvesA = solvedMap[a.slug?.trim().toLowerCase()] || [];
        const solvesB = solvedMap[b.slug?.trim().toLowerCase()] || [];
        valA = solvesA.some(s => s.notes && s.notes.trim() !== "") ? 1 : 0;
        valB = solvesB.some(s => s.notes && s.notes.trim() !== "") ? 1 : 0;
        break;
      }
      case "github": {
        const solvesA = solvedMap[a.slug?.trim().toLowerCase()] || [];
        const solvesB = solvedMap[b.slug?.trim().toLowerCase()] || [];
        valA = solvesA.some(s => s.githubUrl && s.githubUrl.trim() !== "") ? 1 : 0;
        valB = solvesB.some(s => s.githubUrl && s.githubUrl.trim() !== "") ? 1 : 0;
        break;
      }
      case "difficulty": {
        const diffA = (a.difficulty || "Medium").toLowerCase();
        const diffB = (b.difficulty || "Medium").toLowerCase();
        const rank = { "easy": 1, "medium": 2, "hard": 3 };
        const order = currentSortDirection; // "easy", "medium", "hard"
        
        let rankA = rank[diffA] || 2;
        let rankB = rank[diffB] || 2;

        if (order === "easy") {
          return rankA - rankB;
        } else if (order === "medium") {
          const medRank = { "medium": 1, "hard": 2, "easy": 3 };
          return (medRank[diffA] || 2) - (medRank[diffB] || 2);
        } else if (order === "hard") {
          const hardRank = { "hard": 1, "medium": 2, "easy": 3 };
          return (hardRank[diffA] || 2) - (hardRank[diffB] || 2);
        }
        return 0;
      }
      default:
        return 0;
    }

    if (currentSortColumn === "difficulty") return 0;

    if (valA < valB) return currentSortDirection === "asc" ? -1 : 1;
    if (valA > valB) return currentSortDirection === "asc" ? 1 : -1;
    return 0;
  });
}

function handleColumnSort(columnName) {
  if (currentSortColumn === columnName) {
    if (columnName === "difficulty") {
      if (currentSortDirection === "none") currentSortDirection = "easy";
      else if (currentSortDirection === "easy") currentSortDirection = "medium";
      else if (currentSortDirection === "medium") currentSortDirection = "hard";
      else {
        currentSortDirection = "none";
        currentSortColumn = "none";
      }
    } else {
      if (currentSortDirection === "none") currentSortDirection = (columnName === "problem" ? "desc" : "asc");
      else if (currentSortDirection === "desc") currentSortDirection = "asc";
      else if (currentSortDirection === "asc") {
        if (columnName === "problem") {
          currentSortDirection = "none";
          currentSortColumn = "none";
        } else {
          currentSortDirection = "desc";
        }
      } else {
        currentSortDirection = "none";
        currentSortColumn = "none";
      }
    }
  } else {
    currentSortColumn = columnName;
    currentSortDirection = columnName === "difficulty" ? "easy" : (columnName === "problem" ? "desc" : "asc");
    sheetSortDirection = "none"; // override old sort
  }
  renderSheets();
}

function getHeaderSortIndicatorHtml(columnName) {
  if (currentSortColumn !== columnName) {
    return '<span style="opacity: 0.3; margin-left: 6px;">↕</span>';
  }
  if (columnName === "difficulty") {
    const dir = currentSortDirection;
    if (dir === "easy") return '<span style="color: var(--clr-primary); margin-left: 6px; font-weight: 800; font-size: 11px;">(E)</span>';
    if (dir === "medium") return '<span style="color: var(--clr-primary); margin-left: 6px; font-weight: 800; font-size: 11px;">(M)</span>';
    if (dir === "hard") return '<span style="color: var(--clr-primary); margin-left: 6px; font-weight: 800; font-size: 11px;">(H)</span>';
    return '<span style="opacity: 0.3; margin-left: 6px;">↕</span>';
  }
  if (currentSortDirection === "asc") return '<span style="color: var(--clr-primary); margin-left: 6px;">▲</span>';
  if (currentSortDirection === "desc") return '<span style="color: var(--clr-primary); margin-left: 6px;">▼</span>';
  return '<span style="opacity: 0.3; margin-left: 6px;">↕</span>';
}

function renderTableHead(table) {
  table.innerHTML = `
    <thead>
      <tr style="border-bottom: 2px solid var(--clr-border); text-align: left; font-size: 12px; color: var(--clr-muted);">
        <th class="sortable-status-header" style="width: 60px; text-align: center; font-weight: 800; cursor: pointer; user-select: none; white-space: nowrap;">
          <div style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; width: 100%;">
            <span>STATUS</span>${getHeaderSortIndicatorHtml("status")}
          </div>
        </th>
        <th class="sortable-star-header" style="width: 60px; text-align: center; font-weight: 800; cursor: pointer; user-select: none; white-space: nowrap;">
          <div style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; width: 100%;">
            <span>STAR</span>${getHeaderSortIndicatorHtml("star")}
          </div>
        </th>
        <th class="sortable-problem-header" style="font-weight: 800; cursor: pointer; user-select: none; white-space: nowrap;">
          <div style="display: inline-flex; align-items: center; gap: 4px;">
            <span>PROBLEM</span>${getHeaderSortIndicatorHtml("problem")}
          </div>
        </th>
        <th class="sortable-practice-header" style="width: 100px; text-align: center; font-weight: 800; cursor: pointer; user-select: none; white-space: nowrap;">
          <div style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; width: 100%;">
            <span>PRACTICE</span>${getHeaderSortIndicatorHtml("practice")}
          </div>
        </th>
        <th class="sortable-notes-header" style="width: 100px; text-align: center; font-weight: 800; cursor: pointer; user-select: none; white-space: nowrap;">
          <div style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; width: 100%;">
            <span>NOTES</span>${getHeaderSortIndicatorHtml("notes")}
          </div>
        </th>
        <th class="sortable-github-header" style="width: 100px; text-align: center; font-weight: 800; cursor: pointer; user-select: none; white-space: nowrap;">
          <div style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; width: 100%;">
            <span>GITHUB</span>${getHeaderSortIndicatorHtml("github")}
          </div>
        </th>
        <th class="sortable-difficulty-header" style="width: 120px; text-align: right; font-weight: 800; cursor: pointer; user-select: none; white-space: nowrap;">
          <div style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; width: 100%;">
            <span>DIFFICULTY</span>${getHeaderSortIndicatorHtml("difficulty")}
          </div>
        </th>
      </tr>
    </thead>
  `;

  const cols = ["status", "star", "problem", "practice", "notes", "github", "difficulty"];
  cols.forEach(col => {
    const th = table.querySelector(`.sortable-${col}-header`);
    if (th) {
      th.style.transition = "color 0.15s ease";
      th.addEventListener("mouseenter", () => th.style.color = "var(--clr-text)");
      th.addEventListener("mouseleave", () => th.style.color = "var(--clr-muted)");
      th.addEventListener("click", (e) => {
        e.stopPropagation();
        handleColumnSort(col);
      });
    }
  });
}

const DASHBOARD_TOPIC_PATTERNS = {
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
  "two pointers":         ["Opposite Direction", "Same Direction / Fast-Slow", "Three Sum Triplet", "Container With Most Water"],
  "sliding window":       ["Fixed Size Window", "Variable Size Window", "At Most K Distinct", "Minimum Window Substring"],
  "tree":                 ["Preorder / Inorder / Postorder", "Level Order BFS", "DFS / Path Sum", "BST Property", "LCA", "Diameter / Height"],
  "graph":                ["BFS Shortest Path", "DFS Connected Components", "Dijkstra's Shortest Path", "Bellman-Ford", "Floyd-Warshall", "Union Find", "Kruskal / Prim", "Kahn's Topological Sort"],
  "binary tree":          ["Tree DFS", "Tree BFS", "BST", "LCA"],
  "linked list":          ["Dummy Node", "Two Pointers / Fast-Slow", "Reverse Linked List", "Merge Sorted Lists"],
  "binary search tree":   ["BST Search / Insert / Delete", "BST Validator", "LCA in BST"],
  "heap":                 ["Top K Elements", "Merge K Sorted", "Median Finder", "PriorityQueue Selection"],
  "backtracking":         ["Subsets / Power Set", "Permutations", "Combinations", "N-Queens / Sudoku Solver", "Word Search"],
  "trie":                 ["Prefix Search", "Trie Node Insertion", "Autocomplete System"],
  "bit manipulation":     ["Bitwise XOR Properties", "Set Bit Counting", "Power of Two", "Bitwise Subset Masking"]
};

let activeFilters = {
  matchMode: "all", // "all" or "any"
  difficulty: { op: "is", vals: [] },
  status: { op: "is", vals: [] },
  topic: { op: "is", vals: [] },
  pattern: { op: "is", vals: [] },
  collection: { op: "is", vals: [] },
  list: { op: "is", vals: [] }
};

const FIXED_TOPICS = [
  "Array",
  "String",
  "Two Pointers",
  "Sliding Window",
  "Stack",
  "Queue",
  "Linked List",
  "Binary Search",
  "Tree",
  "Graph",
  "Recursion & Backtracking",
  "Greedy",
  "Dynamic Programming",
  "Bit Manipulation",
  "Heap / Priority Queue",
  "Trie"
];



// Elements Cache
const el = {
  navItems:            document.querySelectorAll(".nav-item"),
  screens:             document.querySelectorAll(".screen-content"),
  screenTitle:         document.getElementById("screenTitle"),
  screenSubtitle:      document.getElementById("screenSubtitle"),
  syncStatus:          document.getElementById("syncStatus"),
  btnManualSync:       document.getElementById("btnManualSync"),
  
  // User Status
  avatarImage:         document.getElementById("avatarImage"),
  userName:            document.getElementById("userName"),
  userEmail:           document.getElementById("userEmail"),
  
  // Stats
  streakNum:           document.getElementById("streakNum"),
  totalSolved:         document.getElementById("totalSolved"),
  easyCount:           document.getElementById("easyCount"),
  mediumCount:         document.getElementById("mediumCount"),
  hardCount:           document.getElementById("hardCount"),
  easyRing:            document.getElementById("easyRing"),
  mediumRing:          document.getElementById("mediumRing"),
  hardRing:            document.getElementById("hardRing"),

  // Heatmap
  heatmapGrid:         document.getElementById("heatmapGrid"),
  heatmapYear:         document.getElementById("heatmapYear"),
  btnPrevYear:         document.getElementById("btnPrevYear"),
  btnNextYear:         document.getElementById("btnNextYear"),

  // Recent solves
  recentSolvesList:    document.getElementById("recentSolvesList"),

  // DSA Sheets
  sheetSelect:         document.getElementById("sheetSelect"),
  sheetAccordionContainer: document.getElementById("sheetAccordionContainer"),

  // DSA Controls & Pills
  sheetSearchInput:     document.getElementById("sheetSearchInput"),
  sheetTopicPills:      document.getElementById("sheetTopicPills"),
  btnSheetFilterDropdown: document.getElementById("btnSheetFilterDropdown"),
  btnSheetViewToggle:   document.getElementById("btnSheetViewToggle"),
  btnSheetShuffle:      document.getElementById("btnSheetShuffle"),
  btnSheetReset:        document.getElementById("btnSheetReset"),
  btnSheetExportExcel:  document.getElementById("btnSheetExportExcel"),
  btnSheetHelp:         document.getElementById("btnSheetHelp"),

  // Advanced Filters
  sheetFilterDropdownPanel: document.getElementById("sheetFilterDropdownPanel"),
  sheetFilterBadge:     document.getElementById("sheetFilterBadge"),
  filterMatchMode:      document.getElementById("filterMatchMode"),
  btnResetAllFilters:   document.getElementById("btnResetAllFilters"),
  
  // Sidebar Toggle / Collapse / Expand
  btnCollapseSidebar:   document.getElementById("btnCollapseSidebar"),
  btnExpandSidebar:     document.getElementById("btnExpandSidebar"),

  // My Lists Sidebar
  btnCreateNewListSidebar: document.getElementById("btnCreateNewListSidebar"),
  sheetsSidebarLists:   document.getElementById("sheetsSidebarLists"),

  // Save as Smart List Modal elements
  btnSaveAsSmartList:   document.getElementById("btnSaveAsSmartList"),
  smartListModal:       document.getElementById("smartListModal"),
  smartListModalCloseBtn:document.getElementById("smartListModalCloseBtn"),
  smartListTitleInput:  document.getElementById("smartListTitleInput"),
  smartListTitleCount:  document.getElementById("smartListTitleCount"),
  smartListDescInput:   document.getElementById("smartListDescInput"),
  smartListDescCount:   document.getElementById("smartListDescCount"),
  smartListCancelBtn:   document.getElementById("smartListCancelBtn"),
  smartListCreateBtn:   document.getElementById("smartListCreateBtn"),



  // Revision
  revisionListOverdue: document.getElementById("revisionListOverdue"),
  revisionListToday:   document.getElementById("revisionListToday"),
  revisionListUpcoming:document.getElementById("revisionListUpcoming"),

  // Settings
  txtRepo:             document.getElementById("txtRepo"),
  txtBranch:           document.getElementById("txtBranch"),
  txtBasePath:         document.getElementById("txtBasePath"),
  btnSaveSettings:     document.getElementById("btnSaveSettings"),
  btnFetchSolves:      document.getElementById("btnFetchSolves"),
  btnDisconnect:       document.getElementById("btnDisconnect"),
  txtCustomSheetUrl:   document.getElementById("txtCustomSheetUrl"),
  txtCustomSheetName:  document.getElementById("txtCustomSheetName"),
  btnImportCustomSheet:document.getElementById("btnImportCustomSheet"),
  importStatus:        document.getElementById("importStatus"),

  // Notes Modal
  notesModal:          document.getElementById("notesModal"),
  notesModalTitle:     document.getElementById("notesModalTitle"),
  notesModalSubtitle:  document.getElementById("notesModalSubtitle"),
  notesModalContainer: document.getElementById("notesModalContainer"),
  notesModalCancelBtn: document.getElementById("notesModalCancelBtn"),
  notesModalSaveBtn:   document.getElementById("notesModalSaveBtn"),
  notesModalStatus:    document.getElementById("notesModalStatus"),
};

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);

async function init() {
  const data = await chrome.storage.local.get(["auth_user", STORAGE_KEYS.settings, STORAGE_KEYS.history]);
  
  // Set User Profile Card
  const authUser = data.auth_user;
  if (authUser) {
    el.userName.textContent = authUser.username || authUser.displayName || "LeetSync User";
    el.userEmail.textContent = authUser.email || "Sync enabled";
    if (authUser.photoURL) {
      el.avatarImage.src = authUser.photoURL;
    }
  }

  // Load Settings
  const settings = data[STORAGE_KEYS.settings] || {};
  el.txtRepo.value = settings.repo || "";
  el.txtBranch.value = settings.branch || "main";
  el.txtBasePath.value = settings.basePath || "";

  // Check active tab on boot to toggle My Lists container
  const activeNav = document.querySelector(".nav-item.active");
  const initialScreen = activeNav ? activeNav.dataset.screen : "overview";
  const myListsContainer = document.getElementById("sidebarMyListsContainer");
  if (myListsContainer) {
    if (initialScreen === "sheets") {
      myListsContainer.classList.remove("hidden");
    } else {
      myListsContainer.classList.add("hidden");
    }
  }

  // Render Dashboard Elements
  renderAll();

  // Bind Event Listeners
  setupNavigation();
  setupSettingsListeners();
  setupSheetTabListeners();
  setupHeatmapControls();
  setupNotesModalListeners();
  setupSmartListListeners();

  // Manual Sync Button Click
  if (el.btnManualSync) {
    el.btnManualSync.addEventListener("click", forceSync);
  }
  const btnResetWidget = document.getElementById("btnResetProgressWidget");
  if (btnResetWidget) {
    btnResetWidget.addEventListener("click", forceSync);
  }

  // Sidebar Collapse/Expand Listeners
  if (el.btnCollapseSidebar) {
    el.btnCollapseSidebar.addEventListener("click", () => {
      document.querySelector(".app-container").classList.add("sidebar-collapsed");
    });
  }
  if (el.btnExpandSidebar) {
    el.btnExpandSidebar.addEventListener("click", () => {
      document.querySelector(".app-container").classList.remove("sidebar-collapsed");
    });
  }

  setupSidebarResize();
}

// ── Global Render Trigger ────────────────────────────────────────────────────
async function renderAll() {
  await migrateCustomSheets();
  await populateSheetDropdown();
  renderOverview();
  renderSheets();
  renderRevisionSchedule();
  renderPOTDWidget();
}

// ── Screen Navigation Setup ──────────────────────────────────────────────────
function setupNavigation() {
  el.navItems.forEach(btn => {
    btn.addEventListener("click", () => {
      const screen = btn.dataset.screen;
      
      // Update sidebar nav state
      el.navItems.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Update active content screen
      el.screens.forEach(s => s.classList.remove("active"));
      document.getElementById(`screen-${screen}`).classList.add("active");

      currentScreen = screen;

      // Show/hide My Lists sidebar container
      const myListsContainer = document.getElementById("sidebarMyListsContainer");
      if (myListsContainer) {
        if (screen === "sheets") {
          myListsContainer.classList.remove("hidden");
          selectedSidebarList = null; // Clear active list view when clicking DSA Sheets tab
          
          // Restore controls visibility
          const topControls = document.querySelector(".sheets-top-controls");
          if (topControls) topControls.style.display = "flex";
          const controlsRow = document.querySelector(".sheet-controls-row");
          if (controlsRow) controlsRow.style.display = "flex";
          const topicPills = document.getElementById("sheetTopicPills");
          if (topicPills) topicPills.style.display = "flex";
        } else {
          myListsContainer.classList.add("hidden");
        }
      }
      
      // Update screen title/subtitle
      if (screen === "overview") {
        el.screenTitle.textContent = "Overview";
        el.screenSubtitle.textContent = "Track your daily progress and statistics.";
        renderOverview();
      } else if (screen === "sheets") {
        el.screenTitle.textContent = "DSA Sheets Hub";
        el.screenSubtitle.textContent = "Progress tracker for Striver A-Z, Blind75, and NeetCode150.";
        renderSheets();
      } else if (screen === "revision") {
        el.screenTitle.textContent = "Revision Board";
        el.screenSubtitle.textContent = "Keep retention strong with scheduled Spaced Repetition checks.";
        renderRevisionSchedule();
      } else if (screen === "settings") {
        el.screenTitle.textContent = "Settings & Repositories";
        el.screenSubtitle.textContent = "Configure repository paths and GitHub metadata storage.";
      }
    });
  });
}

// ── SCREEN: OVERVIEW LOGIC ──────────────────────────────────────────────────
async function renderOverview() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.history, STORAGE_KEYS.streak]);
  const history = data[STORAGE_KEYS.history] || [];
  const streakInfo = data[STORAGE_KEYS.streak] || { streak: 0 };

  // 1. Streak count
  el.streakNum.textContent = streakInfo.streak || 0;

  // 2. Solve Breakdown Donuts calculation
  const counts = { easy: 0, medium: 0, hard: 0 };
  const uniqueSlugs = new Set();
  
  history.forEach(h => {
    if (!uniqueSlugs.has(h.slug)) {
      uniqueSlugs.add(h.slug);
      const diff = (h.difficulty || "medium").toLowerCase();
      if (counts.hasOwnProperty(diff)) counts[diff]++;
    }
  });

  const total = uniqueSlugs.size;
  el.totalSolved.textContent = total;
  el.easyCount.textContent = counts.easy;
  el.mediumCount.textContent = counts.medium;
  el.hardCount.textContent = counts.hard;

  // Update SVG rings
  // easy: cx=60, cy=60, r=50, circum=314.16
  // medium: cx=60, cy=60, r=40, circum=251.32
  // hard: cx=60, cy=60, r=30, circum=188.50
  updateRing(el.easyRing, 314.16, total > 0 ? counts.easy / total : 0);
  updateRing(el.mediumRing, 251.32, total > 0 ? counts.medium / total : 0);
  updateRing(el.hardRing, 188.50, total > 0 ? counts.hard / total : 0);

  // 3. Render Heatmap grid
  renderHeatmap(history);

  // 4. Render Recent Solves
  renderRecentSolvesList(history);
}

function updateRing(ring, circum, pct) {
  if (!ring) return;
  const offset = circum - (pct * circum);
  ring.style.strokeDashoffset = offset;
}

// ── Calendar Heatmap Logic ───────────────────────────────────────────────────
function setupHeatmapControls() {
  el.btnPrevYear.addEventListener("click", () => {
    currentYear--;
    el.heatmapYear.textContent = currentYear;
    renderOverview();
  });
  el.btnNextYear.addEventListener("click", () => {
    currentYear++;
    el.heatmapYear.textContent = currentYear;
    renderOverview();
  });
}

function renderHeatmap(history) {
  el.heatmapGrid.innerHTML = "";

  // Index history by local date string YYYY-MM-DD
  const dateMap = {};
  history.forEach(h => {
    if (h.savedAt) {
      const dStr = h.savedAt.split("T")[0];
      dateMap[dStr] = (dateMap[dStr] || 0) + 1;
    }
  });

  // Calculate grid representing the currentYear
  const firstDay = new Date(currentYear, 0, 1);
  const lastDay = new Date(currentYear, 11, 31);
  
  // Align to previous Sunday to form columns
  const startDay = new Date(firstDay);
  startDay.setDate(startDay.getDate() - startDay.getDay());

  const daysToShow = [];
  const currentDay = new Date(startDay);

  // Generate 53 weeks (371 days)
  for (let i = 0; i < 371; i++) {
    daysToShow.push(new Date(currentDay));
    currentDay.setDate(currentDay.getDate() + 1);
  }

  // Render cells row-wise: 7 rows (Sunday to Saturday), 53 columns
  // grid-template-rows is 7, grid-template-columns is 53.
  // To render in chronological columns, we output row-by-row:
  // Row 0: Sunday cells for all 53 weeks, Row 1: Monday cells, etc.
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 53; c++) {
      const dayIdx = c * 7 + r;
      const dateVal = daysToShow[dayIdx];
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";

      if (dateVal.getFullYear() === currentYear) {
        const yyyy = dateVal.getFullYear();
        const mm = String(dateVal.getMonth() + 1).padStart(2, "0");
        const dd = String(dateVal.getDate()).padStart(2, "0");
        const formattedDate = `${yyyy}-${mm}-${dd}`;
        const count = dateMap[formattedDate] || 0;

        let level = 0;
        if (count > 0 && count <= 1) level = 1;
        else if (count > 1 && count <= 2) level = 2;
        else if (count > 2 && count <= 4) level = 3;
        else if (count > 4) level = 4;

        cell.className = `heatmap-cell level-${level}`;
        cell.title = `${dateVal.toDateString()}: ${count} problems solved`;
      } else {
        // Out of current year range -> blank cell
        cell.style.opacity = "0.1";
      }
      el.heatmapGrid.appendChild(cell);
    }
  }
}

// ── Recent Solves List ────────────────────────────────────────────────────────
function renderRecentSolvesList(history) {
  el.recentSolvesList.innerHTML = "";
  
  const recent = history.slice(0, 10);
  if (recent.length === 0) {
    el.recentSolvesList.innerHTML = `<tr><td colspan="6" class="empty-state">No solves found in your history yet!</td></tr>`;
    return;
  }

  recent.forEach(entry => {
    const tr = document.createElement("tr");

    // Title
    const tdTitle = document.createElement("td");
    tdTitle.innerHTML = `<strong>${entry.title || "Unknown"}</strong>`;
    tr.appendChild(tdTitle);

    // Language
    const tdLang = document.createElement("td");
    tdLang.innerHTML = `<span style="font-family:monospace; text-transform:uppercase; font-size:11px; background:#1e293b; padding:2px 6px; border-radius:4px;">${entry.language || "code"}</span>`;
    tr.appendChild(tdLang);

    // Approach
    const tdApproach = document.createElement("td");
    const app = (entry.approach || "oa").toUpperCase();
    tdApproach.innerHTML = `<span class="diff-badge ${app.toLowerCase() === "oa" ? "easy" : app.toLowerCase() === "ba" ? "medium" : "hard"}" style="font-size: 9.5px; font-weight:700;">${app}</span>`;
    tr.appendChild(tdApproach);

    // Date
    const tdDate = document.createElement("td");
    tdDate.textContent = entry.savedAt ? new Date(entry.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    tr.appendChild(tdDate);

    // GitHub Link
    const tdGitHub = document.createElement("td");
    if (entry.githubUrl) {
      tdGitHub.innerHTML = `<a href="${entry.githubUrl}" target="_blank" class="action-link">View File ↗</a>`;
    } else {
      tdGitHub.textContent = "—";
    }
    tr.appendChild(tdGitHub);

    // Notes
    const tdNotes = document.createElement("td");
    const notesExcerpt = entry.notes ? (entry.notes.substring(0, 24) + "...") : "No notes";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "action-link";
    editBtn.style = "background:none; border:0; font-family:inherit; cursor:pointer;";
    editBtn.textContent = entry.notes ? `📝 ${notesExcerpt}` : "+ Add Notes";
    editBtn.addEventListener("click", () => {
      openNotesModal(entry, entry.approach);
    });
    tdNotes.appendChild(editBtn);
    tr.appendChild(tdNotes);

    el.recentSolvesList.appendChild(tr);
  });
}

// ── SCREEN: DSA SHEETS HUB ──────────────────────────────────────────────────
function setupSheetTabListeners() {
  el.sheetSelect.addEventListener("change", () => {
    activeTopicName = null; // reset selected topic to default load
    selectedTopicPill = "all"; // Reset selected topic pill
    renderSheets();
  });

  // Search input real-time query
  if (el.sheetSearchInput) {
    el.sheetSearchInput.addEventListener("input", (e) => {
      sheetSearchQuery = e.target.value.toLowerCase().trim();
      renderSheets();
    });
  }

  // Filter Match Mode change
  if (el.filterMatchMode) {
    el.filterMatchMode.addEventListener("change", (e) => {
      activeFilters.matchMode = e.target.value;
      updateFilterBadgeAndRender();
    });
  }

  const filterTypes = ["difficulty", "status", "topic", "pattern", "collection", "list"];

  // Toggle options container on trigger click
  filterTypes.forEach(type => {
    const trigger = document.getElementById(`filterTrigger${type.charAt(0).toUpperCase() + type.slice(1)}`);
    const optionsDiv = document.getElementById(`filterOptions${type.charAt(0).toUpperCase() + type.slice(1)}`);
    
    if (trigger && optionsDiv) {
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        // Hide other option dropdowns
        filterTypes.forEach(otherType => {
          if (otherType !== type) {
            const otherDiv = document.getElementById(`filterOptions${otherType.charAt(0).toUpperCase() + otherType.slice(1)}`);
            if (otherDiv) otherDiv.classList.add("hidden");
          }
        });
        optionsDiv.classList.toggle("hidden");
      });
    }
  });

  // Hide dropdown containers if click happens outside
  document.addEventListener("click", (e) => {
    filterTypes.forEach(type => {
      const optionsDiv = document.getElementById(`filterOptions${type.charAt(0).toUpperCase() + type.slice(1)}`);
      const trigger = document.getElementById(`filterTrigger${type.charAt(0).toUpperCase() + type.slice(1)}`);
      if (optionsDiv && !optionsDiv.classList.contains("hidden")) {
        if (!optionsDiv.contains(e.target) && e.target !== trigger && (!trigger || !trigger.contains(e.target))) {
          optionsDiv.classList.add("hidden");
        }
      }
    });
  });

  // Listen to changes inside custom multiselect dropdown checkbox input elements
  filterTypes.forEach(type => {
    const optionsDiv = document.getElementById(`filterOptions${type.charAt(0).toUpperCase() + type.slice(1)}`);
    const opSelect = document.getElementById(`filterOp${type.charAt(0).toUpperCase() + type.slice(1)}`);
    const clearBtn = document.querySelector(`.filter-clear-row[data-clear="${type}"]`);

    if (optionsDiv) {
      optionsDiv.addEventListener("change", (e) => {
        if (e.target.type === "checkbox") {
          const checkedCheckboxes = Array.from(optionsDiv.querySelectorAll('input[type="checkbox"]:checked'));
          const checkedVals = checkedCheckboxes.map(cb => cb.value);
          
          activeFilters[type].vals = checkedVals;
          if (opSelect) activeFilters[type].op = opSelect.value;
          
          updateTriggerLabel(type);
          updateFilterBadgeAndRender();
        }
      });
    }

    if (opSelect) {
      opSelect.addEventListener("change", () => {
        activeFilters[type].op = opSelect.value;
        if (activeFilters[type].vals && activeFilters[type].vals.length > 0) {
          updateFilterBadgeAndRender();
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        clearFilterDropdownSelection(type);
      });
    }
  });

  // Helper to dynamically update trigger button labels (e.g. "Select...", "Easy", "2 selected")
  function updateTriggerLabel(type) {
    const trigger = document.getElementById(`filterTrigger${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (!trigger) return;
    const labelEl = trigger.querySelector(".trigger-label");
    if (!labelEl) return;
    
    const checkedCount = activeFilters[type].vals ? activeFilters[type].vals.length : 0;
    if (checkedCount === 0) {
      labelEl.textContent = "Select...";
    } else if (checkedCount === 1) {
      const optionsDiv = document.getElementById(`filterOptions${type.charAt(0).toUpperCase() + type.slice(1)}`);
      const checkedInput = optionsDiv?.querySelector('input[type="checkbox"]:checked');
      const textNode = checkedInput?.nextElementSibling?.textContent || "1 selected";
      labelEl.textContent = textNode;
    } else {
      labelEl.textContent = `${checkedCount} selected`;
    }
  }

  // Helper to clear specific dropdown selections
  function clearFilterDropdownSelection(type) {
    activeFilters[type].vals = [];
    const optionsDiv = document.getElementById(`filterOptions${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (optionsDiv) {
      optionsDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    }
    updateTriggerLabel(type);
    updateFilterBadgeAndRender();
  }

  // Reset All Filters button click
  if (el.btnResetAllFilters) {
    el.btnResetAllFilters.addEventListener("click", () => {
      filterTypes.forEach(type => {
        clearFilterDropdownSelection(type);
      });
    });
  }

  // Toggle Filters Dropdown Panel click
  if (el.btnSheetFilterDropdown) {
    el.btnSheetFilterDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
      if (el.sheetFilterDropdownPanel) {
        el.sheetFilterDropdownPanel.classList.toggle("hidden");
      }
    });

    // Hide popup when clicking anywhere outside
    document.addEventListener("click", (e) => {
      if (el.sheetFilterDropdownPanel && 
          !el.sheetFilterDropdownPanel.contains(e.target) && 
          e.target !== el.btnSheetFilterDropdown &&
          !el.btnSheetFilterDropdown.contains(e.target)) {
        el.sheetFilterDropdownPanel.classList.add("hidden");
      }
    });
  }

  // View style toggle (Group View vs List View)
  if (el.btnSheetViewToggle) {
    el.btnSheetViewToggle.addEventListener("click", () => {
      sheetViewMode = (sheetViewMode === "group") ? "list" : "group";
      
      // Update toggle icon dynamically to match the current view mode
      if (sheetViewMode === "list") {
        el.btnSheetViewToggle.classList.add("active");
        el.btnSheetViewToggle.title = "Show Group View";
        el.btnSheetViewToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>`;
      } else {
        el.btnSheetViewToggle.classList.remove("active");
        el.btnSheetViewToggle.title = "Show List View";
        el.btnSheetViewToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;
      }
      renderSheets();
    });
  }

  // Shuffle/Randomize
  if (el.btnSheetShuffle) {
    el.btnSheetShuffle.addEventListener("click", () => {
      pickRandomProblem();
    });
  }

  // Reset progress
  if (el.btnSheetReset) {
    el.btnSheetReset.addEventListener("click", async () => {
      const confirmReset = confirm("Are you sure you want to reset all progress for the active DSA sheet? This will clear completion checkmarks for all problems in this sheet.");
      if (confirmReset) {
        await resetSheetProgress();
      }
    });
  }

  // Export Sheet to Excel
  if (el.btnSheetExportExcel) {
    el.btnSheetExportExcel.addEventListener("click", async () => {
      await exportActiveSheetToExcel();
    });
  }

  // Help Guide
  if (el.btnSheetHelp) {
    el.btnSheetHelp.addEventListener("click", () => {
      alert("LeetSync Pro DSA Sheets Guide:\n\n" +
            "1. ACTIVE DSA SHEET: Select your sheet from the dropdown.\n" +
            "2. SEARCH: Type in the search box to find specific problems by title.\n" +
            "3. VIEW STYLE: Click the list/grid icon to toggle between Accordion (Group) View and Table (List) View.\n" +
            "4. SHUFFLE: Click the shuffle icon to open a random unsolved question matching your active filters.\n" +
            "5. RESET PROGRESS: Click the trash icon to reset all checked states for the active sheet.\n" +
            "6. TOPIC PILLS: Click any pill (like Array, String) to filter the list to only that topic. Pills display real-time progress counters.\n" +
            "7. ADVANCED FILTERS: Click the filter funnel button to set match rules by difficulty, status, topic, patterns, and collections!");
    });
  }
}

function updateFilterBadgeAndRender() {
  const badge = el.sheetFilterBadge;
  const button = el.btnSheetFilterDropdown;
  let activeCount = 0;
  
  const filterTypes = ["difficulty", "status", "topic", "pattern", "collection", "list"];
  filterTypes.forEach(type => {
    if (activeFilters[type].vals && activeFilters[type].vals.length > 0) {
      activeCount++;
    }
  });

  if (badge) {
    if (activeCount > 0) {
      badge.textContent = activeCount;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }

  if (button) {
    if (activeCount > 0) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  }

  const saveBtn = el.btnSaveAsSmartList;
  if (saveBtn) {
    if (activeCount > 0) {
      saveBtn.disabled = false;
      saveBtn.classList.remove("disabled");
    } else {
      saveBtn.disabled = true;
      saveBtn.classList.add("disabled");
    }
  }

  // Re-populate dropdown checkboxes to reflect dependency-mapped pattern lists
  getActiveSheetProblems().then(async (problems) => {
    const selectedSheetName = el.sheetSelect.value;
    const sheetData = selectedSheetName ? await loadSheet(selectedSheetName) : {};
    const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
    const history = storedHistory[STORAGE_KEYS.history] || [];
    populateDynamicFilterDropdowns(sheetData, history);
  });

  renderSheets();
}



async function renderSheets() {
  const container = el.sheetAccordionContainer;
  const sheetSelect = el.sheetSelect;

  if (!container || !sheetSelect) return;

  const selectedSheetName = sheetSelect.value;

  if (selectedSidebarList) {
    const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
    const history = storedHistory[STORAGE_KEYS.history] || [];
    const solvedMap = {};
    history.forEach(h => {
      if (h.slug) {
        let slug = h.slug.trim().toLowerCase();
        const url = h.url || "";
        if (url.includes("geeksforgeeks.org") || (url === "" && slug.match(/-\d{5,}$/))) {
          slug = slug.replace(/-[0-9]+$/, "");
        }
        if (!solvedMap[slug]) solvedMap[slug] = [];
        solvedMap[slug].push(h);
      }
    });
    renderFlatListProblems(solvedMap);
    renderMyListsSidebar();
    return;
  }

  if (!selectedSheetName) {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; border: 1px dashed var(--clr-border); border-radius: var(--radius); background: rgba(255,255,255,0.01); margin-top: 20px;">
        <p style="font-size: 15px; font-weight: 700; color: var(--clr-muted); margin-bottom: 12px;">No DSA Sheets imported yet.</p>
        <button id="btnGoToSettingsImport" class="primary-btn" style="padding: 8px 16px; font-size: 13px; font-weight: 800;">Go to Settings & Import Sheet</button>
      </div>
    `;
    const btnGo = document.getElementById("btnGoToSettingsImport");
    if (btnGo) {
      btnGo.addEventListener("click", () => {
        const settingsTab = document.querySelector('[data-tab="settings"]');
        if (settingsTab) settingsTab.click();
      });
    }
    updateProgressWidget(0, 0, 0, 0, 0, 0, 0, 0, 0);
    
    // Hide controls and pills if no sheet selected
    if (document.querySelector(".sheet-controls-row")) document.querySelector(".sheet-controls-row").style.display = "none";
    if (el.sheetTopicPills) el.sheetTopicPills.style.display = "none";
    return;
  }

  // Show controls and pills if sheet selected
  if (document.querySelector(".sheet-controls-row")) document.querySelector(".sheet-controls-row").style.display = "flex";
  if (el.sheetTopicPills) el.sheetTopicPills.style.display = "flex";

  const sheetData = await loadSheet(selectedSheetName);
  currentCrossSheetMap = await getCrossSheetMap();

  // Fetch history to match completed states
  const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = storedHistory[STORAGE_KEYS.history] || [];

  // Calculate totals and completions for overall progress bar based on active filters
  let totalProblems = 0;
  let completedProblems = 0;
  
  const allProblems = [];
  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    for (const [subtopicName, subproblems] of Object.entries(subtopics)) {
      subproblems.forEach(p => {
        const slug = p.slug?.trim().toLowerCase();
        if (!slug) return;
        allProblems.push({ ...p, topicName, subtopicName });
      });
    }
  }

  const solvedMap = {};
  history.forEach(h => {
    if (h.slug) {
      let slug = h.slug.trim().toLowerCase();
      const url = h.url || "";
      if (url.includes("geeksforgeeks.org") || (url === "" && slug.match(/-\d{5,}$/))) {
        slug = slug.replace(/-[0-9]+$/, "");
      }
      if (!solvedMap[slug]) {
        solvedMap[slug] = [];
      }
      solvedMap[slug].push(h);
    }
  });


  let easySolved = 0, easyTotal = 0;
  let mediumSolved = 0, mediumTotal = 0;
  let hardSolved = 0, hardTotal = 0;
  let attemptingCount = 0;

  allProblems.forEach(p => {
    totalProblems++;
    const slug = p.slug.trim().toLowerCase();
    const solves = solvedMap[slug] || [];
    const isSolved = solves.length > 0;
    
    // Check if user has notes/activity but unsolved (Attempting)
    const isAttempting = history.some(h => h.slug && h.slug.trim().toLowerCase() === slug) && !isSolved;

    if (isSolved) completedProblems++;
    if (isAttempting) attemptingCount++;

    const diff = (p.difficulty || "Medium").toLowerCase();
    if (diff === "easy") {
      easyTotal++;
      if (isSolved) easySolved++;
    } else if (diff === "hard") {
      hardTotal++;
      if (isSolved) hardSolved++;
    } else {
      mediumTotal++;
      if (isSolved) mediumSolved++;
    }
  });

  updateProgressWidget(completedProblems, totalProblems, easySolved, easyTotal, mediumSolved, mediumTotal, hardSolved, hardTotal, attemptingCount);

  // Populate dynamic advanced filter option lists
  populateDynamicFilterDropdowns(sheetData, history);

  // Dynamic Topic Pills
  populateTopicPills(sheetData, solvedMap);

  // Render main content list/group view style
  renderSheetsListOrGroup(sheetData, solvedMap);

  // Render Left My Lists Sidebar
  renderMyListsSidebar();
}

// Populate dropdown options for advanced filters dynamically
// Helper to build a searchable, customizable multiselect list with "Add Custom" option
function bindMultiselectSearch(type, optionsContainer, items) {
  // Clear container
  optionsContainer.innerHTML = "";

  // Add search/custom input
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "multiselect-search-input";
  searchInput.placeholder = "Search or type custom...";
  searchInput.style = "width: calc(100% - 8px); margin: 4px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--clr-border); border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 11px; outline: none; box-sizing: border-box;";
  optionsContainer.appendChild(searchInput);

  // Add checklist wrapper
  const listWrapper = document.createElement("div");
  listWrapper.className = "multiselect-checkbox-list";
  listWrapper.style = "display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; padding: 4px;";
  optionsContainer.appendChild(listWrapper);

  const checkedVals = activeFilters[type].vals || [];

  const renderList = (filterText = "") => {
    listWrapper.innerHTML = "";
    const normFilter = filterText.trim().toLowerCase();

    // 1. If filterText is typed and does not match any existing item, show "Add custom" checkbox
    if (normFilter !== "") {
      const exactMatch = items.some(item => item.toLowerCase() === normFilter);
      if (!exactMatch) {
        const isChecked = checkedVals.includes(normFilter);
        const addRow = document.createElement("label");
        addRow.className = "multiselect-option-row custom-add-row";
        addRow.style = "color: var(--clr-primary); font-weight: 700;";
        addRow.innerHTML = `
          <input type="checkbox" value="${normFilter}" ${isChecked ? "checked" : ""}>
          <span>Add "${filterText.trim()}"</span>
        `;
        listWrapper.appendChild(addRow);
      }
    }

    // 2. Render items matching query
    items.forEach(item => {
      const normItem = item.toLowerCase();
      if (normFilter !== "" && !normItem.includes(normFilter)) return; // skip unmatched

      const isChecked = checkedVals.includes(normItem);
      const label = document.createElement("label");
      label.className = "multiselect-option-row";
      label.innerHTML = `
        <input type="checkbox" value="${normItem}" ${isChecked ? "checked" : ""}>
        <span>${item}</span>
      `;
      listWrapper.appendChild(label);
    });

    // 3. Keep other checked custom values checked so they don't get lost
    checkedVals.forEach(val => {
      const isCustomValue = !items.some(item => item.toLowerCase() === val) && val !== normFilter;
      if (isCustomValue) {
        const label = document.createElement("label");
        label.className = "multiselect-option-row";
        label.innerHTML = `
          <input type="checkbox" value="${val}" checked>
          <span>${val} (custom)</span>
        `;
        listWrapper.appendChild(label);
      }
    });
  };

  renderList();

  searchInput.addEventListener("input", (e) => {
    renderList(e.target.value);
  });
  
  // Prevent click inside input from closing the filter panel
  searchInput.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

// Populate dropdown options for advanced filters dynamically
async function populateDynamicFilterDropdowns(sheetData, history) {
  // 1. Populate dynamic Topics list by merging sheet topics and FIXED_TOPICS
  const topicOptionsContainer = document.getElementById("filterOptionsTopic");
  if (topicOptionsContainer) {
    const sheetTopics = Object.keys(sheetData).map(t => cleanDisplayName(t));
    const combinedTopicsSet = new Set();
    
    // Add sheet topics first
    sheetTopics.forEach(t => combinedTopicsSet.add(t));
    
    // Add fixed topics while preventing duplicates (case-insensitive check)
    FIXED_TOPICS.forEach(t => {
      const exists = Array.from(combinedTopicsSet).some(existing => existing.toLowerCase() === t.toLowerCase());
      if (!exists) {
        combinedTopicsSet.add(t);
      }
    });

    const sortedTopics = Array.from(combinedTopicsSet).sort();
    bindMultiselectSearch("topic", topicOptionsContainer, sortedTopics);
  }

  // 2. Populate dynamic Patterns list (dependency filter: if topics selected, show related patterns)
  const patternOptionsContainer = document.getElementById("filterOptionsPattern");
  if (patternOptionsContainer) {
    const selectedTopics = activeFilters.topic.vals || [];
    const patterns = new Set();
    
    if (selectedTopics.length > 0) {
      selectedTopics.forEach(topic => {
        const normTopic = topic.toLowerCase().replace(/[^a-z0-9]/g, "");
        
        // Find matching keys in DASHBOARD_TOPIC_PATTERNS (fuzzy substring matching)
        Object.keys(DASHBOARD_TOPIC_PATTERNS).forEach(key => {
          const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normKey.includes(normTopic) || normTopic.includes(normKey)) {
            DASHBOARD_TOPIC_PATTERNS[key].forEach(p => patterns.add(p));
          }
        });

        // Also scan history solves that match selected topics for custom patterns
        history.forEach(h => {
          let problemTopic = "";
          for (const [tName, subtopics] of Object.entries(sheetData)) {
            for (const [subtopicName, subproblems] of Object.entries(subtopics)) {
              if (subproblems.some(p => p.slug === h.slug)) {
                problemTopic = tName.toLowerCase().replace(/[^a-z0-9]/g, "");
                break;
              }
            }
            if (problemTopic) break;
          }

          if (problemTopic && (problemTopic.includes(normTopic) || normTopic.includes(problemTopic)) && h.pattern && h.pattern !== "None") {
            patterns.add(h.pattern);
          }
        });
      });
    } else {
      // Show all static patterns
      Object.values(DASHBOARD_TOPIC_PATTERNS).forEach(pats => {
        pats.forEach(p => patterns.add(p));
      });
      // Show all history patterns
      history.forEach(h => {
        if (h.pattern && h.pattern !== "None") {
          patterns.add(h.pattern);
        }
      });
    }

    const sortedPatterns = Array.from(patterns).sort();
    bindMultiselectSearch("pattern", patternOptionsContainer, sortedPatterns);
  }

  // 3. Populate dynamic Collections list
  const collectionOptionsContainer = document.getElementById("filterOptionsCollection");
  if (collectionOptionsContainer) {
    const collections = new Set();
    history.forEach(h => {
      if (h.collection && h.collection !== "None" && h.collection.trim() !== "") {
        collections.add(h.collection);
      }
    });

    const sortedCollections = Array.from(collections).sort();
    bindMultiselectSearch("collection", collectionOptionsContainer, sortedCollections);
  }

  // 4. Populate dynamic Lists list
  const listOptionsContainer = document.getElementById("filterOptionsList");
  if (listOptionsContainer) {
    const stored = await chrome.storage.local.get("customStarredLists");
    const customLists = stored.customStarredLists || [];
    const allLists = ["Favorite", "Revision", ...customLists];
    bindMultiselectSearch("list", listOptionsContainer, allLists);
  }
}

// Dynamic Topic Pills generator
function populateTopicPills(sheetData, solvedMap) {
  const pillsContainer = el.sheetTopicPills;
  if (!pillsContainer) return;

  const selectedSheetName = el.sheetSelect.value;
  if (selectedSheetName === "all_imported_sheets") {
    pillsContainer.style.display = "none";
    return;
  }
  pillsContainer.style.display = "flex";

  // Calculate totals and completed for each topic under other filters
  const topicCounts = {};
  let allTotal = 0;
  let allCompleted = 0;

  // Temporarily backup and disable active topic filter so other pills calculate counts correctly
  const savedTopicFilter = activeFilters.topic.vals;
  activeFilters.topic.vals = [];

  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    topicCounts[topicName] = { completed: 0, total: 0 };
    const topicProblems = [];
    for (const [subtopicName, problems] of Object.entries(subtopics)) {
      problems.forEach(p => {
        topicProblems.push({ ...p, topicName, subtopicName });
      });
    }

    const filtered = filterSheetProblems(topicProblems, solvedMap);
    filtered.forEach(p => {
      topicCounts[topicName].total++;
      const isSolved = (solvedMap[p.slug] || []).length > 0;
      if (isSolved) {
        topicCounts[topicName].completed++;
      }
    });
  }

  // Restore active topic filter
  activeFilters.topic.vals = savedTopicFilter;

  // Recalculate 'All' total and completed under FULL active filters
  const allProblems = [];
  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    for (const [subtopicName, subproblems] of Object.entries(subtopics)) {
      subproblems.forEach(p => {
        allProblems.push({ ...p, topicName, subtopicName });
      });
    }
  }
  const filteredAll = filterSheetProblems(allProblems, solvedMap);
  filteredAll.forEach(p => {
    allTotal++;
    const isSolved = (solvedMap[p.slug] || []).length > 0;
    if (isSolved) allCompleted++;
  });

  // Clear container
  pillsContainer.innerHTML = "";

  // Add "All" Pill
  const allPill = document.createElement("button");
  allPill.className = "sheet-topic-pill" + (selectedTopicPill === "all" ? " active" : "");
  allPill.innerHTML = `All <span class="pill-count">${allCompleted}/${allTotal}</span>`;
  allPill.addEventListener("click", () => {
    selectedTopicPill = "all";
    pillsContainer.querySelectorAll(".sheet-topic-pill").forEach(p => p.classList.remove("active"));
    allPill.classList.add("active");
    renderSheetsListOrGroup(sheetData, solvedMap);
  });
  pillsContainer.appendChild(allPill);

  // Add dynamic topic pills
  for (const [topicName, counts] of Object.entries(topicCounts)) {
    const pill = document.createElement("button");
    pill.className = "sheet-topic-pill" + (selectedTopicPill === topicName ? " active" : "");
    pill.innerHTML = `${cleanDisplayName(topicName)} <span class="pill-count">${counts.completed}/${counts.total}</span>`;
    pill.addEventListener("click", () => {
      selectedTopicPill = topicName;
      pillsContainer.querySelectorAll(".sheet-topic-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      renderSheetsListOrGroup(sheetData, solvedMap);
    });
    pillsContainer.appendChild(pill);
  }
}

function renderSheetsListOrGroup(sheetData, solvedMap) {
  const selectedSheetName = el.sheetSelect.value;
  if (selectedSheetName === "all_imported_sheets") {
    renderAllSheetsCombinedView(sheetData, solvedMap);
    return;
  }

  if (sheetViewMode === "list") {
    renderFlatTableView(sheetData, solvedMap);
  } else {
    renderAccordionGroupView(sheetData, solvedMap);
  }
}

function renderAllSheetsCombinedView(sheetData, solvedMap) {
  const container = el.sheetAccordionContainer;
  if (!container) return;
  container.innerHTML = "";

  // Gather all problems
  const allProblems = [];
  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    for (const [subtopicName, subproblems] of Object.entries(subtopics)) {
      subproblems.forEach(p => {
        allProblems.push({ ...p, topicName });
      });
    }
  }

  const filtered = filterSheetProblems(allProblems, solvedMap);
  const sorted = sortProblems(filtered, solvedMap);
  
  if (sorted.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.style = "text-align: center; padding: 48px; color: var(--clr-muted); font-weight: 700; border: 1px dashed var(--clr-border); border-radius: var(--radius); background: rgba(255,255,255,0.01); margin-top: 12px;";
    emptyDiv.textContent = "No problems match your active search/filters!";
    container.appendChild(emptyDiv);
    return;
  }

  // Render combined table directly
  const table = document.createElement("table");
  table.className = "sheets-problems-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.marginBottom = "24px";
  table.style.marginTop = "12px";
  
  renderTableHead(table);

  const tbody = document.createElement("tbody");
  sorted.forEach(problem => {
    const tr = createProblemRow(problem, solvedMap, true);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

// Flat List Table representation (similar to neetcode list view)
function renderFlatTableView(sheetData, solvedMap) {
  const container = el.sheetAccordionContainer;
  if (!container) return;
  container.innerHTML = "";

  let totalRendered = 0;

  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    if (selectedTopicPill !== "all" && topicName !== selectedTopicPill) continue;

    // Gather all problems under this topic across all its subtopics
    const topicProblems = [];
    for (const [subtopicName, subproblems] of Object.entries(subtopics)) {
      subproblems.forEach(p => {
        topicProblems.push({ ...p, topicName });
      });
    }

    const filtered = filterSheetProblems(topicProblems, solvedMap);
    const sorted = sortProblems(filtered, solvedMap);
    if (sorted.length === 0) continue;

    totalRendered += sorted.length;

    // Render Topic Header
    const titleWrapper = document.createElement("div");
    titleWrapper.className = "sheet-view-title-container";
    titleWrapper.style.display = "flex";
    titleWrapper.style.justifyContent = "center";
    titleWrapper.style.marginTop = "28px";
    titleWrapper.style.marginBottom = "14px";
    titleWrapper.innerHTML = `<h3 class="sheet-view-title" style="font-size: 16px; font-weight: 800; color: var(--clr-primary); text-transform: uppercase; letter-spacing: 1px;">${cleanDisplayName(topicName)}</h3>`;
    container.appendChild(titleWrapper);

    // Render Table
    const table = document.createElement("table");
    table.className = "sheets-problems-table";
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.marginBottom = "24px";
    
    renderTableHead(table);

    const tbody = document.createElement("tbody");
    sorted.forEach(problem => {
      const tr = createProblemRow(problem, solvedMap, true);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  if (totalRendered === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.style = "text-align: center; padding: 48px; color: var(--clr-muted); font-weight: 700; border: 1px dashed var(--clr-border); border-radius: var(--radius); background: rgba(255,255,255,0.01); margin-top: 12px;";
    emptyDiv.textContent = "No problems match your active search/filters!";
    container.appendChild(emptyDiv);
  }
}

// Accordion (Topic Accordion) representation
function renderAccordionGroupView(sheetData, solvedMap) {
  const container = el.sheetAccordionContainer;
  if (!container) return;

  const openTopics = new Set();
  const openSubtopics = new Set();
  container.querySelectorAll(".sheet-topic-accordion.open").forEach(acc => {
    const name = acc.getAttribute("data-topic-name");
    if (name) openTopics.add(name);
  });
  container.querySelectorAll(".sheet-subtopic-section").forEach(sec => {
    const content = sec.querySelector(".sheet-subtopic-content");
    if (content && content.style.display === "flex") {
      const key = sec.getAttribute("data-subtopic-key");
      if (key) openSubtopics.add(key);
    }
  });

  container.innerHTML = "";

  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    // If topic pill selected, skip others
    if (selectedTopicPill !== "all" && topicName !== selectedTopicPill) continue;

    // Filter problems and count matches first to check if we should render this accordion
    let topicTotal = 0;
    let topicCompleted = 0;
    let hasVisibleProblems = false;

    const subtopicContainer = document.createElement("div");
    subtopicContainer.className = "sheet-topic-content";
    subtopicContainer.style.display = "none";
    subtopicContainer.style.flexDirection = "column";
    subtopicContainer.style.gap = "10px";
    subtopicContainer.style.padding = "16px";
    subtopicContainer.style.backgroundColor = "var(--clr-surface)";
    subtopicContainer.style.border = "1px solid var(--clr-border)";
    subtopicContainer.style.borderTop = "0";
    subtopicContainer.style.borderBottomLeftRadius = "var(--radius)";
    subtopicContainer.style.borderBottomRightRadius = "var(--radius)";

    const subkeys = Object.keys(subtopics);
    const isSingleGeneral = subkeys.length === 1 && 
      (subkeys[0].toLowerCase().includes("general") || 
       subkeys[0].toLowerCase().includes("imported list") || 
       subkeys[0].toLowerCase().includes("problems") || 
       cleanDisplayName(subkeys[0]).trim() === "");

    if (isSingleGeneral) {
      const rawProblems = subtopics[subkeys[0]];
      const problems = rawProblems.map(p => ({ ...p, topicName, subtopicName: subkeys[0] }));
      
      // Filter determines visibility but total count uses ALL problems
      const filteredProblems = filterSheetProblems(problems, solvedMap);
      if (filteredProblems.length > 0 || !sheetSearchQuery && !Object.values(activeFilters).some(f => f.vals && f.vals.length > 0)) {
        hasVisibleProblems = true;
      }
      if (filteredProblems.length > 0) hasVisibleProblems = true;

      // Count total/completed using ALL problems (unfiltered)
      topicTotal = problems.length;
      topicCompleted = problems.filter(p => (solvedMap[p.slug] || []).length > 0).length;

      const table = document.createElement("table");
      table.className = "sheets-problems-table";
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      
      renderTableHead(table);
      
      const tbody = document.createElement("tbody");
      const visibleProblems = problems.filter(p => filteredProblems.includes(p));
      const hiddenProblems = problems.filter(p => !filteredProblems.includes(p));
      const sortedVisible = sortProblems(visibleProblems, solvedMap);

      sortedVisible.forEach(problem => {
        const tr = createProblemRow(problem, solvedMap, true);
        tbody.appendChild(tr);
      });
      hiddenProblems.forEach(problem => {
        const tr = createProblemRow(problem, solvedMap, false);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      subtopicContainer.appendChild(table);
    } else {
      for (const [subtopicName, rawProblems] of Object.entries(subtopics)) {
        const problems = rawProblems.map(p => ({ ...p, topicName, subtopicName }));
        const filteredProblems = filterSheetProblems(problems, solvedMap);
        if (filteredProblems.length > 0) hasVisibleProblems = true;

        // Count total/completed using ALL problems (unfiltered) for correct X/Y display
        topicTotal += problems.length;
        topicCompleted += problems.filter(p => (solvedMap[p.slug] || []).length > 0).length;

        const subtopicSection = document.createElement("div");
        subtopicSection.className = "sheet-subtopic-section";
        subtopicSection.setAttribute("data-subtopic-key", `${topicName}::${subtopicName}`);
        subtopicSection.style.borderLeft = "3px solid var(--clr-primary)";
        subtopicSection.style.paddingLeft = "12px";
        subtopicSection.style.marginTop = "8px";
        subtopicSection.style.marginBottom = "8px";

        // Hide subtopic accordion if it has no visible problems matching active filters
        if (filteredProblems.length === 0) {
          subtopicSection.style.display = "none";
        }

        const hasActiveFilters = sheetSearchQuery || 
          ["difficulty", "status", "topic", "pattern", "collection", "list"].some(t => activeFilters[t].vals && activeFilters[t].vals.length > 0);
        const isSubExp = openSubtopics.has(`${topicName}::${subtopicName}`) || (hasActiveFilters && filteredProblems.length > 0);

        const subtopicHeader = document.createElement("div");
        subtopicHeader.className = "sheet-subtopic-header";
        subtopicHeader.style.display = "flex";
        subtopicHeader.style.justifyContent = "space-between";
        subtopicHeader.style.alignItems = "center";
        subtopicHeader.style.padding = "8px 12px";
        subtopicHeader.style.backgroundColor = isSubExp ? "rgba(56, 189, 248, 0.02)" : "rgba(255, 255, 255, 0.01)";
        subtopicHeader.style.border = isSubExp ? "1px solid var(--clr-primary)" : "1px solid var(--clr-border)";
        subtopicHeader.style.borderRadius = "var(--radius)";
        subtopicHeader.style.cursor = "pointer";
        subtopicHeader.style.userSelect = "none";
        subtopicHeader.style.transition = "var(--transition)";
        
        const subtopicContent = document.createElement("div");
        subtopicContent.className = "sheet-subtopic-content";
        subtopicContent.style.display = isSubExp ? "flex" : "none";
        subtopicContent.style.flexDirection = "column";
        subtopicContent.style.width = "100%";
        subtopicContent.style.marginTop = "8px";
        subtopicContent.style.padding = "0 8px";

        subtopicHeader.addEventListener("mouseover", () => {
          subtopicHeader.style.borderColor = "var(--clr-primary)";
          subtopicHeader.style.backgroundColor = "rgba(56, 189, 248, 0.02)";
        });
        subtopicHeader.addEventListener("mouseout", () => {
          const isExp = subtopicContent.style.display === "flex";
          subtopicHeader.style.borderColor = isExp ? "var(--clr-primary)" : "var(--clr-border)";
          subtopicHeader.style.backgroundColor = isExp ? "rgba(56, 189, 248, 0.02)" : "rgba(255, 255, 255, 0.01)";
        });
        
        let subtopicTotal = problems.length;
        let subtopicCompleted = problems.filter(p => (solvedMap[p.slug] || []).length > 0).length;

        const table = document.createElement("table");
        table.className = "sheets-problems-table";
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";
        
        renderTableHead(table);
        
        const tbody = document.createElement("tbody");
        const visibleProblems = problems.filter(p => filteredProblems.includes(p));
        const hiddenProblems = problems.filter(p => !filteredProblems.includes(p));
        const sortedVisible = sortProblems(visibleProblems, solvedMap);
        
        // Render sorted visible problems first, then hidden ones
        sortedVisible.forEach(problem => {
          const tr = createProblemRow(problem, solvedMap, true);
          tbody.appendChild(tr);
        });
        hiddenProblems.forEach(problem => {
          const tr = createProblemRow(problem, solvedMap, false);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);

        subtopicHeader.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="sheet-subtopic-arrow" style="font-size:9px; transition:transform 0.2s ease; color:var(--clr-muted);${isSubExp ? " transform: rotate(90deg);" : ""}">▶</span>
            <span style="font-weight:700; font-size:12.5px; color:var(--clr-primary);">📂 ${cleanDisplayName(subtopicName)}</span>
          </div>
          <span class="sheet-subtopic-progress" style="font-size:11.5px; color:var(--clr-muted); font-weight:700;">${subtopicCompleted}/${subtopicTotal}</span>
        `;
        
        subtopicHeader.addEventListener("click", () => {
          const isExp = subtopicContent.style.display === "flex";
          const arrow = subtopicHeader.querySelector(".sheet-subtopic-arrow");
          if (isExp) {
            subtopicContent.style.display = "none";
            subtopicHeader.style.borderColor = "var(--clr-border)";
            subtopicHeader.style.backgroundColor = "rgba(255, 255, 255, 0.01)";
            if (arrow) arrow.style.transform = "rotate(0deg)";
          } else {
            subtopicContent.style.display = "flex";
            subtopicHeader.style.borderColor = "var(--clr-primary)";
            subtopicHeader.style.backgroundColor = "rgba(56, 189, 248, 0.02)";
            if (arrow) arrow.style.transform = "rotate(90deg)";
          }
        });

        subtopicSection.appendChild(subtopicHeader);
        subtopicContent.appendChild(table);
        subtopicSection.appendChild(subtopicContent);
        subtopicContainer.appendChild(subtopicSection);
      }
    }

    // Hide accordion card if no problems matched query
    if (!hasVisibleProblems) continue;

    const hasActiveFilters = sheetSearchQuery || 
      ["difficulty", "status", "topic", "pattern", "collection", "list"].some(t => activeFilters[t].vals && activeFilters[t].vals.length > 0);

    const isExp = openTopics.has(topicName) || (hasActiveFilters && hasVisibleProblems);

    const topicAccordion = document.createElement("div");
    topicAccordion.className = "sheet-topic-accordion" + (isExp ? " open" : "");
    topicAccordion.setAttribute("data-topic-name", topicName);
    topicAccordion.style.marginBottom = "10px";

    const header = document.createElement("div");
    header.className = "sheet-topic-header";
    header.style = "padding:14px 20px; display:flex; justify-content:space-between; align-items:center; background:var(--clr-surface-card); cursor:pointer; user-select:none; font-weight:800; font-size:14.5px; border-radius:var(--radius); border:1px solid var(--clr-border); transition:var(--transition);";
    if (isExp) {
      header.style.borderBottomLeftRadius = "0";
      header.style.borderBottomRightRadius = "0";
      header.style.borderColor = "var(--clr-primary)";
    }
    header.addEventListener("mouseover", () => header.style.borderColor = "var(--clr-primary)");
    header.addEventListener("mouseout", () => {
      const isExpanded = topicAccordion.classList.contains("open");
      header.style.borderColor = isExpanded ? "var(--clr-primary)" : "var(--clr-border)";
    });

    header.innerHTML = `
      <div class="sheet-topic-header-left" style="display:flex; align-items:center; gap:12px;">
        <span class="sheet-topic-arrow" style="font-size:10px; transition:transform 0.2s ease; color:var(--clr-muted);${isExp ? " transform: rotate(90deg);" : ""}">▶</span>
        <span>${cleanDisplayName(topicName)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:12px; font-weight:700; color:var(--clr-primary);">${topicCompleted}/${topicTotal}</span>
        <div style="width:120px; height:6px; background:rgba(255,255,255,0.08); border-radius:10px; overflow:hidden; position:relative;">
          <div style="width:${topicTotal > 0 ? (topicCompleted/topicTotal)*100 : 0}%; height:100%; background:var(--clr-primary); border-radius:10px; transition:width 0.3s ease;"></div>
        </div>
      </div>
    `;

    // Auto-open accordion if there is active filtering or restored state
    if (isExp) {
      subtopicContainer.style.display = "flex";
      header.style.borderBottomLeftRadius = "0";
      header.style.borderBottomRightRadius = "0";
      header.style.borderColor = "var(--clr-primary)";
    }

    header.addEventListener("click", () => {
      const isExpanded = topicAccordion.classList.toggle("open");
      const arrow = header.querySelector(".sheet-topic-arrow");
      if (isExpanded) {
        subtopicContainer.style.display = "flex";
        header.style.borderBottomLeftRadius = "0";
        header.style.borderBottomRightRadius = "0";
        header.style.borderColor = "var(--clr-primary)";
        if (arrow) arrow.style.transform = "rotate(90deg)";
      } else {
        subtopicContainer.style.display = "none";
        header.style.borderBottomLeftRadius = "var(--radius)";
        header.style.borderBottomRightRadius = "var(--radius)";
        header.style.borderColor = "var(--clr-border)";
        if (arrow) arrow.style.transform = "rotate(0deg)";
      }
    });

    topicAccordion.appendChild(header);
    topicAccordion.appendChild(subtopicContainer);
    container.appendChild(topicAccordion);
  }
}

// Dynamic Problem row generator
function createProblemRow(problem, solvedMap, isVisible) {
  const LEETCODE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" id="leetcode" style="vertical-align: middle;">
  <path fill="#B3B1B0" d="M22 14.355c0-.742-.564-1.346-1.26-1.346H10.676c-.696 0-1.26.604-1.26 1.346s.563 1.346 1.26 1.346H20.74c.696.001 1.26-.603 1.26-1.346z"></path>
  <path fill="#E7A41F" d="m3.482 18.187 4.313 4.361c.973.979 2.318 1.452 3.803 1.452 1.485 0 2.83-.512 3.805-1.494l2.588-2.637c.51-.514.492-1.365-.039-1.9-.531-.535-1.375-.553-1.884-.039l-2.676 2.607c-.462.467-1.102.662-1.809.662s-1.346-.195-1.81-.662l-4.298-4.363c-.463-.467-.696-1.15-.696-1.863 0-.713.233-1.357.696-1.824l4.285-4.38c.463-.467 1.116-.645 1.822-.645s1.346.195 1.809.662l2.676 2.606c.51.515 1.354.497 1.885-.038.531-.536.549-1.387.039-1.901l-2.588-2.636a4.994 4.994 0 0 0-2.392-1.33l-.034-.007 2.447-2.503c.512-.514.494-1.366-.037-1.901-.531-.535-1.376-.552-1.887-.038l-10.018 10.1C2.509 11.458 2 12.813 2 14.311c0 1.498.509 2.896 1.482 3.876z"></path>
  <path fill="#070706" d="M8.115 22.814a2.109 2.109 0 0 1-.474-.361c-1.327-1.333-2.66-2.66-3.984-3.997-1.989-2.008-2.302-4.937-.786-7.32a6 6 0 0 1 .839-1.004L13.333.489c.625-.626 1.498-.652 2.079-.067.56.563.527 1.455-.078 2.066-.769.776-1.539 1.55-2.309 2.325-.041.122-.14.2-.225.287-.863.876-1.75 1.729-2.601 2.618-.111.116-.262.186-.372.305-1.423 1.423-2.863 2.83-4.266 4.272-1.135 1.167-1.097 2.938.068 4.127 1.308 1.336 2.639 2.65 3.961 3.974.067.067.136.132.204.198.468.303.474 1.25.183 1.671-.321.465-.74.75-1.333.728-.199-.006-.363-.086-.529-.179z"></path>
</svg>`;
  const GFG_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#2F8D46" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M21.45 14.315c-.143.28-.334.532-.565.745a3.691 3.691 0 0 1-1.104.695 4.51 4.51 0 0 1-3.116-.016 3.79 3.79 0 0 1-2.135-2.078 3.571 3.571 0 0 1-.13-.353h7.418a4.26 4.26 0 0 1-.368 1.008zm-11.99-.654a3.793 3.793 0 0 1-2.134 2.078 4.51 4.51 0 0 1-3.117.016 3.7 3.7 0 0 1-1.104-.695 2.652 2.652 0 0 1-.564-.745 4.221 4.221 0 0 1-.368-1.006H9.59c-.038.12-.08.238-.13.352zm14.501-1.758a3.849 3.849 0 0 0-.082-.475l-9.634-.008a3.932 3.932 0 0 1 1.143-2.348c.363-.35.79-.625 1.26-.809a3.97 3.97 0 0 1 4.484.957l1.521-1.49a5.7 5.7 0 0 0-1.922-1.357 6.283 6.283 0 0 0-2.544-.49 6.35 6.35 0 0 0-2.405.457 6.007 6.007 0 0 0-1.963 1.276 6.142 6.142 0 0 0-1.325 1.94 5.862 5.862 0 0 0-.466 1.864h-.063a5.857 5.857 0 0 0-.467-1.865 6.13 6.13 0 0 0-1.325-1.939A6 6 0 0 0 8.21 6.34a6.698 6.698 0 0 0-4.949.031A5.708 5.708 0 0 0 1.34 7.73l1.52 1.49a4.166 4.166 0 0 1 4.484-.958c.47.184.898.46 1.26.81.368.36.66.792.859 1.268.146.344.242.708.285 1.08l-9.635.008A4.714 4.714 0 0 0 0 12.457a6.493 6.493 0 0 0 .345 2.127 4.927 4.927 0 0 0 1.08 1.783c.528.56 1.17 1 1.88 1.293a6.454 6.454 0 0 0 2.504.457c.824.005 1.64-.15 2.404-.457a5.986 5.986 0 0 0 1.964-1.277 6.116 6.116 0 0 0 1.686-3.076h.273a6.13 6.13 0 0 0 1.686 3.077 5.99 5.99 0 0 0 1.964 1.276 6.345 6.345 0 0 0 2.405.457 6.45 6.45 0 0 0 2.502-.457 5.42 5.42 0 0 0 1.882-1.293 4.928 4.928 0 0 0 1.08-1.783A6.52 6.52 0 0 0 24 12.457a4.757 4.757 0 0 0-.039-.554z"/></svg>`;
  const STRIVER_SVG = `<img src="tuf.jpg" width="18" height="18" style="vertical-align: middle; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.15);" />`;
  const GITHUB_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;

  const slug = problem.slug.trim().toLowerCase();
  const solves = solvedMap[slug] || [];
  const isCompleted = solves.length > 0;
  const hasNotes = solves.some(s => s.notes && s.notes.trim() !== "");
  const isBookmarked = solves.some(s => s.isFavorite);
  const githubUrl = solves.find(s => s.githubUrl)?.githubUrl || "";
  const diffLower = (problem.difficulty || "medium").toLowerCase();

  const tr = document.createElement("tr");
  tr.className = "sheet-problem-row" + (isCompleted ? " completed" : "") + (isVisible ? "" : " hidden");
  tr.style.transition = "var(--transition)";

  // Column 1: Status Checkbox
  const tdCheck = document.createElement("td");
  tdCheck.style.textAlign = "center";
  tdCheck.style.width = "60px";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "sheet-checkbox-input";
  checkbox.checked = isCompleted;
  checkbox.style.cursor = "pointer";
  checkbox.addEventListener("change", async (e) => {
    e.stopPropagation();
    await toggleProblemCompletion(problem, checkbox.checked);
    renderSheets();
    renderOverview();
  });
  tdCheck.appendChild(checkbox);
  tr.appendChild(tdCheck);

  // Column 2: Star Bookmark
  const tdRevision = document.createElement("td");
  tdRevision.style.textAlign = "center";
  tdRevision.style.width = "60px";
  const starBtn = document.createElement("button");
  starBtn.type = "button";
  starBtn.className = "btn-ico" + (isBookmarked ? " active-star" : "");
  starBtn.title = isBookmarked ? "Unstar Problem" : "Star for Revision";
  starBtn.textContent = isBookmarked ? "⭐" : "☆";
  starBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openStarPopover(problem, starBtn, solvedMap);
  });
  tdRevision.appendChild(starBtn);
  tr.appendChild(tdRevision);

  // Column 3: Problem Link
  const tdTitle = document.createElement("td");
  const link = document.createElement("a");
  link.href = problem.leetcodeUrl || "#";
  link.target = "_blank";
  link.className = "sheet-problem-link";
  link.style = "color:var(--clr-text); font-weight:700; text-decoration:none; font-size:13.5px;";
  if (isCompleted) {
    link.style.textDecoration = "line-through";
    link.style.color = "var(--clr-muted)";
  }
  link.textContent = problem.title;
  const extIcon = document.createElement("span");
  extIcon.style = "font-size: 11px; margin-left: 5px; opacity: 0.4;";
  extIcon.textContent = "↗";
  link.appendChild(extIcon);
  link.addEventListener("mouseover", () => link.style.textDecoration = "underline");
  link.addEventListener("mouseout", () => {
    link.style.textDecoration = isCompleted ? "line-through" : "none";
  });
  tdTitle.appendChild(link);

  // Cross-sheet / sheet membership badges
  const selectedSheet = el.sheetSelect?.value;
  const isAllCombined = selectedSheet === "all_imported_sheets";

  if (isAllCombined && problem.sheetsIn && problem.sheetsIn.length > 0) {
    // Use sheetsIn[] attached by getCombinedSheetsData — works for unique AND multi-sheet problems
    const sheetsIn = problem.sheetsIn;
    const badgeWrap = document.createElement("div");
    badgeWrap.style.cssText = "display:flex; flex-wrap:wrap; gap:3px; margin-top:3px;";

    if (sheetsIn.length === 1) {
      // Unique problem — show the sheet name as a tag
      const tag = document.createElement("span");
      tag.style.cssText = "font-size:9.5px; padding:1px 6px; border-radius:8px; background:rgba(99,102,241,0.15); color:#a5b4fc; font-weight:600; white-space:nowrap;";
      tag.textContent = sheetsIn[0];
      tag.title = `Only in: ${sheetsIn[0]}`;
      badgeWrap.appendChild(tag);
    } else {
      // Multiple sheets — show count badge with tooltip
      const badge = document.createElement("span");
      badge.className = "cross-sheet-badge";
      badge.textContent = `📂 ${sheetsIn.length} Sheets`;
      badge.title = `Appears in:\n${sheetsIn.map(n => `• ${n}`).join("\n")}`;
      badgeWrap.appendChild(badge);
    }
    tdTitle.appendChild(badgeWrap);
  } else if (!isAllCombined && currentCrossSheetMap && slug && currentCrossSheetMap[slug]) {
    // Normal sheet view — show frequency badge for problems in multiple sheets
    const listNames = currentCrossSheetMap[slug];
    if (listNames.length > 1) {
      const badge = document.createElement("span");
      badge.className = "cross-sheet-badge";
      badge.textContent = `📂 ${listNames.length} Sheets`;
      badge.title = `Appears in:\n${listNames.map(name => `• ${name}`).join("\n")}`;
      tdTitle.appendChild(badge);
    }
  }

  tr.appendChild(tdTitle);

  // Column 4: Practice Icon
  const tdPractice = document.createElement("td");
  tdPractice.style.textAlign = "center";
  tdPractice.style.width = "100px";
  const platLink = document.createElement("a");
  platLink.href = problem.leetcodeUrl || "#";
  platLink.target = "_blank";
  platLink.style = "display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease;";
  platLink.addEventListener("mouseover", () => platLink.style.transform = "scale(1.15)");
  platLink.addEventListener("mouseout", () => platLink.style.transform = "scale(1)");
  const destUrl = (problem.leetcodeUrl || "").toLowerCase();
  const isStriver = destUrl.includes("takeuforward.org");
  const isGFG = destUrl.includes("geeksforgeeks.org");
  if (isStriver) {
    platLink.innerHTML = STRIVER_SVG;
  } else if (isGFG) {
    platLink.innerHTML = GFG_SVG;
  } else {
    platLink.innerHTML = LEETCODE_SVG;
  }
  tdPractice.appendChild(platLink);
  tr.appendChild(tdPractice);

  // Column 5: Notes Button
  const tdNotes = document.createElement("td");
  tdNotes.style.textAlign = "center";
  tdNotes.style.width = "100px";
  const noteBtn = document.createElement("button");
  noteBtn.type = "button";
  noteBtn.className = "btn-ico" + (hasNotes ? " active-note" : "");
  noteBtn.title = hasNotes ? "Edit Notes" : "Add Notes";
  noteBtn.textContent = "📝";
  noteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const representativeEntry = solves.find(s => s.notes && s.notes.trim() !== "") || solves[0] || {
      slug: slug,
      title: problem.title,
      id: el.sheetSelect.value === "striver_a2z_sheet" ? "" : "0",
      approach: "oa",
      language: "python",
      notes: "",
      readmePath: ""
    };
    openNotesModal(representativeEntry, "Optimal");
  });
  tdNotes.appendChild(noteBtn);
  tr.appendChild(tdNotes);

  // Column 6: GitHub Icon
  const tdGitHub = document.createElement("td");
  tdGitHub.style.textAlign = "center";
  tdGitHub.style.width = "100px";
  if (isCompleted && githubUrl) {
    const ghLink = document.createElement("a");
    ghLink.href = githubUrl;
    ghLink.target = "_blank";
    ghLink.style = "display: inline-flex; align-items: center; justify-content: center; cursor: pointer; color: var(--clr-easy); transition: transform 0.2s ease;";
    ghLink.title = "View solution on GitHub";
    ghLink.innerHTML = GITHUB_SVG;
    ghLink.addEventListener("mouseover", () => ghLink.style.transform = "scale(1.15)");
    ghLink.addEventListener("mouseout", () => ghLink.style.transform = "scale(1)");
    tdGitHub.appendChild(ghLink);
  } else {
    const disabledGh = document.createElement("span");
    disabledGh.style = "display: inline-flex; align-items: center; justify-content: center; opacity: 0.15; color: var(--clr-muted); cursor: not-allowed;";
    disabledGh.innerHTML = GITHUB_SVG;
    tdGitHub.appendChild(disabledGh);
  }
  tr.appendChild(tdGitHub);

  // Column 7: Difficulty Badge
  const tdDiff = document.createElement("td");
  tdDiff.className = "sheet-col-diff";
  tdDiff.style.textAlign = "right";
  tdDiff.style.width = "120px";
  const diffSpan = document.createElement("span");
  diffSpan.className = `diff-badge ${diffLower}`;
  diffSpan.textContent = problem.difficulty || "Medium";
  tdDiff.appendChild(diffSpan);
  tr.appendChild(tdDiff);

  return tr;
}

// Sheet problem filter logic using advanced filter rows
function filterSheetProblems(problems, solvedMap, overrideFilters) {
  const targetFilters = overrideFilters || activeFilters;
  return problems.filter(problem => {
    const slug = problem.slug;
    const solves = solvedMap[slug] || [];
    const isCompleted = solves.length > 0;
    const isBookmarked = solves.some(s => s.isFavorite);

    // Search query match
    if (sheetSearchQuery && !problem.title.toLowerCase().includes(sheetSearchQuery)) {
      return false;
    }

    // Determine active filter rules
    const filterRules = [];
    const filterTypes = ["difficulty", "status", "topic", "pattern", "collection", "list"];

    filterTypes.forEach(type => {
      const { op, vals } = targetFilters[type];
      if (!vals || vals.length === 0) return; // skip inactive filter

      let ruleMatches = false;
      if (type === "difficulty") {
        const diffLower = (problem.difficulty || "medium").toLowerCase();
        ruleMatches = vals.includes(diffLower);
      } else if (type === "status") {
        ruleMatches = vals.some(val => {
          if (val === "solved") return isCompleted;
          if (val === "unsolved") return !isCompleted;
          if (val === "starred") return isBookmarked;
          return false;
        });
      } else if (type === "topic") {
        ruleMatches = vals.some(val => {
          const normProblemTopic = (problem.topicName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const normVal = val.toLowerCase().replace(/[^a-z0-9]/g, "");
          
          const cleanDisplayNameProblem = cleanDisplayName(problem.topicName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          
          return normProblemTopic.includes(normVal) || normVal.includes(normProblemTopic) ||
                 cleanDisplayNameProblem.includes(normVal) || normVal.includes(cleanDisplayNameProblem);
        });
      } else if (type === "pattern") {
        ruleMatches = solves.some(s => s.pattern && vals.includes(s.pattern.toLowerCase()));
      } else if (type === "collection") {
        ruleMatches = solves.some(s => s.collection && vals.includes(s.collection.toLowerCase()));
      } else if (type === "list") {
        ruleMatches = vals.some(val => {
          const lowerVal = val.toLowerCase();
          return solves.some(s => {
            if (lowerVal === "favorite") {
              return (s.starredLists && s.starredLists.map(l => l.toLowerCase()).includes("favorite")) || !!s.isFavorite;
            }
            return s.starredLists && s.starredLists.map(l => l.toLowerCase()).includes(lowerVal);
          });
        });
      }

      if (op === "is_not") {
        ruleMatches = !ruleMatches;
      }

      filterRules.push(ruleMatches);
    });

    if (filterRules.length === 0) return true; // No active filters

    if (activeFilters.matchMode === "any") {
      return filterRules.some(r => r === true);
    } else {
      return filterRules.every(r => r === true);
    }
  });
}

// Get all problems list
async function getActiveSheetProblems() {
  const selectedSheetName = el.sheetSelect.value;
  if (!selectedSheetName) return [];
  
  const sheetData = await loadSheet(selectedSheetName);
  
  const problems = [];
  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    for (const [subtopicName, subproblems] of Object.entries(subtopics)) {
      subproblems.forEach(p => {
        problems.push({ ...p, topicName, subtopicName });
      });
    }
  }
  return problems;
}

// Pick a random problem matching filters
async function pickRandomProblem() {
  const problems = await getActiveSheetProblems();
  if (problems.length === 0) {
    alert("No problems found in the active sheet!");
    return;
  }
  
  // Fetch solves history
  const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = storedHistory[STORAGE_KEYS.history] || [];
  const solvedMap = {};
  history.forEach(h => {
    if (h.slug) {
      let slug = h.slug.trim().toLowerCase();
      const url = h.url || "";
      if (url.includes("geeksforgeeks.org") || (url === "" && slug.match(/-\d{5,}$/))) {
        slug = slug.replace(/-[0-9]+$/, "");
      }
      if (!solvedMap[slug]) solvedMap[slug] = [];
      solvedMap[slug].push(h);
    }
  });
  
  // Match topic pill filter first
  let filtered = problems.filter(p => {
    if (selectedTopicPill !== "all" && p.topicName !== selectedTopicPill) return false;
    return true;
  });

  // Apply search query and advanced filters
  filtered = filterSheetProblems(filtered, solvedMap);
  
  if (filtered.length === 0) {
    alert("No problems matching your active filters were found!");
    return;
  }
  
  const randomProblem = filtered[Math.floor(Math.random() * filtered.length)];
  const practiceUrl = randomProblem.leetcodeUrl || `https://leetcode.com/problems/${randomProblem.slug}/`;
  window.open(practiceUrl, "_blank");
}


// Reset sheet checkmarks and database states
async function resetSheetProgress() {
  const problems = await getActiveSheetProblems();
  if (problems.length === 0) return;
  
  const sheetSlugs = new Set(
    problems
      .map(p => normalizeProblemSlug(p.slug, p.leetcodeUrl || p.url))
      .filter(Boolean)
  );
  
  // Fetch solves history
  const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = storedHistory[STORAGE_KEYS.history] || [];
  
  const historyMatches = history.filter(h => sheetSlugs.has(normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl)));
  const solvedCount = new Set(historyMatches.map(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl))).size;
  if (solvedCount === 0) {
    alert("No progress to reset!");
    return;
  }

  const userConfirm = confirm(`This will delete progress of ${solvedCount} solved problems in this sheet. Are you absolutely sure?`);
  if (!userConfirm) return;
  
  const docIdsToDelete = [...new Set(historyMatches.map(h =>
    `${h.slug}-${h.approach || "oa"}`.replace(/[^a-zA-Z0-9_-]/g, "")
  ))];
  
  history = history.filter(h => !sheetSlugs.has(normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl)));
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
  
  // Delete from Firestore
  try {
    const authData = await chrome.storage.local.get("auth_user");
    const authUser = authData.auth_user;
    if (authUser && authUser.uid && authUser.idToken) {
      const baseUrl = getFirestoreApiUrl();
      for (const docId of docIdsToDelete) {
        fetch(`${baseUrl}/users/${authUser.uid}/history/${docId}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${authUser.idToken}`
          }
        });
      }
    }
  } catch (e) {
    console.error("Failed to delete sheet progress from Firestore:", e);
  }
  
  renderSheets();
  renderOverview();
}
// ── SCREEN: REVISION SCHEDULE ───────────────────────────────────────────────
function getRevisionDueDate(entry) {
  if (entry.customRevisionDueDate) {
    const d = new Date(entry.customRevisionDueDate);
    if (!isNaN(d.getTime())) return d;
  }
  if (!entry.savedAt) return null;
  const d = new Date(entry.savedAt);
  const rev = entry.revisionCount || 1;
  let offset = 3;
  if (rev === 2) offset = 7;
  else if (rev === 3) offset = 15;
  else if (rev >= 4) offset = 30;

  d.setDate(d.getDate() + offset);
  return d;
}

async function renderRevisionSchedule() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = data[STORAGE_KEYS.history] || [];

  el.revisionListOverdue.innerHTML = "";
  el.revisionListToday.innerHTML = "";
  el.revisionListUpcoming.innerHTML = "";

  const starred = history.filter(h => h.isFavorite);
  
  let overdueCount = 0;
  let todayCount = 0;
  let upcomingCount = 0;

  const todayStr = new Date().toDateString();
  const nowTime = new Date().getTime();

  starred.forEach(entry => {
    const dueDate = getRevisionDueDate(entry);
    if (!dueDate) return;

    const dueStr = dueDate.toDateString();
    const item = document.createElement("div");
    item.className = "revision-item";

    const left = document.createElement("div");
    left.style = "display:flex; flex-direction:column; gap:2px;";
    const link = document.createElement("a");
    link.href = entry.url || "#";
    link.target = "_blank";
    link.className = "revision-item-title";
    link.textContent = entry.title;
    left.appendChild(link);

    const meta = document.createElement("span");
    meta.className = "revision-item-meta";
    meta.textContent = `Due: ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} (Rev #${entry.revisionCount || 1})`;
    left.appendChild(meta);
    item.appendChild(left);

    // Done/Checked Button
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn-ico";
    doneBtn.title = "Done with this Revision Cycle";
    doneBtn.textContent = "✔️";
    doneBtn.addEventListener("click", async () => {
      await incrementRevisionCycle(entry.slug);
      renderRevisionSchedule();
    });
    item.appendChild(doneBtn);

    if (dueStr === todayStr) {
      todayCount++;
      el.revisionListToday.appendChild(item);
    } else if (dueDate.getTime() < nowTime) {
      overdueCount++;
      el.revisionListOverdue.appendChild(item);
    } else {
      upcomingCount++;
      el.revisionListUpcoming.appendChild(item);
    }
  });

  if (overdueCount === 0) el.revisionListOverdue.innerHTML = `<div class="empty-state">No pending overdue revisions.</div>`;
  if (todayCount === 0) el.revisionListToday.innerHTML = `<div class="empty-state">No reviews scheduled for today.</div>`;
  if (upcomingCount === 0) el.revisionListUpcoming.innerHTML = `<div class="empty-state">No future revisions scheduled.</div>`;
}

async function incrementRevisionCycle(slug) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = data[STORAGE_KEYS.history] || [];

  history = history.map(h => {
    if (h.slug === slug) {
      const currentRev = h.revisionCount || 1;
      return {
        ...h,
        revisionCount: currentRev + 1,
        savedAt: new Date().toISOString() // reset solve date to trigger next spaced offset
      };
    }
    return h;
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
  await syncCloudData();
}

// ── SCREEN: SETTINGS LOGIC ──────────────────────────────────────────────────
function setupSettingsListeners() {
  el.btnSaveSettings.addEventListener("click", saveSettings);
  el.btnFetchSolves.addEventListener("click", fetchSolves);
  el.btnDisconnect.addEventListener("click", disconnect);
  if (el.btnImportCustomSheet) {
    el.btnImportCustomSheet.addEventListener("click", handleCustomSheetImport);
  }
}

async function saveSettings() {
  el.btnSaveSettings.disabled = true;
  el.btnSaveSettings.textContent = "Saving...";

  const newSettings = {
    repo: el.txtRepo.value.trim(),
    branch: el.txtBranch.value.trim(),
    basePath: el.txtBasePath.value.trim()
  };

  const data = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const existing = data[STORAGE_KEYS.settings] || {};
  const merged = { ...existing, ...newSettings };

  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: merged });
  
  el.btnSaveSettings.disabled = false;
  el.btnSaveSettings.textContent = "Save Configurations";
  alert("Settings saved successfully!");
}

async function fetchSolves() {
  el.btnFetchSolves.disabled = true;
  el.btnFetchSolves.textContent = "Fetching...";
  
  // Send message to background worker to fetch
  chrome.runtime.sendMessage({ type: "FETCH_GITHUB_SOLVES" }, (response) => {
    el.btnFetchSolves.disabled = false;
    el.btnFetchSolves.textContent = "Fetch Solves";

    if (chrome.runtime.lastError || (response && !response.ok)) {
      alert("Solve import failed: " + (response?.error || "Unknown error"));
    } else {
      alert("Solve import triggered successfully!");
      renderAll();
    }
  });
}

async function disconnect() {
  if (!confirm("Are you sure you want to disconnect? This will log you out and clear local cache.")) return;
  await chrome.storage.local.remove(["auth_user", "githubSettings", "leetsyncSettings", "github_token", "github_profile"]);
  alert("Disconnected! Reloading page...");
  window.location.reload();
}

// ── NOTES MODAL OVERLAY LOGIC ───────────────────────────────────────────────
function setupNotesModalListeners() {
  el.notesModalCancelBtn.addEventListener("click", () => {
    el.notesModal.classList.add("hidden");
  });
  
  el.notesModal.addEventListener("click", (e) => {
    if (e.target === el.notesModal) {
      el.notesModal.classList.add("hidden");
    }
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function openNotesModal(entry, approachLabel) {
  el.notesModalTitle.textContent = `Edit Solution Notes`;
  el.notesModalSubtitle.textContent = entry.title;
  el.notesModalStatus.textContent = "";

  el.notesModalContainer.innerHTML = "";
  
  // Fetch history to pre-populate tabs
  const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = storedHistory[STORAGE_KEYS.history] || [];
  
  // Find all existing solves for this problem
  const problemSlug = entry.slug.trim().toLowerCase();
  const solves = history.filter(h => h.slug && h.slug.trim().toLowerCase() === problemSlug);

  // Initialize approach session data
  const sessionData = {
    optimal: { notes: "", pattern: "" },
    better: { notes: "", pattern: "" },
    brute_force: { notes: "", pattern: "" }
  };

  // Populate from history solves
  solves.forEach(s => {
    const appLower = (s.approach || "").toLowerCase().trim();
    if (appLower.includes("optimal") || appLower === "oa" || appLower.includes("(oa)")) {
      sessionData.optimal.notes = s.notes || "";
      sessionData.optimal.pattern = s.pattern && s.pattern !== "None" ? s.pattern : "";
    } else if (appLower.includes("better") || appLower === "ba" || appLower.includes("(ba)")) {
      sessionData.better.notes = s.notes || "";
      sessionData.better.pattern = s.pattern && s.pattern !== "None" ? s.pattern : "";
    } else if (appLower.includes("brute") || appLower === "bf" || appLower.includes("(bf)")) {
      sessionData.brute_force.notes = s.notes || "";
      sessionData.brute_force.pattern = s.pattern && s.pattern !== "None" ? s.pattern : "";
    }
  });

  // Unique patterns list for dropdown
  const patternsSet = new Set();
  Object.values(DASHBOARD_TOPIC_PATTERNS).forEach(pats => {
    pats.forEach(p => patternsSet.add(p));
  });
  history.forEach(h => {
    if (h.pattern && h.pattern !== "None") patternsSet.add(h.pattern);
  });
  const sortedPatterns = Array.from(patternsSet).sort();

  const wrapper = document.createElement("div");
  wrapper.style = "display: flex; flex-direction: column; gap: 16px; margin-top: 10px;";
  wrapper.innerHTML = `
    <!-- Tabs Header -->
    <div class="notes-tabs-header" style="display: flex; border-bottom: 2px solid var(--clr-border); margin-bottom: 4px; gap: 4px;">
      <button type="button" class="notes-tab-btn active" data-tab="optimal" style="flex: 1; padding: 10px 12px; background: none; border: none; border-bottom: 2px solid var(--clr-primary); color: var(--clr-text); font-weight: 700; font-size: 13px; cursor: pointer; text-align: center; outline: none; transition: var(--transition);">Optimal</button>
      <button type="button" class="notes-tab-btn" data-tab="better" style="flex: 1; padding: 10px 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--clr-muted); font-weight: 700; font-size: 13px; cursor: pointer; text-align: center; outline: none; transition: var(--transition);">Better</button>
      <button type="button" class="notes-tab-btn" data-tab="brute_force" style="flex: 1; padding: 10px 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--clr-muted); font-weight: 700; font-size: 13px; cursor: pointer; text-align: center; outline: none; transition: var(--transition);">Brute Force</button>
    </div>

    <!-- Algorithm Pattern (Inline Swap UI) -->
    <div>
      <label style="display: block; font-size: 11px; font-weight: 700; color: var(--clr-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Algorithm Pattern</label>
      
      <div id="notesPatternSelectWrap" style="width: 100%;">
        <select id="notesPatternSelect" class="dashboard-select" style="width: 100%; padding: 8px 12px; font-size: 13px; background-color: var(--clr-surface-card); border: 1px solid var(--clr-border); border-radius: 6px; color: var(--clr-text); outline: none; box-sizing: border-box; height: 38px;">
          <option value="">None / General</option>
          ${sortedPatterns.map(p => `<option value="${p.toLowerCase()}">${p}</option>`).join("")}
          <option value="other">Other (Custom Pattern...)</option>
        </select>
      </div>
      
      <div id="notesPatternInputWrap" class="hidden" style="display: flex; align-items: center; gap: 8px; width: 100%;">
        <input id="notesPatternCustomInput" type="text" class="notes-text-input" style="flex: 1; padding: 8px 12px; font-size: 13px; background-color: var(--clr-surface-card); border: 1px solid var(--clr-border); border-radius: 6px; color: var(--clr-text); outline: none; box-sizing: border-box; height: 38px;" placeholder="Type custom pattern...">
        <button id="notesPatternReset" type="button" style="background: none; border: none; color: var(--clr-muted); font-size: 16px; cursor: pointer; padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 38px;" title="Back to list">✖</button>
      </div>
    </div>

    <!-- Notes Textarea -->
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <label style="font-size: 11px; font-weight: 700; color: var(--clr-muted); text-transform: uppercase; letter-spacing: 0.5px;">Solution Notes</label>
        <span id="notesCharCount" style="font-size: 11px; color: var(--clr-muted); font-weight: 700;">0 chars</span>
      </div>
      <textarea class="notes-textarea" style="width: 100%; min-height: 180px; font-family: 'Fira Code', 'Courier New', Courier, monospace; font-size: 13px; line-height: 1.5; padding: 12px; background-color: var(--clr-surface-card); border: 1px solid var(--clr-border); border-radius: 6px; color: var(--clr-text); outline: none; resize: vertical; box-sizing: border-box;" placeholder="Write notes for this approach here..."></textarea>
    </div>
  `;
  el.notesModalContainer.appendChild(wrapper);

  const patternSelect = wrapper.querySelector("#notesPatternSelect");
  const patternSelectWrap = wrapper.querySelector("#notesPatternSelectWrap");
  const patternInputWrap = wrapper.querySelector("#notesPatternInputWrap");
  const patternCustomInput = wrapper.querySelector("#notesPatternCustomInput");
  const patternReset = wrapper.querySelector("#notesPatternReset");
  const textarea = wrapper.querySelector(".notes-textarea");
  const charCountSpan = wrapper.querySelector("#notesCharCount");
  const tabButtons = wrapper.querySelectorAll(".notes-tab-btn");

  let activeTab = "optimal";

  const updateCharCount = () => {
    charCountSpan.textContent = `${textarea.value.length} chars`;
  };
  textarea.addEventListener("input", updateCharCount);

  // Helper to load tab data
  const loadTabData = (tabKey) => {
    const data = sessionData[tabKey];
    textarea.value = data.notes || "";
    updateCharCount();

    // Populate pattern UI
    const pat = data.pattern || "";
    if (pat) {
      const matchedOpt = sortedPatterns.find(p => p.toLowerCase() === pat.toLowerCase());
      if (matchedOpt) {
        patternSelect.value = matchedOpt.toLowerCase();
        patternSelectWrap.classList.remove("hidden");
        patternInputWrap.classList.add("hidden");
      } else {
        patternSelect.value = "other";
        patternCustomInput.value = pat;
        patternSelectWrap.classList.add("hidden");
        patternInputWrap.classList.remove("hidden");
      }
    } else {
      patternSelect.value = "";
      patternCustomInput.value = "";
      patternSelectWrap.classList.remove("hidden");
      patternInputWrap.classList.add("hidden");
    }
  };

  // Helper to save current tab data to local session object
  const saveCurrentTabData = () => {
    sessionData[activeTab].notes = textarea.value;
    
    let currentPattern = "";
    if (patternSelectWrap.classList.contains("hidden")) {
      currentPattern = patternCustomInput.value.trim();
    } else if (patternSelect.value !== "") {
      const matchedOpt = sortedPatterns.find(p => p.toLowerCase() === patternSelect.value);
      currentPattern = matchedOpt || patternSelect.value;
    }
    sessionData[activeTab].pattern = currentPattern;
  };

  // Bind tab click handlers
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const newTab = btn.dataset.tab;
      if (newTab === activeTab) return;

      // 1. Save current tab
      saveCurrentTabData();

      // 2. Switch classes
      tabButtons.forEach(b => {
        if (b.dataset.tab === newTab) {
          b.classList.add("active");
          b.style.borderBottomColor = "var(--clr-primary)";
          b.style.color = "var(--clr-text)";
        } else {
          b.classList.remove("active");
          b.style.borderBottomColor = "transparent";
          b.style.color = "var(--clr-muted)";
        }
      });

      // 3. Load next tab
      activeTab = newTab;
      loadTabData(newTab);
    });
  });

  // Load default "Optimal" tab data
  loadTabData("optimal");

  // Pattern selects logic
  patternSelect.addEventListener("change", () => {
    if (patternSelect.value === "other") {
      patternSelectWrap.classList.add("hidden");
      patternInputWrap.classList.remove("hidden");
      patternCustomInput.value = "";
      patternCustomInput.focus();
    }
  });

  patternReset.addEventListener("click", () => {
    patternCustomInput.value = "";
    patternSelect.value = "";
    patternInputWrap.classList.add("hidden");
    patternSelectWrap.classList.remove("hidden");
  });

  el.notesModalSaveBtn.disabled = false;
  el.notesModalCancelBtn.disabled = false;
  el.notesModal.classList.remove("hidden");
  textarea.focus();

  el.notesModalSaveBtn.onclick = async () => {
    // Save current active tab data
    saveCurrentTabData();

    el.notesModalSaveBtn.disabled = true;
    el.notesModalCancelBtn.disabled = true;
    textarea.disabled = true;
    patternSelect.disabled = true;
    patternCustomInput.disabled = true;
    patternReset.disabled = true;
    tabButtons.forEach(b => b.disabled = true);
    el.notesModalStatus.textContent = "⏳ Saving all approaches...";

    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
      let hist = stored[STORAGE_KEYS.history] || [];

      const tabApproaches = {
        optimal: "Optimal",
        better: "Better",
        brute_force: "Brute Force"
      };

      for (const [tabKey, approachName] of Object.entries(tabApproaches)) {
        const tabVal = sessionData[tabKey];
        const hasNotes = tabVal.notes && tabVal.notes.trim() !== "";
        const hasPattern = tabVal.pattern && tabVal.pattern !== "None" && tabVal.pattern.trim() !== "";
        
        // Find existing solved item in history
        let foundIdx = -1;
        for (let i = 0; i < hist.length; i++) {
          const h = hist[i];
          if (h.slug && h.slug.trim().toLowerCase() === problemSlug) {
            const hAppLower = (h.approach || "").toLowerCase().trim();
            if (tabKey === "optimal" && (hAppLower.includes("optimal") || hAppLower === "oa" || hAppLower.includes("(oa)"))) {
              foundIdx = i;
              break;
            } else if (tabKey === "better" && (hAppLower.includes("better") || hAppLower === "ba" || hAppLower.includes("(ba)"))) {
              foundIdx = i;
              break;
            } else if (tabKey === "brute_force" && (hAppLower.includes("brute") || hAppLower === "bf" || hAppLower.includes("(bf)"))) {
              foundIdx = i;
              break;
            }
          }
        }

        if (foundIdx !== -1) {
          // Update existing solve
          hist[foundIdx].notes = tabVal.notes;
          hist[foundIdx].pattern = tabVal.pattern || "None";
        } else if (hasNotes || hasPattern) {
          // Create placeholder history solve if notes exist but solve doesn't
          const nowStr = new Date().toISOString();
          const newEntry = {
            id: entry.id || "",
            title: entry.title,
            slug: entry.slug,
            difficulty: entry.difficulty || "Medium",
            url: entry.leetcodeUrl || `https://leetcode.com/problems/${entry.slug}/`,
            savedAt: nowStr,
            approach: approachName,
            language: entry.language || "python",
            notes: tabVal.notes,
            pattern: tabVal.pattern || "None",
            collection: "None",
            githubUrl: "",
            isFavorite: false,
            revisionCount: 1,
            revisionCompleted: false,
            revisionCompletedAt: null,
            readmePath: ""
          };
          hist.unshift(newEntry);
        }
      }

      await chrome.storage.local.set({ [STORAGE_KEYS.history]: hist });

      // Trigger background notes commit for the current ACTIVE tab approach
      const activeApproachName = tabApproaches[activeTab];
      const activeTabVal = sessionData[activeTab];

      chrome.runtime.sendMessage({
        type: "LEETSYNC_UPDATE_NOTES",
        payload: {
          slug: entry.slug,
          title: entry.title,
          approach: activeApproachName,
          notes: activeTabVal.notes,
          language: entry.language || "python",
          readmePath: entry.readmePath || ""
        }
      }, (response) => {
        el.notesModalSaveBtn.disabled = false;
        el.notesModalCancelBtn.disabled = false;
        textarea.disabled = false;
        patternSelect.disabled = false;
        patternCustomInput.disabled = false;
        patternReset.disabled = false;
        tabButtons.forEach(b => b.disabled = false);

        if (chrome.runtime.lastError || (response && !response.ok)) {
          el.notesModalStatus.textContent = "❌ Sync failed, local notes saved.";
        } else {
          el.notesModalStatus.textContent = "✅ Saved & Synced!";
          setTimeout(() => {
            el.notesModal.classList.add("hidden");
            renderAll();
          }, 800);
        }
      });
    } catch (e) {
      console.error(e);
      el.notesModalSaveBtn.disabled = false;
      el.notesModalCancelBtn.disabled = false;
      textarea.disabled = false;
      patternSelect.disabled = false;
      patternCustomInput.disabled = false;
      patternReset.disabled = false;
      tabButtons.forEach(b => b.disabled = false);
      el.notesModalStatus.textContent = "❌ Save failed";
    }
  };
}

// ── Background Helpers ────────────────────────────────────────────────────────
async function syncCloudData() {
  // Sync to firestore via message trigger
  chrome.runtime.sendMessage({ type: "SYNC_FIRESTORE_DATA" });
}

async function forceSync() {
  el.syncStatus.textContent = "Syncing...";
  chrome.runtime.sendMessage({ type: "SYNC_FIRESTORE_DATA" }, (response) => {
    if (chrome.runtime.lastError) {
      el.syncStatus.textContent = "Error";
    } else {
      el.syncStatus.textContent = "Synced";
      renderAll();
      setTimeout(() => el.syncStatus.textContent = "Idle", 3000);
    }
  });
}

// ── Custom Sheets Scraper & Parser Logic ──────────────────────────────────────
async function populateSheetDropdown() {
  const select = el.sheetSelect;
  if (!select) return;

  await populateSheetDropdownHelper(select, true);

  // Trigger render since selection has updated
  renderSheets();

  // Refresh Custom Sheets Manager list
  if (typeof renderCustomSheetsManager === "function") {
    await renderCustomSheetsManager();
  }
}

async function migrateCustomSheets() {
  const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
  const customSheets = stored.customSheets || {};
  let registry = stored.customSheetsRegistry || {};
  let migrated = false;

  // Ensure platform catch-all sheets exist
  if (!customSheets["gfg"]) {
    customSheets["gfg"] = { name: "GFG", isPlatformSheet: true, data: { "General": { "Problems": [] } } };
    migrated = true;
  }
  if (!customSheets["leetcode"]) {
    customSheets["leetcode"] = { name: "LeetCode", isPlatformSheet: true, data: { "General": { "Problems": [] } } };
    migrated = true;
  }

  for (const [sheetKey, sheetObj] of Object.entries(customSheets)) {
    if (sheetObj && sheetObj.data) {
      let sheetMigrated = false;
      const newData = {};
      
      for (const [topicName, subtopics] of Object.entries(sheetObj.data)) {
        newData[topicName] = {};
        for (const [subtopicName, problems] of Object.entries(subtopics)) {
          newData[topicName][subtopicName] = [];
          if (Array.isArray(problems)) {
            problems.forEach(p => {
              if (p && typeof p === "object" && !Array.isArray(p)) {
                const slug = p.slug || p.title?.toLowerCase().replace(/[^a-z0-9]/g, "-");
                if (slug) {
                  registry[slug] = {
                    t: p.title || slug,
                    d: p.difficulty || "Medium",
                    u: p.leetcodeUrl || `https://leetcode.com/problems/${slug}/`
                  };
                  newData[topicName][subtopicName].push(slug);
                  sheetMigrated = true;
                }
              } else {
                newData[topicName][subtopicName].push(p);
              }
            });
          }
        }
      }
      if (sheetMigrated) {
        sheetObj.data = newData;
        migrated = true;
      }
    }
  }
  
  const activeSlugs = new Set();
  for (const [sheetKey, sheetObj] of Object.entries(customSheets)) {
    if (sheetObj && sheetObj.data) {
      for (const [topicName, subtopics] of Object.entries(sheetObj.data)) {
        for (const [subtopicName, problems] of Object.entries(subtopics)) {
          if (Array.isArray(problems)) {
            problems.forEach(p => {
              if (typeof p === "string") activeSlugs.add(p);
            });
          }
        }
      }
    }
  }
  
  let gcDone = false;
  for (const slug of Object.keys(registry)) {
    if (!activeSlugs.has(slug)) {
      delete registry[slug];
      gcDone = true;
    }
  }
  
  if (migrated || gcDone) {
    await chrome.storage.local.set({
      customSheets,
      customSheetsRegistry: registry
    });
    console.log("Custom sheets migrated to normalized format successfully.");
  }
}

function classifyDifficulty(diffVal) {
  if (!diffVal) return "Medium";
  
  const valStr = String(diffVal).trim().toLowerCase();
  
  // 1. Standard text check
  if (valStr.includes("easy") || valStr === "e") return "Easy";
  if (valStr.includes("medium") || valStr === "m") return "Medium";
  if (valStr.includes("hard") || valStr === "h") return "Hard";
  
  // 2. Stars check: ⭐, ★, ☆, *
  const starRegex = /[⭐★☆*]/g;
  const starsMatched = valStr.match(starRegex);
  if (starsMatched) {
    const starCount = starsMatched.length;
    if (starCount === 1 || starCount === 2) return "Easy";
    if (starCount === 3) return "Medium";
    if (starCount === 4 || starCount === 5) return "Hard";
    return "Medium";
  }
  
  // 3. Numbers/Fractions check: e.g. "1", "2/3", "4/5"
  const matchNum = valStr.match(/^([0-9.]+)/);
  if (matchNum) {
    const num = parseFloat(matchNum[1]);
    if (!isNaN(num)) {
      const denomMatch = valStr.match(/\/([0-9.]+)/);
      let maxVal = 5; // default scale (1 to 5)
      if (denomMatch) {
        maxVal = parseFloat(denomMatch[1]);
      }
      
      const ratio = num / maxVal;
      if (ratio <= 0.4) return "Easy";
      if (ratio <= 0.75) return "Medium";
      return "Hard";
    }
  }
  
  return "Medium";
}

async function handleCustomSheetImport() {
  const url = el.txtCustomSheetUrl.value.trim();
  let displayName = el.txtCustomSheetName.value.trim();
  const statusEl = el.importStatus;

  if (!url) {
    alert("Please enter a valid sheet resource URL!");
    return;
  }

  el.btnImportCustomSheet.disabled = true;
  el.btnImportCustomSheet.textContent = "Importing...";
  statusEl.style.color = "var(--clr-primary)";
  statusEl.textContent = "⏳ Fetching page content...";

  try {
    let parsedData = {}; // { topic: { subtopic: [problems] } }

    if (url.includes("docs.google.com/spreadsheets")) {
      statusEl.textContent = "⏳ Extracting spreadsheet components...";
      const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!sheetIdMatch) {
        throw new Error("Could not extract spreadsheet ID from the URL.");
      }
      const spreadsheetId = sheetIdMatch[1];
      
      let gid = "0";
      const gidMatch = url.match(/[?&]gid=([0-9]+)/) || url.match(/#gid=([0-9]+)/);
      if (gidMatch) {
        gid = gidMatch[1];
      }
      
      const xlsxUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx&gid=${gid}`;
      const response = await fetch(xlsxUrl);
      if (!response.ok) {
        throw new Error("Could not fetch the Google Sheet. Please verify it is shared as 'Anyone with the link can view'.");
      }
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      const files = {};
      
      // Parse XLSX ZIP via Central Directory
      let idx = 0;
      while (idx < bytes.length - 46) {
        if (bytes[idx] === 0x50 && bytes[idx+1] === 0x4B && bytes[idx+2] === 0x01 && bytes[idx+3] === 0x02) {
          const compressionMethod = bytes[idx + 10] | (bytes[idx + 11] << 8);
          const compressedSize = bytes[idx + 20] | (bytes[idx + 21] << 8) | (bytes[idx + 22] << 16) | (bytes[idx + 23] << 24);
          const filenameLen = bytes[idx + 28] | (bytes[idx + 29] << 8);
          const extraFieldLen = bytes[idx + 30] | (bytes[idx + 31] << 8);
          const commentLen = bytes[idx + 32] | (bytes[idx + 33] << 8);
          const localHeaderOffset = bytes[idx + 42] | (bytes[idx + 43] << 8) | (bytes[idx + 44] << 16) | (bytes[idx + 45] << 24);
          
          const filenameBytes = bytes.slice(idx + 46, idx + 46 + filenameLen);
          const filename = new TextDecoder().decode(filenameBytes);
          
          const lhIdx = localHeaderOffset;
          if (lhIdx < bytes.length - 30) {
            const lhFilenameLen = bytes[lhIdx + 26] | (bytes[lhIdx + 27] << 8);
            const lhExtraFieldLen = bytes[lhIdx + 28] | (bytes[lhIdx + 29] << 8);
            const dataOffset = lhIdx + 30 + lhFilenameLen + lhExtraFieldLen;
            const compressedData = bytes.slice(dataOffset, dataOffset + compressedSize);
            
            if (filename.includes("sheet") || filename.includes("sharedStrings") || filename.includes("rels")) {
              let decompressedText = "";
              if (compressionMethod === 8) {
                const decompressed = await decompressDeflateRaw(compressedData);
                decompressedText = new TextDecoder().decode(decompressed);
              } else if (compressionMethod === 0) {
                decompressedText = new TextDecoder().decode(compressedData);
              }
              files[filename] = decompressedText;
            }
          }
          idx += 46 + filenameLen + extraFieldLen + commentLen;
        } else {
          idx++;
        }
      }
      
      const sheetXml = files["xl/worksheets/sheet1.xml"];
      const relsXml = files["xl/worksheets/_rels/sheet1.xml.rels"];
      const sharedStringsXml = files["xl/sharedStrings.xml"];
      
      if (!sheetXml || !relsXml || !sharedStringsXml) {
        throw new Error("Invalid or incomplete Google Sheet structure received.");
      }
      
      if (!displayName) {
        const titleMatch = sheetXml.match(/<sheetName[^>]*name="([^"]+)"/i);
        displayName = titleMatch ? titleMatch[1].replace(/ - Google Sheets/i, "").trim() : "Google Sheet DSA";
        if (displayName.length > 40) displayName = displayName.substring(0, 37) + "...";
      }
      
      // Parse Shared Strings
      const sharedStrings = [];
      const siRegex = /<si>([\s\S]*?)<\/si>/gi;
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/gi;
      let siMatch;
      while ((siMatch = siRegex.exec(sharedStringsXml)) !== null) {
        const siContent = siMatch[1];
        let text = "";
        let tMatch;
        while ((tMatch = tRegex.exec(siContent)) !== null) {
          text += tMatch[1];
        }
        sharedStrings.push(text);
      }
      
      // Parse Relationships
      const relationships = {};
      const relRegex = /<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/gi;
      let relMatch;
      while ((relMatch = relRegex.exec(relsXml)) !== null) {
        relationships[relMatch[1]] = relMatch[2];
      }
      
      // Parse Hyperlink cell references
      const cellHyperlinks = {};
      const hyperlinkRegex = /<hyperlink\s+([^>]+?)\/>/gi;
      let hlMatch;
      while ((hlMatch = hyperlinkRegex.exec(sheetXml)) !== null) {
        const attrs = hlMatch[1];
        const refMatch = attrs.match(/ref="([^"]+)"/);
        const idMatch = attrs.match(/r:id="([^"]+)"/);
        if (refMatch && idMatch) {
          cellHyperlinks[refMatch[1]] = relationships[idMatch[1]] || "";
        }
      }
      
      // Parse rows & cells
      const grid = {};
      const rowRegex = /<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/gi;
      const cRegex = /<c\s+([^>]+?)(?:\/>|>([\s\S]*?)<\/c>)/gi;
      const vRegex = /<v>([^<]+)<\/v>/i;
      
      let rowMatch;
      while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
        const rowNum = parseInt(rowMatch[1], 10);
        const rowContent = rowMatch[2];
        grid[rowNum] = {};
        
        let cMatch;
        while ((cMatch = cRegex.exec(rowContent)) !== null) {
          const attrs = cMatch[1];
          const cContent = cMatch[2] || "";
          
          const rMatch = attrs.match(/r="([A-Z]+)(\d+)"/);
          if (rMatch) {
            const colLetter = rMatch[1];
            const tMatch = attrs.match(/t="([^"]+)"/);
            const type = tMatch ? tMatch[1] : "";
            
            const vMatch = vRegex.exec(cContent);
            if (vMatch) {
              const val = vMatch[1];
              let finalVal = val;
              if (type === "s") {
                const sIdx = parseInt(val, 10);
                finalVal = sharedStrings[sIdx] || "";
              }
              grid[rowNum][colLetter] = finalVal;
            }
          }
        }
      }
      
      // Compile into hierarchical structured Topics -> Subtopics -> Problems
      const rawParsed = {};
      let currentTopic = "General";
      let currentSubtopic = "Problems";
      let pendingTitle = "";
      
      const sortedRowNums = Object.keys(grid).map(n => parseInt(n, 10)).sort((a, b) => a - b);
      
      sortedRowNums.forEach(rowNum => {
        const row = grid[rowNum];
        
        const hasC = !!row["C"];
        const hasD = !!row["D"];
        const hasE = !!row["E"];
        
        let topicVal = "";
        let subtopicVal = "";
        let problemVal = "";
        
        if (hasE) {
          problemVal = row["E"];
          if (hasC && hasD) {
            topicVal = row["C"];
            subtopicVal = row["D"];
          } else if (hasD) {
            subtopicVal = row["D"];
          } else if (hasC) {
            subtopicVal = row["C"];
          }
        } else if (hasD) {
          problemVal = row["D"];
          if (hasC) {
            subtopicVal = row["C"];
          }
        } else if (hasC) {
          problemVal = row["C"];
        }
        
        const diffVal = row["G"] ? row["G"].trim() : "Medium";
        
        if (topicVal && topicVal.trim() !== "Topic") {
          currentTopic = topicVal.trim();
        }
        if (subtopicVal && subtopicVal.trim() !== "Subtopic") {
          currentSubtopic = subtopicVal.trim();
        }
        
        const cellRef = `F${rowNum}`;
        const url = cellHyperlinks[cellRef];
        
        if (url && (url.includes("leetcode.com") || url.includes("geeksforgeeks.org"))) {
          const problemName = (problemVal ? problemVal.trim() : "") || pendingTitle || "Coding Problem";
          if (problemName === "Problem Name") return;
          
          let slug = "";
          try {
            const urlObj = new URL(url);
            const match = urlObj.pathname.match(/\/problems\/([a-zA-Z0-9_-]+)/);
            if (match) slug = match[1];
          } catch(e) {}
          if (!slug) {
            slug = problemName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
          }
          
          const difficulty = classifyDifficulty(diffVal);
          
          const tKey = currentTopic.replace(/^[0-9]+\s*[.)-]?\s+/, "").trim();
          const sKey = currentSubtopic.replace(/^[0-9]+\s*[.)-]?\s+/, "").trim();
          
          if (!rawParsed[tKey]) rawParsed[tKey] = {};
          if (!rawParsed[tKey][sKey]) rawParsed[tKey][sKey] = [];
          
          rawParsed[tKey][sKey].push({
            title: problemName,
            slug: slug,
            difficulty: difficulty,
            leetcodeUrl: url
          });
          pendingTitle = "";
        } else {
          const vals = Object.entries(row)
            .filter(([col, val]) => col !== "A" && col !== "B" && val && val.trim().length > 0)
            .map(([col, val]) => val.trim());
          if (vals.length === 1 && vals[0] !== "DSA Master Sheet") {
            pendingTitle = vals[0];
          }
        }
      });
      
      let topicIdx = 1;
      for (const [topic, subtopics] of Object.entries(rawParsed)) {
        const stepNum = String(topicIdx).padStart(2, "0");
        const cleanTopic = topic.replace(/^[0-9]+\s*[.)-]?\s+/, "").trim();
        const topicName = `Step ${stepNum}: ${cleanTopic}`;
        parsedData[topicName] = {};
        topicIdx++;
        
        let subIdx = 1;
        for (const [subtopic, problems] of Object.entries(subtopics)) {
          const lecNum = String(subIdx).padStart(2, "0");
          const cleanSub = subtopic.replace(/^[0-9]+\s*[.)-]?\s+/, "").trim();
          const subtopicName = `Lec ${lecNum}: ${cleanSub}`;
          parsedData[topicName][subtopicName] = problems;
          subIdx++;
        }
      }
    } else if (url.includes("leetcode.com/studyplan/")) {
      statusEl.textContent = "⏳ Querying LeetCode GraphQL API...";
      const studyPlanMatch = url.match(/\/studyplan\/([a-zA-Z0-9-_]+)/);
      if (!studyPlanMatch) {
        throw new Error("Could not extract Study Plan slug from the URL.");
      }
      const planSlug = studyPlanMatch[1];
      
      const query = `
        query studyPlanV2Detail($planSlug: String!) {
          studyPlanV2Detail(planSlug: $planSlug) {
            name
            slug
            planSubGroups {
              name
              slug
              questions {
                title
                titleSlug
                difficulty
              }
            }
          }
        }
      `;
      
      const response = await fetch('https://leetcode.com/graphql/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: { planSlug }
        })
      });
      
      if (!response.ok) {
        throw new Error(`LeetCode API returned status ${response.status}`);
      }
      
      const result = await response.json();
      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0].message);
      }
      
      const detail = result.data?.studyPlanV2Detail;
      if (!detail) {
        throw new Error("No study plan details returned from LeetCode.");
      }
      
      if (!displayName) {
        displayName = detail.name || "LeetCode Study Plan";
      }
      
      let topicIdx = 1;
      detail.planSubGroups.forEach(group => {
        const cleanTopicName = group.name || "General";
        const stepNum = String(topicIdx).padStart(2, "0");
        const topicName = `Step ${stepNum}: ${cleanTopicName}`;
        const subtopicName = "Problems";
        
        if (!parsedData[topicName]) {
          parsedData[topicName] = {};
        }
        parsedData[topicName][subtopicName] = [];
        
        group.questions.forEach(q => {
          parsedData[topicName][subtopicName].push({
            title: q.title,
            slug: q.titleSlug,
            difficulty: classifyDifficulty(q.difficulty),
            leetcodeUrl: `https://leetcode.com/problems/${q.titleSlug}/`
          });
        });
        topicIdx++;
      });
    } else {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load page. Server returned: ${response.status}`);
      }
      
      statusEl.textContent = "⏳ Parsing HTML structure...";
      const htmlText = await response.text();
      const docParser = new DOMParser();
      const doc = docParser.parseFromString(htmlText, "text/html");

      if (!displayName) {
        displayName = doc.title ? doc.title.replace(/[\r\n\t]+/g, " ").trim() : "Custom Imported Sheet";
        if (displayName.length > 40) displayName = displayName.substring(0, 37) + "...";
      }

      // 1. Next.js Hydration Payload Parsing (e.g. for Takeuforward, hynts.in)
      if (url.includes("takeuforward.org") || htmlText.includes("self.__next_f.push")) {
      const segments = [];
      const segmentRegex = /self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)/g;
      let segMatch;
      while ((segMatch = segmentRegex.exec(htmlText)) !== null) {
        segments.push(segMatch[1]);
      }
      const rawData = segments.join("");
      
      const searchStr = '\\"sections\\":[';
      const startIdx = rawData.indexOf(searchStr);
      if (startIdx !== -1) {
        const arrayStartIdx = startIdx + searchStr.length - 1;
        let bracketCount = 0;
        let endIdx = -1;
        for (let i = arrayStartIdx; i < rawData.length; i++) {
          const char = rawData[i];
          if (char === '[') bracketCount++;
          else if (char === ']') {
            bracketCount--;
            if (bracketCount === 0) {
              endIdx = i;
              break;
            }
          }
        }
        
        if (endIdx !== -1) {
          try {
            const arrayString = rawData.substring(arrayStartIdx, endIdx + 1);
            const jsonString = arrayString
              .replace(/\\"/g, '"')
              .replace(/\\u0022/g, '"')
              .replace(/\\\\/g, '\\');
            
            const sections = JSON.parse(jsonString);
            sections.forEach((sec, secIdx) => {
              // 1. Takeuforward format
              if (sec.category_name && sec.subcategories) {
                const stepNum = String(secIdx + 1).padStart(2, "0");
                const cleanCategory = sec.category_name.replace(/^[0-9]+\s*[.)-]?\s+/, "").replace(/^Step\s*\d+\s*:\s*/i, "").trim();
                const topicName = `Step ${stepNum}: ${cleanCategory}`;
                if (!parsedData[topicName]) parsedData[topicName] = {};
                
                sec.subcategories.forEach((sub, subIdx) => {
                  const lecNum = String(subIdx + 1).padStart(2, "0");
                  const cleanSubcategory = sub.subcategory_name.replace(/^[0-9]+\s*[.)-]?\s+/, "").replace(/^Lec\s*\d+\s*:\s*/i, "").trim();
                  const subtopicName = `Lec ${lecNum}: ${cleanSubcategory}`;
                  if (!parsedData[topicName][subtopicName]) parsedData[topicName][subtopicName] = [];
                  
                  sub.problems.forEach(p => {
                    let pUrl = p.leetcode;
                    if (!pUrl || pUrl === "$undefined") {
                      if (p.plus && (p.plus.includes("leetcode.com") || p.plus.includes("geeksforgeeks.org"))) {
                        pUrl = p.plus;
                      } else if (p.article && (p.article.includes("leetcode.com") || p.article.includes("geeksforgeeks.org"))) {
                        pUrl = p.article;
                      } else {
                        pUrl = p.article || "";
                      }
                    }
                    
                    let slug = "";
                    if (pUrl) {
                      try {
                        const cleanUrl = pUrl.split("#")[0].split("?")[0];
                        const urlObj = new URL(cleanUrl);
                        const match = urlObj.pathname.match(/\/problems\/([a-zA-Z0-9_-]+)/);
                        if (match) slug = match[1];
                      } catch(e) {}
                    }
                    if (!slug) {
                      slug = p.problem_name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
                    }
                    
                    parsedData[topicName][subtopicName].push({
                      title: p.problem_name.trim(),
                      slug: slug,
                      difficulty: classifyDifficulty(p.difficulty),
                      leetcodeUrl: pUrl
                    });
                  });
                });
              }
              // 2. Hynts flat section format
              else if (sec.topic && sec.problems) {
                const stepNum = String(secIdx + 1).padStart(2, "0");
                const cleanTopic = sec.topic.replace(/^[0-9]+\s*[.)-]?\s+/, "").replace(/^Step\s*\d+\s*:\s*/i, "").trim();
                const topicName = `Step ${stepNum}: ${cleanTopic}`;
                if (!parsedData[topicName]) parsedData[topicName] = {};
                
                const subName = sec.subTopic || sec.subtopic || "General";
                const cleanSub = subName.replace(/^[0-9]+\s*[.)-]?\s+/, "").replace(/^Lec\s*\d+\s*:\s*/i, "").trim();
                const subtopicName = `Lec 01: ${cleanSub}`;
                if (!parsedData[topicName][subtopicName]) parsedData[topicName][subtopicName] = [];
                
                sec.problems.forEach(p => {
                  const pUrl = p.problemUrl || p.url || "";
                  if (!pUrl || (!pUrl.includes("leetcode.com") && !pUrl.includes("geeksforgeeks.org"))) return;
                  
                  let slug = "";
                  try {
                    const cleanUrl = pUrl.split("#")[0].split("?")[0];
                    const urlObj = new URL(cleanUrl);
                    const match = urlObj.pathname.match(/\/problems\/([a-zA-Z0-9_-]+)/);
                    if (match) slug = match[1];
                  } catch(e) {}
                  
                  const pName = p.title || p.problemName || p.name || "Coding Problem";
                  if (!slug) {
                    slug = pName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
                  }
                  
                  parsedData[topicName][subtopicName].push({
                    title: pName.trim(),
                    slug: slug,
                    difficulty: classifyDifficulty(p.difficulty),
                    leetcodeUrl: pUrl
                  });
                });
              }
            });
          } catch (jsonErr) {
            console.error("Failed to parse Next.js hydration payload", jsonErr);
          }
        }
      }
    }

    // 2. Fallback to standard DOM querySelector (if not Striver's Next.js page or if hydration parsing failed)
    if (Object.keys(parsedData).length === 0) {
      const links = doc.querySelectorAll('a[href*="leetcode.com/problems"], a[href*="geeksforgeeks.org/problems"]');
      if (links.length > 0) {
        statusEl.textContent = `⏳ Compiling ${links.length} problems...`;
        links.forEach(link => {
          try {
            const urlStr = link.href;
            const urlObj = new URL(urlStr);
            const pathname = urlObj.pathname;
            const hostname = urlObj.hostname;
            let slug = "";
            let title = link.textContent.trim() || "";
            
            const rawParentText = link.parentElement ? link.parentElement.textContent : "";
            const difficulty = classifyDifficulty(rawParentText);

            if (hostname.includes("leetcode.com") || hostname.includes("geeksforgeeks.org")) {
              const match = pathname.match(/\/problems\/([a-zA-Z0-9_-]+)/);
              if (match) slug = match[1];
            }

            if (!slug) return;

            if (!title || title.length > 80 || title.includes("https")) {
              title = slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            }

            let topicName = "General DSA Problems";
            let subtopicName = "Imported List";

            let parent = link.parentElement;
            let limit = 8;
            let foundTopic = null;
            let foundSubtopic = null;

            while (parent && limit > 0) {
              if (parent.className && typeof parent.className === "string") {
                if (parent.className.includes("kt-accordion-panel") || parent.className.includes("wp-block-kadence-accordion")) {
                  let prev = parent.previousElementSibling;
                  while (prev) {
                    if (prev.className && typeof prev.className === "string" && prev.className.includes("kt-accordion-header")) {
                      foundTopic = prev.textContent.trim();
                      break;
                    }
                    prev = prev.previousElementSibling;
                  }
                }
              }

              let sibling = parent.previousElementSibling;
              while (sibling) {
                const tag = sibling.tagName ? sibling.tagName.toLowerCase() : "";
                if (tag === "h3" || tag === "h4") {
                  if (!foundSubtopic) foundSubtopic = sibling.textContent.trim();
                } else if (tag === "h2") {
                  if (!foundTopic) foundTopic = sibling.textContent.trim();
                }
                sibling = sibling.previousElementSibling;
              }

              if (foundTopic && foundSubtopic) break;
              parent = parent.parentElement;
              limit--;
            }

            if (!foundTopic) {
              let prev = link.previousElementSibling;
              while (prev) {
                const tag = prev.tagName ? prev.tagName.toLowerCase() : "";
                if (tag === "h2" || tag === "h3") {
                  foundTopic = prev.textContent.trim();
                  break;
                }
                prev = prev.previousElementSibling;
              }
            }

            if (foundTopic) topicName = foundTopic.replace(/^[0-9.\s▶📂]+/, "").trim();
            if (foundSubtopic) subtopicName = foundSubtopic.replace(/^[0-9.\s▶📂]+/, "").trim();

            if (topicName.length > 60) topicName = topicName.substring(0, 57) + "...";
            if (subtopicName.length > 60) subtopicName = subtopicName.substring(0, 57) + "...";

            if (!parsedData[topicName]) parsedData[topicName] = {};
            if (!parsedData[topicName][subtopicName]) parsedData[topicName][subtopicName] = [];

            const exists = parsedData[topicName][subtopicName].some(p => p.slug === slug);
            if (!exists) {
              parsedData[topicName][subtopicName].push({
                title,
                slug,
                difficulty,
                leetcodeUrl: urlStr
              });
            }
          } catch (err) {
            console.error("Link parse skipped:", err);
          }
        });
      }
    }
  }

    if (Object.keys(parsedData).length === 0) {
      throw new Error("Could not extract any LeetCode/GFG coding links from this page!");
    }

    // Save in storage
    const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
    const customSheets = stored.customSheets || {};
    const registry = stored.customSheetsRegistry || {};
    const sheetKey = displayName.toLowerCase().replace(/[^a-z0-9]/g, "_");

    const normalizedData = {};
    for (const [topicName, subtopics] of Object.entries(parsedData)) {
      normalizedData[topicName] = {};
      for (const [subtopicName, problems] of Object.entries(subtopics)) {
        normalizedData[topicName][subtopicName] = [];
        if (Array.isArray(problems)) {
          problems.forEach(p => {
            if (p.slug) {
              registry[p.slug] = {
                t: p.title,
                d: p.difficulty,
                u: p.leetcodeUrl
              };
              normalizedData[topicName][subtopicName].push(p.slug);
            }
          });
        }
      }
    }

    customSheets[sheetKey] = {
      name: displayName,
      url: url,
      data: normalizedData
    };

    await chrome.storage.local.set({ 
      customSheets,
      customSheetsRegistry: registry
    });
    
    statusEl.style.color = "var(--clr-easy)";
    statusEl.textContent = `✅ Successfully imported "${displayName}"!`;

    // Clear inputs
    el.txtCustomSheetUrl.value = "";
    el.txtCustomSheetName.value = "";

    // Refresh UI dropdown options
    await renderAll();

    // Auto-select imported sheet
    el.sheetSelect.value = `custom_${sheetKey}`;
    renderSheets();

    setTimeout(() => {
      statusEl.textContent = "";
    }, 4000);

  } catch (err) {
    statusEl.style.color = "var(--clr-hard)";
    statusEl.textContent = `❌ Import Failed: ${err.message}`;
    console.error(err);
  } finally {
    el.btnImportCustomSheet.disabled = false;
    el.btnImportCustomSheet.textContent = "Fetch & Import Sheet";
  }
}


async function decompressDeflateRaw(compressedBytes) {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(compressedBytes);
  writer.close();
  const response = new Response(ds.readable);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function cleanDisplayName(name) {
  if (!name) return "";
  // First strip Step/Lec/Lecture indexing prefix with potential hyphens or colons
  let clean = name.replace(/^(Step|Lec|Lecture)\s*[-:]?\s*\d+\s*[-:]?\s*/i, "");
  // Then strip numbering prefix like "1. ", "2. ", "10) " but NOT "2D Arrays"
  return clean.replace(/^[0-9]+\s*[.)-]?\s+/, "");
}

function normalizeProblemSlug(slug, url = "") {
  let normalized = (slug || "").trim().toLowerCase();
  if (!normalized) return "";
  if ((url || "").includes("geeksforgeeks.org") || (url === "" && normalized.match(/-\d{5,}$/))) {
    normalized = normalized.replace(/-[0-9]+$/, "");
  }
  return normalized;
}


async function renderCustomSheetsManager() {
  const manager = document.getElementById("customSheetsManager");
  const list = document.getElementById("customSheetsList");
  if (!manager || !list) return;

  const stored = await chrome.storage.local.get("customSheets");
  const customSheets = stored.customSheets || {};

  const staticKeys = [
    "apnacollege_dsa_sheet",
    "collegewallah_dsa_master_sheet",
    "fraz_dsa_sheet",
    "leetcode_75",
    "leetcode_top_100_liked",
    "love_babbar_dsa_sheet",
    "neetcode_150",
    "striver_a2z_sheet",
    "top_interview_150",
    "gfg_160",
    "gfg",
    "leetcode"
  ];
  const keys = Object.keys(customSheets).filter(k => !staticKeys.includes(k));
  if (keys.length === 0) {
    list.style.display = "none";
    const header = manager.querySelector("h4");
    if (header) header.style.display = "none";
    const btnBackup = document.getElementById("btnBackupSheets");
    if (btnBackup) btnBackup.style.display = "none";
    manager.style.display = "block";
    return;
  }

  manager.style.display = "block";
  list.style.display = "flex";
  const header = manager.querySelector("h4");
  if (header) header.style.display = "block";
  const btnBackup = document.getElementById("btnBackupSheets");
  if (btnBackup) btnBackup.style.display = "block";

  list.innerHTML = "";

  for (const [key, sheetObj] of Object.entries(customSheets)) {
    if (staticKeys.includes(key)) continue;
    const row = document.createElement("div");
    row.style = "display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--clr-border); border-radius: var(--radius); transition: var(--transition);";

    const leftContainer = document.createElement("div");
    leftContainer.style = "display: flex; align-items: center; gap: 8px;";

    const nameSpan = document.createElement("span");
    nameSpan.style = "font-weight: 700; font-size: 13px; color: var(--clr-text);";
    nameSpan.textContent = sheetObj.name || key;
    leftContainer.appendChild(nameSpan);

    const rightContainer = document.createElement("div");
    rightContainer.style = "display: flex; align-items: center; gap: 8px;";

    const isPerm = !!sheetObj.isPermanent;

    const lockBtn = document.createElement("button");
    lockBtn.style = "background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; line-height: 1; display: inline-flex; transition: var(--transition);";
    lockBtn.title = isPerm ? "Unmark as Permanent (Unlock)" : "Mark as Permanent (Lock)";
    lockBtn.textContent = isPerm ? "🔒" : "🔓";
    lockBtn.addEventListener("click", async () => {
      sheetObj.isPermanent = !isPerm;
      await chrome.storage.local.set({ customSheets });
      await populateSheetDropdown();
    });
    rightContainer.appendChild(lockBtn);

    const renameBtn = document.createElement("button");
    renameBtn.style = "background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; line-height: 1; display: inline-flex; transition: var(--transition);";
    renameBtn.title = "Rename Sheet";
    renameBtn.textContent = "✏️";
    renameBtn.addEventListener("click", async () => {
      const oldName = sheetObj.name || key;
      const newName = prompt(`Enter new name for "${oldName}":`, oldName);
      if (newName !== null && newName.trim() !== "") {
        sheetObj.name = newName.trim();
        await chrome.storage.local.set({ customSheets });
        await populateSheetDropdown();
      }
    });
    rightContainer.appendChild(renameBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "danger-btn";
    delBtn.style = "padding: 4px 8px; font-size: 11px; font-weight: 800; line-height: 1; border-radius: 4px;";
    delBtn.textContent = "🗑️ Delete";
    delBtn.addEventListener("click", async () => {
      if (confirm(`Are you sure you want to delete "${sheetObj.name || key}"?`)) {
        await deleteCustomSheet(key);
      }
    });

    if (isPerm) {
      delBtn.style.display = "none";
      row.style.borderColor = "var(--clr-primary)";
      row.style.background = "rgba(56, 189, 248, 0.03)";
    }

    rightContainer.appendChild(delBtn);

    row.appendChild(leftContainer);
    row.appendChild(rightContainer);
    list.appendChild(row);
  }
}

async function deleteCustomSheet(key) {
  const stored = await chrome.storage.local.get("customSheets");
  const customSheets = stored.customSheets || {};

  if (customSheets[key]) {
    // Safety check: prevent deleting permanent sheets
    if (customSheets[key].isPermanent) {
      console.warn("Attempted to delete permanent sheet: " + key);
      return;
    }
    
    delete customSheets[key];
    await chrome.storage.local.set({ customSheets });

    const select = el.sheetSelect;
    if (select && select.value === `custom_${key}`) {
      select.value = "";
      activeTopicName = null;
      renderSheets();
    }
  }
}

// Add onChanged listener to dashboard.js to sync deletions in real-time
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local" && (changes.customSheets || changes.customSheetsRegistry)) {
    clearSheetCache(); // bust stale cache so new problems appear immediately
    await populateSheetDropdown();
    renderSheets();
  }
});

// Backup & Restore click listeners
document.addEventListener("DOMContentLoaded", () => {
  setupBackupRestoreListeners();
});
// Also run directly in case DOMContentLoaded has already fired
setupBackupRestoreListeners();

function setupBackupRestoreListeners() {
  const btnBackup = document.getElementById("btnBackupSheets");
  const btnRestore = document.getElementById("btnRestoreSheets");
  const fileInput = document.getElementById("fileRestoreInput");

  if (btnBackup && !btnBackup.dataset.listenerAdded) {
    btnBackup.dataset.listenerAdded = "true";
    btnBackup.addEventListener("click", async () => {
      const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
      const customSheets = stored.customSheets || {};
      const registry = stored.customSheetsRegistry || {};
      if (Object.keys(customSheets).length === 0) {
        alert("No sheets to export!");
        return;
      }
      const backupObj = {
        version: "2.0",
        customSheets,
        customSheetsRegistry: registry
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "leetsync_dsa_sheets_backup.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }

  if (btnRestore && !btnRestore.dataset.listenerAdded) {
    btnRestore.dataset.listenerAdded = "true";
    btnRestore.addEventListener("click", () => {
      fileInput?.click();
    });
  }

  if (fileInput && !fileInput.dataset.listenerAdded) {
    fileInput.dataset.listenerAdded = "true";
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (typeof imported !== "object" || Array.isArray(imported)) {
            throw new Error("Invalid backup file format!");
          }

          const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
          const customSheets = stored.customSheets || {};
          const registry = stored.customSheetsRegistry || {};

          if (imported.version === "2.0" && imported.customSheets) {
            Object.assign(customSheets, imported.customSheets);
            Object.assign(registry, imported.customSheetsRegistry || {});
          } else {
            // Old format backup (direct sheets map)
            Object.assign(customSheets, imported);
          }

          await chrome.storage.local.set({ 
            customSheets,
            customSheetsRegistry: registry
          });
          
          await migrateCustomSheets();
          alert("Sheets restored successfully!");
          await populateSheetDropdown();
        } catch (err) {
          alert("Error restoring backup: " + err.message);
        }
        fileInput.value = "";
      };
      reader.readAsText(file);
    });
  }
}

// Toggle problem completion manually
async function toggleProblemCompletion(problem, completed) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = stored[STORAGE_KEYS.history] || [];
  const targetSlug = normalizeProblemSlug(problem.slug, problem.leetcodeUrl || problem.url);

  if (completed) {
    // Check if it already exists in history
    const exists = history.some(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug);
    if (!exists) {
      // Create a local placeholder solve in history
      const nowStr = new Date().toISOString();
      const newEntry = {
        id: "",
        title: problem.title,
        slug: problem.slug,
        difficulty: problem.difficulty || "Medium",
        url: problem.leetcodeUrl || "",
        savedAt: nowStr,
        approach: "oa",
        language: "python",
        notes: "",
        githubUrl: "",
        isFavorite: false,
        revisionCount: 1,
        revisionCompleted: false,
        revisionCompletedAt: null,
        readmePath: ""
      };
      history.unshift(newEntry);
      await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
      // Trigger Firestore sync automatically
      await syncCloudData();
    }
  } else {
    const entriesToDelete = history.filter(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug);
    // Remove all saves of this problem from history
    history = history.filter(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) !== targetSlug);
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
    // Trigger Firestore sync
    await syncCloudData();
    
    // Also delete from Firestore cloud
    try {
      const authData = await chrome.storage.local.get("auth_user");
      const authUser = authData.auth_user;
      if (authUser && authUser.uid && authUser.idToken) {
        const baseUrl = getFirestoreApiUrl();
        const docIdsToDelete = [...new Set(entriesToDelete.map(entry =>
          `${entry.slug}-${entry.approach || "oa"}`.replace(/[^a-zA-Z0-9_-]/g, "")
        ))];
        for (const docId of docIdsToDelete) {
          await fetch(`${baseUrl}/users/${authUser.uid}/history/${docId}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${authUser.idToken}`
            }
          });
        }
      }
    } catch (e) {
      console.error("Failed to delete manual untick from Firestore:", e);
    }
  }
}

// Toggle problem star/favorite manually
async function toggleProblemBookmark(problem, bookmarked) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = stored[STORAGE_KEYS.history] || [];

  // Update existing solved history matches
  let updated = false;
  history = history.map(h => {
    if (h.slug === problem.slug) {
      updated = true;
      return { ...h, isFavorite: bookmarked };
    }
    return h;
  });

  if (!updated && bookmarked) {
    // If not solved yet, create a placeholder solve that is starred
    const nowStr = new Date().toISOString();
    const newEntry = {
      id: "",
      title: problem.title,
      slug: problem.slug,
      difficulty: problem.difficulty || "Medium",
      url: problem.leetcodeUrl || "",
      savedAt: nowStr,
      approach: "oa",
      language: "python",
      notes: "",
      githubUrl: "",
      isFavorite: true,
      revisionCount: 1,
      revisionCompleted: false,
      revisionCompletedAt: null,
      readmePath: ""
    };
    history.unshift(newEntry);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
  await syncCloudData();
}

async function openStarPopover(problem, starBtn, solvedMap) {
  let starPopover = document.getElementById("leetsync-star-popover");
  if (!starPopover) {
    starPopover = document.createElement("div");
    starPopover.id = "leetsync-star-popover";
    starPopover.className = "star-popover glass hidden";
    starPopover.style = "position: absolute; z-index: 10000; width: 220px; background: rgba(30, 30, 30, 0.95); border: 1px solid var(--clr-border); border-radius: var(--radius); padding: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); backdrop-filter: blur(10px); color: var(--clr-text); font-family: sans-serif;";
    document.body.appendChild(starPopover);
  }

  const scrollContainer = starBtn.closest(".main-content") || window;

  const updatePosition = () => {
    if (starPopover.classList.contains("hidden") || !document.body.contains(starBtn)) {
      scrollContainer.removeEventListener("scroll", updatePosition);
      return;
    }
    const rect = starBtn.getBoundingClientRect();
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    starPopover.style.left = `${rect.left + scrollLeft - 80}px`;
    starPopover.style.top = `${rect.bottom + scrollTop + 8}px`;
  };

  const handleOutsideClick = (e) => {
    if (starPopover.contains(e.target)) return;

    if (!e.target.closest(".btn-ico")) {
      e.stopPropagation();
      e.preventDefault();
    }

    starPopover.classList.add("hidden");
    document.removeEventListener("click", handleOutsideClick, true);
    scrollContainer.removeEventListener("scroll", updatePosition);
  };

  if (starPopover._outsideClickRef) {
    document.removeEventListener("click", starPopover._outsideClickRef, true);
  }
  starPopover._outsideClickRef = handleOutsideClick;

  if (starPopover._scrollRef && starPopover._scrollContainerRef) {
    starPopover._scrollContainerRef.removeEventListener("scroll", starPopover._scrollRef);
  }
  starPopover._scrollRef = updatePosition;
  starPopover._scrollContainerRef = scrollContainer;

  setTimeout(() => {
    document.addEventListener("click", handleOutsideClick, true);
  }, 0);
  
  const slug = problem.slug.trim().toLowerCase();
  const solves = solvedMap[slug] || [];
  const representativeSolve = solves[0] || null;
  
  let activeLists = [];
  if (representativeSolve) {
    if (representativeSolve.starredLists) {
      activeLists = representativeSolve.starredLists.map(l => l.toLowerCase());
    } else if (representativeSolve.isFavorite) {
      activeLists = ["favorite"];
    }
  }

  const stored = await chrome.storage.local.get("customStarredLists");
  const customLists = stored.customStarredLists || [];
  const allLists = ["Favorite", "Revision", ...customLists];

  starPopover.innerHTML = `
    <div style="font-weight: 800; font-size: 12px; color: var(--clr-muted); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
      <span>My Lists</span>
      <span style="font-size: 11px; opacity: 0.5;">🔒 Default</span>
    </div>
    <div class="popover-lists-container" style="display: flex; flex-direction: column; gap: 6px; max-height: 150px; overflow-y: auto; margin-bottom: 8px;">
      ${allLists.map(listName => {
        const lowerName = listName.toLowerCase();
        const isChecked = activeLists.includes(lowerName);
        const isFixed = lowerName === "favorite" || lowerName === "revision";
        return `
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 700; cursor: pointer; user-select: none; padding: 4px 6px; border-radius: 4px; transition: background 0.15s ease;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" class="star-list-checkbox" data-list="${listName}" ${isChecked ? 'checked' : ''} style="cursor: pointer;">
              <span>${listName}</span>
            </div>
            ${isFixed ? '<span style="font-size: 10px; opacity: 0.3;">🔒</span>' : `<button class="btn-delete-list" data-list="${listName}" style="background: none; border: none; cursor: pointer; opacity: 0.4; font-size: 11px; padding: 2px;">🗑️</button>`}
          </label>
        `;
      }).join("")}
    </div>
    <div style="border-top: 1px solid var(--clr-border); padding-top: 8px; margin-top: 8px;">
      <div class="popover-create-list-row" style="display: flex; gap: 4px; align-items: center;">
        <input type="text" id="popover-new-list-input" placeholder="+ Create a new list" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid var(--clr-border); border-radius: 4px; padding: 4px 6px; font-size: 11.5px; color: var(--clr-text); outline: none;">
        <button id="popover-new-list-btn" style="background: var(--clr-primary); border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 11px; padding: 4px 8px; font-weight: 800; display: flex; align-items: center; justify-content: center; height: 24px;">Add</button>
      </div>
    </div>
  `;
  
  starPopover.classList.remove("hidden");
  scrollContainer.addEventListener("scroll", updatePosition);
  updatePosition();

  const checkboxes = starPopover.querySelectorAll(".star-list-checkbox");
  checkboxes.forEach(cb => {
    cb.addEventListener("change", async () => {
      const listName = cb.dataset.list;
      const checked = cb.checked;
      await toggleProblemFromList(problem, listName, checked);
      const isStarredNow = await checkIsStarred(problem.slug);
      if (isStarredNow) {
        starBtn.classList.add("active-star");
        starBtn.textContent = "⭐";
      } else {
        starBtn.classList.remove("active-star");
        starBtn.textContent = "☆";
      }
    });
  });

  const deleteBtns = starPopover.querySelectorAll(".btn-delete-list");
  deleteBtns.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const listName = btn.dataset.list;
      if (confirm(`Are you sure you want to delete the list "${listName}"? This will remove all questions from this list.`)) {
        await deleteCustomListGlobally(listName);
        openStarPopover(problem, starBtn, solvedMap);
        renderSheets();
      }
    });
  });

  const input = starPopover.querySelector("#popover-new-list-input");
  const addBtn = starPopover.querySelector("#popover-new-list-btn");
  
  const handleAddList = async () => {
    const listName = input.value.trim();
    if (!listName) return;
    if (listName.toLowerCase() === "favorite" || listName.toLowerCase() === "revision") {
      alert("This is a reserved list name.");
      return;
    }
    await addCustomListGlobally(listName);
    await toggleProblemFromList(problem, listName, true);
    openStarPopover(problem, starBtn, solvedMap);
    starBtn.classList.add("active-star");
    starBtn.textContent = "⭐";
    renderSheets();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddList();
    }
  });

  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleAddList();
  });
}

async function toggleProblemFromList(problem, listName, add) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = stored[STORAGE_KEYS.history] || [];
  let updated = false;

  history = history.map(h => {
    if (h.slug === problem.slug) {
      updated = true;
      let lists = h.starredLists || [];
      if (h.isFavorite && !lists.map(l => l.toLowerCase()).includes("favorite")) {
        lists.push("Favorite");
      }
      
      if (add) {
        if (!lists.map(l => l.toLowerCase()).includes(listName.toLowerCase())) lists.push(listName);
      } else {
        lists = lists.filter(l => l.toLowerCase() !== listName.toLowerCase());
      }
      
      const isFavorite = lists.length > 0;
      return { ...h, starredLists: lists, isFavorite };
    }
    return h;
  });

  if (!updated && add) {
    const nowStr = new Date().toISOString();
    const newEntry = {
      id: "",
      title: problem.title,
      slug: problem.slug,
      difficulty: problem.difficulty || "Medium",
      url: problem.leetcodeUrl || "",
      savedAt: nowStr,
      approach: "oa",
      language: "python",
      notes: "",
      githubUrl: "",
      isFavorite: true,
      starredLists: [listName],
      revisionCount: 1,
      revisionCompleted: false,
      revisionCompletedAt: null,
      readmePath: ""
    };
    history.unshift(newEntry);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
  await syncCloudData();
}

async function checkIsStarred(slug) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = stored[STORAGE_KEYS.history] || [];
  const entry = history.find(h => h.slug === slug);
  if (!entry) return false;
  return entry.isFavorite || (entry.starredLists && entry.starredLists.length > 0);
}

async function addCustomListGlobally(listName) {
  const stored = await chrome.storage.local.get("customStarredLists");
  const customLists = stored.customStarredLists || [];
  if (!customLists.map(l => l.toLowerCase()).includes(listName.toLowerCase())) {
    customLists.push(listName);
    await chrome.storage.local.set({ customStarredLists: customLists });
  }
}

async function deleteCustomListGlobally(listName) {
  const storedList = await chrome.storage.local.get("customStarredLists");
  let customLists = storedList.customStarredLists || [];
  customLists = customLists.filter(l => l.toLowerCase() !== listName.toLowerCase());
  await chrome.storage.local.set({ customStarredLists: customLists });

  const storedHist = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = storedHist[STORAGE_KEYS.history] || [];
  history = history.map(h => {
    if (h.starredLists) {
      const newLists = h.starredLists.filter(l => l.toLowerCase() !== listName.toLowerCase());
      return { ...h, starredLists: newLists, isFavorite: newLists.length > 0 };
    }
    return h;
  });
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
}

function setupSmartListListeners() {
  if (el.smartListTitleInput && el.smartListTitleCount) {
    el.smartListTitleInput.addEventListener("input", (e) => {
      const len = e.target.value.length;
      el.smartListTitleCount.textContent = `${len}/30`;
    });
  }
  if (el.smartListDescInput && el.smartListDescCount) {
    el.smartListDescInput.addEventListener("input", (e) => {
      const len = e.target.value.length;
      el.smartListDescCount.textContent = `${len}/150`;
    });
  }

  if (el.btnSaveAsSmartList) {
    el.btnSaveAsSmartList.addEventListener("click", () => {
      if (el.smartListModal) {
        el.smartListModal.classList.remove("hidden");
        if (el.smartListTitleInput) {
          el.smartListTitleInput.value = "";
          el.smartListTitleCount.textContent = "0/30";
        }
        if (el.smartListDescInput) {
          el.smartListDescInput.value = "";
          el.smartListDescCount.textContent = "0/150";
        }
      }
    });
  }

  const closeSmartListModal = () => {
    if (el.smartListModal) el.smartListModal.classList.add("hidden");
  };
  if (el.smartListModalCloseBtn) el.smartListModalCloseBtn.addEventListener("click", closeSmartListModal);
  if (el.smartListCancelBtn) el.smartListCancelBtn.addEventListener("click", closeSmartListModal);

  if (el.smartListCreateBtn) {
    el.smartListCreateBtn.addEventListener("click", async () => {
      const title = el.smartListTitleInput.value.trim();
      const desc = el.smartListDescInput.value.trim();
      if (!title) {
        alert("Please enter a list title.");
        return;
      }

      const lowerTitle = title.toLowerCase();
      if (lowerTitle === "favorite" || lowerTitle === "revision") {
        alert("This is a reserved list name.");
        return;
      }

      const storedStar = await chrome.storage.local.get("customStarredLists");
      const customLists = storedStar.customStarredLists || [];
      if (customLists.map(l => l.toLowerCase()).includes(lowerTitle)) {
        alert("A static list with this name already exists. Please choose a different name.");
        return;
      }

      const storedSmart = await chrome.storage.local.get("customSmartLists");
      const customSmartLists = storedSmart.customSmartLists || {};

      customSmartLists[lowerTitle] = {
        name: title,
        description: desc,
        rules: JSON.parse(JSON.stringify(activeFilters)),
        isSmart: true
      };

      await chrome.storage.local.set({ customSmartLists });

      selectedSidebarList = title;
      selectedSidebarListIsSmart = true;
      
      // Reset other advanced filters
      ["difficulty", "status", "topic", "pattern", "collection"].forEach(t => {
        activeFilters[t].vals = [];
        const optionsDiv = document.getElementById(`filterOptions${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (optionsDiv) {
          optionsDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => cb.checked = false);
        }
      });
      activeFilters.list.vals = []; // Clear list filter
      updateFilterBadgeAndRender();

      closeSmartListModal();
      renderSheets();
    });
  }

  if (el.btnCreateNewListSidebar) {
    el.btnCreateNewListSidebar.addEventListener("click", () => {
      const listName = prompt("Enter a name for the new list:");
      if (!listName) return;
      const trimmed = listName.trim();
      if (!trimmed) return;
      if (trimmed.toLowerCase() === "favorite" || trimmed.toLowerCase() === "revision") {
        alert("This is a reserved list name.");
        return;
      }
      addCustomListGlobally(trimmed).then(() => {
        renderMyListsSidebar();
      });
    });
  }
}

async function renderMyListsSidebar() {
  const container = el.sheetsSidebarLists;
  if (!container) return;

  const storedStar = await chrome.storage.local.get("customStarredLists");
  const customLists = storedStar.customStarredLists || [];
  
  const storedSmart = await chrome.storage.local.get("customSmartLists");
  const customSmartLists = storedSmart.customSmartLists || {};

  container.innerHTML = "";

  // 1. Render default and static lists
  const staticLists = ["Favorite", "Revision", ...customLists];
  staticLists.forEach(listName => {
    const isFixed = listName.toLowerCase() === "favorite" || listName.toLowerCase() === "revision";
    const isActive = selectedSidebarList && selectedSidebarList.toLowerCase() === listName.toLowerCase() && !selectedSidebarListIsSmart;

    const item = document.createElement("div");
    item.className = "sidebar-list-item" + (isActive ? " active" : "");
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
        <span style="font-size: 14px;">${listName.toLowerCase() === "favorite" ? "⭐" : "📂"}</span>
        <span>${listName}</span>
      </div>
      ${isFixed ? `<span style="font-size: 11px; opacity: 0.3;">🔒</span>` : `<button class="delete-btn" title="Delete List" style="background: none; border: none; cursor: pointer; color: var(--clr-text); display: flex; align-items: center; justify-content: center; font-size: 11px;">🗑️</button>`}
    `;

    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-btn") || e.target.closest(".delete-btn")) {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete the list "${listName}"? This will remove all questions from this list.`)) {
          deleteCustomListGlobally(listName).then(() => {
            if (isActive) selectedSidebarList = null;
            renderSheets();
          });
        }
        return;
      }

      if (isActive) {
        selectedSidebarList = null;
      } else {
        selectedSidebarList = listName;
        selectedSidebarListIsSmart = false;
      }
      renderSheets();
    });

    container.appendChild(item);
  });

  // 2. Render dynamic smart lists
  Object.keys(customSmartLists).forEach(key => {
    const smartList = customSmartLists[key];
    const listName = smartList.name;
    const isActive = selectedSidebarList && selectedSidebarList.toLowerCase() === listName.toLowerCase() && selectedSidebarListIsSmart;

    const item = document.createElement("div");
    item.className = "sidebar-list-item" + (isActive ? " active" : "");
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
        <span style="font-size: 14px;">🧠</span>
        <span>${listName}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="smart-list-icon" title="Smart List" style="font-size: 12px; cursor: help; opacity: 0.8; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px;">⚛️</span>
        <button class="delete-btn" title="Delete List" style="background: none; border: none; cursor: pointer; color: var(--clr-text); display: flex; align-items: center; justify-content: center; font-size: 11px;">🗑️</button>
      </div>
    `;

    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-btn") || e.target.closest(".delete-btn")) {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete the smart list "${listName}"?`)) {
          deleteSmartListGlobally(listName).then(() => {
            if (isActive) selectedSidebarList = null;
            renderSheets();
          });
        }
        return;
      }

      if (isActive) {
        selectedSidebarList = null;
      } else {
        selectedSidebarList = listName;
        selectedSidebarListIsSmart = true;
      }
      renderSheets();
    });

    container.appendChild(item);
  });
}

function renderFlatListProblems(solvedMap) {
  const container = el.sheetAccordionContainer;
  if (!container) return;
  container.innerHTML = "";

  // Hide active sheet select dropdown card (keep progress widget visible!)
  const sheetSelectCard = document.getElementById("sheetSelectCard");
  if (sheetSelectCard) sheetSelectCard.style.display = "none";

  const controlsRow = document.querySelector(".sheet-controls-row");
  if (controlsRow) controlsRow.style.display = "none";
  const topicPills = document.getElementById("sheetTopicPills");
  if (topicPills) topicPills.style.display = "none";

  if (selectedSidebarListIsSmart) {
    chrome.storage.local.get("customSmartLists").then((storedSmart) => {
      const customSmartLists = storedSmart.customSmartLists || {};
      const smartList = customSmartLists[selectedSidebarList.toLowerCase()];
      const rules = smartList ? smartList.rules : activeFilters;

      const selectedSheetName = el.sheetSelect.value;
      loadSheet(selectedSheetName).then(sheetData => {
        evaluateAndRenderSmartList(sheetData, solvedMap, rules, sheetSelectCard, controlsRow, topicPills);
      });
    });
  } else {
    chrome.storage.local.get(STORAGE_KEYS.history).then((storedHist) => {
      const history = storedHist[STORAGE_KEYS.history] || [];
      const listProblems = [];
      const uniqueSlugs = new Set();
      
      history.forEach(h => {
        if (!h.slug) return;
        const slug = normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl);
        if (uniqueSlugs.has(slug)) return;

        let match = false;
        if (selectedSidebarList.toLowerCase() === "favorite") {
          match = h.isFavorite || (h.starredLists && h.starredLists.map(l => l.toLowerCase()).includes("favorite"));
        } else {
          match = h.starredLists && h.starredLists.map(l => l.toLowerCase()).includes(selectedSidebarList.toLowerCase());
        }

        if (match) {
          uniqueSlugs.add(slug);
          listProblems.push({
            title: h.name || h.title || slug,
            slug: slug,
            difficulty: h.difficulty || "Medium",
            leetcodeUrl: h.leetcodeUrl || h.url || `https://leetcode.com/problems/${slug}`
          });
        }
      });

      renderFlatTableUI(listProblems, solvedMap, sheetSelectCard, controlsRow, topicPills, false);
    });
  }
}

function evaluateAndRenderSmartList(sheetData, solvedMap, rules, sheetSelectCard, controlsRow, topicPills) {
  const allProblems = [];
  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    for (const [subtopicName, subproblems] of Object.entries(subtopics)) {
      subproblems.forEach(p => {
        allProblems.push({ ...p, topicName, subtopicName });
      });
    }
  }

  const listProblems = filterSheetProblems(allProblems, solvedMap, rules);
  renderFlatTableUI(listProblems, solvedMap, sheetSelectCard, controlsRow, topicPills, true);
}

function renderFlatTableUI(listProblems, solvedMap, sheetSelectCard, controlsRow, topicPills, isSmart) {
  const container = el.sheetAccordionContainer;
  if (!container) return;

  // Calculate difficulty progress for this specific list
  let completedProblems = 0;
  let easySolved = 0, easyTotal = 0;
  let mediumSolved = 0, mediumTotal = 0;
  let hardSolved = 0, hardTotal = 0;
  let attemptingCount = 0;

  listProblems.forEach(p => {
    const slug = p.slug.trim().toLowerCase();
    const solves = solvedMap[slug] || [];
    const isCompleted = solves.length > 0;

    if (isCompleted) completedProblems++;
    else attemptingCount++;

    const diff = (p.difficulty || "Medium").toLowerCase();
    if (diff === "easy") {
      easyTotal++;
      if (isCompleted) easySolved++;
    } else if (diff === "hard") {
      hardTotal++;
      if (isCompleted) hardSolved++;
    } else {
      mediumTotal++;
      if (isCompleted) mediumSolved++;
    }
  });

  updateProgressWidget(completedProblems, listProblems.length, easySolved, easyTotal, mediumSolved, mediumTotal, hardSolved, hardTotal, attemptingCount);

  const listHeader = document.createElement("div");
  listHeader.className = "list-info-header glass";
  listHeader.style = "padding: 16px; border: 1px solid var(--clr-border); border-radius: var(--radius); margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02);";
  listHeader.innerHTML = `
    <div>
      <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--clr-text); display: flex; align-items: center; gap: 8px;">
        <span>${isSmart ? "⚛️" : (selectedSidebarList.toLowerCase() === "favorite" ? "⭐" : "📂")}</span>
        <span>${selectedSidebarList}</span>
        ${isSmart ? '<span style="font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: rgba(56,189,248,0.15); color: var(--clr-primary); margin-left: 8px;">Smart List</span>' : ''}
      </h2>
      <p style="margin: 4px 0 0 0; font-size: 12.5px; color: var(--clr-muted);">${isSmart ? 'Dynamic rule-based smart list.' : 'Static bookmarked list.'} Total questions: <strong>${listProblems.length}</strong></p>
    </div>
    <button id="btnExitListView" class="filter-reset-btn" style="border: 1px solid var(--clr-border); border-radius: 4px; padding: 6px 12px; font-size: 11.5px; font-weight: 700; color: var(--clr-text); cursor: pointer; background: none;">Exit List View</button>
  `;
  container.appendChild(listHeader);

  const exitBtn = listHeader.querySelector("#btnExitListView");
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      selectedSidebarList = null;
      if (sheetSelectCard) sheetSelectCard.style.display = "flex";
      if (controlsRow) controlsRow.style.display = "flex";
      if (topicPills) topicPills.style.display = "flex";
      renderSheets();
    });
  }

  if (listProblems.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.style = "text-align: center; padding: 48px; color: var(--clr-muted); font-weight: 700; border: 1px dashed var(--clr-border); border-radius: var(--radius); background: rgba(255,255,255,0.01); margin-top: 12px;";
    emptyDiv.textContent = isSmart ? "No questions match this smart list's rules." : "This list is empty. Add questions to this list using the star icon in problem sheets!";
    container.appendChild(emptyDiv);
    return;
  }

  const sorted = sortProblems(listProblems, solvedMap);

  const table = document.createElement("table");
  table.className = "sheets-problems-table";
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.marginBottom = "24px";
  
  renderTableHead(table);

  const tbody = document.createElement("tbody");
  sorted.forEach(problem => {
    const tr = createProblemRow(problem, solvedMap, true);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

async function deleteSmartListGlobally(listName) {
  const storedSmart = await chrome.storage.local.get("customSmartLists");
  const customSmartLists = storedSmart.customSmartLists || {};
  delete customSmartLists[listName.toLowerCase()];
  await chrome.storage.local.set({ customSmartLists });
}

function setupSidebarResize() {
  const splitter = document.getElementById("sidebarSplitter");
  const sidebar = document.querySelector(".sidebar");
  const appContainer = document.querySelector(".app-container");
  
  if (!splitter || !sidebar) return;
  
  let isDragging = false;
  
  splitter.addEventListener("mousedown", (e) => {
    if (e.target.closest("#btnCollapseSidebar")) return;
    
    isDragging = true;
    appContainer.classList.add("sidebar-resizing");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });
  
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    
    const newWidth = e.clientX;
    
    if (newWidth < 100) {
      appContainer.classList.add("sidebar-collapsed");
      isDragging = false;
      cleanupDrag();
    } else if (newWidth >= 150 && newWidth <= 450) {
      sidebar.style.width = `${newWidth}px`;
      sidebar.style.minWidth = `${newWidth}px`;
      appContainer.classList.remove("sidebar-collapsed");
    }
  });
  
  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      cleanupDrag();
    }
  });
  
  function cleanupDrag() {
    appContainer.classList.remove("sidebar-resizing");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
}

function updateProgressWidget(solvedCount, totalCount, easySolved, easyTotal, mediumSolved, mediumTotal, hardSolved, hardTotal, attemptingCount) {
  const solvedSpan = document.getElementById("widgetSolvedCount");
  const totalSpan = document.getElementById("widgetTotalCount");
  const easySpan = document.getElementById("widgetEasyCount");
  const mediumSpan = document.getElementById("widgetMediumCount");
  const hardSpan = document.getElementById("widgetHardCount");
  const fillPath = document.getElementById("widgetProgressCircleFill");

  const easyBar = document.getElementById("widgetEasyBar");
  const mediumBar = document.getElementById("widgetMediumBar");
  const hardBar = document.getElementById("widgetHardBar");

  if (solvedSpan) solvedSpan.textContent = solvedCount;
  if (totalSpan) totalSpan.textContent = totalCount;
  if (easySpan) easySpan.textContent = `${easySolved}/${easyTotal}`;
  if (mediumSpan) mediumSpan.textContent = `${mediumSolved}/${mediumTotal}`;
  if (hardSpan) hardSpan.textContent = `${hardSolved}/${hardTotal}`;

  if (easyBar) {
    const easyPct = easyTotal > 0 ? (easySolved / easyTotal) * 100 : 0;
    easyBar.style.width = `${easyPct}%`;
  }
  if (mediumBar) {
    const medPct = mediumTotal > 0 ? (mediumSolved / mediumTotal) * 100 : 0;
    mediumBar.style.width = `${medPct}%`;
  }
  if (hardBar) {
    const hardPct = hardTotal > 0 ? (hardSolved / hardTotal) * 100 : 0;
    hardBar.style.width = `${hardPct}%`;
  }

  if (fillPath) {
    const pct = totalCount > 0 ? (solvedCount / totalCount) : 0;
    // Circumference of the 270-degree arc (r=40) is 188.5
    const offset = 188.5 * (1 - pct);
    fillPath.style.strokeDashoffset = offset;
  }
}

async function exportActiveSheetToExcel() {
  const problems = await getActiveSheetProblems();
  if (problems.length === 0) {
    alert("No problems found in the active sheet to export!");
    return;
  }

  // Fetch solves history
  const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = storedHistory[STORAGE_KEYS.history] || [];
  
  const solvedMap = {};
  history.forEach(h => {
    if (h.slug) {
      const slug = h.slug.trim().toLowerCase();
      if (!solvedMap[slug]) {
        solvedMap[slug] = [];
      }
      solvedMap[slug].push(h);
    }
  });

  const diffStyle = {
    easy:   "background:#f0fdf4;color:#166534;",   // soft green
    medium: "background:#fffbeb;color:#92400e;",   // soft yellow/amber
    hard:   "background:#fef2f2;color:#991b1b;",   // soft red
  };

  const approachDisplayName = (app) => {
    if (app === "brute") return "Brute";
    if (app === "better") return "Better";
    if (app === "optimal") return "Optimal";
    return (app || "").toUpperCase();
  };

  const headingCells = [
    "#", "Title", "Topic", "Subtopic", "Difficulty", "Status", "Revision", "Time Spent", "Star", "Date", "Notes", "LeetCode/GFG Link", "GitHub Link"
  ].map(h => `<th x:autofilter="all" style="background:#0f172a;color:#ffffff;font-weight:bold;padding:10px 14px;border:1px solid #334155;font-size:12px;text-align:center;white-space:nowrap;font-family:'Segoe UI',sans-serif;">${h}</th>`)
   .join("");

  const dataRows = problems.map((prob, i) => {
    const slug = prob.slug?.trim().toLowerCase();
    const solves = solvedMap[slug] || [];
    const isCompleted = solves.length > 0;
    const diff = (prob.difficulty || "").toLowerCase();
    const rowStyle = diffStyle[diff] || "background:#f8fafc;";
    const tdStyle = `padding:8px 12px;border:1px solid #cbd5e1;font-size:11.5px;font-family:'Segoe UI',sans-serif;`;

    const statusVal = isCompleted ? "Completed" : "Pending";
    const starVal = solves.some(s => s.isFavorite) ? "⭐" : "—";
    const revCount = solves.length > 0 ? (solves[0].revisionCount || 1) : "—";
    const timeSpentVal = solves.length > 0 ? (solves[0].timeSpent || "—") : "—";
    const dateVal = (solves.length > 0 && solves[0].savedAt) ? new Date(solves[0].savedAt).toLocaleDateString() : "—";

    // Dynamic problem URL
    const problemUrl = prob.leetcodeUrl || `https://leetcode.com/problems/${slug}/`;
    const titleLink = `<a href="${escapeHtml(problemUrl)}" style="color:#0284c7;text-decoration:underline;font-weight:600;">${escapeHtml(prob.title)}</a>`;
    const leetcodeCell = `<a href="${escapeHtml(problemUrl)}" style="color:#0284c7;text-decoration:underline;font-weight:600;">Open Link</a>`;

    // Unique approaches
    const uniqueApproachesList = [];
    const seenApproaches = new Set();
    solves.forEach(h => {
      if (!seenApproaches.has(h.approach)) {
        seenApproaches.add(h.approach);
        uniqueApproachesList.push(h);
      }
    });

    const mergedApproaches = uniqueApproachesList.map(h => approachDisplayName(h.approach)).join(", ") || "—";
    const mergedGithubLinks = uniqueApproachesList.map(h => {
      const label = escapeHtml(approachDisplayName(h.approach));
      if (h.githubUrl) {
        return `<a href="${escapeHtml(h.githubUrl)}" style="color:#0284c7;text-decoration:underline;">${label} Link</a>`;
      }
      return `${label}: —`;
    }).join("<br>") || "—";

    const mergedNotes = uniqueApproachesList.map(h => {
      const label = escapeHtml(approachDisplayName(h.approach));
      let safeNotes = escapeHtml(h.notes?.trim() || "");
      const notesContent = safeNotes ? safeNotes.replace(/\n+/g, "<br>") : "—";
      return `<b>[${label}]</b>: ${notesContent}`;
    }).join("<br>") || "—";

    return `
      <tr style="${rowStyle}">
        <td style="${tdStyle}text-align:center;vertical-align:top;">${i + 1}</td>
        <td style="${tdStyle}font-weight:600;vertical-align:top;color:#0f172a;">${titleLink}</td>
        <td style="${tdStyle}vertical-align:top;">${escapeHtml(cleanDisplayName(prob.topicName) || "—")}</td>
        <td style="${tdStyle}vertical-align:top;">${escapeHtml(cleanDisplayName(prob.subtopicName) || "—")}</td>
        <td style="${tdStyle}text-align:center;font-weight:700;vertical-align:top;">${prob.difficulty}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;font-weight:600;">${statusVal}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${solves.length > 0 ? "Rev " + revCount : "—"}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${timeSpentVal}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${starVal}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${dateVal}</td>
        <td style="${tdStyle}max-width:300px;white-space:normal;vertical-align:top;">${mergedNotes}</td>
        <td style="${tdStyle}vertical-align:top;text-align:center;">${leetcodeCell}</td>
        <td style="${tdStyle}vertical-align:top;text-align:center;">${mergedGithubLinks}</td>
      </tr>`;
  }).join("\n");

  const selectedSheetName = el.sheetSelect.options[el.sheetSelect.selectedIndex]?.text || "DSA Sheet";

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml><x:ExcelWorkbook><x:ExcelWorksheets>
        <x:ExcelWorksheet><x:Name>DSA Sheet Progress</x:Name>
        <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        <x:AutoFilter x:range="A4:M${problems.length + 4}"/>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets></x:ExcelWorkbook></xml>
      <![endif]-->
    </head>
    <body style="font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:20px;">
      <table border="1" cellspacing="0" cellpadding="0"
             style="border-collapse:collapse;font-family:'Segoe UI',sans-serif;width:100%;border:1px solid #cbd5e1;">
        <thead>
          <tr style="height: 42px;">
            <th colspan="13" style="background:#1e3a8a;color:#ffffff;font-size:16px;font-weight:bold;text-align:center;vertical-align:middle;font-family:'Segoe UI',sans-serif;border:1px solid #1e3a8a;">⚡ LeetSync Pro — ${escapeHtml(selectedSheetName)} Progress Report</th>
          </tr>
          <tr style="height: 24px;">
            <th colspan="13" style="background:#f1f5f9;color:#475569;font-size:10.5px;text-align:center;vertical-align:middle;font-weight:600;font-family:'Segoe UI',sans-serif;border:1px solid #cbd5e1;">Generated on: ${new Date().toLocaleString()} · Total Problems: ${problems.length}</th>
          </tr>
          <tr style="height: 10px;"><th colspan="13" style="border:none;background:#ffffff;"></th></tr>
          <tr style="mso-filter:auto;">${headingCells}</tr>
        </thead>
        <tbody>${dataRows}</tbody>
      </table>
    </body>
    </html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  
  const cleanSheetName = selectedSheetName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  link.download = `leetsync-sheet-${cleanSheetName}-${new Date().toISOString().slice(0, 10)}.xls`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function renderPOTDWidget() {
  const container = document.getElementById("potdGridContainer");
  const streakBadge = document.getElementById("potdStreakProgress");
  if (!container) return;

  try {
    const potdData = await getDailyPOTD();
    const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
    const history = stored[STORAGE_KEYS.history] || [];

    // Filter today's solves
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySolves = history.filter(h => {
      if (!h.savedAt) return false;
      const solveDateStr = new Date(h.savedAt).toISOString().slice(0, 10);
      return solveDateStr === todayStr;
    });

    // Segment today's solves by platform
    const lcSolves = todaySolves.filter(h => !h.url || h.url.includes("leetcode.com"));
    const gfgSolves = todaySolves.filter(h => h.url && h.url.includes("geeksforgeeks.org"));
    const cnSolves = todaySolves.filter(h => h.url && (h.url.includes("codingninjas.com") || h.url.includes("naukri.com/code360")));

    let solvedCount = 0;
    container.innerHTML = "";

    const platforms = [
      { 
        key: "leetcode", 
        name: "LeetCode", 
        class: "leetcode", 
        logo: "🟨", 
        checkSolved: (info) => {
          const slug = info.slug?.trim().toLowerCase();
          return lcSolves.some(h => h.slug?.trim().toLowerCase() === slug || (info.title && h.title?.toLowerCase() === info.title.toLowerCase()));
        },
        getTitle: (info) => info.title
      },
      { 
        key: "gfg", 
        name: "GeeksforGeeks", 
        class: "gfg", 
        logo: "🟩", 
        checkSolved: (info) => {
          const slug = info.slug?.trim().toLowerCase();
          if (!slug || slug === "problem-of-the-day" || slug === "") {
            return gfgSolves.length > 0;
          }
          return gfgSolves.some(h => {
            const hSlug = (h.slug || "").trim().toLowerCase();
            return hSlug === slug || hSlug.replace(/-[0-9]+$/, "") === slug.replace(/-[0-9]+$/, "");
          });
        },
        getTitle: (info) => {
          const slug = info.slug?.trim().toLowerCase();
          if (!slug || slug === "problem-of-the-day" || slug === "") {
            return gfgSolves[0] ? gfgSolves[0].title : info.title;
          }
          return info.title;
        }
      },
      { 
        key: "code360", 
        name: "Code 360", 
        class: "codingninjas", 
        logo: "🟧", 
        checkSolved: () => cnSolves.length > 0,
        getTitle: (info) => {
          return cnSolves.length > 0 ? cnSolves[0].title : info.title;
        }
      }
    ];

    // Self-healing: if cache is old and doesn't contain new code360 key, clear and re-fetch
    if (potdData && !potdData.code360) {
      console.log("LeetSync: Obsolete cache detected. Re-fetching fresh POTD data...");
      await chrome.storage.local.remove("leetsyncPotdCache");
      return renderPOTDWidget();
    }

    const fallbackUrls = {
      leetcode: "https://leetcode.com/problemset/all/",
      gfg: "https://practice.geeksforgeeks.org/problem-of-the-day",
      code360: "https://www.naukri.com/code360/problem-of-the-day"
    };

    platforms.forEach(p => {
      const info = potdData[p.key] || {};
      const isSolved = p.checkSolved(info);
      const displayTitle = p.getTitle(info);
      const targetUrl = info.url || fallbackUrls[p.key] || "#";

      if (isSolved) solvedCount++;

      const card = document.createElement("div");
      card.className = `potd-card ${p.class} ${isSolved ? "solved" : ""}`;
      
      const diffLower = (info.difficulty || "Medium").toLowerCase();
      
      card.innerHTML = `
        <div>
          <div class="potd-card-platform">
            <span>${p.logo}</span>
            <span>${p.name}</span>
          </div>
          <div class="potd-card-title" title="${escapeHtml(displayTitle || "")}">
            ${escapeHtml(displayTitle || "Daily Coding Challenge")}
          </div>
        </div>
        <div class="potd-card-footer">
          <span class="potd-card-diff ${diffLower}">${escapeHtml(info.difficulty || "Medium")}</span>
          <a href="${escapeHtml(targetUrl)}" target="_blank" class="potd-card-btn">
            ${isSolved ? "✅ Solved" : "Solve Now ↗"}
          </a>
        </div>
      `;
      container.appendChild(card);
    });

    if (streakBadge) {
      streakBadge.textContent = `Today's Solves: ${solvedCount}/${platforms.length}`;
    }
  } catch (e) {
    console.error("LeetSync: Failed to render POTD widget:", e);
    container.innerHTML = `<div style="color:var(--clr-muted); font-size:12px; padding:12px; text-align:center; grid-column:1/-1;">Failed to load daily challenges. Please refresh or check connection.</div>`;
  }
}
