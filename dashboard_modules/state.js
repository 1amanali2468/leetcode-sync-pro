// dashboard_modules/state.js - Dashboard State Management
export { TOPIC_NAMES as FIXED_TOPICS, TOPIC_PATTERNS as DASHBOARD_TOPIC_PATTERNS } from "../shared_constants.js";

export const STORAGE_KEYS = {
  history: "leetsyncHistory",
  settings: "githubSettings",
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
  sheetSearchClear:     document.getElementById("sheetSearchClear"),
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
