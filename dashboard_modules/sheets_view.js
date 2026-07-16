// dashboard_modules/sheets_view.js - DSA Sheets View, Topics, and Accordion Controller
import { el, STORAGE_KEYS, state, FIXED_TOPICS, DASHBOARD_TOPIC_PATTERNS } from "./state.js";
import { getFirestoreApiUrl } from "../firebase-config.js";
import { cleanDisplayName, normalizeProblemSlug, classifyDifficulty, escapeHtml, sortProblems, renderTableHead } from "./ui_helpers.js";
import { openNotesModal } from "./notes_modal.js";
import { openStarPopover, renderMyListsSidebar, renderFlatListProblems, updateProgressWidget } from "./smart_lists.js";
import { syncCloudData, exportActiveSheetToExcel } from "./settings.js";
import { loadSheet, getCrossSheetMap } from "../sheet-loader.js";

let onSheetsChangeCallback = null;

export function registerSheetsChangeCallback(cb) {
  onSheetsChangeCallback = cb;
}

export function setupSheetTabListeners() {
  el.sheetSelect.addEventListener("change", () => {
    state.activeTopicName = null;
    state.selectedTopicPill = "all";
    renderSheets();
  });

  if (el.sheetSearchInput) {
    el.sheetSearchInput.addEventListener("input", (e) => {
      state.sheetSearchQuery = e.target.value.toLowerCase().trim();
      renderSheets();
    });
  }

  if (el.filterMatchMode) {
    el.filterMatchMode.addEventListener("change", (e) => {
      state.activeFilters.matchMode = e.target.value;
      updateFilterBadgeAndRender();
    });
  }

  const filterTypes = ["difficulty", "status", "topic", "pattern", "collection", "list"];

  filterTypes.forEach(type => {
    const trigger = document.getElementById(`filterTrigger${type.charAt(0).toUpperCase() + type.slice(1)}`);
    const optionsDiv = document.getElementById(`filterOptions${type.charAt(0).toUpperCase() + type.slice(1)}`);
    
    if (trigger && optionsDiv) {
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
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

  filterTypes.forEach(type => {
    const optionsDiv = document.getElementById(`filterOptions${type.charAt(0).toUpperCase() + type.slice(1)}`);
    const opSelect = document.getElementById(`filterOp${type.charAt(0).toUpperCase() + type.slice(1)}`);
    const clearBtn = document.querySelector(`.filter-clear-row[data-clear="${type}"]`);

    if (optionsDiv) {
      optionsDiv.addEventListener("change", (e) => {
        if (e.target.type === "checkbox") {
          const checkedCheckboxes = Array.from(optionsDiv.querySelectorAll('input[type="checkbox"]:checked'));
          const checkedVals = checkedCheckboxes.map(cb => cb.value);
          
          state.activeFilters[type].vals = checkedVals;
          if (opSelect) state.activeFilters[type].op = opSelect.value;
          
          updateTriggerLabel(type);
          updateFilterBadgeAndRender();
        }
      });
    }

    if (opSelect) {
      opSelect.addEventListener("change", () => {
        state.activeFilters[type].op = opSelect.value;
        if (state.activeFilters[type].vals && state.activeFilters[type].vals.length > 0) {
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

  function updateTriggerLabel(type) {
    const trigger = document.getElementById(`filterTrigger${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (!trigger) return;
    const labelEl = trigger.querySelector(".trigger-label");
    if (!labelEl) return;
    
    const checkedCount = state.activeFilters[type].vals ? state.activeFilters[type].vals.length : 0;
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

  function clearFilterDropdownSelection(type) {
    state.activeFilters[type].vals = [];
    const optionsDiv = document.getElementById(`filterOptions${type.charAt(0).toUpperCase() + type.slice(1)}`);
    if (optionsDiv) {
      optionsDiv.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    }
    updateTriggerLabel(type);
    updateFilterBadgeAndRender();
  }

  if (el.btnResetAllFilters) {
    el.btnResetAllFilters.addEventListener("click", () => {
      filterTypes.forEach(type => {
        clearFilterDropdownSelection(type);
      });
    });
  }

  if (el.btnSheetFilterDropdown) {
    el.btnSheetFilterDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
      if (el.sheetFilterDropdownPanel) {
        el.sheetFilterDropdownPanel.classList.toggle("hidden");
      }
    });

    document.addEventListener("click", (e) => {
      if (el.sheetFilterDropdownPanel && 
          !el.sheetFilterDropdownPanel.contains(e.target) && 
          e.target !== el.btnSheetFilterDropdown &&
          !el.btnSheetFilterDropdown.contains(e.target)) {
        el.sheetFilterDropdownPanel.classList.add("hidden");
      }
    });
  }

  if (el.btnSheetViewToggle) {
    el.btnSheetViewToggle.addEventListener("click", () => {
      state.sheetViewMode = (state.sheetViewMode === "group") ? "list" : "group";
      
      if (state.sheetViewMode === "list") {
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

  if (el.btnSheetShuffle) {
    el.btnSheetShuffle.addEventListener("click", () => {
      pickRandomProblem();
    });
  }

  if (el.btnSheetReset) {
    el.btnSheetReset.addEventListener("click", async () => {
      const confirmReset = confirm("Are you sure you want to reset all progress for the active DSA sheet? This will clear completion checkmarks for all problems in this sheet.");
      if (confirmReset) {
        await resetSheetProgress();
      }
    });
  }

  if (el.btnSheetExportExcel) {
    el.btnSheetExportExcel.addEventListener("click", async () => {
      await exportActiveSheetToExcel();
    });
  }

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

export function updateFilterBadgeAndRender() {
  const badge = el.sheetFilterBadge;
  const button = el.btnSheetFilterDropdown;
  let activeCount = 0;
  
  const filterTypes = ["difficulty", "status", "topic", "pattern", "collection", "list"];
  filterTypes.forEach(type => {
    if (state.activeFilters[type].vals && state.activeFilters[type].vals.length > 0) {
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

  renderSheets();
}

export async function renderSheets() {
  const container = el.sheetAccordionContainer;
  const sheetSelect = el.sheetSelect;

  if (!container || !sheetSelect) return;

  const selectedSheetName = sheetSelect.value;

  if (state.selectedSidebarList) {
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
    
    if (document.querySelector(".sheet-controls-row")) document.querySelector(".sheet-controls-row").style.display = "none";
    if (el.sheetTopicPills) el.sheetTopicPills.style.display = "none";
    return;
  }

  if (document.querySelector(".sheet-controls-row")) document.querySelector(".sheet-controls-row").style.display = "flex";
  if (el.sheetTopicPills) el.sheetTopicPills.style.display = "flex";

  const sheetData = await loadSheet(selectedSheetName);
  state.currentCrossSheetMap = await getCrossSheetMap();

  const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = storedHistory[STORAGE_KEYS.history] || [];

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

  populateDynamicFilterDropdowns(sheetData, history);
  populateTopicPills(sheetData, solvedMap);
  renderSheetsListOrGroup(sheetData, solvedMap);
  renderMyListsSidebar();
}

export function bindMultiselectSearch(type, optionsContainer, items) {
  optionsContainer.innerHTML = "";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "multiselect-search-input";
  searchInput.placeholder = "Search or type custom...";
  searchInput.style = "width: calc(100% - 8px); margin: 4px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--clr-border); border-radius: 4px; padding: 4px 8px; color: #fff; font-size: 11px; outline: none; box-sizing: border-box;";
  optionsContainer.appendChild(searchInput);

  const listWrapper = document.createElement("div");
  listWrapper.className = "multiselect-checkbox-list";
  listWrapper.style = "display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; padding: 4px;";
  optionsContainer.appendChild(listWrapper);

  const checkedVals = state.activeFilters[type].vals || [];

  const renderList = (filterText = "") => {
    listWrapper.innerHTML = "";
    const normFilter = filterText.trim().toLowerCase();

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

    items.forEach(item => {
      const normItem = item.toLowerCase();
      if (normFilter !== "" && !normItem.includes(normFilter)) return;

      const isChecked = checkedVals.includes(normItem);
      const label = document.createElement("label");
      label.className = "multiselect-option-row";
      label.innerHTML = `
        <input type="checkbox" value="${normItem}" ${isChecked ? "checked" : ""}>
        <span>${item}</span>
      `;
      listWrapper.appendChild(label);
    });

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
  
  searchInput.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

export function populateDynamicFilterDropdowns(sheetData, history) {
  const topicOptionsContainer = document.getElementById("filterOptionsTopic");
  if (topicOptionsContainer) {
    const sheetTopics = Object.keys(sheetData).map(t => cleanDisplayName(t));
    const combinedTopicsSet = new Set();
    
    sheetTopics.forEach(t => combinedTopicsSet.add(t));
    
    FIXED_TOPICS.forEach(t => {
      const exists = Array.from(combinedTopicsSet).some(existing => existing.toLowerCase() === t.toLowerCase());
      if (!exists) {
        combinedTopicsSet.add(t);
      }
    });

    const sortedTopics = Array.from(combinedTopicsSet).sort();
    bindMultiselectSearch("topic", topicOptionsContainer, sortedTopics);
  }

  const patternOptionsContainer = document.getElementById("filterOptionsPattern");
  if (patternOptionsContainer) {
    const selectedTopics = state.activeFilters.topic.vals || [];
    const patterns = new Set();
    
    // DASHBOARD_TOPIC_PATTERNS is imported from state.js at top
    if (selectedTopics.length > 0) {
      selectedTopics.forEach(topic => {
        const normTopic = topic.toLowerCase().replace(/[^a-z0-9]/g, "");
        
        Object.keys(DASHBOARD_TOPIC_PATTERNS).forEach(key => {
          const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (normKey.includes(normTopic) || normTopic.includes(normKey)) {
            DASHBOARD_TOPIC_PATTERNS[key].forEach(p => patterns.add(p));
          }
        });

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
      Object.values(DASHBOARD_TOPIC_PATTERNS).forEach(pats => {
        pats.forEach(p => patterns.add(p));
      });
      history.forEach(h => {
        if (h.pattern && h.pattern !== "None") {
          patterns.add(h.pattern);
        }
      });
    }

    const sortedPatterns = Array.from(patterns).sort();
    bindMultiselectSearch("pattern", patternOptionsContainer, sortedPatterns);
  }

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

  const listOptionsContainer = document.getElementById("filterOptionsList");
  if (listOptionsContainer) {
    chrome.storage.local.get("customStarredLists").then((stored) => {
      const customLists = stored.customStarredLists || [];
      const allLists = ["Favorite", "Revision", ...customLists];
      bindMultiselectSearch("list", listOptionsContainer, allLists);
    });
  }
}

export function populateTopicPills(sheetData, solvedMap) {
  const pillsContainer = el.sheetTopicPills;
  if (!pillsContainer) return;

  const selectedSheetName = el.sheetSelect.value;
  if (selectedSheetName === "all_imported_sheets") {
    pillsContainer.style.display = "none";
    return;
  }
  pillsContainer.style.display = "flex";

  const topicCounts = {};
  let allTotal = 0;
  let allCompleted = 0;

  const savedTopicFilter = state.activeFilters.topic.vals;
  state.activeFilters.topic.vals = [];

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

  state.activeFilters.topic.vals = savedTopicFilter;

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

  pillsContainer.innerHTML = "";

  const allPill = document.createElement("button");
  allPill.className = "sheet-topic-pill" + (state.selectedTopicPill === "all" ? " active" : "");
  allPill.innerHTML = `All <span class="pill-count">${allCompleted}/${allTotal}</span>`;
  allPill.addEventListener("click", () => {
    state.selectedTopicPill = "all";
    pillsContainer.querySelectorAll(".sheet-topic-pill").forEach(p => p.classList.remove("active"));
    allPill.classList.add("active");
    renderSheetsListOrGroup(sheetData, solvedMap);
  });
  pillsContainer.appendChild(allPill);

  for (const [topicName, counts] of Object.entries(topicCounts)) {
    const pill = document.createElement("button");
    pill.className = "sheet-topic-pill" + (state.selectedTopicPill === topicName ? " active" : "");
    pill.innerHTML = `${cleanDisplayName(topicName)} <span class="pill-count">${counts.completed}/${counts.total}</span>`;
    pill.addEventListener("click", () => {
      state.selectedTopicPill = topicName;
      pillsContainer.querySelectorAll(".sheet-topic-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      renderSheetsListOrGroup(sheetData, solvedMap);
    });
    pillsContainer.appendChild(pill);
  }
}

export function renderSheetsListOrGroup(sheetData, solvedMap) {
  const selectedSheetName = el.sheetSelect.value;
  if (selectedSheetName === "all_imported_sheets") {
    renderAllSheetsCombinedView(sheetData, solvedMap);
  } else if (state.sheetViewMode === "list") {
    renderFlatTableView(sheetData, solvedMap);
  } else {
    renderAccordionGroupView(sheetData, solvedMap);
  }
}

export function renderAllSheetsCombinedView(sheetData, solvedMap) {
  const container = el.sheetAccordionContainer;
  if (!container) return;
  container.innerHTML = "";

  const allProblems = [];
  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    for (const [subtopicName, subproblems] of Object.entries(subtopics)) {
      subproblems.forEach(p => {
        allProblems.push({ ...p, topicName, subtopicName });
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

export function renderFlatTableView(sheetData, solvedMap) {
  const container = el.sheetAccordionContainer;
  if (!container) return;
  container.innerHTML = "";

  const listProblems = [];
  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    if (state.selectedTopicPill !== "all" && topicName !== state.selectedTopicPill) continue;
    for (const [subtopicName, subproblems] of Object.entries(subtopics)) {
      subproblems.forEach(p => {
        listProblems.push({ ...p, topicName, subtopicName });
      });
    }
  }

  const filtered = filterSheetProblems(listProblems, solvedMap);
  const sorted = sortProblems(filtered, solvedMap);

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

export function renderAccordionGroupView(sheetData, solvedMap) {
  const container = el.sheetAccordionContainer;
  if (!container) return;
  container.innerHTML = "";

  let activeIndex = 0;
  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    if (state.selectedTopicPill !== "all" && topicName !== state.selectedTopicPill) continue;

    // Filter problems first to check if they match filters
    const topicProblems = [];
    for (const [subtopicName, problems] of Object.entries(subtopics)) {
      problems.forEach(p => {
        topicProblems.push({ ...p, topicName, subtopicName });
      });
    }
    const filteredTopicProblems = filterSheetProblems(topicProblems, solvedMap);
    if (filteredTopicProblems.length === 0) continue; // skip empty accordion

    const topicAccordion = document.createElement("div");
    topicAccordion.className = "sheet-topic-accordion";

    // Auto-expand first topic or if searching
    const hasSearchQuery = !!state.sheetSearchQuery;
    const isExp = hasSearchQuery || (state.selectedTopicPill !== "all") || (activeIndex === 0);
    if (isExp) topicAccordion.classList.add("open");
    activeIndex++;

    // Calculate total and solved for this topic
    let topicTotal = 0;
    let topicSolved = 0;
    filteredTopicProblems.forEach(p => {
      topicTotal++;
      if ((solvedMap[p.slug] || []).length > 0) topicSolved++;
    });

    const header = document.createElement("div");
    header.className = "sheet-topic-header glass";
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span class="sheet-topic-arrow" style="display: inline-block; font-size: 14px; font-weight: 800; transition: transform 0.2s ease; transform: rotate(${isExp ? "90" : "0"}deg);">▶</span>
        <span style="font-weight: 800; font-size: 14.5px; color: var(--clr-text);">${cleanDisplayName(topicName)}</span>
      </div>
      <div class="sheet-topic-progress-pill" style="font-size: 11px; font-weight: 700; background: ${topicSolved === topicTotal ? "var(--clr-easy-bg)" : "rgba(255,255,255,0.05)"}; color: ${topicSolved === topicTotal ? "var(--clr-easy)" : "var(--clr-muted)"}; padding: 3px 10px; border-radius: 20px; transition: var(--transition);">
        ${topicSolved}/${topicTotal} Solved
      </div>
    `;

    const subtopicContainer = document.createElement("div");
    subtopicContainer.className = "sheet-subtopics-container";
    subtopicContainer.style.display = isExp ? "flex" : "none";

    for (const [subtopicName, problems] of Object.entries(subtopics)) {
      const subproblems = problems.map(p => ({ ...p, topicName, subtopicName }));
      const filteredSubproblems = filterSheetProblems(subproblems, solvedMap);
      if (filteredSubproblems.length === 0) continue;

      const subHeader = document.createElement("div");
      subHeader.className = "sheet-subtopic-title";
      subHeader.textContent = cleanDisplayName(subtopicName);
      subtopicContainer.appendChild(subHeader);

      const table = document.createElement("table");
      table.className = "sheets-problems-table";
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.marginBottom = "16px";

      renderTableHead(table);

      const tbody = document.createElement("tbody");
      const sorted = sortProblems(filteredSubproblems, solvedMap);
      sorted.forEach(problem => {
        const tr = createProblemRow(problem, solvedMap, true);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      subtopicContainer.appendChild(table);
    }

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

export function createProblemRow(problem, solvedMap, isVisible) {
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
    if (onSheetsChangeCallback) {
      onSheetsChangeCallback();
    }
  });
  tdCheck.appendChild(checkbox);
  tr.appendChild(tdCheck);

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

  const selectedSheet = el.sheetSelect?.value;
  const isAllCombined = selectedSheet === "all_imported_sheets";

  if (isAllCombined && problem.sheetsIn && problem.sheetsIn.length > 0) {
    const sheetsIn = problem.sheetsIn;
    const badgeWrap = document.createElement("div");
    badgeWrap.style.cssText = "display:flex; flex-wrap:wrap; gap:3px; margin-top:3px;";

    if (sheetsIn.length === 1) {
      const tag = document.createElement("span");
      tag.style.cssText = "font-size:9.5px; padding:1px 6px; border-radius:8px; background:rgba(99,102,241,0.15); color:#a5b4fc; font-weight:600; white-space:nowrap;";
      tag.textContent = sheetsIn[0];
      tag.title = `Only in: ${sheetsIn[0]}`;
      badgeWrap.appendChild(tag);
    } else {
      const badge = document.createElement("span");
      badge.className = "cross-sheet-badge";
      badge.textContent = `📂 ${sheetsIn.length} Sheets`;
      badge.title = `Appears in:\n${sheetsIn.map(n => `• ${n}`).join("\n")}`;
      badgeWrap.appendChild(badge);
    }
    tdTitle.appendChild(badgeWrap);
  } else if (!isAllCombined && state.currentCrossSheetMap && slug && state.currentCrossSheetMap[slug]) {
    const listNames = state.currentCrossSheetMap[slug];
    if (listNames.length > 1) {
      const badge = document.createElement("span");
      badge.className = "cross-sheet-badge";
      badge.textContent = `📂 ${listNames.length} Sheets`;
      badge.title = `Appears in:\n${listNames.map(name => `• ${name}`).join("\n")}`;
      tdTitle.appendChild(badge);
    }
  }

  tr.appendChild(tdTitle);

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

export function filterSheetProblems(problems, solvedMap, overrideFilters) {
  const targetFilters = overrideFilters || state.activeFilters;
  return problems.filter(problem => {
    const slug = problem.slug;
    const solves = solvedMap[slug] || [];
    const isCompleted = solves.length > 0;
    const isBookmarked = solves.some(s => s.isFavorite);

    if (state.sheetSearchQuery && !problem.title.toLowerCase().includes(state.sheetSearchQuery)) {
      return false;
    }

    const filterRules = [];
    const filterTypes = ["difficulty", "status", "topic", "pattern", "collection", "list"];

    filterTypes.forEach(type => {
      const { op, vals } = targetFilters[type];
      if (!vals || vals.length === 0) return;

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

    if (filterRules.length === 0) return true;

    if (state.activeFilters.matchMode === "any") {
      return filterRules.some(r => r === true);
    } else {
      return filterRules.every(r => r === true);
    }
  });
}

export async function getActiveSheetProblems() {
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

export async function pickRandomProblem() {
  const problems = await getActiveSheetProblems();
  if (problems.length === 0) {
    alert("No problems found in the active sheet!");
    return;
  }
  
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
  
  let filtered = problems.filter(p => {
    if (state.selectedTopicPill !== "all" && p.topicName !== state.selectedTopicPill) return false;
    return true;
  });

  filtered = filterSheetProblems(filtered, solvedMap);
  
  if (filtered.length === 0) {
    alert("No problems matching your active filters were found!");
    return;
  }
  
  const randomProblem = filtered[Math.floor(Math.random() * filtered.length)];
  const practiceUrl = randomProblem.leetcodeUrl || `https://leetcode.com/problems/${randomProblem.slug}/`;
  window.open(practiceUrl, "_blank");
}

export async function resetSheetProgress() {
  const problems = await getActiveSheetProblems();
  if (problems.length === 0) return;
  
  const sheetSlugs = new Set(
    problems
      .map(p => normalizeProblemSlug(p.slug, p.leetcodeUrl || p.url))
      .filter(Boolean)
  );
  
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
  
  if (onSheetsChangeCallback) {
    onSheetsChangeCallback();
  }
}

export async function toggleProblemCompletion(problem, completed) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = stored[STORAGE_KEYS.history] || [];
  const targetSlug = normalizeProblemSlug(problem.slug, problem.leetcodeUrl || problem.url);

  if (completed) {
    const exists = history.some(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug);
    if (!exists) {
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
      await syncCloudData();
    }
  } else {
    const entriesToDelete = history.filter(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug);
    history = history.filter(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) !== targetSlug);
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
    await syncCloudData();
    
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

export async function toggleProblemBookmark(problem, bookmarked) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = stored[STORAGE_KEYS.history] || [];

  let updated = false;
  history = history.map(h => {
    if (h.slug === problem.slug) {
      updated = true;
      return { ...h, isFavorite: bookmarked };
    }
    return h;
  });

  if (!updated && bookmarked) {
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
