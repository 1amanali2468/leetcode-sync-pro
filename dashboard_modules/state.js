// dashboard_modules/state.js - Shared Global State and Elements Cache

export const STORAGE_KEYS = {
  history: "leetsyncHistory",
  settings: "leetsyncSettings",
  streak:  "leetsyncStreak"
};

// Global mutable state object to avoid ES module read-only live binding re-assignment errors
export const state = {
  currentScreen: "overview",
  activeTopicName: null,
  currentYear: new Date().getFullYear(),
  sheetViewMode: "group", // "group" or "list"
  sheetSearchQuery: "",
  selectedTopicPill: "all",
  selectedSidebarList: null,
  selectedSidebarListIsSmart: false,
  currentCrossSheetMap: {},
  sheetSortDirection: "none", // Kept for backwards compatibility
  currentSortColumn: "none",  // "none", "status", "star", etc.
  currentSortDirection: "none", // "none", "asc", "desc", or difficulty phases
  
  activeFilters: {
    matchMode: "all", // "all" or "any"
    difficulty: { op: "is", vals: [] },
    status: { op: "is", vals: [] },
    topic: { op: "is", vals: [] },
    pattern: { op: "is", vals: [] },
    collection: { op: "is", vals: [] },
    list: { op: "is", vals: [] }
  }
};

export const DASHBOARD_TOPIC_PATTERNS = {
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

export const FIXED_TOPICS = [
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
export const el = {
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
