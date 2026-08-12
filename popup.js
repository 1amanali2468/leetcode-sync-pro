// popup.js – Main popup controller
import { FIREBASE_CONFIG, getFirestoreApiUrl } from "./firebase-config.js";
import { loadSheet, populateSheetDropdown as populateSheetDropdownHelper, getCrossSheetMap, clearSheetCache } from "./sheet-loader.js";
import { renderStats, exportCSV } from "./popup_stats.js";
import { renderHistory } from "./popup_history.js";
import { renderCalendar, calendarState } from "./popup_calendar.js";
import { renderSheets, setupSheetsListeners, renderCollectionOptions } from "./popup_sheets.js";
import { syncCloudData, createNewRepository, disconnectGitHub, persistSettings, loadGitHubRepositories, fetchGitHubRepoSolves } from "./popup_sync.js";

export const STORAGE_KEYS = {
  settings: "githubSettings",
  history: "leetsyncHistory",
};

export const filterState = {
  difficulties: [],
  topics: [],
  topicMode: "",
  patterns: [],
  patternMode: "",
  collections: [],
  collectionMode: ""
};
import { TOPIC_NAMES as POPUP_TOPIC_NAMES, TOPIC_PATTERNS as POPUP_TOPIC_PATTERNS } from "./shared_constants.js";

// ── DOM References ────────────────────────────────────────────────────────────
export const el = {
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
  const storedData = await chrome.storage.local.get([STORAGE_KEYS.history, STORAGE_KEYS.settings, "auth_user"]);
  const authUser = storedData.auth_user;
  const authScreen = document.getElementById("authScreen");
  const shell = document.querySelector(".shell");

  if (!authScreen) return; // We are not in the popup UI

  if (!authUser) {
    authScreen.classList.remove("hidden");
    if (shell) shell.classList.add("hidden");
    document.getElementById("btnLaunchAuth").addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("login.html") });
    });
    return;
  }

  authScreen.classList.add("hidden");
  if (shell) shell.classList.remove("hidden");

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
      await chrome.storage.local.remove(["auth_user", "githubSettings", "github_token", "github_profile"]);
      window.location.reload();
    });
  }

  const syncBtn = document.getElementById("btnManualSync");
  if (syncBtn) {
    syncBtn.addEventListener("click", syncCloudData);
  }

  if (el.btnResetLocal) {
    el.btnResetLocal.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to wipe all offline solved history from this browser cache?\n\nThis will NOT delete your cloud database on Firestore.")) return;
      await chrome.storage.local.set({ [STORAGE_KEYS.history]: [] });
      renderHistory();
      renderStats();
      renderCalendar();
      el.resultText.textContent = "Offline solved history wiped successfully.";
      el.resultText.className = "result success";
    });
  }

  setTimeout(syncCloudData, 100);

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

  document.addEventListener("click", () => {
    closeAllDropdowns();
  });

  const renderDifficultyOptions = () => {
    if (!difficultyOptionsDiv) return;
    difficultyOptionsDiv.innerHTML = "";
    
    const allOpt = document.createElement("div");
    const isAllSelected = filterState.difficulties.length === 0;
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

    ["Easy", "Medium", "Hard"].forEach(diff => {
      const isSelected = filterState.difficulties.includes(diff);
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
        filterState.difficulties = [];
      } else {
        const idx = filterState.difficulties.indexOf(val);
        if (idx === -1) {
          filterState.difficulties.push(val);
        } else {
          filterState.difficulties.splice(idx, 1);
        }
      }

      if (difficultyText) {
        if (filterState.difficulties.length === 0) {
          difficultyText.textContent = "All Diff";
        } else {
          difficultyText.textContent = filterState.difficulties.join(", ");
        }
      }

      renderDifficultyOptions();
      renderHistory();
    });
  }

  const renderTopicOptions = () => {
    if (!topicOptionsDiv) return;
    topicOptionsDiv.innerHTML = "";
    
    const allOpt = document.createElement("div");
    const isAllSelected = filterState.topicMode === "" && filterState.topics.length === 0;
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

    POPUP_TOPIC_NAMES.forEach(topic => {
      const isSelected = filterState.topicMode === "" && filterState.topics.includes(topic);
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

    const isOtherSelected = filterState.topicMode === "__other__";
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
        filterState.topics = [];
        filterState.topicMode = "";
      } else if (val === "__other__") {
        filterState.topics = [];
        filterState.topicMode = "__other__";
      } else {
        filterState.topicMode = "";
        const idx = filterState.topics.indexOf(val);
        if (idx === -1) {
          filterState.topics.push(val);
        } else {
          filterState.topics.splice(idx, 1);
        }
      }

      if (topicText) {
        if (filterState.topicMode === "__other__") {
          topicText.textContent = "✏️ Other...";
        } else if (filterState.topics.length === 0) {
          topicText.textContent = "All Topics";
        } else {
          const joined = filterState.topics.join(", ");
          topicText.textContent = joined.length > 15 ? `${filterState.topics.length} Selected` : joined;
        }
      }

      if (filterState.topicMode === "__other__") {
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
      filterState.topics = [];
      filterState.topicMode = "";
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

    if (filterState.topicMode === "__other__" && topicCustomInput) {
      const selectedTopic = topicCustomInput.value.trim().toLowerCase();
      const pats = POPUP_TOPIC_PATTERNS[selectedTopic] || [];
      pats.forEach(p => mergedPatterns.add(p));
    } else if (filterState.topics.length > 0) {
      filterState.topics.forEach(topic => {
        const norm = topic.toLowerCase().trim();
        const pats = POPUP_TOPIC_PATTERNS[norm] || [];
        pats.forEach(p => mergedPatterns.add(p));
      });
    } else {
      Object.keys(POPUP_TOPIC_PATTERNS).forEach(topicKey => {
        const pats = POPUP_TOPIC_PATTERNS[topicKey] || [];
        pats.forEach(p => mergedPatterns.add(p));
      });
    }

    const patterns = Array.from(mergedPatterns).sort((a, b) => a.localeCompare(b));

    filterState.patterns = filterState.patterns.filter(pat => patterns.includes(pat));

    patternOptionsDiv.innerHTML = "";
    
    const allOpt = document.createElement("div");
    const isAllSelected = filterState.patternMode === "" && filterState.patterns.length === 0;
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

    patterns.forEach(pat => {
      const isSelected = filterState.patternMode === "" && filterState.patterns.includes(pat);
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

    const isOtherSelected = filterState.patternMode === "__other__";
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
        filterState.patterns = [];
        filterState.patternMode = "";
      } else if (val === "__other__") {
        filterState.patterns = [];
        filterState.patternMode = "__other__";
      } else {
        filterState.patternMode = "";
        const idx = filterState.patterns.indexOf(val);
        if (idx === -1) {
          filterState.patterns.push(val);
        } else {
          filterState.patterns.splice(idx, 1);
        }
      }

      if (patternText) {
        if (filterState.patternMode === "__other__") {
          patternText.textContent = "✏️ Other...";
        } else if (filterState.patterns.length === 0) {
          patternText.textContent = "All Patterns";
        } else {
          const joined = filterState.patterns.join(", ");
          patternText.textContent = joined.length > 15 ? `${filterState.patterns.length} Selected` : joined;
        }
      }

      if (filterState.patternMode === "__other__") {
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
      filterState.patterns = [];
      filterState.patternMode = "";
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

  const collectionContainer = el.historyFilterCollection;
  const collectionTrigger = document.getElementById("historyFilterCollectionTrigger");
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
        filterState.collections = [];
        filterState.collectionMode = "";
      } else if (val === "__other__") {
        filterState.collections = [];
        filterState.collectionMode = "__other__";
      } else {
        filterState.collectionMode = "";
        const idx = filterState.collections.indexOf(val);
        if (idx === -1) {
          filterState.collections.push(val);
        } else {
          filterState.collections.splice(idx, 1);
        }
      }

      if (collectionText) {
        if (filterState.collectionMode === "__other__") {
          collectionText.textContent = "✏️ Other...";
        } else if (filterState.collections.length === 0) {
          collectionText.textContent = "All Collections";
        } else {
          const joined = filterState.collections.join(", ");
          collectionText.textContent = joined.length > 15 ? `${filterState.collections.length} Selected` : joined;
        }
      }

      if (filterState.collectionMode === "__other__") {
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
      filterState.collections = [];
      filterState.collectionMode = "";
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
      calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() - 1);
      renderCalendar();
    });
  }

  if (el.calendarNextMonthBtn) {
    el.calendarNextMonthBtn.addEventListener("click", () => {
      calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() + 1);
      renderCalendar();
    });
  }

  setupSheetsListeners();
}

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.githubSettings || changes.deviceFlowState) {
    chrome.storage.local.get(STORAGE_KEYS.settings, (res) => {
      applySettings(res[STORAGE_KEYS.settings] || {});
    });
  }
  if (changes.customSheets || changes.customSheetsRegistry) {
    clearSheetCache();
    await populateSheetDropdownPopup();
    renderSheets();
  }
});

[el.owner, el.repo, el.branch, el.basePath].forEach(
  (input) => input && input.addEventListener("input", persistSettings)
);
if (el.streakReminderEnabled) {
  el.streakReminderEnabled.addEventListener("change", persistSettings);
}
if (el.disconnectButton) {
  el.disconnectButton.addEventListener("click", disconnectGitHub);
}

export function applySettings(settings) {
  if (el.streakReminderEnabled) {
    el.streakReminderEnabled.checked = settings.hasOwnProperty("streakReminderEnabled") ? settings.streakReminderEnabled : true;
  }
  if (el.owner) el.owner.value    = settings.owner    || "";
  if (el.repo) el.repo.value     = settings.repo     || "";
  if (el.branch) el.branch.value   = settings.branch   || "main";
  if (el.basePath) el.basePath.value = settings.basePath || "";
  
  updateConnectionUI(settings);
  if (settings.token && el.repoSelect) {
    loadGitHubRepositories(settings.token, settings.repo);
  } else if (!settings.token) {
    if (el.repoSelectContainer) el.repoSelectContainer.classList.add("hidden");
    if (el.repo) el.repo.classList.remove("hidden");
    if (el.toggleNewRepoBtn) el.toggleNewRepoBtn.classList.add("hidden");
  }
}

export function updateConnectionUI(settings) {
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

// ── Custom Solve Form Implementation ─────────────────────────────────────────
function initCustomSolveForm() {
  const form = document.getElementById("customSolveForm");
  if (!form) return;

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

  function populatePatterns(topicVal) {
    patternSelect.innerHTML = "";
    const norm = (topicVal || "").toLowerCase().trim();
    const patterns = POPUP_TOPIC_PATTERNS[norm] || [];
    
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

  form.onsubmit = async (e) => {
    e.preventDefault();
    statusText.textContent = "⏳ Saving & syncing...";
    statusText.className = "result";
    statusText.style.color = "var(--clr-primary)";

    const title = document.getElementById("customTitle").value.trim();
    const difficulty = document.getElementById("customDifficulty").value;
    
    const checkedApproach = [...approachRadios].find(r => r.checked);
    const approachType = checkedApproach ? checkedApproach.value : "oa";
    const customApproachName = approachNameInput.value.trim();
    
    let topic = topicSelect.value;
    if (topic === "__other__") {
      topic = topicInput.value.trim();
    }
    let pattern = patternSelect.value;
    if (pattern === "__other__") {
      pattern = patternInput.value.trim();
    }

    let timeComplexity = timeSelect.value;
    if (timeComplexity === "custom") {
      timeComplexity = timeNameInput.value.trim();
    }
    let spaceComplexity = spaceSelect.value;
    if (spaceComplexity === "custom") {
      spaceComplexity = spaceNameInput.value.trim();
    }

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
        if (response && response.queued) {
          statusText.textContent = "⚠️ Saved locally! GitHub upload queued.";
          statusText.style.color = "#fbbf24";
        } else {
          statusText.textContent = "✅ Saved & Synced Successfully!";
          statusText.style.color = "#22c55e";
        }
        form.reset();
        
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
        
        const optimalRadio = [...approachRadios].find(r => r.value === "oa");
        if (optimalRadio) optimalRadio.checked = true;

        renderHistory();
        renderStats();
      }
    });
  };
}
