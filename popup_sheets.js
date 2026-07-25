// popup_sheets.js – Handles curated sheet rendering, dropdown selectors, and manual complete/star toggles.
// Loaded as an ES module by popup.js.

import { el, STORAGE_KEYS, filterState } from "./popup.js";
import { escapeHtml, isSafeUrl, normalizeProblemSlug, cleanDisplayName } from "./popup_helpers.js";
import { openNotesModal } from "./popup_history.js";
import { renderStats, todayStr } from "./popup_stats.js";
import { syncCloudData } from "./popup_sync.js";
import { getFirestoreApiUrl } from "./firebase-config.js";
import { loadSheet, populateSheetDropdown as populateSheetDropdownHelper, getCrossSheetMap } from "./sheet-loader.js";
import { toggleProblemCompletion as toggleProblemCompletionBase, toggleProblemFromList as toggleProblemFromListBase, isProblemCompleted } from "./history_manager.js";

export let currentSheetFilter = "all";
export let currentCrossSheetMap = null;

export function renderCollectionOptions(history) {
  const collectionOptionsDiv = document.getElementById("historyFilterCollectionOptions");
  if (!collectionOptionsDiv) return;
  collectionOptionsDiv.innerHTML = "";
  
  const allOpt = document.createElement("div");
  const isAllSelected = filterState.collectionMode === "" && filterState.collections.length === 0;
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
    const isSelected = filterState.collectionMode === "" && filterState.collections.includes(col);
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

  const isOtherSelected = filterState.collectionMode === "__other__";
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

export async function renderSheets() {
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

  let totalProblems = 0;
  let completedProblems = 0;

  container.innerHTML = "";

  const LEETCODE_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;">
    <path fill="#B3B1B0" d="M22 14.355c0-.742-.564-1.346-1.26-1.346H10.676c-.696 0-1.26.604-1.26 1.346s.563 1.346 1.26 1.346H20.74c.696.001 1.26-.603 1.26-1.346z"></path>
    <path fill="#E7A41F" d="m3.482 18.187 4.313 4.361c.973.979 2.318 1.452 3.803 1.452 1.485 0 2.83-.512 3.805-1.494l2.588-2.637c.51-.514.492-1.365-.039-1.9-.531-.535-1.375-.553-1.884-.039l-2.676 2.607c-.462.467-1.102.662-1.809.662s-1.346-.195-1.81-.662l-4.298-4.363c-.463-.467-.696-1.15-.696-1.863 0-.713.233-1.357.696-1.824l4.285-4.38c.463-.467 1.116-.645 1.822-.645s1.346.195 1.809.662l2.676 2.606c.51.515 1.354.497 1.885-.038.531-.536.549-1.387.039-1.901l-2.588-2.636a4.994 4.994 0 0 0-2.392-1.33l-.034-.007 2.447-2.503c.512-.514.494-1.366-.037-1.901-.531-.535-1.376-.552-1.887-.038l-10.018 10.1C2.509 11.458 2 12.813 2 14.311c0 1.498.509 2.896 1.482 3.876z"></path>
    <path fill="#070706" d="M8.115 22.814a2.109 2.109 0 0 1-.474-.361c-1.327-1.333-2.66-2.66-3.984-3.997-1.989-2.008-2.302-4.937-.786-7.32a6 6 0 0 1 .839-1.004L13.333.489c.625-.626 1.498-.652 2.079-.067.56.563.527 1.455-.078 2.066-.769.776-1.539 1.55-2.309 2.325-.041.122-.14.2-.225.287-.863.876-1.75 1.729-2.601 2.618-.111.116-.262.186-.372.305-1.423 1.423-2.863 2.83-4.266 4.272-1.135 1.167-1.097 2.938.068 4.127 1.308 1.336 2.639 2.65 3.961 3.974.067.067.136.132.204.198.468.303.474 1.25.183 1.671-.321.465-.74.75-1.333.728-.199-.006-.363-.086-.529-.179z"></path>
  </svg>`;
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
    subtopicContainer.style.flexDirection = "column";
    subtopicContainer.style.gap = "8px";
    subtopicContainer.style.padding = "10px";
    subtopicContainer.style.backgroundColor = "var(--clr-surface)";
    subtopicContainer.style.border = "1px solid var(--clr-border)";
    subtopicContainer.style.borderTop = "0";

    const subkeys = Object.keys(subtopics);
    const isSingleGeneral = subkeys.length === 1;

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
        const isCompleted = isProblemCompleted(solves);
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
        const destUrl = (problem.leetcodeUrl || "").toLowerCase();
        const isGFG = destUrl.includes("geeksforgeeks.org");
        const isTUF = destUrl.includes("takeuforward.org");
        if (isTUF) {
          platLink.innerHTML = `<img src="${chrome.runtime.getURL('tuf.jpg')}" style="width:15px; height:15px; border-radius:50%; object-fit:cover; vertical-align:middle;" />`;
        } else if (isGFG) {
          platLink.innerHTML = GFG_SVG;
        } else {
          platLink.innerHTML = LEETCODE_SVG;
        }
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
            id: selectedSheetName === "striver_a2z_sheet" ? "" : "0",
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
          const isCompleted = isProblemCompleted(solves);
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
          const destUrl = (problem.leetcodeUrl || "").toLowerCase();
          const isGFG = destUrl.includes("geeksforgeeks.org");
          const isTUF = destUrl.includes("takeuforward.org");
          if (isTUF) {
            platLink.innerHTML = `<img src="${chrome.runtime.getURL('tuf.jpg')}" style="width:15px; height:15px; border-radius:50%; object-fit:cover; vertical-align:middle;" />`;
          } else if (isGFG) {
            platLink.innerHTML = GFG_SVG;
          } else {
            platLink.innerHTML = LEETCODE_SVG;
          }
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
              id: selectedSheetName === "striver_a2z_sheet" ? "" : "0",
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
}

export async function setupSheetsListeners() {
  const sheetSelect = document.getElementById("sheetSelect");
  const filterBtns = document.querySelectorAll(".sheet-filter-btn");

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

export async function populateSheetDropdownPopup() {
  const select = document.getElementById("sheetSelect");
  if (!select) return;

  await populateSheetDropdownHelper(select, true);

  renderSheets();
}

export async function toggleProblemCompletion(problem, completed) {
  await toggleProblemCompletionBase(problem, completed);
  await syncCloudData();
}

export async function toggleProblemBookmark(problem, bookmarked) {
  await toggleProblemFromListBase(problem, "Favorite", bookmarked);
  await syncCloudData();
}
