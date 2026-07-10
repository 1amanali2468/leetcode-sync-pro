// popup.js – Main popup controller
import { FIREBASE_CONFIG, getFirestoreApiUrl } from "./firebase-config.js";
import { loadSheet, populateSheetDropdown as populateSheetDropdownHelper, getCrossSheetMap } from "./sheet-loader.js";
// Tabs: Settings | Stats | History
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  settings: "githubSettings",
  history: "leetsyncHistory",
};

const DEFAULT_CLIENT_ID = "Iv23lia8fcf70570b5ee";

let currentFilterDifficulties = [];
let currentFilterTopics = [];
let currentFilterTopicMode = "";
let currentFilterPatterns = [];
let currentFilterPatternMode = "";
let currentFilterCollections = [];
let currentFilterCollectionMode = "";

let currentCalendarDate = new Date();
let selectedCalendarDate = new Date();
let activeRevisionDropdownBtn = null;
let currentCrossSheetMap = {};

// ── DOM References ────────────────────────────────────────────────────────────
const el = {
  // Settings tab
  owner:           document.querySelector("#owner"),
  repo:            document.querySelector("#repo"),
  branch:          document.querySelector("#branch"),
  basePath:        document.querySelector("#basePath"),
  resultText:      document.querySelector("#resultText"),
  streakReminderEnabled: document.querySelector("#streakReminderEnabled"),

  // OAuth
  profileCard:       document.querySelector("#profileCard"),
  profileAvatar:     document.querySelector("#profileAvatar"),
  profileUsername:   document.querySelector("#profileUsername"),
  disconnectButton:  document.querySelector("#disconnectButton"),


  // Repo
  repoSelect:         document.querySelector("#repoSelect"),
  repoSelectContainer:document.querySelector("#repoSelectContainer"),
  toggleNewRepoBtn:   document.querySelector("#toggleNewRepoBtn"),
  newRepoArea:        document.querySelector("#newRepoArea"),
  newRepoName:        document.querySelector("#newRepoName"),
  createNewRepoBtn:   document.querySelector("#createNewRepoBtn"),
  cancelNewRepoBtn:   document.querySelector("#cancelNewRepoBtn"),

  // Stats tab
  statTotal:    document.querySelector("#statTotal"),
  statEasy:     document.querySelector("#statEasy"),
  statMedium:   document.querySelector("#statMedium"),
  statHard:     document.querySelector("#statHard"),
  statStreak:   document.querySelector("#statStreak"),
  statSolvedToday: document.querySelector("#statSolvedToday"),
  topicPillList: document.querySelector("#topicPillList"),
  btnResetLocal: document.querySelector("#btnResetLocal"),

  // History tab
  historyList:  document.querySelector("#historyList"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  historySearch: document.querySelector("#historySearch"),
  historyFilterDifficulty: document.querySelector("#historyFilterDifficultyContainer"),
  historyFilterDifficultyOptions: document.querySelector("#historyFilterDifficultyOptions"),
  historyFilterFav: document.querySelector("#historyFilterFav"),
  historyFilterTopic: document.querySelector("#historyFilterTopicContainer"),
  historyFilterPattern: document.querySelector("#historyFilterPatternContainer"),
  historyFilterCollection: document.querySelector("#historyFilterCollectionContainer"),
  // Calendar tab
  calendarMonthYear:       document.querySelector("#calendarMonthYear"),
  calendarGrid:            document.querySelector("#calendarGrid"),
  calendarPrevMonthBtn:    document.querySelector("#calendarPrevMonthBtn"),
  calendarNextMonthBtn:    document.querySelector("#calendarNextMonthBtn"),
  calendarSelectedDateStr: document.querySelector("#calendarSelectedDateStr"),
  calendarDayDetailsList:  document.querySelector("#calendarDayDetailsList"),
  // Revision scheduler
  statRevisionDueCount:    document.querySelector("#statRevisionDueCount"),
  popupRevisionList:       document.querySelector("#popupRevisionList"),
  
  // Notes Modal
  notesModal:              document.querySelector("#notesModal"),
  notesModalTitle:         document.querySelector("#notesModalTitle"),
  notesModalSubtitle:      document.querySelector("#notesModalSubtitle"),
  notesModalContainer:    document.querySelector("#notesModalContainer"),
  notesModalSaveBtn:       document.querySelector("#notesModalSaveBtn"),
  notesModalCancelBtn:     document.querySelector("#notesModalCancelBtn"),
  notesModalStatus:        document.querySelector("#notesModalStatus"),
};

// ── Tab Switching ─────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));

    btn.classList.add("active");
    document.getElementById(`tab-${tab}`).classList.remove("hidden");

    if (tab === "stats")   renderStats();
    if (tab === "calendar") renderCalendar();
    if (tab === "history") {
      renderHistory();
      // Wire up export button each time history tab is opened
      el.exportCsvBtn.onclick = exportCSV;
    }
    if (tab === "custom-solve") {
      initCustomSolveForm();
    }
    if (tab === "sheets") {
      renderSheets();
    }
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);

async function init() {
  // --- Check Authentication State ---
  const storedData = await chrome.storage.local.get([STORAGE_KEYS.history, STORAGE_KEYS.settings, "auth_user"]);
  const authUser = storedData.auth_user;
  const authScreen = document.getElementById("authScreen");
  const shell = document.querySelector(".shell");

  if (!authUser) {
    authScreen.classList.remove("hidden");
    shell.classList.add("hidden");
    document.getElementById("btnLaunchAuth").addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("login.html") });
    });
    return; // Halt dashboard initialization until signed in
  }

  // User is logged in
  authScreen.classList.add("hidden");
  shell.classList.remove("hidden");

  const btnOpenDashboard = document.getElementById("btnOpenDashboard");
  if (btnOpenDashboard) {
    btnOpenDashboard.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });
  }
  
  const cloudEmailEl = document.getElementById("cloudUserEmail");
  if (cloudEmailEl) {
    if (authUser.username) {
      cloudEmailEl.textContent = `${authUser.username} (GitHub)`;
    } else {
      cloudEmailEl.textContent = authUser.email;
    }
  }
  
  const logoutBtn = document.getElementById("btnLogout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await chrome.storage.local.remove(["auth_user", "githubSettings", "leetsyncSettings", "github_token", "github_profile"]);
      window.location.reload();
    });
  }

  // --- Manual Sync Button ---
  const syncBtn = document.getElementById("btnManualSync");
  if (syncBtn) {
    syncBtn.addEventListener("click", syncCloudData);
  }

  // --- Reset Local Data Button ---
  if (el.btnResetLocal) {
    el.btnResetLocal.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to wipe all offline solved history from this browser cache?\n\nThis will NOT delete your cloud database on Firestore.")) return;
      await chrome.storage.local.set({ [STORAGE_KEYS.history]: [] });
      renderHistory();
      renderStats();
      renderCalendar();
      setResult("Offline solved history wiped successfully.", "success");
    });
  }

  // --- Silent Auto-Sync on popup open ---
  setTimeout(syncCloudData, 100);

  // --- Auto-cleanup corrupted imported data ---
  if (storedData[STORAGE_KEYS.history]) {
    const history = storedData[STORAGE_KEYS.history];
    const originalLength = history.length;
    const cleaned = history.filter(entry => {
      if (entry.approach === "custom") return false;
      if (entry.githubUrl && entry.githubUrl.includes("/blob/") && !entry.githubUrl.match(/\.[a-zA-Z0-9]+$/)) {
        return false;
      }
      return true;
    });
    if (cleaned.length !== originalLength) {
      await chrome.storage.local.set({ [STORAGE_KEYS.history]: cleaned });
      storedData[STORAGE_KEYS.history] = cleaned;
    }
  }
  // --------------------------------------------

  const btnFetch = document.getElementById("btnFetchGitHubRepoSolves");
  if (btnFetch) {
    btnFetch.addEventListener("click", fetchGitHubRepoSolves);
  }

  applySettings(storedData[STORAGE_KEYS.settings] || {});

  const difficultyContainer = el.historyFilterDifficulty;
  const difficultyTrigger = document.getElementById("historyFilterDifficultyTrigger");
  const difficultyOptionsDiv = el.historyFilterDifficultyOptions;
  const difficultyText = difficultyTrigger ? difficultyTrigger.querySelector(".custom-select-text") : null;

  const topicContainer = el.historyFilterTopic;
  const topicTrigger = document.getElementById("historyFilterTopicTrigger");
  const topicOptionsDiv = document.getElementById("historyFilterTopicOptions");
  const topicText = topicTrigger ? topicTrigger.querySelector(".custom-select-text") : null;

  const topicCustomWrap = document.getElementById("historyFilterTopicCustomWrap");
  const topicCustomInput = document.getElementById("historyFilterTopicCustom");
  const topicResetBtn = document.getElementById("historyFilterTopicReset");
  
  const patternContainer = el.historyFilterPattern;
  const patternTrigger = document.getElementById("historyFilterPatternTrigger");
  const patternOptionsDiv = document.getElementById("historyFilterPatternOptions");
  const patternText = patternTrigger ? patternTrigger.querySelector(".custom-select-text") : null;

  const patternCustomWrap = document.getElementById("historyFilterPatternCustomWrap");
  const patternCustomInput = document.getElementById("historyFilterPatternCustom");
  const patternResetBtn = document.getElementById("historyFilterPatternReset");

  const collectionOptionsDiv = document.getElementById("historyFilterCollectionOptions");

  const closeAllDropdowns = () => {
    if (difficultyOptionsDiv) difficultyOptionsDiv.classList.add("hidden");
    if (topicOptionsDiv) topicOptionsDiv.classList.add("hidden");
    if (patternOptionsDiv) patternOptionsDiv.classList.add("hidden");
    if (collectionOptionsDiv) collectionOptionsDiv.classList.add("hidden");
  };

  if (difficultyTrigger && difficultyOptionsDiv) {
    difficultyTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = difficultyOptionsDiv.classList.contains("hidden");
      closeAllDropdowns();
      if (isHidden) difficultyOptionsDiv.classList.remove("hidden");
    });
  }

  if (topicTrigger && topicOptionsDiv) {
    topicTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = topicOptionsDiv.classList.contains("hidden");
      closeAllDropdowns();
      if (isHidden) topicOptionsDiv.classList.remove("hidden");
    });
  }

  if (patternTrigger && patternOptionsDiv) {
    patternTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = patternOptionsDiv.classList.contains("hidden");
      closeAllDropdowns();
      if (isHidden) patternOptionsDiv.classList.remove("hidden");
    });
  }

  // Close dropdowns on outside click
  document.addEventListener("click", () => {
    closeAllDropdowns();
  });

  const renderDifficultyOptions = () => {
    if (!difficultyOptionsDiv) return;
    difficultyOptionsDiv.innerHTML = "";
    
    // 1. All Option
    const allOpt = document.createElement("div");
    const isAllSelected = currentFilterDifficulties.length === 0;
    allOpt.className = "custom-select-option" + (isAllSelected ? " selected" : "");
    allOpt.dataset.value = "";
    
    const allCb = document.createElement("input");
    allCb.type = "checkbox";
    allCb.checked = isAllSelected;
    allCb.style.marginRight = "6px";
    allCb.style.pointerEvents = "none";
    allOpt.appendChild(allCb);
    
    const allText = document.createElement("span");
    allText.textContent = "All Diff";
    allOpt.appendChild(allText);
    difficultyOptionsDiv.appendChild(allOpt);

    // 2. Easy, Medium, Hard
    ["Easy", "Medium", "Hard"].forEach(diff => {
      const isSelected = currentFilterDifficulties.includes(diff);
      const opt = document.createElement("div");
      opt.className = "custom-select-option" + (isSelected ? " selected" : "");
      opt.dataset.value = diff;
      
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isSelected;
      cb.style.marginRight = "6px";
      cb.style.pointerEvents = "none";
      opt.appendChild(cb);
      
      const textSpan = document.createElement("span");
      textSpan.textContent = diff;
      opt.appendChild(textSpan);
      difficultyOptionsDiv.appendChild(opt);
    });
  };

  if (difficultyOptionsDiv) {
    difficultyOptionsDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      const opt = e.target.closest(".custom-select-option");
      if (!opt) return;

      const val = opt.dataset.value;
      if (val === "") {
        currentFilterDifficulties = [];
      } else {
        const idx = currentFilterDifficulties.indexOf(val);
        if (idx === -1) {
          currentFilterDifficulties.push(val);
        } else {
          currentFilterDifficulties.splice(idx, 1);
        }
      }

      if (difficultyText) {
        if (currentFilterDifficulties.length === 0) {
          difficultyText.textContent = "All Diff";
        } else {
          difficultyText.textContent = currentFilterDifficulties.join(", ");
        }
      }

      renderDifficultyOptions();
      renderHistory();
    });
  }

  const renderTopicOptions = () => {
    if (!topicOptionsDiv) return;
    topicOptionsDiv.innerHTML = "";
    
    // 1. All Option
    const allOpt = document.createElement("div");
    const isAllSelected = currentFilterTopicMode === "" && currentFilterTopics.length === 0;
    allOpt.className = "custom-select-option" + (isAllSelected ? " selected" : "");
    allOpt.dataset.value = "";
    
    const allCb = document.createElement("input");
    allCb.type = "checkbox";
    allCb.checked = isAllSelected;
    allCb.style.marginRight = "6px";
    allCb.style.pointerEvents = "none";
    allOpt.appendChild(allCb);
    
    const allText = document.createElement("span");
    allText.textContent = "All Topics";
    allOpt.appendChild(allText);
    topicOptionsDiv.appendChild(allOpt);

    // 2. Topics List
    POPUP_TOPIC_NAMES.forEach(topic => {
      const isSelected = currentFilterTopicMode === "" && currentFilterTopics.includes(topic);
      const opt = document.createElement("div");
      opt.className = "custom-select-option" + (isSelected ? " selected" : "");
      opt.dataset.value = topic;
      
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isSelected;
      cb.style.marginRight = "6px";
      cb.style.pointerEvents = "none";
      opt.appendChild(cb);
      
      const textSpan = document.createElement("span");
      textSpan.textContent = topic;
      opt.appendChild(textSpan);
      topicOptionsDiv.appendChild(opt);
    });

    // 3. Other Option
    const isOtherSelected = currentFilterTopicMode === "__other__";
    const otherOpt = document.createElement("div");
    otherOpt.className = "custom-select-option" + (isOtherSelected ? " selected" : "");
    otherOpt.dataset.value = "__other__";
    
    const otherCb = document.createElement("input");
    otherCb.type = "checkbox";
    otherCb.checked = isOtherSelected;
    otherCb.style.marginRight = "6px";
    otherCb.style.pointerEvents = "none";
    otherOpt.appendChild(otherCb);
    
    const otherText = document.createElement("span");
    otherText.textContent = "✏️ Other...";
    otherOpt.appendChild(otherText);
    topicOptionsDiv.appendChild(otherOpt);
  };

  if (topicOptionsDiv) {
    topicOptionsDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      const opt = e.target.closest(".custom-select-option");
      if (!opt) return;

      const val = opt.dataset.value;
      if (val === "") {
        currentFilterTopics = [];
        currentFilterTopicMode = "";
      } else if (val === "__other__") {
        currentFilterTopics = [];
        currentFilterTopicMode = "__other__";
      } else {
        currentFilterTopicMode = "";
        const idx = currentFilterTopics.indexOf(val);
        if (idx === -1) {
          currentFilterTopics.push(val);
        } else {
          currentFilterTopics.splice(idx, 1);
        }
      }

      if (topicText) {
        if (currentFilterTopicMode === "__other__") {
          topicText.textContent = "✏️ Other...";
        } else if (currentFilterTopics.length === 0) {
          topicText.textContent = "All Topics";
        } else {
          const joined = currentFilterTopics.join(", ");
          topicText.textContent = joined.length > 15 ? `${currentFilterTopics.length} Selected` : joined;
        }
      }

      if (currentFilterTopicMode === "__other__") {
        if (topicContainer) topicContainer.classList.add("hidden");
        if (topicCustomWrap) topicCustomWrap.classList.remove("hidden");
        if (topicCustomInput) {
          topicCustomInput.value = "";
          topicCustomInput.focus();
        }
      } else {
        if (topicContainer) topicContainer.classList.remove("hidden");
        if (topicCustomWrap) topicCustomWrap.classList.add("hidden");
        if (topicCustomInput) topicCustomInput.value = "";
      }

      renderTopicOptions();
      updatePatternsSelect();
      renderHistory();
    });
  }

  if (topicResetBtn) {
    topicResetBtn.addEventListener("click", () => {
      currentFilterTopics = [];
      currentFilterTopicMode = "";
      if (topicCustomInput) topicCustomInput.value = "";
      if (topicCustomWrap) topicCustomWrap.classList.add("hidden");
      if (topicContainer) topicContainer.classList.remove("hidden");
      if (topicText) topicText.textContent = "All Topics";
      renderTopicOptions();
      updatePatternsSelect();
      renderHistory();
    });
  }

  if (topicCustomInput) {
    topicCustomInput.addEventListener("input", () => {
      updatePatternsSelect();
      renderHistory();
    });
  }

  const updatePatternsSelect = () => {
    if (!patternOptionsDiv) return;
    
    const mergedPatterns = new Set();

    if (currentFilterTopicMode === "__other__" && topicCustomInput) {
      const selectedTopic = topicCustomInput.value.trim().toLowerCase();
      const pats = POPUP_TOPIC_PATTERNS[selectedTopic] || [];
      pats.forEach(p => mergedPatterns.add(p));
    } else if (currentFilterTopics.length > 0) {
      currentFilterTopics.forEach(topic => {
        const norm = topic.toLowerCase().trim();
        const pats = POPUP_TOPIC_PATTERNS[norm] || [];
        pats.forEach(p => mergedPatterns.add(p));
      });
    } else {
      // All Topics -> show all patterns in database
      Object.keys(POPUP_TOPIC_PATTERNS).forEach(topicKey => {
        const pats = POPUP_TOPIC_PATTERNS[topicKey] || [];
        pats.forEach(p => mergedPatterns.add(p));
      });
    }

    const patterns = Array.from(mergedPatterns).sort((a, b) => a.localeCompare(b));

    // Filter out active patterns that are no longer valid
    currentFilterPatterns = currentFilterPatterns.filter(pat => patterns.includes(pat));

    patternOptionsDiv.innerHTML = "";
    
    // 1. All Option
    const allOpt = document.createElement("div");
    const isAllSelected = currentFilterPatternMode === "" && currentFilterPatterns.length === 0;
    allOpt.className = "custom-select-option" + (isAllSelected ? " selected" : "");
    allOpt.dataset.value = "";
    
    const allCb = document.createElement("input");
    allCb.type = "checkbox";
    allCb.checked = isAllSelected;
    allCb.style.marginRight = "6px";
    allCb.style.pointerEvents = "none";
    allOpt.appendChild(allCb);
    
    const allText = document.createElement("span");
    allText.textContent = "All Patterns";
    allOpt.appendChild(allText);
    patternOptionsDiv.appendChild(allOpt);

    // 2. Patterns List
    patterns.forEach(pat => {
      const isSelected = currentFilterPatternMode === "" && currentFilterPatterns.includes(pat);
      const opt = document.createElement("div");
      opt.className = "custom-select-option" + (isSelected ? " selected" : "");
      opt.dataset.value = pat;
      
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isSelected;
      cb.style.marginRight = "6px";
      cb.style.pointerEvents = "none";
      opt.appendChild(cb);
      
      const textSpan = document.createElement("span");
      textSpan.textContent = pat;
      opt.appendChild(textSpan);
      patternOptionsDiv.appendChild(opt);
    });

    // 3. Other Option
    const isOtherSelected = currentFilterPatternMode === "__other__";
    const otherOpt = document.createElement("div");
    otherOpt.className = "custom-select-option" + (isOtherSelected ? " selected" : "");
    otherOpt.dataset.value = "__other__";
    
    const otherCb = document.createElement("input");
    otherCb.type = "checkbox";
    otherCb.checked = isOtherSelected;
    otherCb.style.marginRight = "6px";
    otherCb.style.pointerEvents = "none";
    otherOpt.appendChild(otherCb);
    
    const otherText = document.createElement("span");
    otherText.textContent = "✏️ Other...";
    otherOpt.appendChild(otherText);
    patternOptionsDiv.appendChild(otherOpt);
  };

  if (patternOptionsDiv) {
    patternOptionsDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      const opt = e.target.closest(".custom-select-option");
      if (!opt) return;

      const val = opt.dataset.value;
      if (val === "") {
        currentFilterPatterns = [];
        currentFilterPatternMode = "";
      } else if (val === "__other__") {
        currentFilterPatterns = [];
        currentFilterPatternMode = "__other__";
      } else {
        currentFilterPatternMode = "";
        const idx = currentFilterPatterns.indexOf(val);
        if (idx === -1) {
          currentFilterPatterns.push(val);
        } else {
          currentFilterPatterns.splice(idx, 1);
        }
      }

      if (patternText) {
        if (currentFilterPatternMode === "__other__") {
          patternText.textContent = "✏️ Other...";
        } else if (currentFilterPatterns.length === 0) {
          patternText.textContent = "All Patterns";
        } else {
          const joined = currentFilterPatterns.join(", ");
          patternText.textContent = joined.length > 15 ? `${currentFilterPatterns.length} Selected` : joined;
        }
      }

      if (currentFilterPatternMode === "__other__") {
        if (patternContainer) patternContainer.classList.add("hidden");
        if (patternCustomWrap) patternCustomWrap.classList.remove("hidden");
        if (patternCustomInput) {
          patternCustomInput.value = "";
          patternCustomInput.focus();
        }
      } else {
        if (patternContainer) patternContainer.classList.remove("hidden");
        if (patternCustomWrap) patternCustomWrap.classList.add("hidden");
        if (patternCustomInput) patternCustomInput.value = "";
      }

      updatePatternsSelect();
      renderHistory();
    });
  }

  if (patternResetBtn) {
    patternResetBtn.addEventListener("click", () => {
      currentFilterPatterns = [];
      currentFilterPatternMode = "";
      if (patternCustomInput) patternCustomInput.value = "";
      if (patternCustomWrap) patternCustomWrap.classList.add("hidden");
      if (patternContainer) patternContainer.classList.remove("hidden");
      if (patternText) patternText.textContent = "All Patterns";
      updatePatternsSelect();
      renderHistory();
    });
  }

  if (patternCustomInput) {
    patternCustomInput.addEventListener("input", renderHistory);
  }

  // Collection Filter Setup
  const collectionContainer = el.historyFilterCollection;
  const collectionTrigger = document.getElementById("historyFilterCollectionTrigger");
  // collectionOptionsDiv is already declared at the top of init()
  const collectionText = collectionTrigger ? collectionTrigger.querySelector(".custom-select-text") : null;

  const collectionCustomWrap = document.getElementById("historyFilterCollectionCustomWrap");
  const collectionCustomInput = document.getElementById("historyFilterCollectionCustom");
  const collectionResetBtn = document.getElementById("historyFilterCollectionReset");

  if (collectionTrigger && collectionOptionsDiv) {
    collectionTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = collectionOptionsDiv.classList.contains("hidden");
      closeAllDropdowns();
      if (isHidden) collectionOptionsDiv.classList.remove("hidden");
    });
  }

  if (collectionOptionsDiv) {
    collectionOptionsDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      const opt = e.target.closest(".custom-select-option");
      if (!opt) return;

      const val = opt.dataset.value;
      if (val === "") {
        currentFilterCollections = [];
        currentFilterCollectionMode = "";
      } else if (val === "__other__") {
        currentFilterCollections = [];
        currentFilterCollectionMode = "__other__";
      } else {
        currentFilterCollectionMode = "";
        const idx = currentFilterCollections.indexOf(val);
        if (idx === -1) {
          currentFilterCollections.push(val);
        } else {
          currentFilterCollections.splice(idx, 1);
        }
      }

      if (collectionText) {
        if (currentFilterCollectionMode === "__other__") {
          collectionText.textContent = "✏️ Other...";
        } else if (currentFilterCollections.length === 0) {
          collectionText.textContent = "All Collections";
        } else {
          const joined = currentFilterCollections.join(", ");
          collectionText.textContent = joined.length > 15 ? `${currentFilterCollections.length} Selected` : joined;
        }
      }

      if (currentFilterCollectionMode === "__other__") {
        if (collectionContainer) collectionContainer.classList.add("hidden");
        if (collectionCustomWrap) collectionCustomWrap.classList.remove("hidden");
        if (collectionCustomInput) {
          collectionCustomInput.value = "";
          collectionCustomInput.focus();
        }
      } else {
        if (collectionContainer) collectionContainer.classList.remove("hidden");
        if (collectionCustomWrap) collectionCustomWrap.classList.add("hidden");
        if (collectionCustomInput) collectionCustomInput.value = "";
      }

      chrome.storage.local.get(STORAGE_KEYS.history, (stored) => {
        const hist = stored[STORAGE_KEYS.history] || [];
        renderCollectionOptions(hist);
      });
      renderHistory();
    });
  }

  if (collectionResetBtn) {
    collectionResetBtn.addEventListener("click", () => {
      currentFilterCollections = [];
      currentFilterCollectionMode = "";
      if (collectionCustomInput) collectionCustomInput.value = "";
      if (collectionCustomWrap) collectionCustomWrap.classList.add("hidden");
      if (collectionContainer) collectionContainer.classList.remove("hidden");
      if (collectionText) collectionText.textContent = "All Collections";
      chrome.storage.local.get(STORAGE_KEYS.history, (stored) => {
        const hist = stored[STORAGE_KEYS.history] || [];
        renderCollectionOptions(hist);
      });
      renderHistory();
    });
  }

  if (collectionCustomInput) {
    collectionCustomInput.addEventListener("input", renderHistory);
  }

  renderDifficultyOptions();
  renderTopicOptions();
  updatePatternsSelect();

  chrome.storage.local.get(STORAGE_KEYS.history, (stored) => {
    const hist = stored[STORAGE_KEYS.history] || [];
    renderCollectionOptions(hist);
  });

  if (el.calendarPrevMonthBtn) {
    el.calendarPrevMonthBtn.addEventListener("click", () => {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
      renderCalendar();
    });
  }

  if (el.calendarNextMonthBtn) {
    el.calendarNextMonthBtn.addEventListener("click", () => {
      currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
      renderCalendar();
    });
  }

  // Setup listeners for Sheets selection and filters
  setupSheetsListeners();
}

function renderCollectionOptions(history) {
  const collectionOptionsDiv = document.getElementById("historyFilterCollectionOptions");
  if (!collectionOptionsDiv) return;
  collectionOptionsDiv.innerHTML = "";
  
  // 1. All Option
  const allOpt = document.createElement("div");
  const isAllSelected = currentFilterCollectionMode === "" && currentFilterCollections.length === 0;
  allOpt.className = "custom-select-option" + (isAllSelected ? " selected" : "");
  allOpt.dataset.value = "";
  
  const allCb = document.createElement("input");
  allCb.type = "checkbox";
  allCb.checked = isAllSelected;
  allCb.style.marginRight = "6px";
  allCb.style.pointerEvents = "none";
  allOpt.appendChild(allCb);
  
  const allText = document.createElement("span");
  allText.textContent = "All Collections";
  allOpt.appendChild(allText);
  collectionOptionsDiv.appendChild(allOpt);

  // 2. Collections List
  const defaultCols = ["Blind75", "NeetCode150", "Striver A-Z Sheet", "Google", "Amazon", "Must Revise"];
  const allCols = new Set(defaultCols);
  history.forEach(entry => {
    if (entry.collection && typeof entry.collection === "string") {
      const c = entry.collection.trim();
      if (c) allCols.add(c);
    } else if (entry.collections && Array.isArray(entry.collections)) {
      entry.collections.forEach(c => {
        if (c && c.trim()) allCols.add(c.trim());
      });
    }
  });

  const sortedCols = Array.from(allCols).sort((a, b) => a.localeCompare(b));

  sortedCols.forEach(col => {
    const isSelected = currentFilterCollectionMode === "" && currentFilterCollections.includes(col);
    const opt = document.createElement("div");
    opt.className = "custom-select-option" + (isSelected ? " selected" : "");
    opt.dataset.value = col;
    
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isSelected;
    cb.style.marginRight = "6px";
    cb.style.pointerEvents = "none";
    opt.appendChild(cb);
    
    const textSpan = document.createElement("span");
    textSpan.textContent = col;
    opt.appendChild(textSpan);
    collectionOptionsDiv.appendChild(opt);
  });

  // 3. Other Option
  const isOtherSelected = currentFilterCollectionMode === "__other__";
  const otherOpt = document.createElement("div");
  otherOpt.className = "custom-select-option" + (isOtherSelected ? " selected" : "");
  otherOpt.dataset.value = "__other__";
  
  const otherCb = document.createElement("input");
  otherCb.type = "checkbox";
  otherCb.checked = isOtherSelected;
  otherCb.style.marginRight = "6px";
  otherCb.style.pointerEvents = "none";
  otherOpt.appendChild(otherCb);
  
  const otherText = document.createElement("span");
  otherText.textContent = "✏️ Other...";
  otherOpt.appendChild(otherText);
  collectionOptionsDiv.appendChild(otherOpt);
}

// React to storage changes (e.g. background polling finishes auth)
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.githubSettings || changes.deviceFlowState) {
    chrome.storage.local.get(STORAGE_KEYS.settings, (res) => {
      applySettings(res[STORAGE_KEYS.settings] || {});
    });
  }
  if (changes.customSheets) {
    await populateSheetDropdownPopup();
    renderSheets();
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────
[el.owner, el.repo, el.branch, el.basePath].forEach(
  (input) => input.addEventListener("input", persistSettings)
);
if (el.streakReminderEnabled) {
  el.streakReminderEnabled.addEventListener("change", persistSettings);
}

el.disconnectButton.addEventListener("click", disconnectGitHub);




// ── History Filter Bindings ──────────────────────────────────────────────────
let filterFav = false;
el.historySearch.addEventListener("input", renderHistory);

if (el.historyFilterFav) {
  el.historyFilterFav.addEventListener("click", () => {
    filterFav = !filterFav;
    el.historyFilterFav.classList.toggle("active", filterFav);
    el.historyFilterFav.textContent = filterFav ? "❤️" : "🤍";
    renderHistory();
  });
}

el.repoSelect.addEventListener("change", () => {
  el.repo.value = el.repoSelect.value;
  persistSettings();
});

el.toggleNewRepoBtn.addEventListener("click", () => {
  el.repoSelectContainer.classList.add("hidden");
  el.toggleNewRepoBtn.classList.add("hidden");
  el.newRepoArea.classList.remove("hidden");
  el.newRepoName.value = "";
  el.newRepoName.focus();
});

el.cancelNewRepoBtn.addEventListener("click", () => {
  el.newRepoArea.classList.add("hidden");
  el.repoSelectContainer.classList.remove("hidden");
  el.toggleNewRepoBtn.classList.remove("hidden");
});

el.createNewRepoBtn.addEventListener("click", createNewRepository);

function applySettings(settings) {
  if (el.streakReminderEnabled) {
    el.streakReminderEnabled.checked = settings.hasOwnProperty("streakReminderEnabled") ? settings.streakReminderEnabled : true;
  }
  el.owner.value    = settings.owner    || "";
  el.repo.value     = settings.repo     || "";
  el.branch.value   = settings.branch   || "main";
  el.basePath.value = settings.basePath || "";
  updateConnectionUI(settings);
  if (settings.token) {
    loadGitHubRepositories(settings.token, settings.repo);
  } else {
    el.repoSelectContainer.classList.add("hidden");
    el.repo.classList.remove("hidden");
    el.toggleNewRepoBtn.classList.add("hidden");
  }
}

function updateConnectionUI(settings) {
  if (settings.token) {
    el.profileCard.classList.remove("hidden");
    el.profileUsername.textContent = `@${settings.owner || "username"}`;
    if (settings.avatarUrl) {
      el.profileAvatar.src = settings.avatarUrl;
      el.profileAvatar.classList.remove("hidden");
    } else {
      el.profileAvatar.classList.add("hidden");
    }
  } else {
    el.profileCard.classList.add("hidden");
  }
}

async function persistSettings() {
  const settings = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const existing = stored[STORAGE_KEYS.settings] || {};
  const src = el.profileAvatar.src;
  return {
    token:     existing.token || "",
    clientId:  existing.clientId || "",
    owner:     el.owner.value.trim(),
    repo:      el.repo.value.trim(),
    branch:    el.branch.value.trim(),
    basePath:  el.basePath.value.trim(),
    avatarUrl: src && !src.endsWith("popup.html") ? src : "",
    streakReminderEnabled: el.streakReminderEnabled ? el.streakReminderEnabled.checked : true,
  };
}

async function disconnectGitHub() {
  if (!confirm("Disconnect from GitHub?")) return;
  // Completely clear user authentication and GitHub settings for a fresh state
  await chrome.storage.local.remove(["auth_user", "githubSettings", "leetsyncSettings", "github_token", "github_profile"]);
  window.location.reload();
}

async function loadGitHubRepositories(token, selectedRepo) {
  if (!token) return;
  el.repoSelectContainer.classList.remove("hidden");
  el.repo.classList.add("hidden");
  el.toggleNewRepoBtn.classList.remove("hidden");
  el.repoSelect.innerHTML = '<option value="">-- Loading Repos --</option>';

  try {
    const response = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated",
      { headers: githubHeaders(token) }
    );
    if (!response.ok) throw new Error(`Failed to load repos: ${response.status}`);
    const repos = await response.json();
    el.repoSelect.innerHTML = '<option value="">-- Select Repo --</option>';
    repos.forEach((repo) => {
      const opt = document.createElement("option");
      opt.value = repo.name;
      opt.textContent = repo.name;
      if (repo.name === selectedRepo) opt.selected = true;
      el.repoSelect.appendChild(opt);
    });
    if (selectedRepo && !repos.some((r) => r.name === selectedRepo)) {
      const opt = document.createElement("option");
      opt.value = selectedRepo;
      opt.textContent = selectedRepo;
      opt.selected = true;
      el.repoSelect.appendChild(opt);
    }
  } catch {
    el.repoSelectContainer.classList.add("hidden");
    el.repo.classList.remove("hidden");
    el.toggleNewRepoBtn.classList.add("hidden");
  }
}

async function createNewRepository() {
  const repoName = el.newRepoName.value.trim();
  if (!repoName) { setResult("Please enter a repository name.", "error"); return; }

  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const settings = stored[STORAGE_KEYS.settings] || {};
  const token = settings.token;
  if (!token) {
    setResult("GitHub token not found. Please log in again.", "error");
    return;
  }

  el.createNewRepoBtn.disabled = true;
  el.createNewRepoBtn.textContent = "Creating...";
  try {
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: githubHeaders(token),
      body: JSON.stringify({ name: repoName, private: true, auto_init: true }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || `Failed to create repo: ${response.status}`);
    }
    const newRepo = await response.json();
    setResult(`Repository '${newRepo.name}' created!`, "success");
    el.newRepoArea.classList.add("hidden");
    el.repoSelectContainer.classList.remove("hidden");
    el.toggleNewRepoBtn.classList.remove("hidden");
    el.repo.value = newRepo.name;
    await persistSettings();
    await loadGitHubRepositories(token, newRepo.name);
  } catch (error) {
    setResult(error.message, "error");
  } finally {
    el.createNewRepoBtn.disabled = false;
    el.createNewRepoBtn.textContent = "Create";
  }
}

function setResult(msg, type) {
  el.resultText.textContent = msg;
  el.resultText.className = `result ${type}`.trim();
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// STATS TAB
// ══════════════════════════════════════════════════════════════════════════════

async function renderStats() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = stored[STORAGE_KEYS.history] || [];

  // ── Difficulty counts ──────────────────────────────────────────────────────
  const counts = { easy: 0, medium: 0, hard: 0 };
  // Count unique problems (by slug) only
  const uniqueSlugs = new Set();
  for (const entry of history) {
    if (!uniqueSlugs.has(entry.slug)) {
      uniqueSlugs.add(entry.slug);
      const d = (entry.difficulty || "").toLowerCase();
      if (d === "easy")   counts.easy++;
      else if (d === "medium") counts.medium++;
      else if (d === "hard")   counts.hard++;
    }
  }
  el.statTotal.textContent  = uniqueSlugs.size;
  el.statEasy.textContent   = counts.easy;
  el.statMedium.textContent = counts.medium;
  el.statHard.textContent   = counts.hard;

  // ── Streak & Solved Today ──────────────────────────────────────────────────
  const { streak } = calcStreak(history);
  el.statStreak.textContent = streak;

  const todayStr = getLocalDateString(new Date());
  const solvedTodaySlugs = new Set();
  for (const entry of history) {
    if (getLocalDateString(entry.savedAt) === todayStr) {
      solvedTodaySlugs.add(entry.slug);
    }
  }
  el.statSolvedToday.textContent = solvedTodaySlugs.size;

  // ── Topic Breakdown ────────────────────────────────────────────────────────
  const topicCounts = {};
  const processedSlugs = new Set();

  for (const entry of history) {
    if (!processedSlugs.has(entry.slug)) {
      processedSlugs.add(entry.slug);
      
      const topic = entry.topic ? entry.topic.trim() : "";
      if (topic) {
        if (!topicCounts[topic]) {
          topicCounts[topic] = { total: 0, easy: 0, medium: 0, hard: 0 };
        }
        topicCounts[topic].total++;
        const d = (entry.difficulty || "medium").toLowerCase();
        if (d === "easy")        topicCounts[topic].easy++;
        else if (d === "medium") topicCounts[topic].medium++;
        else if (d === "hard")   topicCounts[topic].hard++;
      }
    }
  }

  if (el.topicPillList) {
    el.topicPillList.innerHTML = "";
    
    // Sort topics descending by total count
    const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1].total - a[1].total);
    
    if (sortedTopics.length === 0) {
      el.topicPillList.innerHTML = `<p class="empty-state" style="padding: 10px 0; font-size: 10.5px; width: 100%;">No topics tracked yet. Save a solution with a topic tag!</p>`;
    } else {
      sortedTopics.forEach(([topic, data]) => {
        const pill = document.createElement("div");
        pill.className = "topic-stat-pill";
        
        // Create tooltip text showing Easy, Medium, Hard counts
        let tooltipParts = [];
        tooltipParts.push(`${data.easy} Easy`);
        tooltipParts.push(`${data.medium} Medium`);
        tooltipParts.push(`${data.hard} Hard`);
        const tooltipText = tooltipParts.join(" · ");

        pill.title = tooltipText;
        pill.innerHTML = `
          <span>${topic}</span>
          <span class="topic-stat-count">${data.total}</span>
        `;
        el.topicPillList.appendChild(pill);
      });
    }
  }

  // ── Render Revision Scheduler ──────────────────────────────────────────────
  const dueList = getDueRevisions(history);
  const pendingCount = dueList.filter(e => !e.revisionCompleted).length;
  if (el.statRevisionDueCount) {
    el.statRevisionDueCount.textContent = `${pendingCount} Due`;
    if (pendingCount === 0) {
      el.statRevisionDueCount.style.background = "#dcfce7";
      el.statRevisionDueCount.style.color = "#166534";
    } else {
      el.statRevisionDueCount.style.background = "#fee2e2";
      el.statRevisionDueCount.style.color = "#dc2626";
    }
  }

  if (el.popupRevisionList) {
    el.popupRevisionList.innerHTML = "";
    if (dueList.length === 0) {
      el.popupRevisionList.innerHTML = `<p class="empty-state">🎉 All caught up! No revisions due today.</p>`;
    } else {
      dueList.forEach(entry => {
        const item = document.createElement("div");
        item.className = "day-details-item";
        const diffClass = (entry.difficulty || "medium").toLowerCase();
        const nextRev = (entry.revisionCount || 1) + 1;
        
        let offsetLabel = "3d";
        const rev = entry.revisionCount || 1;
        let offset = 3;
        if (rev === 2) offset = 7;
        else if (rev === 3) offset = 15;
        else if (rev >= 4) offset = 30;
        
        offsetLabel = `${offset}d`;

        const escapedTitle = escapeHtml(entry.title || entry.slug || "Solve");
        const safeLeetcodeUrl = isSafeUrl(leetcodeUrl) ? leetcodeUrl : "#";
        const safeGithubUrl = isSafeUrl(entry.githubUrl) ? entry.githubUrl : "";

        item.innerHTML = `
          <div class="day-details-left">
            <div style="display: flex; align-items: center; gap: 6px; width: 100%;">
              <input type="checkbox" class="revision-todo-checkbox" ${entry.revisionCompleted ? 'checked' : ''} style="width: auto; margin: 0; cursor: pointer;">
              <a class="day-details-title day-details-title-link ${entry.revisionCompleted ? 'completed-revision' : ''}" href="${safeLeetcodeUrl}" target="_blank" title="Open on LeetCode">${entry.id ? escapeHtml(entry.id) + ". " : ""}${escapedTitle}</a>
            </div>
            <span class="day-details-meta" style="margin-left: 20px;">Next: Rev ${nextRev} (Interval: ${offsetLabel})</span>
          </div>
          <div class="day-details-right">
            <span class="diff-badge ${diffClass}">${escapeHtml(entry.difficulty) || "?"}</span>
            ${safeGithubUrl
              ? `<a class="history-link" href="${safeGithubUrl}" target="_blank" title="View on GitHub">↗</a>`
              : ""}
          </div>
        `;

        // Bind checkbox change handler
        const chk = item.querySelector(".revision-todo-checkbox");
        chk.addEventListener("change", async () => {
          const isChecked = chk.checked;
          const currentCount = entry.revisionCount || 1;
          const newCount = isChecked ? currentCount + 1 : Math.max(1, currentCount - 1);
          
          await updateProblemRevisionSettings(entry.slug, {
            revisionCount: newCount,
            lastRevisionAt: isChecked ? new Date().toISOString() : null,
            revisionCompleted: isChecked,
            revisionCompletedAt: isChecked ? todayStr() : null
          });

          // Sync loop values so UI updates immediately
          entry.revisionCount = newCount;
          entry.lastRevisionAt = isChecked ? new Date().toISOString() : null;
          entry.revisionCompleted = isChecked;
          entry.revisionCompletedAt = isChecked ? todayStr() : null;

          renderStats();
          renderRevisionScheduler();
          renderCalendar();
        });

        el.popupRevisionList.appendChild(item);
      });
    }
  }
}

function getLocalDateString(savedAt) {
  if (!savedAt) return "";
  const d = new Date(savedAt);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isSameLocalDate(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

// Calculate daily streak from history
function calcStreak(history) {
  if (!history.length) return { streak: 0, lastDate: null };

  // Get unique solve dates (YYYY-MM-DD) in local timezone
  const dates = [...new Set(
    history.map((h) => getLocalDateString(h.savedAt)).filter(Boolean)
  )].sort().reverse(); // newest first

  if (!dates.length) return { streak: 0, lastDate: null };

  const today  = todayStr();
  const yesterday = dayOffset(-1);

  // Streak only counts if solved today or yesterday
  if (dates[0] !== today && dates[0] !== yesterday) {
    return { streak: 0, lastDate: dates[0] };
  }

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const expected = dayOffset(-(i));
    if (dates[i] === expected) {
      streak++;
    } else {
      break;
    }
  }
  return { streak, lastDate: dates[0] };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRelativeDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameLocalDate(d, today))     return "Today";
  if (isSameLocalDate(d, yesterday)) return "Yesterday";

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function openNotesModal(entry, approachLabel) {
  const { notesModal, notesModalTitle, notesModalSubtitle, notesModalContainer, notesModalSaveBtn, notesModalCancelBtn, notesModalStatus } = el;
  
  notesModalTitle.textContent = `Edit Notes – ${approachLabel}`;
  notesModalSubtitle.textContent = `${entry.id && entry.id !== "0" && entry.id !== 0 ? entry.id + ". " : ""}${entry.title}`;
  notesModalSubtitle.dataset.slug = entry.slug;
  notesModalSubtitle.dataset.approach = entry.approach;
  notesModalStatus.className = "notes-sync-status";
  notesModalStatus.textContent = "";
  
  notesModalContainer.innerHTML = "";
  
  const wrapper = document.createElement("div");
  wrapper.style = "display: flex; flex-direction: column; gap: 4px; margin-top: 6px;";
  wrapper.innerHTML = `
    <textarea class="notes-textarea approach-notes-input" 
              data-approach="${entry.approach}" 
              data-version="${entry.version || 1}" 
              data-language="${entry.language || ""}" 
              data-readme-path="${entry.readmePath || ""}" 
              style="height: 120px;" 
              placeholder="Write your notes here...">${escapeHtml(entry.notes || "")}</textarea>
  `;
  notesModalContainer.appendChild(wrapper);

  notesModalSaveBtn.disabled = false;
  notesModalCancelBtn.disabled = false;

  notesModal.classList.remove("hidden");
  
  const textarea = notesModalContainer.querySelector(".notes-textarea");
  if (textarea) textarea.focus();
  
  const close = () => {
    notesModal.classList.add("hidden");
    notesModalSubtitle.removeAttribute("data-slug");
    notesModalSubtitle.removeAttribute("data-approach");
  };
  notesModalCancelBtn.onclick = close;

  notesModal.onclick = (e) => {
    if (e.target === notesModal) {
      close();
    }
  };

  notesModalSaveBtn.onclick = async () => {
    const newNotes = textarea.value;

    notesModalSaveBtn.disabled = true;
    notesModalCancelBtn.disabled = true;
    textarea.disabled = true;

    notesModalStatus.className = "notes-sync-status loading";
    notesModalStatus.textContent = "⏳ Saving...";

    try {
      // 1. Update local storage
      const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
      const hist = storedHistory[STORAGE_KEYS.history] || [];
      const updatedHistory = hist.map((h) => {
        if (h.slug === entry.slug && h.approach === entry.approach) {
          return { ...h, notes: newNotes };
        }
        return h;
      });
      await chrome.storage.local.set({ [STORAGE_KEYS.history]: updatedHistory });

      // Update local entry reference
      entry.notes = newNotes;

      // 2. Trigger background sync
      chrome.runtime.sendMessage({
        type: "LEETSYNC_UPDATE_NOTES",
        payload: {
          slug: entry.slug,
          title: entry.title,
          topic: entry.topic,
          id: entry.id,
          approach: entry.approach,
          notes: newNotes,
          readmePath: entry.readmePath,
          language: entry.language,
          version: entry.version
        }
      }, (response) => {
        notesModalSaveBtn.disabled = false;
        notesModalCancelBtn.disabled = false;
        textarea.disabled = false;
        
        if (chrome.runtime.lastError || (response && !response.ok)) {
          const errMsg = response?.error || "GitHub Sync Failed";
          notesModalStatus.className = "notes-sync-status error";
          notesModalStatus.textContent = `❌ ${errMsg}`;
          setTimeout(() => {
            notesModalStatus.textContent = "";
          }, 3000);
        } else {
          notesModalStatus.className = "notes-sync-status success";
          notesModalStatus.textContent = "✅ Saved & Synced!";
          setTimeout(() => {
            close();
            renderHistory();
          }, 1000);
        }
      });

    } catch (err) {
      notesModalSaveBtn.disabled = false;
      notesModalCancelBtn.disabled = false;
      textarea.disabled = false;
      notesModalStatus.className = "notes-sync-status error";
      notesModalStatus.textContent = `❌ ${err.message || "Error occurred"}`;
    }
  };
}

async function renderHistory() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = stored[STORAGE_KEYS.history] || [];
  const originalLen = history.length;

  // 1. Permanent database cleanup of duplicate notes/description artifacts
  history = history.filter(entry => {
    const cleanApp = (entry.approach || "").toLowerCase().trim();
    return cleanApp && !cleanApp.includes("notes") && !cleanApp.includes("description") && cleanApp !== "approaches";
  });

  // 2. Migration & Cleanup of GFG history items (retroactive name/id split and url backfill)
  let gfgUpdated = false;
  history.forEach(entry => {
    const title = entry.title || "";
    const slug  = entry.slug  || "";

    // Case A: old entry where title still has numeric suffix  e.g. "Sum Of Digits1742"
    const trailingNum = title.match(/(\d+)$/);
    if (trailingNum && (entry.id === "0" || entry.id === 0 || !entry.url)) {
      const cleanTitle = title.slice(0, title.length - trailingNum[1].length).trim();
      const cleanSlug  = slug.replace(/-?\d+$/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+$/, "");
      entry.id    = "";                  // GFG has no public number
      entry.title = cleanTitle || title;
      entry.slug  = cleanSlug  || slug;
      entry.url   = `https://www.geeksforgeeks.org/problems/${cleanSlug || slug}/1`;
      gfgUpdated  = true;
    }

    // Case B: entry already has a gfg url but id is still "0" — just clear the id
    if ((entry.url || "").includes("geeksforgeeks") && (entry.id === "0" || entry.id === 0)) {
      entry.id   = "";
      gfgUpdated = true;
    }

    // Case C: entry has gfg-looking slug (no hyphens, long num suffix) but missing url
    if (!entry.url && slug && /\d{6,}$/.test(slug)) {
      const cleanSlug = slug.replace(/-?\d+$/, "").toLowerCase();
      entry.url   = `https://www.geeksforgeeks.org/problems/${cleanSlug || slug}/1`;
      entry.slug  = cleanSlug || slug;
      entry.id    = "";
      gfgUpdated  = true;
    }
  });

  if (history.length !== originalLen || gfgUpdated) {
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
  }

  renderCollectionOptions(history);

  el.historyList.innerHTML = "";

  if (!history.length) {
    el.historyList.innerHTML =
      '<p class="empty-state">No solutions saved yet.<br>Submit an accepted solution on LeetCode!</p>';
    return;
  }

  // Keep only the latest submission per problem slug + approach
  const uniqueMap = new Map();
  history.forEach((entry) => {
    const key = `${entry.slug}-${entry.approach}`;
    const existing = uniqueMap.get(key);
    if (!existing || new Date(entry.savedAt) > new Date(existing.savedAt)) {
      uniqueMap.set(key, entry);
    }
  });
  const displayedHistory = Array.from(uniqueMap.values());
  // Sort descending: most recent solves first
  displayedHistory.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));

  const query = el.historySearch.value.trim().toLowerCase();

  // Multi-select Difficulty
  const selectedDiffs = currentFilterDifficulties.map(d => d.toLowerCase());

  // Topic
  let filterTopic = "";
  if (currentFilterTopicMode === "__other__") {
    const topicCustom = document.getElementById("historyFilterTopicCustom");
    filterTopic = topicCustom ? topicCustom.value.trim().toLowerCase() : "";
  }
  const selectedTopics = currentFilterTopics.map(t => t.toLowerCase());

  // Pattern
  let filterPattern = "";
  if (currentFilterPatternMode === "__other__") {
    const patternCustom = document.getElementById("historyFilterPatternCustom");
    filterPattern = patternCustom ? patternCustom.value.trim().toLowerCase() : "";
  }
  const selectedPatterns = currentFilterPatterns.map(p => p.toLowerCase());

  // Collection
  let filterCollection = "";
  if (currentFilterCollectionMode === "__other__") {
    const collectionCustom = document.getElementById("historyFilterCollectionCustom");
    filterCollection = collectionCustom ? collectionCustom.value.trim().toLowerCase() : "";
  }
  const selectedCollections = currentFilterCollections.map(c => c.toLowerCase());

  const filtered = displayedHistory.filter((entry) => {
    const title = (entry.title || "").toLowerCase();
    const id = (entry.id || "").toString();
    const slug = (entry.slug || "").toLowerCase();
    const topic = (entry.topic || "").toLowerCase();
    const pattern = (entry.pattern || "").toLowerCase();
    const matchesQuery =
      !query ||
      title.includes(query) ||
      id.includes(query) ||
      slug.includes(query) ||
      topic.includes(query) ||
      pattern.includes(query);

    const diff = (entry.difficulty || "").toLowerCase();
    const matchesDiff = selectedDiffs.length === 0 || selectedDiffs.includes(diff);

    const matchesFav = !filterFav || !!entry.isFavorite;

    // Matches Topic (Custom or Multi-select)
    let matchesTopic = true;
    if (currentFilterTopicMode === "__other__") {
      matchesTopic = !filterTopic || topic.includes(filterTopic);
    } else if (selectedTopics.length > 0) {
      matchesTopic = selectedTopics.includes(topic);
    }

    // Matches Pattern (Custom or Multi-select)
    let matchesPattern = true;
    if (currentFilterPatternMode === "__other__") {
      matchesPattern = !filterPattern || pattern.includes(filterPattern);
    } else if (selectedPatterns.length > 0) {
      matchesPattern = selectedPatterns.includes(pattern);
    }

    // Matches Collection (Custom or Multi-select)
    let matchesCollection = true;
    if (currentFilterCollectionMode === "__other__") {
      if (entry.collection && typeof entry.collection === "string") {
        matchesCollection = !filterCollection || entry.collection.toLowerCase().trim().includes(filterCollection);
      } else if (entry.collections && Array.isArray(entry.collections)) {
        matchesCollection = !filterCollection || entry.collections.some(c => c.toLowerCase().trim().includes(filterCollection));
      } else {
        matchesCollection = !filterCollection;
      }
    } else if (selectedCollections.length > 0) {
      if (entry.collection && typeof entry.collection === "string") {
        matchesCollection = selectedCollections.includes(entry.collection.toLowerCase().trim());
      } else if (entry.collections && Array.isArray(entry.collections)) {
        matchesCollection = entry.collections.some(c => selectedCollections.includes(c.toLowerCase().trim()));
      } else {
        matchesCollection = false;
      }
    }

    return matchesQuery && matchesDiff && matchesFav && matchesTopic && matchesPattern && matchesCollection;
  });

  if (!filtered.length) {
    el.historyList.innerHTML = '<p class="empty-state">No matching solutions found.</p>';
    return;
  }

  filtered.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const diffClass = (entry.difficulty || "medium").toLowerCase();
    const dateStr = formatRelativeDate(entry.savedAt);
    const patternStr = entry.pattern ? ` · 🧩 ${escapeHtml(entry.pattern)}` : "";
    const topicStr = entry.topic ? ` · 📁 ${escapeHtml(entry.topic)}` : "";
    const revStr = entry.revisionCount ? ` · 🔄 Rev: ${entry.revisionCount}` : "";
    const timeSpentStr = entry.timeSpent ? ` · ⏱️ ${escapeHtml(entry.timeSpent)}` : "";
    let collStr = "";
    if (entry.collection && typeof entry.collection === "string") {
      collStr = ` · 📁 ${escapeHtml(entry.collection)}`;
    } else if (entry.collections && Array.isArray(entry.collections) && entry.collections.length > 0) {
      collStr = ` · 📁 ${entry.collections.map(c => escapeHtml(c)).join(", ")}`;
    }

    const favHeart = entry.isFavorite ? "❤️" : "🤍";
    const favClass = entry.isFavorite ? "active" : "";

    const approachLabel = approachDisplayName(entry.approach);
    const escapedTitle = escapeHtml(entry.title || entry.slug || "Solve");
    const escapedApproach = escapeHtml(approachLabel);
    
    const problemUrl = (entry.url && entry.url.startsWith("http")) 
      ? entry.url 
      : `https://leetcode.com/problems/${entry.slug}/`;
    const safeProblemUrl = isSafeUrl(problemUrl) ? problemUrl : "#";
    const safeGithubUrl = isSafeUrl(entry.githubUrl) ? entry.githubUrl : "";

    item.innerHTML = `
      <div class="history-item-left">
        <a class="history-item-title day-details-title-link" href="${safeProblemUrl}" target="_blank" title="Open Problem">${entry.id && entry.id !== "0" && entry.id !== 0 ? escapeHtml(entry.id) + ". " : ""}${escapedTitle}</a>
        <span class="history-item-meta">${dateStr}${topicStr}${patternStr}${revStr}${timeSpentStr}${collStr}</span>
      </div>
      <div class="history-item-right">
        <span class="diff-badge ${diffClass}">${escapeHtml(entry.difficulty) || "?"}</span>
        <span class="approach-pill">${escapedApproach}</span>
        ${safeGithubUrl
          ? `<a class="history-link" href="${safeGithubUrl}" target="_blank" title="View on GitHub">↗</a>`
          : ""}
        <button class="history-edit-btn" title="Edit Notes">✏️</button>
        <button class="history-fav-btn ${favClass}" title="Toggle Favorite">${favHeart}</button>
        <button class="history-delete-btn" data-slug="${escapeHtml(entry.slug)}" data-approach="${escapeHtml(entry.approach)}" title="Delete Record">✕</button>
      </div>
    `;

    // Bind edit notes event handler to open modal
    const editBtn = item.querySelector(".history-edit-btn");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isModalOpen = !el.notesModal.classList.contains("hidden");
      if (isModalOpen && el.notesModalSubtitle.dataset.slug === entry.slug && el.notesModalSubtitle.dataset.approach === entry.approach) {
        el.notesModal.classList.add("hidden");
        el.notesModalSubtitle.removeAttribute("data-slug");
        el.notesModalSubtitle.removeAttribute("data-approach");
      } else {
        openNotesModal(entry, approachLabel);
      }
    });

    // Bind favorite event handler
    const favBtn = item.querySelector(".history-fav-btn");
    favBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      entry.isFavorite = !entry.isFavorite;
      
      const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
      const hist = storedHistory[STORAGE_KEYS.history] || [];
      const updated = hist.map((h) => {
        if (h.slug === entry.slug && h.approach === entry.approach) {
          let lists = h.starredLists || [];
          if (entry.isFavorite) {
            if (!lists.map(l => l.toLowerCase()).includes("favorite")) {
              lists.push("Favorite");
            }
          } else {
            lists = lists.filter(l => l.toLowerCase() !== "favorite");
          }
          return { ...h, isFavorite: entry.isFavorite, starredLists: lists };
        }
        return h;
      });
      await chrome.storage.local.set({ [STORAGE_KEYS.history]: updated });
      renderHistory();
      renderStats();
    });

    // Bind delete event handler
    const delBtn = item.querySelector(".history-delete-btn");
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const slug = delBtn.dataset.slug;
      const approach = delBtn.dataset.approach;
      const appName = approachDisplayName(approach);
      
      if (confirm(`Delete history record for "${entry.title}" (${appName})?`)) {
        const updated = history.filter((h) => !(h.slug === slug && h.approach === approach));
        await chrome.storage.local.set({ [STORAGE_KEYS.history]: updated });
        
        // Also delete from Firestore if logged in
        const authData = await chrome.storage.local.get("auth_user");
        const authUser = authData.auth_user;
        if (authUser && authUser.uid) {
          const idToken = await getValidIdToken(authUser);
          if (idToken) {
            const uid = authUser.uid;
            const baseUrl = getFirestoreApiUrl();
            const safeId = `${slug}-${approach}`.replace(/[^a-zA-Z0-9_-]/g, "");
            
            try {
              await fetch(`${baseUrl}/users/${uid}/history/${safeId}`, {
                method: "DELETE",
                headers: {
                  "Authorization": `Bearer ${idToken}`
                }
              });
              console.log(`Deleted ${safeId} from Firestore`);
            } catch (err) {
              console.error("Failed to delete from Firestore:", err);
            }
          }
        }

        renderHistory();
        renderStats();
      }
    });

    el.historyList.appendChild(item);
  });
}

function approachDisplayName(code) {
  const clean = (code || "").toLowerCase().trim();
  if (clean.includes("optimal") || clean === "oa" || clean.includes("(oa)")) return "OA";
  if (clean.includes("better") || clean === "ba" || clean.includes("(ba)")) return "BA";
  if (clean.includes("brute") || clean === "bf" || clean.includes("(bf)")) return "BF";
  return clean.toUpperCase();
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT AS EXCEL (.xls) — styled HTML table that Excel/Google Sheets reads
// ══════════════════════════════════════════════════════════════════════════════

async function exportCSV() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = stored[STORAGE_KEYS.history] || [];

  if (!history.length) {
    alert("No history to export yet!");
    return;
  }

  // Deduplicate by problem slug to avoid duplicate rows in Excel
  const uniqueMap = new Map();
  history.forEach((entry) => {
    const key = entry.slug;
    const existing = uniqueMap.get(key);
    if (!existing || new Date(entry.savedAt) > new Date(existing.savedAt)) {
      uniqueMap.set(key, entry);
    }
  });
  const displayedHistory = Array.from(uniqueMap.values());

  const query = el.historySearch.value.trim().toLowerCase();

  // Multi-select Difficulty
  const selectedDiffs = currentFilterDifficulties.map(d => d.toLowerCase());

  // Topic
  let filterTopic = "";
  if (currentFilterTopicMode === "__other__") {
    const topicCustom = document.getElementById("historyFilterTopicCustom");
    filterTopic = topicCustom ? topicCustom.value.trim().toLowerCase() : "";
  }
  const selectedTopics = currentFilterTopics.map(t => t.toLowerCase());

  // Pattern
  let filterPattern = "";
  if (currentFilterPatternMode === "__other__") {
    const patternCustom = document.getElementById("historyFilterPatternCustom");
    filterPattern = patternCustom ? patternCustom.value.trim().toLowerCase() : "";
  }
  const selectedPatterns = currentFilterPatterns.map(p => p.toLowerCase());

  // Collection
  let filterCollection = "";
  if (currentFilterCollectionMode === "__other__") {
    const collectionCustom = document.getElementById("historyFilterCollectionCustom");
    filterCollection = collectionCustom ? collectionCustom.value.trim().toLowerCase() : "";
  }
  const selectedCollections = currentFilterCollections.map(c => c.toLowerCase());

  const filtered = displayedHistory.filter((entry) => {
    const title = (entry.title || "").toLowerCase();
    const id = (entry.id || "").toString();
    const slug = (entry.slug || "").toLowerCase();
    const topic = (entry.topic || "").toLowerCase();
    const pattern = (entry.pattern || "").toLowerCase();
    const matchesQuery =
      !query ||
      title.includes(query) ||
      id.includes(query) ||
      slug.includes(query) ||
      topic.includes(query) ||
      pattern.includes(query);

    const diff = (entry.difficulty || "").toLowerCase();
    const matchesDiff = selectedDiffs.length === 0 || selectedDiffs.includes(diff);

    const matchesFav = !filterFav || !!entry.isFavorite;

    // Matches Topic (Custom or Multi-select)
    let matchesTopic = true;
    if (currentFilterTopicMode === "__other__") {
      matchesTopic = !filterTopic || topic.includes(filterTopic);
    } else if (selectedTopics.length > 0) {
      matchesTopic = selectedTopics.includes(topic);
    }

    // Matches Pattern (Custom or Multi-select)
    let matchesPattern = true;
    if (currentFilterPatternMode === "__other__") {
      matchesPattern = !filterPattern || pattern.includes(filterPattern);
    } else if (selectedPatterns.length > 0) {
      matchesPattern = selectedPatterns.includes(pattern);
    }

    // Matches Collection (Custom or Multi-select)
    let matchesCollection = true;
    if (currentFilterCollectionMode === "__other__") {
      if (entry.collection && typeof entry.collection === "string") {
        matchesCollection = !filterCollection || entry.collection.toLowerCase().trim().includes(filterCollection);
      } else if (entry.collections && Array.isArray(entry.collections)) {
        matchesCollection = !filterCollection || entry.collections.some(c => c.toLowerCase().trim().includes(filterCollection));
      } else {
        matchesCollection = !filterCollection;
      }
    } else if (selectedCollections.length > 0) {
      if (entry.collection && typeof entry.collection === "string") {
        matchesCollection = selectedCollections.includes(entry.collection.toLowerCase().trim());
      } else if (entry.collections && Array.isArray(entry.collections)) {
        matchesCollection = entry.collections.some(c => selectedCollections.includes(c.toLowerCase().trim()));
      } else {
        matchesCollection = false;
      }
    }

    return matchesQuery && matchesDiff && matchesFav && matchesTopic && matchesPattern && matchesCollection;
  });

  if (!filtered.length) {
    alert("No matching history records to export!");
    return;
  }

  // Sort descending: most recent solves first
  filtered.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));

  // ── Row color per difficulty ───────────────────────────────────────────────
  const diffStyle = {
    easy:   "background:#f0fdf4;color:#166534;",   // soft green
    medium: "background:#fffbeb;color:#92400e;",   // soft yellow/amber
    hard:   "background:#fef2f2;color:#991b1b;",   // soft red
  };

  // ── Heading row ───────────────────────────────────────────────────────────
  const headingCells = ["#", "Title", "Difficulty", "Approach", "Revision", "Time Spent", "Topic", "Pattern", "Collection", "Favorite", "Date", "Notes", "Link", "GitHub Link"]
    .map((h) => `<th x:autofilter="all" style="background:#0f172a;color:#ffffff;font-weight:bold;padding:10px 14px;border:1px solid #334155;font-size:12px;text-align:center;white-space:nowrap;font-family:'Segoe UI',sans-serif;">${h}</th>`)
    .join("");

  // ── Data rows ─────────────────────────────────────────────────────────────
  const dataRows = filtered.map((entry, i) => {
    const diff     = (entry.difficulty || "").toLowerCase();
    const rowStyle = diffStyle[diff] || "background:#f8fafc;";
    const tdStyle  = `padding:8px 12px;border:1px solid #cbd5e1;font-size:11.5px;font-family:'Segoe UI',sans-serif;`;

    // Dynamic problem URL (Leetsync solves vs Custom solves)
    const problemUrl = (entry.url && entry.url.startsWith("http")) 
      ? entry.url 
      : `https://leetcode.com/problems/${entry.slug || ""}/`;
    const leetcodeCell = `<a href="${escapeHtml(problemUrl)}" style="color:#0284c7;text-decoration:underline;font-weight:600;">Open Link</a>`;

    // Find all solves for this problem slug to merge approaches, links, and notes
    const solvesForThisProblem = history.filter(h => h.slug === entry.slug);
    
    // Unique approaches sorted by date
    const uniqueApproachesList = [];
    const seenApproaches = new Set();
    solvesForThisProblem.forEach(h => {
      if (!seenApproaches.has(h.approach)) {
        seenApproaches.add(h.approach);
        uniqueApproachesList.push(h);
      }
    });

    const mergedApproaches = uniqueApproachesList.map(h => approachDisplayName(h.approach)).join(", ");
    
    const mergedGithubLinks = uniqueApproachesList.map(h => {
      const label = escapeHtml(approachDisplayName(h.approach));
      if (h.githubUrl) {
        return `<a href="${escapeHtml(h.githubUrl)}" style="color:#0284c7;text-decoration:underline;">${label} Link</a>`;
      }
      return `${label}: —`;
    }).join("<br>");

    const mergedNotes = uniqueApproachesList.map(h => {
      const label = escapeHtml(approachDisplayName(h.approach));
      let safeNotes = escapeHtml(h.notes?.trim() || "");
      const notesContent = safeNotes ? safeNotes.replace(/\n+/g, "<br>") : "—";
      return `<b>[${label}]</b>: ${notesContent}`;
    }).join("<br>");

    const githubCell = mergedGithubLinks || "—";
    const notesCell  = mergedNotes || "—";
    const dateStr    = entry.savedAt ? getLocalDateString(entry.savedAt) : "—";
    const approach   = mergedApproaches;
    const title      = escapeHtml(entry.title || "");
    const difficulty = escapeHtml(entry.difficulty || "");
    const topicCell  = escapeHtml(entry.topic || "—");
    const patternCell = escapeHtml(entry.pattern || "—");
    const revCount   = entry.revisionCount || 1;
    const timeSpentCell = escapeHtml(entry.timeSpent || "—");
    let collectionVal = "—";
    if (entry.collection && typeof entry.collection === "string") {
      collectionVal = entry.collection;
    } else if (entry.collections && Array.isArray(entry.collections) && entry.collections.length > 0) {
      collectionVal = entry.collections.join(", ");
    }
    const collectionsCell = escapeHtml(collectionVal);
    const favCell     = entry.isFavorite ? "❤️" : "—";

    return `
      <tr style="${rowStyle}">
        <td style="${tdStyle}text-align:center;vertical-align:top;">${i + 1}</td>
        <td style="${tdStyle}font-weight:600;vertical-align:top;color:#0f172a;">${entry.id && entry.id !== "0" && entry.id !== 0 ? entry.id + ". " : ""}${title}</td>
        <td style="${tdStyle}text-align:center;font-weight:700;vertical-align:top;">${difficulty}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${approach}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">Rev ${revCount}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${timeSpentCell}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${topicCell}</td>
        <td style="${tdStyle}vertical-align:top;">${patternCell}</td>
        <td style="${tdStyle}vertical-align:top;">${collectionsCell}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${favCell}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${dateStr}</td>
        <td style="${tdStyle}max-width:300px;white-space:normal;vertical-align:top;">${notesCell}</td>
        <td style="${tdStyle}vertical-align:top;text-align:center;">${leetcodeCell}</td>
        <td style="${tdStyle}vertical-align:top;text-align:center;">${githubCell}</td>
      </tr>`;
  }).join("\n");

  // ── Full HTML document ────────────────────────────────────────────────────
  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml><x:ExcelWorkbook><x:ExcelWorksheets>
        <x:ExcelWorksheet><x:Name>LeetSync History</x:Name>
        <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        <x:AutoFilter x:range="A4:N${filtered.length + 4}"/>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets></x:ExcelWorkbook></xml>
      <![endif]-->
    </head>
    <body style="font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:20px;">
      <table border="1" cellspacing="0" cellpadding="0"
             style="border-collapse:collapse;font-family:'Segoe UI',sans-serif;width:100%;border:1px solid #cbd5e1;">
        <thead>
          <tr style="height: 42px;">
            <th colspan="14" style="background:#185abc;color:#ffffff;font-size:16px;font-weight:bold;text-align:center;vertical-align:middle;font-family:'Segoe UI',sans-serif;border:1px solid #1e5cba;">⚡ LeetSync Pro — Coding Solve History Report</th>
          </tr>
          <tr style="height: 24px;">
            <th colspan="14" style="background:#f1f5f9;color:#475569;font-size:10.5px;text-align:center;vertical-align:middle;font-weight:600;font-family:'Segoe UI',sans-serif;border:1px solid #cbd5e1;">Generated on: ${new Date().toLocaleString()} · Total Solves: ${filtered.length}</th>
          </tr>
          <tr style="height: 10px;"><th colspan="14" style="border:none;background:#ffffff;"></th></tr>
          <tr style="mso-filter:auto;">${headingCells}</tr>
        </thead>
        <tbody>${dataRows}</tbody>
      </table>
    </body>
    </html>`;

  // ── Download ──────────────────────────────────────────────────────────────
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `leetsync-history-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Escape special HTML characters to prevent injection in the table
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (e) {
    return false;
  }
}

const POPUP_TOPIC_NAMES = [
  "Array", "String", "Hash Table", "Dynamic Programming", "Math", "Sorting", "Greedy",
  "Depth-First Search", "Breadth-First Search", "Binary Search", "Matrix", "Two Pointers",
  "Bit Manipulation", "Stack", "Heap (Priority Queue)", "Backtracking", "Graph", "Tree",
  "Linked List", "Sliding Window", "Trie", "Union Find"
];

const POPUP_TOPIC_PATTERNS = {
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

// ── Calendar Tab Implementation ──────────────────────────────────────────────
async function renderCalendar() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = stored[STORAGE_KEYS.history] || [];

  // Group history items by local date string (YYYY-MM-DD)
  const historyByDate = {};
  history.forEach(entry => {
    const dateStr = getLocalDateString(entry.savedAt);
    if (dateStr) {
      if (!historyByDate[dateStr]) {
        historyByDate[dateStr] = [];
      }
      historyByDate[dateStr].push(entry);
    }
  });

  // Render Month Year title
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  if (el.calendarMonthYear) {
    el.calendarMonthYear.textContent = `${monthNames[month]} ${year}`;
  }

  if (!el.calendarGrid) return;
  el.calendarGrid.innerHTML = "";

  // Get first day of the month and total number of days
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday, 6 is Saturday
  const totalDays = new Date(year, month + 1, 0).getDate();

  // Days from the previous month to fill the first row
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  const prevMonthYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthTotalDays - i;
    const cellDate = new Date(prevMonthYear, prevMonth, dayNum);
    const cell = createCalendarCell(cellDate, false, historyByDate);
    el.calendarGrid.appendChild(cell);
  }

  // Days for the current month
  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const cellDate = new Date(year, month, dayNum);
    const cell = createCalendarCell(cellDate, true, historyByDate);
    el.calendarGrid.appendChild(cell);
  }

  // Days from the next month to fill the last row
  const totalRendered = firstDayIndex + totalDays;
  const nextMonthYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const totalCellsNeeded = totalRendered <= 35 ? 35 : 42;
  const nextMonthDaysToAdd = totalCellsNeeded - totalRendered;

  for (let dayNum = 1; dayNum <= nextMonthDaysToAdd; dayNum++) {
    const cellDate = new Date(nextMonthYear, nextMonth, dayNum);
    const cell = createCalendarCell(cellDate, false, historyByDate);
    el.calendarGrid.appendChild(cell);
  }

  // Render the details panel for the selected date
  renderSelectedDayDetails(historyByDate);
}

function createCalendarCell(date, isCurrentMonth, historyByDate) {
  const cell = document.createElement("div");
  cell.className = "calendar-day";
  if (!isCurrentMonth) {
    cell.className += " other-month";
  }

  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  
  // Highlight today
  const today = new Date();
  const isToday = date.getDate() === today.getDate() && 
                  date.getMonth() === today.getMonth() && 
                  date.getFullYear() === today.getFullYear();
  if (isToday) {
    cell.className += " today";
  }

  // Highlight selected
  const isSelected = date.getDate() === selectedCalendarDate.getDate() && 
                     date.getMonth() === selectedCalendarDate.getMonth() && 
                     date.getFullYear() === selectedCalendarDate.getFullYear();
  if (isSelected) {
    cell.className += " selected";
  }

  // Day number label
  const numLabel = document.createElement("span");
  numLabel.className = "calendar-day-num";
  numLabel.textContent = date.getDate();
  cell.appendChild(numLabel);

  // Render solved problems mini pills
  const dayHistory = historyByDate[dateStr] || [];
  if (dayHistory.length > 0) {
    // Deduplicate cell solves by slug + approach to only show unique problem names in the calendar grid
    const uniqueMap = new Map();
    dayHistory.forEach((entry) => {
      const key = `${entry.slug}-${entry.approach}`;
      const existing = uniqueMap.get(key);
      if (!existing || new Date(entry.savedAt) > new Date(existing.savedAt)) {
        uniqueMap.set(key, entry);
      }
    });
    const uniqueDayHistory = Array.from(uniqueMap.values());
    uniqueDayHistory.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));

    const pillList = document.createElement("div");
    pillList.className = "calendar-pill-list";

    // Limit pills inside the cell to 2, and show "+X more" if there are more
    const limit = 2;
    uniqueDayHistory.slice(0, limit).forEach(entry => {
      const pill = document.createElement("div");
      const diffClass = (entry.difficulty || "medium").toLowerCase();
      pill.className = `calendar-pill ${diffClass}`;
      
      let title = entry.title || "Solved";
      pill.textContent = title;
      pill.title = `${title} (${entry.difficulty})`;
      pillList.appendChild(pill);
    });

    if (uniqueDayHistory.length > limit) {
      const more = document.createElement("div");
      more.className = "calendar-pill more-indicator";
      more.textContent = `+${uniqueDayHistory.length - limit} more`;
      pillList.appendChild(more);
    }

    cell.appendChild(pillList);
  }

  // Event listener to click a day
  cell.addEventListener("click", () => {
    selectedCalendarDate = date;
    
    // Unselect previous
    const prevSelected = el.calendarGrid.querySelector(".calendar-day.selected");
    if (prevSelected) {
      prevSelected.classList.remove("selected");
    }
    cell.classList.add("selected");

    // Render details
    renderSelectedDayDetails(historyByDate);
  });

  return cell;
}

function renderSelectedDayDetails(historyByDate) {
  const dateStr = `${selectedCalendarDate.getFullYear()}-${String(selectedCalendarDate.getMonth() + 1).padStart(2, '0')}-${String(selectedCalendarDate.getDate()).padStart(2, '0')}`;
  
  // Set date title label in details panel
  if (el.calendarSelectedDateStr) {
    el.calendarSelectedDateStr.textContent = selectedCalendarDate.toLocaleDateString("en-US", {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  }

  if (!el.calendarDayDetailsList) return;
  el.calendarDayDetailsList.innerHTML = "";

  const dayHistory = historyByDate[dateStr] || [];
  if (dayHistory.length === 0) {
    el.calendarDayDetailsList.innerHTML = `<p class="empty-state">No problems solved on this day.</p>`;
    return;
  }

  // Deduplicate day details solves by slug + approach
  const uniqueMap = new Map();
  dayHistory.forEach((entry) => {
    const key = `${entry.slug}-${entry.approach}`;
    const existing = uniqueMap.get(key);
    if (!existing || new Date(entry.savedAt) > new Date(existing.savedAt)) {
      uniqueMap.set(key, entry);
    }
  });
  const displayedDayHistory = Array.from(uniqueMap.values());
  displayedDayHistory.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));

  displayedDayHistory.forEach(entry => {
    const item = document.createElement("div");
    item.className = "day-details-item";

    const diffClass = (entry.difficulty || "medium").toLowerCase();
    const approachLabel = approachDisplayName(entry.approach);
    const patternStr = entry.pattern ? `🧩 ${escapeHtml(entry.pattern)}` : "";
    const topicStr = entry.topic ? `📁 ${escapeHtml(entry.topic)}` : "";
    const revStr = entry.revisionCount ? `🔄 Rev: ${entry.revisionCount}` : "";

    let metaParts = [];
    if (topicStr) metaParts.push(topicStr);
    if (patternStr) metaParts.push(patternStr);
    if (revStr) metaParts.push(revStr);
    const metaText = metaParts.join(" · ") || (entry.language ? `Lang: ${escapeHtml(entry.language)}` : "");

    const isScheduled = !!entry.customRevisionDueDate;
    const scheduleTitle = isScheduled ? `Revision scheduled: ${entry.customRevisionDueDate}` : 'Schedule Revision';
    const activeClass = isScheduled ? 'active' : '';

    const escapedTitle = escapeHtml(entry.title || entry.slug || "Solve");
    const escapedApproach = escapeHtml(approachLabel);
    const problemUrl = (entry.url && entry.url.startsWith("http")) 
      ? entry.url 
      : `https://leetcode.com/problems/${entry.slug}/`;
    const safeProblemUrl = isSafeUrl(problemUrl) ? problemUrl : "#";
    const safeGithubUrl = isSafeUrl(entry.githubUrl) ? entry.githubUrl : "";

    item.innerHTML = `
      <div class="day-details-left">
        <a class="day-details-title day-details-title-link" href="${safeProblemUrl}" target="_blank" title="Open Problem">${entry.id && entry.id !== "0" && entry.id !== 0 ? escapeHtml(entry.id) + ". " : ""}${escapedTitle}</a>
        <span class="day-details-meta">${metaText}</span>
      </div>
      <div class="day-details-right">
        <span class="diff-badge ${diffClass}">${escapeHtml(entry.difficulty) || "?"}</span>
        <span class="approach-pill">${escapedApproach}</span>
        ${safeGithubUrl
          ? `<a class="history-link" href="${safeGithubUrl}" target="_blank" title="View on GitHub">↗</a>`
          : ""}
        <button class="revision-btn ${activeClass}" title="${escapeHtml(scheduleTitle)}">✓</button>
      </div>
    `;

    // Event listener for the rightmost tick button to open the floating dropdown
    const revBtn = item.querySelector(".revision-btn");
    revBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleRevisionDropdown(revBtn, entry);
    });

    el.calendarDayDetailsList.appendChild(item);
  });
}

function removeDropdown(dropdown) {
  if (!dropdown) return;
  if (dropdown.closeListener) {
    document.removeEventListener("click", dropdown.closeListener);
  }
  dropdown.remove();
  activeRevisionDropdownBtn = null;
}

function toggleRevisionDropdown(revBtn, entry) {
  // Remove any existing dropdown
  const oldDropdown = document.querySelector(".revision-floating-dropdown");
  if (oldDropdown) {
    const wasSame = (activeRevisionDropdownBtn === revBtn);
    removeDropdown(oldDropdown);
    if (wasSame) {
      return;
    }
  }

  const panel = document.querySelector(".calendar-panel");
  if (!panel) return;

  activeRevisionDropdownBtn = revBtn;

  const isScheduled = !!entry.customRevisionDueDate;

  const dropdown = document.createElement("div");
  dropdown.className = "revision-floating-dropdown";

  dropdown.innerHTML = `
    <span style="font-size: 9px; color: var(--clr-muted); font-weight: 600; margin-right: 2px;">Revise:</span>
    <button class="rev-drop-opt" data-days="3">3d</button>
    <button class="rev-drop-opt" data-days="5">5d</button>
    <button class="rev-drop-opt" data-days="7">7d</button>
    <button class="rev-drop-opt" data-days="10">10d</button>
    <div class="rev-drop-divider-vertical"></div>
    <input type="number" class="rev-custom-input" min="1" placeholder="Days">
    <button class="rev-custom-set-btn">Set</button>
    ${isScheduled ? `
      <div class="rev-drop-divider-vertical"></div>
      <button class="rev-drop-clear" title="Clear Revision">Clear</button>
    ` : ''}
  `;

  // Calculate coordinates relative to .calendar-panel which has position: relative
  const rect = revBtn.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const top = rect.bottom - panelRect.top;
  const right = panelRect.right - rect.right;

  dropdown.style.top = `${top + 4}px`;
  dropdown.style.right = `${right}px`;

  panel.appendChild(dropdown);

  // Bind click handlers for standard options
  dropdown.querySelectorAll(".rev-drop-opt").forEach(btn => {
    btn.addEventListener("click", async () => {
      const days = parseInt(btn.dataset.days);
      await setRevision(entry.slug, days);
      removeDropdown(dropdown);
    });
  });

  // Bind click handler for custom days input
  const setBtn = dropdown.querySelector(".rev-custom-set-btn");
  const customInput = dropdown.querySelector(".rev-custom-input");
  setBtn.addEventListener("click", async () => {
    const val = parseInt(customInput.value);
    if (isNaN(val) || val <= 0) {
      alert("Please enter a positive number of days.");
      return;
    }
    await setRevision(entry.slug, val);
    removeDropdown(dropdown);
  });

  // Bind click handler for clearing revision
  const clearBtn = dropdown.querySelector(".rev-drop-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      await updateProblemRevisionSettings(entry.slug, {
        customRevisionDueDate: null,
        revisionCompleted: null,
        revisionCompletedAt: null
      });
      removeDropdown(dropdown);
      renderCalendar();
    });
  }

  // Prevent click propagation from closing the dropdown immediately
  dropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // Close when clicking outside
  setTimeout(() => {
    const closeDrop = (e) => {
      if (!dropdown.contains(e.target) && e.target !== revBtn) {
        removeDropdown(dropdown);
      }
    };
    dropdown.closeListener = closeDrop;
    document.addEventListener("click", closeDrop);
  }, 0);
}

async function setRevision(slug, days) {
  const d = new Date(selectedCalendarDate);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const dueDateStr = `${yyyy}-${mm}-${dd}`;
  
  await updateProblemRevisionSettings(slug, {
    customRevisionDueDate: dueDateStr,
    revisionCompleted: false,
    revisionCompletedAt: null
  });
  
  renderCalendar();
}

// ── Spaced Repetition (Revision Scheduler) Helpers ───────────────────────────
function getRevisionDueDate(entry) {
  if (entry.customRevisionDueDate) {
    const d = new Date(entry.customRevisionDueDate);
    if (!isNaN(d.getTime())) return d;
  }
  if (!entry.savedAt) return null;
  const d = new Date(entry.lastRevisionAt || entry.savedAt);
  const rev = entry.revisionCount || 1;
  let offset = 3;
  if (rev === 2) offset = 7;
  else if (rev === 3) offset = 15;
  else if (rev >= 4) offset = 30;

  d.setDate(d.getDate() + offset);
  return d;
}

function isRevisionDue(entry) {
  const today = todayStr();
  let isCompleted = !!entry.revisionCompleted;
  let completedAt = entry.revisionCompletedAt || "";

  if (isCompleted && completedAt !== today) {
    // Reset completed flag for the next cycle
    entry.revisionCompleted = false;
    entry.revisionCompletedAt = null;
    isCompleted = false;
    completedAt = "";
    updateProblemRevisionSettings(entry.slug, {
      revisionCompleted: false,
      revisionCompletedAt: null
    });
  }

  const dueDate = getRevisionDueDate(entry);
  if (!dueDate) return false;

  if (isCompleted) {
    return completedAt === today;
  }

  const compareStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
  return today >= compareStr;
}

function getDueRevisions(history) {
  const latestBySlug = {};
  history.forEach(entry => {
    if (!latestBySlug[entry.slug]) {
      latestBySlug[entry.slug] = entry;
    } else {
      const d1 = new Date(entry.savedAt);
      const d2 = new Date(latestBySlug[entry.slug].savedAt);
      if (d1 > d2) {
        latestBySlug[entry.slug] = entry;
      }
    }
  });

  const dueList = [];
  for (const slug in latestBySlug) {
    const entry = latestBySlug[slug];
    if (isRevisionDue(entry)) {
      dueList.push(entry);
    }
  }
  return dueList;
}

async function updateProblemRevisionSettings(slug, settings) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = stored[STORAGE_KEYS.history] || [];
  
  const updated = history.map(entry => {
    if (entry.slug === slug) {
      return {
        ...entry,
        ...settings
      };
    }
    return entry;
  });
  
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: updated });
}

// ── Cloud Sync Logic ─────────────────────────────────────────────────────────

async function syncCloudData() {
  const syncBtn = document.getElementById("btnManualSync");
  const statusText = document.getElementById("cloudSyncStatusText");

  if (statusText) {
    statusText.textContent = "Syncing...";
    statusText.style.color = "var(--clr-primary)";
  }

  if (syncBtn) {
    syncBtn.classList.add("spinning");
    syncBtn.disabled = true;
  }

  const storedData = await chrome.storage.local.get(["auth_user", STORAGE_KEYS.history, STORAGE_KEYS.settings]);
  const authUser = storedData.auth_user;
  if (!authUser || !authUser.uid) {
    if (syncBtn) {
      syncBtn.classList.remove("spinning");
      syncBtn.disabled = false;
    }
    if (statusText) {
      statusText.textContent = "Not logged in";
      statusText.style.color = "#dc2626";
    }
    return;
  }

  const idToken = await getValidIdToken(authUser);
  if (!idToken) {
    if (syncBtn) {
      syncBtn.classList.remove("spinning");
      syncBtn.disabled = false;
    }
    if (statusText) {
      statusText.textContent = "Session expired. Log in again.";
      statusText.style.color = "#dc2626";
    }
    return;
  }

  const uid = authUser.uid;
  const baseUrl = getFirestoreApiUrl();
  const headers = { 
    "Content-Type": "application/json",
    "Authorization": `Bearer ${idToken}`
  };

  try {
    // 1. Fetch settings from Firestore
    const settingsRes = await fetch(`${baseUrl}/users/${uid}`, { headers });
    if (settingsRes.ok) {
      const settingsDoc = await settingsRes.json();
      const cloudSettings = convertFromFirestoreFields(settingsDoc.fields || {});
      if (cloudSettings && Object.keys(cloudSettings).length > 0) {
        const localStored = await chrome.storage.local.get("githubSettings");
        const localSettings = localStored.githubSettings || {};
        
        // Merge cloud settings with local settings (preserving local credentials/token)
        const mergedSettings = { ...cloudSettings, ...localSettings };
        await chrome.storage.local.set({ githubSettings: mergedSettings });
        applySettings(mergedSettings);
      }
    } else if (settingsRes.status !== 404) {
      console.error(`Failed to fetch settings from Firestore: ${settingsRes.status}`);
      try {
        const errText = await settingsRes.text();
        console.error("Firestore settings error details:", errText);
      } catch (e) {}
    }

    // 2. Fetch history from Firestore
    const historyRes = await fetch(`${baseUrl}/users/${uid}/history?pageSize=300`, { headers });
    if (historyRes.ok) {
      const historyDoc = await historyRes.json();
      const cloudHistory = (historyDoc.documents || []).map(doc => {
        return convertFromFirestoreFields(doc.fields || {});
      });

      const localHistory = storedData[STORAGE_KEYS.history] || [];

      // Merge logic: cloud data overwrites local if newer or not exists
      const merged = [...localHistory];
      cloudHistory.forEach(cloudItem => {
        const idx = merged.findIndex(h => h.slug === cloudItem.slug && h.approach === cloudItem.approach);
        if (idx !== -1) {
          const localDate = new Date(merged[idx].savedAt || 0);
          const cloudDate = new Date(cloudItem.savedAt || 0);
          if (cloudDate > localDate) {
            merged[idx] = cloudItem;
          } else if (cloudDate.getTime() === localDate.getTime()) {
            // Overwrite with cloud edits (like updated notes/favorites)
            merged[idx] = { ...merged[idx], ...cloudItem };
          }
        } else {
          merged.push(cloudItem);
        }
      });

      await chrome.storage.local.set({ [STORAGE_KEYS.history]: merged });
      
      // Also upload any local solves that are NOT in the cloud, or have newer local changes
      for (const localItem of localHistory) {
        const cloudMatch = cloudHistory.find(c => c.slug === localItem.slug && c.approach === localItem.approach);
        const needsUpload = !cloudMatch || 
                            new Date(localItem.savedAt || 0) > new Date(cloudMatch.savedAt || 0) ||
                            (localItem.notes || "") !== (cloudMatch.notes || "") ||
                            localItem.isFavorite !== cloudMatch.isFavorite;

        if (needsUpload) {
          const safeId = `${localItem.slug}-${localItem.approach}`.replace(/[^a-zA-Z0-9_-]/g, "");
          await fetch(`${baseUrl}/users/${uid}/history/${safeId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(convertToFirestoreFields(localItem))
          });
        }
      }
      
      // Re-render popup panels
      renderHistory();
      renderStats();
      renderCalendar();
      if (statusText) {
        statusText.textContent = "✅ Connected & Synced";
        statusText.style.color = "#22c55e";
      }
    } else {
      console.error(`Failed to fetch history from Firestore: ${historyRes.status}`);
      if (statusText) {
        statusText.textContent = `❌ Error (History: ${historyRes.status})`;
        statusText.style.color = "#dc2626";
      }
      try {
        const errText = await historyRes.text();
        console.error("Firestore history error details:", errText);
      } catch (e) {}
    }
  } catch (err) {
    console.error("Cloud sync failed:", err);
    if (statusText) {
      statusText.textContent = `❌ Error: ${err.message}`;
      statusText.style.color = "#dc2626";
    }
  } finally {
    if (syncBtn) {
      syncBtn.classList.remove("spinning");
      syncBtn.disabled = false;
    }
  }
}

function convertFromFirestoreFields(fields) {
  const obj = {};
  for (const [key, valObj] of Object.entries(fields)) {
    if (!valObj) continue;
    if ("stringValue" in valObj) {
      obj[key] = valObj.stringValue;
    } else if ("doubleValue" in valObj) {
      obj[key] = Number(valObj.doubleValue);
    } else if ("integerValue" in valObj) {
      obj[key] = Number(valObj.integerValue);
    } else if ("booleanValue" in valObj) {
      obj[key] = valObj.booleanValue;
    } else if ("arrayValue" in valObj) {
      const values = valObj.arrayValue.values || [];
      obj[key] = values.map(v => v.stringValue || "");
    }
  }
  return obj;
}

function convertToFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      fields[key] = { stringValue: value };
    } else if (typeof value === "number") {
      fields[key] = { doubleValue: value };
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(v => ({ stringValue: String(v) }))
        }
      };
    }
  }
  return { fields };
}

function getJwtExpiration(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return 0;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp * 1000;
  } catch (e) {
    return 0;
  }
}

async function getValidIdToken(authUser) {
  if (!authUser || !authUser.idToken || !authUser.refreshToken) {
    return "";
  }
  
  const exp = getJwtExpiration(authUser.idToken);
  // If the token is valid for more than 5 minutes, use it
  if (exp && (exp - Date.now() > 5 * 60 * 1000)) {
    return authUser.idToken;
  }
  
  // Refresh the token
  try {
    console.log("Firebase ID token expired or close to expiration. Refreshing...");
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(authUser.refreshToken)}`
    });
    
    if (!res.ok) throw new Error("Failed to refresh token");
    const data = await res.json();
    
    authUser.idToken = data.id_token;
    authUser.refreshToken = data.refresh_token || authUser.refreshToken;
    
    // Save updated authState to storage
    await chrome.storage.local.set({ auth_user: authUser });
    console.log("Firebase ID token refreshed successfully.");
    return authUser.idToken;
  } catch (err) {
    console.error("Token refresh failed:", err);
    return "";
  }
}

// ── Custom Solve Form Implementation ─────────────────────────────────────────
function initCustomSolveForm() {
  const form = document.getElementById("customSolveForm");
  if (!form) return;

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

  const approachRadios = document.querySelectorAll('input[name="customApproach"]');
  const approachNameWrap = document.getElementById("customApproachNameWrap");
  const approachNameInput = document.getElementById("customApproachName");
  const approachReset = document.getElementById("customApproachReset");

  const topicSelect = document.getElementById("customTopicSelect");
  const topicSelectWrap = document.getElementById("customTopicSelectWrap");
  const topicInputWrap = document.getElementById("customTopicInputWrap");
  const topicInput = document.getElementById("customTopicInput");
  const topicReset = document.getElementById("customTopicReset");

  const patternSelect = document.getElementById("customPatternSelect");
  const patternSelectWrap = document.getElementById("customPatternSelectWrap");
  const patternInputWrap = document.getElementById("customPatternInputWrap");
  const patternInput = document.getElementById("customPatternInput");
  const patternReset = document.getElementById("customPatternReset");

  const timeSelect = document.getElementById("customTimeComplexity");
  const timeSelectWrap = document.getElementById("customTimeSelectWrap");
  const timeNameWrap = document.getElementById("customTimeComplexityNameWrap");
  const timeNameInput = document.getElementById("customTimeComplexityName");
  const timeReset = document.getElementById("customTimeComplexityReset");

  const spaceSelect = document.getElementById("customSpaceComplexity");
  const spaceSelectWrap = document.getElementById("customSpaceSelectWrap");
  const spaceNameWrap = document.getElementById("customSpaceComplexityNameWrap");
  const spaceNameInput = document.getElementById("customSpaceComplexityName");
  const spaceReset = document.getElementById("customSpaceComplexityReset");

  const collectionSelect = document.getElementById("customCollection");
  const collectionSelectWrap = document.getElementById("customCollectionSelectWrap");
  const collectionInputWrap = document.getElementById("customCollectionInputWrap");
  const collectionInput = document.getElementById("customCollectionInput");
  const collectionReset = document.getElementById("customCollectionReset");

  const statusText = document.getElementById("customSolveStatus");

  // Approach toggle (radio buttons)
  approachRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      if (radio.value === "custom") {
        approachNameWrap.classList.remove("hidden");
        approachNameInput.required = true;
        approachNameInput.value = "";
        approachNameInput.focus();
      } else {
        approachNameWrap.classList.add("hidden");
        approachNameInput.required = false;
      }
    });
  });

  if (approachReset) {
    approachReset.addEventListener("click", () => {
      approachNameInput.value = "";
      approachNameWrap.classList.add("hidden");
      approachNameInput.required = false;
      const optimalRadio = [...approachRadios].find(r => r.value === "oa");
      if (optimalRadio) optimalRadio.checked = true;
    });
  }

  // Helper to populate pattern dropdown based on topic
  function populatePatterns(topicVal) {
    patternSelect.innerHTML = "";
    const norm = (topicVal || "").toLowerCase().trim();
    const patterns = TOPIC_PATTERNS[norm] || [];
    
    if (patterns.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Select Topic First —";
      patternSelect.appendChild(opt);
    } else {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "— Choose Pattern —";
      patternSelect.appendChild(opt);
      patterns.forEach(pat => {
        const o = document.createElement("option");
        o.value = pat;
        o.textContent = pat;
        patternSelect.appendChild(o);
      });
    }
    const o = document.createElement("option");
    o.value = "__other__";
    o.textContent = "✏️ Custom...";
    patternSelect.appendChild(o);
  }

  // Topic dropdown toggle
  if (topicSelect && topicSelectWrap && topicInputWrap) {
    topicSelect.addEventListener("change", () => {
      if (topicSelect.value === "__other__") {
        topicSelectWrap.classList.add("hidden");
        topicInputWrap.classList.remove("hidden");
        if (topicInput) { topicInput.value = ""; topicInput.required = true; topicInput.focus(); }
        populatePatterns("");
      } else {
        populatePatterns(topicSelect.value);
      }
    });
    if (topicReset) {
      topicReset.addEventListener("click", () => {
        if (topicInput) { topicInput.value = ""; topicInput.required = false; }
        topicInputWrap.classList.add("hidden");
        topicSelectWrap.classList.remove("hidden");
        topicSelect.value = "";
        populatePatterns("");
      });
    }
  }

  // Pattern dropdown toggle
  if (patternSelect && patternSelectWrap && patternInputWrap) {
    patternSelect.addEventListener("change", () => {
      if (patternSelect.value === "__other__") {
        patternSelectWrap.classList.add("hidden");
        patternInputWrap.classList.remove("hidden");
        if (patternInput) { patternInput.value = ""; patternInput.required = true; patternInput.focus(); }
      }
    });
    if (patternReset) {
      patternReset.addEventListener("click", () => {
        if (patternInput) { patternInput.value = ""; patternInput.required = false; }
        patternInputWrap.classList.add("hidden");
        patternSelectWrap.classList.remove("hidden");
        patternSelect.value = "";
      });
    }
  }

  // Time Complexity toggle (select hides, custom input appears)
  if (timeSelect && timeSelectWrap && timeNameWrap) {
    timeSelect.addEventListener("change", () => {
      if (timeSelect.value === "custom") {
        timeSelectWrap.classList.add("hidden");
        timeNameWrap.classList.remove("hidden");
        if (timeNameInput) { timeNameInput.value = ""; timeNameInput.required = true; timeNameInput.focus(); }
      }
    });
    if (timeReset) {
      timeReset.addEventListener("click", () => {
        if (timeNameInput) { timeNameInput.value = ""; timeNameInput.required = false; }
        timeNameWrap.classList.add("hidden");
        timeSelectWrap.classList.remove("hidden");
        timeSelect.value = "O(n)";
      });
    }
  }

  // Space Complexity toggle (select hides, custom input appears)
  if (spaceSelect && spaceSelectWrap && spaceNameWrap) {
    spaceSelect.addEventListener("change", () => {
      if (spaceSelect.value === "custom") {
        spaceSelectWrap.classList.add("hidden");
        spaceNameWrap.classList.remove("hidden");
        if (spaceNameInput) { spaceNameInput.value = ""; spaceNameInput.required = true; spaceNameInput.focus(); }
      }
    });
    if (spaceReset) {
      spaceReset.addEventListener("click", () => {
        if (spaceNameInput) { spaceNameInput.value = ""; spaceNameInput.required = false; }
        spaceNameWrap.classList.add("hidden");
        spaceSelectWrap.classList.remove("hidden");
        spaceSelect.value = "O(1)";
      });
    }
  }

  // Collection name toggle (select hides, custom input appears)
  if (collectionSelect && collectionSelectWrap && collectionInputWrap) {
    collectionSelect.addEventListener("change", () => {
      if (collectionSelect.value === "__other__") {
        collectionSelectWrap.classList.add("hidden");
        collectionInputWrap.classList.remove("hidden");
        if (collectionInput) { collectionInput.value = ""; collectionInput.required = true; collectionInput.focus(); }
      }
    });
    if (collectionReset) {
      collectionReset.addEventListener("click", () => {
        if (collectionInput) { collectionInput.value = ""; collectionInput.required = false; }
        collectionInputWrap.classList.add("hidden");
        collectionSelectWrap.classList.remove("hidden");
        collectionSelect.value = "";
      });
    }
  }

  // Form submit handler
  form.onsubmit = async (e) => {
    e.preventDefault();
    statusText.textContent = "⏳ Saving & syncing...";
    statusText.className = "result";
    statusText.style.color = "var(--clr-primary)";

    const title = document.getElementById("customTitle").value.trim();
    const difficulty = document.getElementById("customDifficulty").value;
    
    // Find checked approach
    const checkedApproach = [...approachRadios].find(r => r.checked);
    const approachType = checkedApproach ? checkedApproach.value : "oa";
    const customApproachName = approachNameInput.value.trim();
    
    // Resolve topic and pattern
    let topic = topicSelect.value;
    if (topic === "__other__") {
      topic = topicInput.value.trim();
    }
    let pattern = patternSelect.value;
    if (pattern === "__other__") {
      pattern = patternInput.value.trim();
    }

    // Resolve complexities
    let timeComplexity = timeSelect.value;
    if (timeComplexity === "custom") {
      timeComplexity = timeNameInput.value.trim();
    }
    let spaceComplexity = spaceSelect.value;
    if (spaceComplexity === "custom") {
      spaceComplexity = spaceNameInput.value.trim();
    }

    // Resolve collection
    let selectedCollection = collectionSelect.value;
    if (selectedCollection === "__other__") {
      selectedCollection = collectionInput.value.trim();
    }

    const timeSpent = "";
    const language = "python";
    const link = document.getElementById("customLink").value.trim();
    const notes = document.getElementById("customNotes").value.trim();
    const code = document.getElementById("customCode").value.trim();

    const finalApproach = approachType === "custom" ? customApproachName : approachType;

    // Send save request to background worker
    chrome.runtime.sendMessage({
      type: "LEETSYNC_SAVE_CUSTOM_SOLVE",
      payload: {
        title,
        difficulty,
        approach: finalApproach,
        timeComplexity,
        spaceComplexity,
        topic: topic || "Other",
        pattern: pattern || "None",
        collection: selectedCollection,
        timeSpent,
        language,
        link,
        notes,
        code
      }
    }, (response) => {
      if (chrome.runtime.lastError || (response && !response.ok)) {
        statusText.textContent = `❌ Error: ${response?.error || chrome.runtime.lastError?.message || "Failed to save"}`;
        statusText.style.color = "#dc2626";
      } else {
        statusText.textContent = "✅ Saved & Synced Successfully!";
        statusText.style.color = "#22c55e";
        form.reset();
        
        // Reset custom input states
        approachNameWrap.classList.add("hidden");
        topicInputWrap.classList.add("hidden");
        topicSelectWrap.classList.remove("hidden");
        patternInputWrap.classList.add("hidden");
        patternSelectWrap.classList.remove("hidden");
        timeNameWrap.classList.add("hidden");
        timeSelectWrap.classList.remove("hidden");
        spaceNameWrap.classList.add("hidden");
        spaceSelectWrap.classList.remove("hidden");
        collectionInputWrap.classList.add("hidden");
        collectionSelectWrap.classList.remove("hidden");
        
        populatePatterns("");
        
        // Default radio checked
        const optimalRadio = [...approachRadios].find(r => r.value === "oa");
        if (optimalRadio) optimalRadio.checked = true;

        // Refresh local views if active
        renderHistory();
        renderStats();
      }
    });
  };
}

// ── Fetch & Sync Solves from GitHub Repository ──────────────────────────────
async function fetchGitHubRepoSolves() {
  const statusText = document.getElementById("repoFetchStatus");
  const btn = document.getElementById("btnFetchGitHubRepoSolves");

  if (!statusText || !btn) return;

  statusText.textContent = "⏳ Fetching settings...";
  statusText.style.color = "var(--clr-primary)";
  btn.disabled = true;

  try {
    const stored = await chrome.storage.local.get(["auth_user", "githubSettings", STORAGE_KEYS.history]);
    const authUser = stored.auth_user;
    const settings = stored.githubSettings || {};
    const localHistory = stored[STORAGE_KEYS.history] || [];

    if (!authUser || !authUser.uid) {
      throw new Error("You must be logged in to sync solved history.");
    }

    const token = settings.token;
    const owner = settings.owner;
    const repo = settings.repo;
    const branch = settings.branch || "main";

    if (!token || !owner || !repo) {
      throw new Error("GitHub integration settings (token, owner, repo) are missing.");
    }

    // 1. Fetch recursive tree
    statusText.textContent = "⏳ Fetching repository file list...";
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/vnd.github.v3+json"
      }
    });

    if (!treeRes.ok) {
      throw new Error(`Failed to fetch Git tree: ${treeRes.status} ${treeRes.statusText}`);
    }

    const treeData = await treeRes.json();
    const files = treeData.tree || [];

    // Filter for README.md files
    const readmeFiles = files.filter(f => f.type === "blob" && f.path.toLowerCase().endsWith("readme.md"));

    const importedHistory = [];

    if (readmeFiles.length > 0) {
      statusText.textContent = `⏳ Found ${readmeFiles.length} README files. Importing contents...`;
      
      // 2. Fetch and parse each README
      for (let i = 0; i < readmeFiles.length; i++) {
        const file = readmeFiles[i];
        statusText.textContent = `⏳ Syncing README ${i + 1}/${readmeFiles.length}: ${file.path}`;

        try {
          const fileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}?ref=${branch}`, {
            headers: {
              "Authorization": `token ${token}`,
              "Accept": "application/vnd.github.v3+json"
            }
          });

          if (fileRes.ok) {
            const fileData = await fileRes.json();
            const base64Content = fileData.content.replace(/\s/g, "");
            const decodedText = decodeURIComponent(escape(atob(base64Content)));
            
            const parsedSolves = parseReadmeMetadata(decodedText, file.path, files, { owner, repo, branch });
            if (parsedSolves && parsedSolves.length > 0) {
              importedHistory.push(...parsedSolves);
            }
          }
        } catch (err) {
          console.error(`Failed to parse README at ${file.path}:`, err);
        }
      }
    }

    // 2.5 Scan all code files in the repository to find missing solves or non-README solves
    statusText.textContent = "⏳ Scanning code files in the repository for additional solves...";
    
    const codeExtensions = {
      "py": "python", "py3": "python3", "cpp": "cpp", "cc": "cpp", "cxx": "cpp",
      "java": "java", "js": "javascript", "ts": "typescript", "go": "go", "rs": "rust",
      "kt": "kotlin", "cs": "csharp"
    };

    const parsedSlugs = new Set();
    importedHistory.forEach(h => parsedSlugs.add(`${h.slug}-${h.approach}`));

    const projectFoldersBlacklist = [
      "node_modules", "venv", "env", ".venv", ".git", ".github", "build", "dist",
      "target", "bin", "obj", "public", "assets", "components", "views",
      "controllers", "models", "routes", "middlewares", "services", "utils", "helpers"
    ];

    const projectFilesBlacklist = [
      "index", "main", "app", "server", "client", "config", "setup", "manage",
      "utils", "helper", "test", "tests", "spec", "api", "package", "tsconfig",
      "gulpfile", "package-lock", "yarn", "vite.config", "next.config"
    ];

    files.forEach(file => {
      if (file.type !== "blob") return;
      
      const pathLower = file.path.toLowerCase();
      // Skip hidden files, readmes, configs, images, static styles
      if (pathLower.startsWith(".") || pathLower.includes("/.") || pathLower.endsWith(".md") || pathLower.endsWith(".json") || pathLower.endsWith(".png") || pathLower.endsWith(".jpg") || pathLower.endsWith(".txt") || pathLower.endsWith(".css") || pathLower.endsWith(".html")) {
        return;
      }

      // Check folder blacklist
      const parts = file.path.split("/");
      const hasBlacklistedFolder = parts.some(p => projectFoldersBlacklist.includes(p.toLowerCase()));
      if (hasBlacklistedFolder) return;

      const filename = parts.pop();
      const parentFolder = parts.pop() || "";

      const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
      if (!extMatch) return;
      const ext = extMatch[1].toLowerCase();
      const lang = codeExtensions[ext];
      if (!lang) return;

      // Check filename blacklist
      const nameWithoutExt = filename.substring(0, filename.lastIndexOf(".")).toLowerCase();
      if (projectFilesBlacklist.includes(nameWithoutExt)) return;

      // Positive indicators check:
      // 1. Parent folder or filename starts with digits (e.g. 0001-two-sum)
      const startsWithDigits = parentFolder.match(/^\d+/) || filename.match(/^\d+/);
      
      // 2. Path contains typical DSA keywords
      const containsDSAKeywords = pathLower.includes("leetcode") || 
                                  pathLower.includes("solutions") || 
                                  pathLower.includes("problems") || 
                                  pathLower.includes("solved") || 
                                  pathLower.includes("dsa") || 
                                  pathLower.includes("coding") || 
                                  pathLower.includes("codeforces") || 
                                  pathLower.includes("gfg") || 
                                  pathLower.includes("algorithms") ||
                                  repo.toLowerCase().includes("leetcode") ||
                                  repo.toLowerCase().includes("solved") ||
                                  repo.toLowerCase().includes("dsa") ||
                                  repo.toLowerCase().includes("problems") ||
                                  repo.toLowerCase().includes("solutions");

      // 3. Folder contains a sibling README.md
      const parentPath = file.path.substring(0, file.path.lastIndexOf("/"));
      const hasSiblingReadme = readmeFiles.some(rf => {
        const rfParent = rf.path.substring(0, rf.path.lastIndexOf("/"));
        return rfParent === parentPath;
      });

      // Ignore if no positive indicator matches to avoid importing project files
      if (!startsWithDigits && !containsDSAKeywords && !hasSiblingReadme) {
        return;
      }

      let rawSlug = "";
      let problemId = "";

      if (parentFolder && parentFolder !== "leetcode" && parentFolder !== "solutions" && parentFolder !== "src" && parentFolder !== "dsa") {
        rawSlug = parentFolder;
      } else {
        rawSlug = filename.substring(0, filename.lastIndexOf("."));
      }

      const idMatch = rawSlug.match(/^(\d+)[-._]?/);
      if (idMatch) {
        problemId = parseInt(idMatch[1], 10).toString();
        rawSlug = rawSlug.substring(idMatch[0].length);
      }

      const slug = rawSlug.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      if (!slug) return;

      const title = slug.split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      let approach = "oa";
      const fnLower = filename.toLowerCase();
      if (fnLower.includes("brute") || fnLower.includes("bf")) approach = "bf";
      else if (fnLower.includes("better") || fnLower.includes("ba")) approach = "ba";
      else {
        const appMatch = fnLower.match(/-(optimal|brute|better|bf|ba|oa)-v\d+/);
        if (appMatch) {
          const m = appMatch[1];
          approach = m === "optimal" ? "oa" : (m === "better" ? "ba" : (m === "brute" ? "bf" : m));
        }
      }

      const uniqKey = `${slug}-${approach}`;
      if (parsedSlugs.has(uniqKey)) return;
      parsedSlugs.add(uniqKey);

      const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`;

      importedHistory.push({
        id: problemId,
        title: title,
        slug: slug,
        difficulty: "Medium",
        url: "",
        savedAt: new Date().toISOString(),
        approach: approach,
        notes: "",
        timeSpent: "",
        collection: "",
        topic: "Other",
        pattern: "None",
        githubUrl: githubUrl,
        isFavorite: false,
        revisionCount: 1,
        revisionCompleted: false,
        revisionCompletedAt: null
      });
    });

    if (importedHistory.length === 0) {
      throw new Error("Could not find or parse any solve records (READMEs or code files) in this repository.");
    }

    // 3. Merge with local history
    const mergedHistory = [...localHistory];
    importedHistory.forEach(importedItem => {
      const idx = mergedHistory.findIndex(h => h.slug === importedItem.slug && h.approach === importedItem.approach);
      if (idx !== -1) {
        // Keep the newer one
        const localDate = new Date(mergedHistory[idx].savedAt || 0);
        const importedDate = new Date(importedItem.savedAt || 0);
        if (importedDate > localDate) {
          mergedHistory[idx] = { ...mergedHistory[idx], ...importedItem };
        }
      } else {
        mergedHistory.push(importedItem);
      }
    });

    await chrome.storage.local.set({ [STORAGE_KEYS.history]: mergedHistory });

    statusText.textContent = `⏳ Merging with Firestore cloud database...`;
    // Trigger standard Firestore sync
    await syncCloudData();

    statusText.textContent = `✅ Sync Complete! Imported/Synced ${importedHistory.length} items.`;
    statusText.style.color = "#22c55e";

    renderHistory();
    renderStats();
    renderCalendar();

  } catch (err) {
    statusText.textContent = `❌ Sync Failed: ${err.message}`;
    statusText.style.color = "#dc2626";
  } finally {
    btn.disabled = false;
  }
}

// Helper: Parse LeetSync Pro or LeetHub Markdown README to extract solve records
function parseReadmeMetadata(markdown, filePath, allFiles, githubInfo = {}) {
  const { owner, repo, branch = "main" } = githubInfo;

  // Title / Number (Flexible regex matching # 1. Two Sum, # [1] Two Sum, # Two Sum)
  const titleMatch = markdown.match(/^#\s+(?:\[?(\d+)\]?[-.\s]+)?(.*)$/m);
  if (!titleMatch) return null;

  const problemId = titleMatch[1] || "";
  const problemTitle = titleMatch[2].trim();

  // Difficulty (supporting both tables and standard LeetHub tags)
  let difficulty = "Medium";
  const diffTableMatch = markdown.match(/Difficulty-(Easy|Medium|Hard)/i);
  if (diffTableMatch) {
    difficulty = diffTableMatch[1];
  } else {
    const diffMatch = markdown.match(/Difficulty:\s*\*?([a-zA-Z]+)\*?/i) || markdown.match(/\*\*Difficulty\*\*:\s*([^\n\r]+)/i);
    if (diffMatch) difficulty = diffMatch[1].trim();
  }

  // URL / Link (supporting both LeetSync table links and LeetHub format links)
  let url = "";
  const urlTableMatch = markdown.match(/\[(?:LeetCode|CodeForces|GeeksforGeeks|Coding Platform|Link)\]\((https?:\/\/[^\)]+)\)/i);
  if (urlTableMatch) {
    url = urlTableMatch[1].trim();
  } else {
    const urlMatch = markdown.match(/\*\*LeetCode\*\*:\s*\[[^\]]+\]\(([^)]+)\)/i) || markdown.match(/leetcode\.com\/problems\/([a-zA-Z0-9-]+)/i);
    if (urlMatch) {
      url = urlMatch[0].startsWith("http") ? urlMatch[0] : `https://${urlMatch[0]}`;
    }
  }

  // Topic tags & main Pattern
  let topics = [];
  let mainPattern = "None";
  const tableRowMatch = markdown.match(/\|\s*\[[^\]]+\]\([^\)]+\)\s*\|\s*!\[[^\]]*\]\([^\)]+\)\s*\|\s*([^|]+)\|\s*([^|]+)\|/i);
  if (tableRowMatch) {
    const rawTopics = tableRowMatch[1].replace(/`/g, "").trim();
    topics = rawTopics ? rawTopics.split(",").map(t => t.trim()) : [];
    mainPattern = tableRowMatch[2].replace(/`/g, "").trim() || "None";
  } else {
    const topicMatch = markdown.match(/\*\*Topics\*\*:\s*([^\n\r]+)/i);
    topics = topicMatch ? topicMatch[1].split(",").map(t => t.trim()) : [];
    const patternMatchMain = markdown.match(/\*\*Pattern\*\*:\s*([^\n\r]+)/i);
    mainPattern = patternMatchMain ? patternMatchMain[1].trim() : "None";
  }

  // Default path slug
  const pathParts = filePath.split("/");
  const folderName = pathParts[pathParts.length - 2] || "";
  const slug = folderName.replace(/^\d+-/, "") || problemTitle.toLowerCase().replace(/\s+/g, "-");

  const solvesList = [];
  const APPROACHES_HEADER = "## Approaches";

  // If approaches block exists, parse normally
  if (markdown.includes(APPROACHES_HEADER)) {
    const splitIdx = markdown.indexOf(APPROACHES_HEADER);
    const approachesRaw = markdown.slice(splitIdx + APPROACHES_HEADER.length).trim();

    // Split on "### "
    const blocks = approachesRaw.split("### ").slice(1);

    blocks.forEach(block => {
      const lines = block.split("\n");
      const approachLabel = lines[0].trim().toLowerCase();
      if (!approachLabel || approachLabel.includes("notes") || approachLabel.includes("description") || approachLabel === "approaches") return;

      // Resolve time, space, timeSpent, topic, pattern, collection
      const timeMatch = block.match(/Time(?:\s*Complexity)?\s*\|\s*`([^`]+)`/i);
      const spaceMatch = block.match(/Space(?:\s*Complexity)?\s*\|\s*`([^`]+)`/i);
      const timeSpentMatch = block.match(/Time\s*Spent\s*\|\s*`([^`]+)`/i);
      const collectionMatch = block.match(/Collection\s*\|\s*`([^`]+)`/i);
      const topicMatchSingle = block.match(/Topic(?:\s*Tag)?\s*\|\s*`([^`]+)`/i);
      const patternMatch = block.match(/Pattern(?:\s*Used)?\s*\|\s*`([^`]+)`/i);

      // Notes
      let notes = "";
      const notesMatch = block.match(/####?\s*(?:📝\s*)?Notes/i);
      if (notesMatch) {
        const idx = notesMatch.index;
        const dividerText = notesMatch[0];
        notes = block.substring(idx + dividerText.length).trim();
        // Remove leading blockquote markers (> ) if present (due to the new beautiful format)
        notes = notes.replace(/^>\s*/gm, "");
        if (notes === "_No notes added._") notes = "";
      }

      // Find the corresponding code file in the same folder to get the exact solution URL
      let githubUrl = "";
      if (Array.isArray(allFiles) && owner && repo) {
        const parentParts = filePath.split("/");
        parentParts.pop(); // remove README.md
        const parentFolder = parentParts.join("/");

        const siblings = allFiles.filter(f => 
          f.type === "blob" && 
          f.path.startsWith(parentFolder + "/") && 
          f.path.toLowerCase() !== filePath.toLowerCase()
        );

        const normApproach = approachLabel.toLowerCase();
        let matchedSib = siblings.find(sib => {
          const fn = sib.path.split("/").pop().toLowerCase();
          if (normApproach.includes("optimal") || normApproach === "oa" || normApproach.includes("(oa)")) {
            return fn.includes("optimal") || fn.includes("-oa-") || fn.includes("solution") || fn.includes("sol");
          }
          if (normApproach.includes("better") || normApproach === "ba" || normApproach.includes("(ba)")) {
            return fn.includes("better") || fn.includes("-ba-");
          }
          if (normApproach.includes("brute") || normApproach === "bf" || normApproach.includes("(bf)")) {
            return fn.includes("brute") || fn.includes("-bf-") || fn.includes("force");
          }
          return fn.includes(normApproach);
        });

        if (!matchedSib && siblings.length > 0) {
          matchedSib = siblings[0];
        }

        if (matchedSib) {
          githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${matchedSib.path}`;
        }
      }

      if (!githubUrl && owner && repo) {
        githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
      }

      solvesList.push({
        id: problemId,
        title: problemTitle,
        slug: slug,
        difficulty: difficulty,
        url: url,
        savedAt: new Date().toISOString(), // Default import timestamp
        approach: (approachLabel.includes("(oa)") || approachLabel.includes("optimal")) ? "oa" :
                  (approachLabel.includes("(ba)") || approachLabel.includes("better")) ? "ba" :
                  (approachLabel.includes("(bf)") || approachLabel.includes("brute")) ? "bf" : approachLabel,
        notes: notes,
        timeSpent: timeSpentMatch ? timeSpentMatch[1].trim() : "",
        collection: collectionMatch ? collectionMatch[1].trim() : "",
        topic: topicMatchSingle ? topicMatchSingle[1].trim() : (topics[0] || "Other"),
        pattern: patternMatch ? patternMatch[1].trim() : mainPattern,
        githubUrl: githubUrl,
        isFavorite: false,
        revisionCount: 1,
        revisionCompleted: false,
        revisionCompletedAt: null
      });
    });
  }

  // Fallback: If no approaches parsed, scan sibling files in allFiles to reconstruct history
  if (solvesList.length === 0 && Array.isArray(allFiles)) {
    const parentParts = filePath.split("/");
    parentParts.pop(); // Remove "README.md"
    const parentFolder = parentParts.join("/");

    // Sibling files are blobs in the same directory (excluding README.md)
    const siblings = allFiles.filter(f => 
      f.type === "blob" && 
      f.path.startsWith(parentFolder + "/") && 
      f.path.toLowerCase() !== filePath.toLowerCase()
    );

    siblings.forEach(sib => {
      const filename = sib.path.split("/").pop();
      const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
      if (!extMatch) return; // skip folder/non-extension files

      const ext = extMatch[1].toLowerCase();
      // Only keep known code extensions to avoid syncing config/images/etc.
      const extToLang = {
        "py": "python", "py3": "python3", "cpp": "cpp", "cc": "cpp", "cxx": "cpp",
        "java": "java", "js": "javascript", "ts": "typescript", "go": "go", "rs": "rust"
      };
      if (!extToLang[ext]) return;

      // Extract approach from filename. If name matches patterns like 'two-sum-1-OPTIMAL-v1.py' or 'optimal.py'
      let approach = "oa"; // default fallback optimal
      if (filename.toLowerCase().includes("brute") || filename.toLowerCase().includes("bf")) {
        approach = "bf";
      } else if (filename.toLowerCase().includes("better") || filename.toLowerCase().includes("ba")) {
        approach = "ba";
      } else {
        // Try to match standard approach suffix
        const appMatch = filename.match(/-(OPTIMAL|BRUTE|BETTER|bf|ba|oa)-v\d+/i);
        if (appMatch) {
          const matchedApp = appMatch[1].toLowerCase();
          approach = matchedApp === "optimal" ? "oa" : (matchedApp === "better" ? "ba" : (matchedApp === "brute" ? "bf" : matchedApp));
        }
      }

      solvesList.push({
        id: problemId,
        title: problemTitle,
        slug: slug,
        difficulty: difficulty,
        url: url,
        savedAt: new Date().toISOString(),
        approach: approach,
        notes: "",
        timeSpent: "",
        collection: "",
        topic: topics[0] || "Other",
        pattern: "None",
        isFavorite: false,
        revisionCount: 1,
        revisionCompleted: false,
        revisionCompletedAt: null
      });
    });
  }

  return solvesList;
}

// ── DSA Sheets Logic ─────────────────────────────────────────────────────────
let currentSheetFilter = "all";

async function renderSheets() {
  const container = document.getElementById("sheetAccordionContainer");
  const progressText = document.getElementById("sheetProgressText");
  const progressBarFill = document.getElementById("sheetProgressBarFill");
  const sheetSelect = document.getElementById("sheetSelect");

  if (!container || !sheetSelect) return;

  const selectedSheetName = sheetSelect.value;
  if (!selectedSheetName) {
    container.innerHTML = `<div class="empty-state" style="padding: 20px; text-align: center; font-size: 12px; color: var(--clr-muted);">Please import a sheet in Settings first.</div>`;
    return;
  }

  const sheetData = await loadSheet(selectedSheetName);
  currentCrossSheetMap = await getCrossSheetMap();

  const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = storedHistory[STORAGE_KEYS.history] || [];

  const solvedMap = {};
  history.forEach(h => {
    const slug = h.slug;
    if (!solvedMap[slug]) {
      solvedMap[slug] = [];
    }
    solvedMap[slug].push(h);
  });

  let totalProblems = 0;
  let completedProblems = 0;

  container.innerHTML = "";

  const LEETCODE_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M16.102 17.93l-2.69 2.607c-.466.451-1.211.451-1.677 0l-8.62-8.351a1.147 1.147 0 0 1 0-1.622l2.69-2.608a1.18 1.18 0 0 1 1.677 0l8.621 8.352a1.148 1.148 0 0 1 0 1.622zm3.32-8.351L17.728 7.97a1.148 1.148 0 0 0-1.677 0l-2.69 2.607a1.18 1.18 0 0 0 0 1.622l1.701 1.648a1.148 1.148 0 0 0 1.677 0l2.69-2.607a1.18 1.18 0 0 0 0-1.622z" fill="#FFA116"/></svg>`;
  const GFG_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2F8D46" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;
  const GITHUB_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;

  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    const topicAccordion = document.createElement("div");
    topicAccordion.className = "sheet-topic-accordion";
    topicAccordion.style.marginBottom = "8px";

    let topicTotal = 0;
    let topicCompleted = 0;

    const subtopicContainer = document.createElement("div");
    subtopicContainer.className = "sheet-topic-content";
    subtopicContainer.style.display = "none";
    subtopicContainer.style.flexDirection = "column";
    subtopicContainer.style.gap = "8px";
    subtopicContainer.style.padding = "10px";
    subtopicContainer.style.backgroundColor = "var(--clr-surface)";
    subtopicContainer.style.border = "1px solid var(--clr-border)";
    subtopicContainer.style.borderTop = "0";

    const subkeys = Object.keys(subtopics);
    const isSingleGeneral = subkeys.length === 1 && 
      (subkeys[0].toLowerCase().includes("general") || 
       subkeys[0].toLowerCase().includes("imported list") || 
       cleanDisplayName(subkeys[0]).trim() === "");

    if (isSingleGeneral) {
      const problems = subtopics[subkeys[0]];
      const table = document.createElement("table");
      table.className = "sheet-problem-table";
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      
      table.innerHTML = `
        <thead>
          <tr style="border-bottom: 1.5px solid var(--clr-border); text-align: left; font-size: 11px; color: var(--clr-muted);">
            <th style="width: 40px; text-align: center; padding: 6px 2px; font-weight: 800;">Status</th>
            <th style="width: 40px; text-align: center; padding: 6px 2px; font-weight: 800;">Star</th>
            <th style="padding: 6px 2px; font-weight: 800;">Problem</th>
            <th style="width: 60px; text-align: center; padding: 6px 2px; font-weight: 800;">Practice</th>
            <th style="width: 60px; text-align: center; padding: 6px 2px; font-weight: 800;">Notes</th>
            <th style="width: 60px; text-align: center; padding: 6px 2px; font-weight: 800;">GitHub</th>
            <th style="width: 80px; text-align: right; padding: 6px 2px; font-weight: 800;">Difficulty</th>
          </tr>
        </thead>
      `;
      
      const tbody = document.createElement("tbody");
      problems.forEach(problem => {
        const slug = problem.slug;
        const solves = solvedMap[slug] || [];
        const isCompleted = solves.length > 0;
        const hasNotes = solves.some(s => s.notes && s.notes.trim() !== "");
        const isBookmarked = solves.some(s => s.isFavorite);
        const githubUrl = solves.find(s => s.githubUrl)?.githubUrl || "";

        totalProblems++;
        topicTotal++;

        if (isCompleted) {
          completedProblems++;
          topicCompleted++;
        }

        let isVisible = true;
        const diffLower = (problem.difficulty || "medium").toLowerCase();
        if (currentSheetFilter === "completed" && !isCompleted) isVisible = false;
        else if (currentSheetFilter === "pending" && isCompleted) isVisible = false;
        else if (currentSheetFilter === "easy" && diffLower !== "easy") isVisible = false;
        else if (currentSheetFilter === "medium" && diffLower !== "medium") isVisible = false;
        else if (currentSheetFilter === "hard" && diffLower !== "hard") isVisible = false;
        else if (currentSheetFilter === "bookmarked" && !isBookmarked) isVisible = false;

        const tr = document.createElement("tr");
        tr.className = "sheet-problem-row" + (isCompleted ? " completed" : "") + (isVisible ? "" : " hidden");
        tr.style.borderBottom = "1px solid rgba(255, 255, 255, 0.02)";

        const tdCheck = document.createElement("td");
        tdCheck.style.width = "40px";
        tdCheck.style.textAlign = "center";
        tdCheck.style.padding = "6px 2px";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = isCompleted;
        checkbox.style.cursor = "pointer";
        checkbox.addEventListener("change", async (e) => {
          e.stopPropagation();
          await toggleProblemCompletion(problem, checkbox.checked);
          renderSheets();
        });
        tdCheck.appendChild(checkbox);
        tr.appendChild(tdCheck);

        const tdRevision = document.createElement("td");
        tdRevision.style.width = "40px";
        tdRevision.style.textAlign = "center";
        tdRevision.style.padding = "6px 2px";
        const starBtn = document.createElement("button");
        starBtn.type = "button";
        starBtn.className = "sheet-star-btn" + (isBookmarked ? " active" : "");
        starBtn.title = isBookmarked ? "Unstar Problem" : "Star for Revision";
        starBtn.textContent = isBookmarked ? "⭐" : "☆";
        starBtn.style.cursor = "pointer";
        starBtn.style.background = "none";
        starBtn.style.border = "none";
        starBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await toggleProblemBookmark(problem, !isBookmarked);
          renderSheets();
        });
        tdRevision.appendChild(starBtn);
        tr.appendChild(tdRevision);

        const tdTitle = document.createElement("td");
        tdTitle.style.padding = "6px 2px";
        const link = document.createElement("a");
        link.href = problem.leetcodeUrl || "#";
        link.target = "_blank";
        link.className = "sheet-problem-link";
        link.style = "color:var(--clr-text); font-weight:700; text-decoration:none; font-size:12px;";
        if (isCompleted) {
          link.style.textDecoration = "line-through";
          link.style.color = "var(--clr-muted)";
        }
        link.textContent = problem.title;
        const extIcon = document.createElement("span");
        extIcon.style = "font-size: 10px; margin-left: 4px; opacity: 0.4;";
        extIcon.textContent = "↗";
        link.appendChild(extIcon);
        link.addEventListener("mouseover", () => link.style.textDecoration = "underline");
        link.addEventListener("mouseout", () => {
          link.style.textDecoration = isCompleted ? "line-through" : "none";
        });
        tdTitle.appendChild(link);

        if (currentCrossSheetMap && slug && currentCrossSheetMap[slug]) {
          const listNames = currentCrossSheetMap[slug];
          if (listNames.length > 1) {
            const badge = document.createElement("span");
            badge.className = "cross-sheet-badge";
            badge.textContent = `${listNames.length} Sheets`;
            badge.title = `Appears in:\n${listNames.map(name => `• ${name}`).join("\n")}`;
            tdTitle.appendChild(badge);
          }
        }

        tr.appendChild(tdTitle);

        const tdPractice = document.createElement("td");
        tdPractice.style.width = "60px";
        tdPractice.style.textAlign = "center";
        tdPractice.style.padding = "6px 2px";
        const platLink = document.createElement("a");
        platLink.href = problem.leetcodeUrl || "#";
        platLink.target = "_blank";
        platLink.style = "display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease;";
        platLink.addEventListener("mouseover", () => platLink.style.transform = "scale(1.15)");
        platLink.addEventListener("mouseout", () => platLink.style.transform = "scale(1)");
        const isGFG = (problem.leetcodeUrl || "").includes("geeksforgeeks.org");
        platLink.innerHTML = isGFG ? GFG_SVG : LEETCODE_SVG;
        tdPractice.appendChild(platLink);
        tr.appendChild(tdPractice);

        const tdNotes = document.createElement("td");
        tdNotes.style.width = "60px";
        tdNotes.style.textAlign = "center";
        tdNotes.style.padding = "6px 2px";
        const noteBtn = document.createElement("button");
        noteBtn.type = "button";
        noteBtn.className = "sheet-note-btn" + (hasNotes ? " active" : "");
        noteBtn.title = hasNotes ? "Edit Notes" : "Add Notes";
        noteBtn.textContent = "📝";
        noteBtn.style.cursor = "pointer";
        noteBtn.style.background = "none";
        noteBtn.style.border = "none";
        noteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const representativeEntry = solves.find(s => s.slug === slug) || {
            slug: slug,
            title: problem.title,
            id: selectedSheetName === "striver" ? "" : "0",
            approach: "oa",
            language: "python",
            notes: "",
            readmePath: ""
          };
          openNotesModal(representativeEntry, "Optimal");
        });
        tdNotes.appendChild(noteBtn);
        tr.appendChild(tdNotes);

        const tdGitHub = document.createElement("td");
        tdGitHub.style.width = "60px";
        tdGitHub.style.textAlign = "center";
        tdGitHub.style.padding = "6px 2px";
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

        const tdDiff = document.createElement("td");
        tdDiff.className = "sheet-col-diff";
        tdDiff.style.width = "80px";
        tdDiff.style.textAlign = "right";
        tdDiff.style.padding = "6px 2px";
        const diffSpan = document.createElement("span");
        diffSpan.className = `sheet-diff-tag ${diffLower}`;
        diffSpan.textContent = problem.difficulty || "Medium";
        tdDiff.appendChild(diffSpan);
        tr.appendChild(tdDiff);

        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      subtopicContainer.appendChild(table);
    } else {
      for (const [subtopicName, problems] of Object.entries(subtopics)) {
        const subtopicSection = document.createElement("div");
        subtopicSection.className = "sheet-subtopic-section";
        subtopicSection.style.borderLeft = "3px solid var(--clr-primary)";
        subtopicSection.style.paddingLeft = "10px";
        subtopicSection.style.marginTop = "6px";
        subtopicSection.style.marginBottom = "6px";

        const subtopicHeader = document.createElement("div");
        subtopicHeader.className = "sheet-subtopic-header";
        subtopicHeader.style.display = "flex";
        subtopicHeader.style.justifyContent = "space-between";
        subtopicHeader.style.alignItems = "center";
        subtopicHeader.style.padding = "6px 10px";
        subtopicHeader.style.backgroundColor = "rgba(255, 255, 255, 0.01)";
        subtopicHeader.style.border = "1px solid var(--clr-border)";
        subtopicHeader.style.borderRadius = "6px";
        subtopicHeader.style.cursor = "pointer";
        subtopicHeader.style.userSelect = "none";
        subtopicHeader.style.transition = "var(--transition)";
        
        const subtopicContent = document.createElement("div");
        subtopicContent.className = "sheet-subtopic-content";
        subtopicContent.style.display = "none";
        subtopicContent.style.flexDirection = "column";
        subtopicContent.style.width = "100%";
        subtopicContent.style.marginTop = "6px";
        subtopicContent.style.padding = "0 4px";

        subtopicHeader.addEventListener("mouseover", () => {
          subtopicHeader.style.borderColor = "var(--clr-primary)";
          subtopicHeader.style.backgroundColor = "rgba(56, 189, 248, 0.02)";
        });
        subtopicHeader.addEventListener("mouseout", () => {
          const isExp = subtopicContent.style.display === "flex";
          subtopicHeader.style.borderColor = isExp ? "var(--clr-primary)" : "var(--clr-border)";
          subtopicHeader.style.backgroundColor = isExp ? "rgba(56, 189, 248, 0.02)" : "rgba(255, 255, 255, 0.01)";
        });
        
        let subtopicTotal = 0;
        let subtopicCompleted = 0;

        const table = document.createElement("table");
        table.className = "sheet-problem-table";
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";
        
        table.innerHTML = `
          <thead>
            <tr style="border-bottom: 1.5px solid var(--clr-border); text-align: left; font-size: 11px; color: var(--clr-muted);">
              <th style="width: 40px; text-align: center; padding: 6px 2px; font-weight: 800;">Status</th>
              <th style="width: 40px; text-align: center; padding: 6px 2px; font-weight: 800;">Star</th>
              <th style="padding: 6px 2px; font-weight: 800;">Problem</th>
              <th style="width: 60px; text-align: center; padding: 6px 2px; font-weight: 800;">Practice</th>
              <th style="width: 60px; text-align: center; padding: 6px 2px; font-weight: 800;">Notes</th>
              <th style="width: 60px; text-align: center; padding: 6px 2px; font-weight: 800;">GitHub</th>
              <th style="width: 80px; text-align: right; padding: 6px 2px; font-weight: 800;">Difficulty</th>
            </tr>
          </thead>
        `;
        
        const tbody = document.createElement("tbody");

        problems.forEach(problem => {
          const slug = problem.slug;
          const solves = solvedMap[slug] || [];
          const isCompleted = solves.length > 0;
          const hasNotes = solves.some(s => s.notes && s.notes.trim() !== "");
          const isBookmarked = solves.some(s => s.isFavorite);
          const githubUrl = solves.find(s => s.githubUrl)?.githubUrl || "";

          totalProblems++;
          topicTotal++;
          subtopicTotal++;

          if (isCompleted) {
            completedProblems++;
            topicCompleted++;
            subtopicCompleted++;
          }

          let isVisible = true;
          const diffLower = (problem.difficulty || "medium").toLowerCase();
          if (currentSheetFilter === "completed" && !isCompleted) isVisible = false;
          else if (currentSheetFilter === "pending" && isCompleted) isVisible = false;
          else if (currentSheetFilter === "easy" && diffLower !== "easy") isVisible = false;
          else if (currentSheetFilter === "medium" && diffLower !== "medium") isVisible = false;
          else if (currentSheetFilter === "hard" && diffLower !== "hard") isVisible = false;
          else if (currentSheetFilter === "bookmarked" && !isBookmarked) isVisible = false;

          const tr = document.createElement("tr");
          tr.className = "sheet-problem-row" + (isCompleted ? " completed" : "") + (isVisible ? "" : " hidden");
          tr.style.borderBottom = "1px solid rgba(255, 255, 255, 0.02)";

          const tdCheck = document.createElement("td");
          tdCheck.style.width = "40px";
          tdCheck.style.textAlign = "center";
          tdCheck.style.padding = "6px 2px";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = isCompleted;
          checkbox.style.cursor = "pointer";
          checkbox.addEventListener("change", async (e) => {
            e.stopPropagation();
            await toggleProblemCompletion(problem, checkbox.checked);
            renderSheets();
          });
          tdCheck.appendChild(checkbox);
          tr.appendChild(tdCheck);

          const tdRevision = document.createElement("td");
          tdRevision.style.width = "40px";
          tdRevision.style.textAlign = "center";
          tdRevision.style.padding = "6px 2px";
          const starBtn = document.createElement("button");
          starBtn.type = "button";
          starBtn.className = "sheet-star-btn" + (isBookmarked ? " active" : "");
          starBtn.title = isBookmarked ? "Unstar Problem" : "Star for Revision";
          starBtn.textContent = isBookmarked ? "⭐" : "☆";
          starBtn.style.cursor = "pointer";
          starBtn.style.background = "none";
          starBtn.style.border = "none";
          starBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await toggleProblemBookmark(problem, !isBookmarked);
            renderSheets();
          });
          tdRevision.appendChild(starBtn);
          tr.appendChild(tdRevision);

          const tdTitle = document.createElement("td");
          tdTitle.style.padding = "6px 2px";
          const link = document.createElement("a");
          link.href = problem.leetcodeUrl || "#";
          link.target = "_blank";
          link.className = "sheet-problem-link";
          link.style = "color:var(--clr-text); font-weight:700; text-decoration:none; font-size:12px;";
          if (isCompleted) {
            link.style.textDecoration = "line-through";
            link.style.color = "var(--clr-muted)";
          }
          link.textContent = problem.title;
          const extIcon = document.createElement("span");
          extIcon.style = "font-size: 10px; margin-left: 4px; opacity: 0.4;";
          extIcon.textContent = "↗";
          link.appendChild(extIcon);
          link.addEventListener("mouseover", () => link.style.textDecoration = "underline");
          link.addEventListener("mouseout", () => {
            link.style.textDecoration = isCompleted ? "line-through" : "none";
          });
          tdTitle.appendChild(link);

          if (currentCrossSheetMap && slug && currentCrossSheetMap[slug]) {
            const listNames = currentCrossSheetMap[slug];
            if (listNames.length > 1) {
              const badge = document.createElement("span");
              badge.className = "cross-sheet-badge";
              badge.textContent = `${listNames.length} Sheets`;
              badge.title = `Appears in:\n${listNames.map(name => `• ${name}`).join("\n")}`;
              tdTitle.appendChild(badge);
            }
          }

          tr.appendChild(tdTitle);

          const tdPractice = document.createElement("td");
          tdPractice.style.width = "60px";
          tdPractice.style.textAlign = "center";
          tdPractice.style.padding = "6px 2px";
          const platLink = document.createElement("a");
          platLink.href = problem.leetcodeUrl || "#";
          platLink.target = "_blank";
          platLink.style = "display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s ease;";
          platLink.addEventListener("mouseover", () => platLink.style.transform = "scale(1.15)");
          platLink.addEventListener("mouseout", () => platLink.style.transform = "scale(1)");
          const isGFG = (problem.leetcodeUrl || "").includes("geeksforgeeks.org");
          platLink.innerHTML = isGFG ? GFG_SVG : LEETCODE_SVG;
          tdPractice.appendChild(platLink);
          tr.appendChild(tdPractice);

          const tdNotes = document.createElement("td");
          tdNotes.style.width = "60px";
          tdNotes.style.textAlign = "center";
          tdNotes.style.padding = "6px 2px";
          const noteBtn = document.createElement("button");
          noteBtn.type = "button";
          noteBtn.className = "sheet-note-btn" + (hasNotes ? " active" : "");
          noteBtn.title = hasNotes ? "Edit Notes" : "Add Notes";
          noteBtn.textContent = "📝";
          noteBtn.style.cursor = "pointer";
          noteBtn.style.background = "none";
          noteBtn.style.border = "none";
          noteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const representativeEntry = solves.find(s => s.slug === slug) || {
              slug: slug,
              title: problem.title,
              id: selectedSheetName === "striver" ? "" : "0",
              approach: "oa",
              language: "python",
              notes: "",
              readmePath: ""
            };
            openNotesModal(representativeEntry, "Optimal");
          });
          tdNotes.appendChild(noteBtn);
          tr.appendChild(tdNotes);

          const tdGitHub = document.createElement("td");
          tdGitHub.style.width = "60px";
          tdGitHub.style.textAlign = "center";
          tdGitHub.style.padding = "6px 2px";
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

          const tdDiff = document.createElement("td");
          tdDiff.className = "sheet-col-diff";
          tdDiff.style.width = "80px";
          tdDiff.style.textAlign = "right";
          tdDiff.style.padding = "6px 2px";
          const diffSpan = document.createElement("span");
          diffSpan.className = `sheet-diff-tag ${diffLower}`;
          diffSpan.textContent = problem.difficulty || "Medium";
          tdDiff.appendChild(diffSpan);
          tr.appendChild(tdDiff);

          tbody.appendChild(tr);
        });

        table.appendChild(tbody);

        subtopicHeader.innerHTML = `
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="sheet-subtopic-arrow" style="font-size:8px; transition:transform 0.2s ease; color:var(--clr-muted); margin-right:4px;">▶</span>
            <span style="font-weight:700;">📂 ${cleanDisplayName(subtopicName)}</span>
          </div>
          <span class="sheet-subtopic-progress">${subtopicCompleted}/${subtopicTotal}</span>
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

    // Render Topic Accordion Header
    const header = document.createElement("div");
    header.className = "sheet-topic-header";
    header.innerHTML = `
      <div class="sheet-topic-header-left">
        <span class="sheet-topic-arrow">▶</span>
        <span>${cleanDisplayName(topicName)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="sheet-topic-progress-badge" style="font-size:11px; font-weight:700; color:var(--clr-primary);">${topicCompleted}/${topicTotal}</span>
        <div style="width:60px; height:5px; background:rgba(255,255,255,0.08); border-radius:5px; overflow:hidden; position:relative;">
          <div style="width:${topicTotal > 0 ? (topicCompleted/topicTotal)*100 : 0}%; height:100%; background:var(--clr-primary); border-radius:5px; transition:width 0.3s ease;"></div>
        </div>
      </div>
    `;

    header.addEventListener("click", () => {
      topicAccordion.classList.toggle("open");
    });

    topicAccordion.appendChild(header);
    topicAccordion.appendChild(subtopicContainer);
    container.appendChild(topicAccordion);
  }

  const pct = totalProblems > 0 ? Math.round((completedProblems / totalProblems) * 100) : 0;
  progressText.textContent = `${pct}% (${completedProblems}/${totalProblems})`;
  progressBarFill.style.width = `${pct}%`;
}// Setup event listeners for Sheets Selector and Filters
async function setupSheetsListeners() {
  const sheetSelect = document.getElementById("sheetSelect");
  const filterBtns = document.querySelectorAll(".sheet-filter-btn");

  // Load custom sheets options
  await populateSheetDropdownPopup();

  if (sheetSelect) {
    sheetSelect.addEventListener("change", () => {
      renderSheets();
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSheetFilter = btn.dataset.filter;
      renderSheets();
    });
  });
}

async function populateSheetDropdownPopup() {
  const select = document.getElementById("sheetSelect");
  if (!select) return;

  await populateSheetDropdownHelper(select, true);

  renderSheets();
}


function cleanDisplayName(name) {
  if (!name) return "";
  // First strip Step/Lec indexing prefix
  let clean = name.replace(/^(Step|Lec)\s*\d+\s*:\s*/i, "");
  // Then strip numbering prefix like "1. ", "2. ", "10) " but NOT "2D Arrays"
  return clean.replace(/^[0-9]+\s*[.)-]?\s+/, "");
}

// Toggle problem completion manually
async function toggleProblemCompletion(problem, completed) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = stored[STORAGE_KEYS.history] || [];

  if (completed) {
    // Check if it already exists in history
    const exists = history.some(h => h.slug === problem.slug);
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
    // Remove all saves of this problem from history
    history = history.filter(h => h.slug !== problem.slug);
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
    // Trigger Firestore sync
    await syncCloudData();
    
    // Also delete from Firestore cloud
    try {
      const authData = await chrome.storage.local.get("auth_user");
      const authUser = authData.auth_user;
      if (authUser && authUser.uid && authUser.idToken) {
        const baseUrl = getFirestoreApiUrl();
        const docId = `${problem.slug}-oa`.replace(/[^a-zA-Z0-9_-]/g, "");
        await fetch(`${baseUrl}/users/${authUser.uid}/history/${docId}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${authUser.idToken}`
          }
        });
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

