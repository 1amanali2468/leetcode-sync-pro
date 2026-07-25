// dashboard_modules/smart_lists.js - Smart and Custom Starred Lists Sidebar & Table Controller
import { el, STORAGE_KEYS, state } from "./state.js";
import { syncCloudData } from "./settings.js";
import { normalizeProblemSlug, sortProblems, renderTableHead } from "./ui_helpers.js";
import { toggleProblemFromList as toggleProblemFromListBase } from "../history_manager.js";

// Decoupled callback refs — registered by dashboard.js at boot
let _renderSheets = null;
let _createProblemRow = null;
let _filterSheetProblems = null;
let _loadSheet = null;

export function registerSheetsCallbacks({ renderSheets, createProblemRow, filterSheetProblems, loadSheet }) {
  _renderSheets = renderSheets;
  _createProblemRow = createProblemRow;
  _filterSheetProblems = filterSheetProblems;
  _loadSheet = loadSheet;
}

export async function openStarPopover(problem, starBtn, solvedMap) {
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
        if (_renderSheets) _renderSheets();
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
    if (_renderSheets) _renderSheets();
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

export async function toggleProblemFromList(problem, listName, add) {
  await toggleProblemFromListBase(problem, listName, add);
  await syncCloudData();
}

export async function checkIsStarred(slug) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = stored[STORAGE_KEYS.history] || [];
  const entry = history.find(h => h.slug === slug);
  if (!entry) return false;
  return entry.isFavorite || (entry.starredLists && entry.starredLists.length > 0);
}

export async function addCustomListGlobally(listName) {
  const stored = await chrome.storage.local.get("customStarredLists");
  const customLists = stored.customStarredLists || [];
  if (!customLists.map(l => l.toLowerCase()).includes(listName.toLowerCase())) {
    customLists.push(listName);
    await chrome.storage.local.set({ customStarredLists: customLists });
  }
}

export async function deleteCustomListGlobally(listName) {
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

export function setupSmartListListeners() {
  if (el.smartListTitleInput && el.smartListTitleCount) {
    el.smartListTitleInput.addEventListener("input", (e) => {
      el.smartListTitleCount.textContent = `${e.target.value.length}/30`;
    });
  }
  if (el.smartListDescInput && el.smartListDescCount) {
    el.smartListDescInput.addEventListener("input", (e) => {
      el.smartListDescCount.textContent = `${e.target.value.length}/150`;
    });
  }

  if (el.btnSaveAsSmartList) {
    el.btnSaveAsSmartList.addEventListener("click", () => {
      if (el.smartListModal) {
        el.smartListModal.classList.remove("hidden");
        if (el.smartListTitleInput) { el.smartListTitleInput.value = ""; el.smartListTitleCount.textContent = "0/30"; }
        if (el.smartListDescInput) { el.smartListDescInput.value = ""; el.smartListDescCount.textContent = "0/150"; }
      }
    });
  }

  const closeSmartListModal = () => { if (el.smartListModal) el.smartListModal.classList.add("hidden"); };
  if (el.smartListModalCloseBtn) el.smartListModalCloseBtn.addEventListener("click", closeSmartListModal);
  if (el.smartListCancelBtn) el.smartListCancelBtn.addEventListener("click", closeSmartListModal);

  if (el.smartListCreateBtn) {
    el.smartListCreateBtn.addEventListener("click", async () => {
      const title = el.smartListTitleInput.value.trim();
      const desc = el.smartListDescInput.value.trim();
      if (!title) { alert("Please enter a list title."); return; }

      const lowerTitle = title.toLowerCase();
      if (lowerTitle === "favorite" || lowerTitle === "revision") { alert("This is a reserved list name."); return; }

      const storedStar = await chrome.storage.local.get("customStarredLists");
      const customLists = storedStar.customStarredLists || [];
      if (customLists.map(l => l.toLowerCase()).includes(lowerTitle)) {
        alert("A static list with this name already exists. Please choose a different name.");
        return;
      }

      const storedSmart = await chrome.storage.local.get("customSmartLists");
      const customSmartLists = storedSmart.customSmartLists || {};
      customSmartLists[lowerTitle] = {
        name: title, description: desc,
        rules: JSON.parse(JSON.stringify(state.activeFilters)),
        isSmart: true
      };
      await chrome.storage.local.set({ customSmartLists });

      state.selectedSidebarList = title;
      state.selectedSidebarListIsSmart = true;
      
      ["difficulty", "status", "topic", "pattern", "collection"].forEach(t => {
        state.activeFilters[t].vals = [];
        const optionsDiv = document.getElementById(`filterOptions${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (optionsDiv) optionsDiv.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => cb.checked = false);
      });
      state.activeFilters.list.vals = [];
      
      closeSmartListModal();
      if (_renderSheets) _renderSheets();
    });
  }

  if (el.btnCreateNewListSidebar) {
    el.btnCreateNewListSidebar.addEventListener("click", () => {
      const listName = prompt("Enter a name for the new list:");
      if (!listName) return;
      const trimmed = listName.trim();
      if (!trimmed) return;
      if (trimmed.toLowerCase() === "favorite" || trimmed.toLowerCase() === "revision") {
        alert("This is a reserved list name."); return;
      }
      addCustomListGlobally(trimmed).then(() => renderMyListsSidebar());
    });
  }
}

export async function renderMyListsSidebar() {
  const container = el.sheetsSidebarLists;
  if (!container) return;

  const storedStar = await chrome.storage.local.get("customStarredLists");
  const customLists = storedStar.customStarredLists || [];
  const storedSmart = await chrome.storage.local.get("customSmartLists");
  const customSmartLists = storedSmart.customSmartLists || {};

  container.innerHTML = "";

  const staticLists = ["Favorite", "Revision", ...customLists];
  staticLists.forEach(listName => {
    const isFixed = listName.toLowerCase() === "favorite" || listName.toLowerCase() === "revision";
    const isActive = state.selectedSidebarList && state.selectedSidebarList.toLowerCase() === listName.toLowerCase() && !state.selectedSidebarListIsSmart;

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
            if (isActive) state.selectedSidebarList = null;
            if (_renderSheets) _renderSheets();
          });
        }
        return;
      }
      state.selectedSidebarList = isActive ? null : listName;
      if (!isActive) state.selectedSidebarListIsSmart = false;
      if (_renderSheets) _renderSheets();
    });

    container.appendChild(item);
  });

  Object.keys(customSmartLists).forEach(key => {
    const smartList = customSmartLists[key];
    const listName = smartList.name;
    const isActive = state.selectedSidebarList && state.selectedSidebarList.toLowerCase() === listName.toLowerCase() && state.selectedSidebarListIsSmart;

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
            if (isActive) state.selectedSidebarList = null;
            if (_renderSheets) _renderSheets();
          });
        }
        return;
      }
      state.selectedSidebarList = isActive ? null : listName;
      if (!isActive) state.selectedSidebarListIsSmart = true;
      if (_renderSheets) _renderSheets();
    });

    container.appendChild(item);
  });
}

export function renderFlatListProblems(solvedMap) {
  const container = el.sheetAccordionContainer;
  if (!container) return;
  container.innerHTML = "";

  const sheetSelectCard = document.getElementById("sheetSelectCard");
  if (sheetSelectCard) sheetSelectCard.style.display = "none";
  const controlsRow = document.querySelector(".sheet-controls-row");
  if (controlsRow) controlsRow.style.display = "none";
  const topicPills = document.getElementById("sheetTopicPills");
  if (topicPills) topicPills.style.display = "none";

  if (state.selectedSidebarListIsSmart) {
    chrome.storage.local.get("customSmartLists").then((storedSmart) => {
      const customSmartLists = storedSmart.customSmartLists || {};
      const smartList = customSmartLists[state.selectedSidebarList.toLowerCase()];
      const rules = smartList ? smartList.rules : state.activeFilters;

      const selectedSheetName = el.sheetSelect.value;
      if (_loadSheet) {
        _loadSheet(selectedSheetName).then(sheetData => {
          evaluateAndRenderSmartList(sheetData, solvedMap, rules, sheetSelectCard, controlsRow, topicPills);
        });
      }
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
        if (state.selectedSidebarList.toLowerCase() === "favorite") {
          match = h.isFavorite || (h.starredLists && h.starredLists.map(l => l.toLowerCase()).includes("favorite"));
        } else {
          match = h.starredLists && h.starredLists.map(l => l.toLowerCase()).includes(state.selectedSidebarList.toLowerCase());
        }

        if (match) {
          uniqueSlugs.add(slug);
          listProblems.push({
            title: h.name || h.title || slug, slug,
            difficulty: h.difficulty || "Medium",
            leetcodeUrl: h.leetcodeUrl || h.url || `https://leetcode.com/problems/${slug}`
          });
        }
      });

      renderFlatTableUI(listProblems, solvedMap, sheetSelectCard, controlsRow, topicPills, false);
    });
  }
}

export function evaluateAndRenderSmartList(sheetData, solvedMap, rules, sheetSelectCard, controlsRow, topicPills) {
  const allProblems = [];
  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    for (const [subtopicName, subproblems] of Object.entries(subtopics)) {
      subproblems.forEach(p => allProblems.push({ ...p, topicName, subtopicName }));
    }
  }
  const listProblems = _filterSheetProblems ? _filterSheetProblems(allProblems, solvedMap, rules) : allProblems;
  renderFlatTableUI(listProblems, solvedMap, sheetSelectCard, controlsRow, topicPills, true);
}

export function renderFlatTableUI(listProblems, solvedMap, sheetSelectCard, controlsRow, topicPills, isSmart) {
  const container = el.sheetAccordionContainer;
  if (!container) return;

  let completedProblems = 0, easySolved = 0, easyTotal = 0;
  let mediumSolved = 0, mediumTotal = 0, hardSolved = 0, hardTotal = 0, attemptingCount = 0;

  listProblems.forEach(p => {
    const slug = p.slug.trim().toLowerCase();
    const isCompleted = (solvedMap[slug] || []).length > 0;
    if (isCompleted) completedProblems++; else attemptingCount++;
    const diff = (p.difficulty || "Medium").toLowerCase();
    if (diff === "easy") { easyTotal++; if (isCompleted) easySolved++; }
    else if (diff === "hard") { hardTotal++; if (isCompleted) hardSolved++; }
    else { mediumTotal++; if (isCompleted) mediumSolved++; }
  });

  updateProgressWidget(completedProblems, listProblems.length, easySolved, easyTotal, mediumSolved, mediumTotal, hardSolved, hardTotal, attemptingCount);

  const listHeader = document.createElement("div");
  listHeader.className = "list-info-header glass";
  listHeader.style = "padding: 16px; border: 1px solid var(--clr-border); border-radius: var(--radius); margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02);";
  listHeader.innerHTML = `
    <div>
      <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: var(--clr-text); display: flex; align-items: center; gap: 8px;">
        <span>${isSmart ? "⚛️" : (state.selectedSidebarList.toLowerCase() === "favorite" ? "⭐" : "📂")}</span>
        <span>${state.selectedSidebarList}</span>
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
      state.selectedSidebarList = null;
      if (sheetSelectCard) sheetSelectCard.style.display = "flex";
      if (controlsRow) controlsRow.style.display = "flex";
      if (topicPills) topicPills.style.display = "flex";
      if (_renderSheets) _renderSheets();
    });
  }

  if (listProblems.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.style = "text-align: center; padding: 48px; color: var(--clr-muted); font-weight: 700; border: 1px dashed var(--clr-border); border-radius: var(--radius); background: rgba(255,255,255,0.01); margin-top: 12px;";
    emptyDiv.textContent = isSmart ? "No questions match this smart list's rules." : "This list is empty. Add questions using the star icon in problem sheets!";
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
    const tr = _createProblemRow ? _createProblemRow(problem, solvedMap, true) : document.createElement("tr");
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

export async function deleteSmartListGlobally(listName) {
  const storedSmart = await chrome.storage.local.get("customSmartLists");
  const customSmartLists = storedSmart.customSmartLists || {};
  delete customSmartLists[listName.toLowerCase()];
  await chrome.storage.local.set({ customSmartLists });
}

export function setupSidebarResize() {
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
    if (isDragging) { isDragging = false; cleanupDrag(); }
  });

  function cleanupDrag() {
    appContainer.classList.remove("sidebar-resizing");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
}

export function updateProgressWidget(solvedCount, totalCount, easySolved, easyTotal, mediumSolved, mediumTotal, hardSolved, hardTotal, attemptingCount) {
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

  if (easyBar) easyBar.style.width = `${easyTotal > 0 ? (easySolved / easyTotal) * 100 : 0}%`;
  if (mediumBar) mediumBar.style.width = `${mediumTotal > 0 ? (mediumSolved / mediumTotal) * 100 : 0}%`;
  if (hardBar) hardBar.style.width = `${hardTotal > 0 ? (hardSolved / hardTotal) * 100 : 0}%`;

  if (fillPath) {
    const pct = totalCount > 0 ? (solvedCount / totalCount) : 0;
    fillPath.style.strokeDashoffset = 188.5 * (1 - pct);
  }
}
