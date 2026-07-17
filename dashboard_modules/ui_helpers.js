// dashboard_modules/ui_helpers.js - UI Formatting and Table Sorting Helpers
import { state, el } from "./state.js";

let onSortCallback = null;

export function registerSortCallback(cb) {
  onSortCallback = cb;
}

export function getSheetCount(problem) {
  if (Array.isArray(problem.sheetsIn)) return problem.sheetsIn.length;
  const slug = problem.slug?.trim().toLowerCase();
  return slug ? (state.currentCrossSheetMap?.[slug]?.length || 0) : 0;
}

export function sortProblems(problemsArray, solvedMap) {
  if (state.currentSortColumn === "none" || state.currentSortDirection === "none") {
    // Default fallback to frequency sort if sheetSortDirection is set
    if (state.sheetSortDirection !== "none") {
      return [...problemsArray].sort((a, b) => {
        const countA = getSheetCount(a);
        const countB = getSheetCount(b);
        if (state.sheetSortDirection === "desc") return countB - countA;
        return countA - countB;
      });
    }
    return problemsArray;
  }

  return [...problemsArray].sort((a, b) => {
    let valA, valB;

    switch (state.currentSortColumn) {
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
        const order = state.currentSortDirection; // "easy", "medium", "hard"
        
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

    if (state.currentSortColumn === "difficulty") return 0;

    if (valA < valB) return state.currentSortDirection === "asc" ? -1 : 1;
    if (valA > valB) return state.currentSortDirection === "asc" ? 1 : -1;
    return 0;
  });
}

export function handleColumnSort(columnName) {
  if (state.currentSortColumn === columnName) {
    if (columnName === "difficulty") {
      if (state.currentSortDirection === "none") state.currentSortDirection = "easy";
      else if (state.currentSortDirection === "easy") state.currentSortDirection = "medium";
      else if (state.currentSortDirection === "medium") state.currentSortDirection = "hard";
      else {
        state.currentSortDirection = "none";
        state.currentSortColumn = "none";
      }
    } else {
      if (state.currentSortDirection === "none") state.currentSortDirection = (columnName === "problem" ? "desc" : "asc");
      else if (state.currentSortDirection === "desc") state.currentSortDirection = "asc";
      else if (state.currentSortDirection === "asc") {
        if (columnName === "problem") {
          state.currentSortDirection = "none";
          state.currentSortColumn = "none";
        } else {
          state.currentSortDirection = "desc";
        }
      } else {
        state.currentSortDirection = "none";
        state.currentSortColumn = "none";
      }
    }
  } else {
    state.currentSortColumn = columnName;
    state.currentSortDirection = columnName === "difficulty" ? "easy" : (columnName === "problem" ? "desc" : "asc");
    state.sheetSortDirection = "none"; // override old sort
  }
  
  if (onSortCallback) {
    onSortCallback();
  }
}

export function getHeaderSortIndicatorHtml(columnName) {
  if (state.currentSortColumn !== columnName) {
    return '<span style="opacity: 0.3; margin-left: 6px;">↕</span>';
  }
  if (columnName === "difficulty") {
    const dir = state.currentSortDirection;
    if (dir === "easy") return '<span style="color: var(--clr-primary); margin-left: 6px; font-weight: 800; font-size: 11px;">(E)</span>';
    if (dir === "medium") return '<span style="color: var(--clr-primary); margin-left: 6px; font-weight: 800; font-size: 11px;">(M)</span>';
    if (dir === "hard") return '<span style="color: var(--clr-primary); margin-left: 6px; font-weight: 800; font-size: 11px;">(H)</span>';
    return '<span style="opacity: 0.3; margin-left: 6px;">↕</span>';
  }
  if (state.currentSortDirection === "asc") return '<span style="color: var(--clr-primary); margin-left: 6px;">▲</span>';
  if (state.currentSortDirection === "desc") return '<span style="color: var(--clr-primary); margin-left: 6px;">▼</span>';
  return '<span style="opacity: 0.3; margin-left: 6px;">↕</span>';
}

export function renderTableHead(table) {
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

export function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function cleanDisplayName(name) {
  if (!name) return "";
  let clean = name.replace(/^(Step|Lec|Lecture)\s*[-:]?\s*\d+\s*[-:]?\s*/i, "");
  clean = clean.replace(/^[0-9]+\s*[.)-]?\s+/, "");
  return clean.replace(/[_-]+/g, " ").trim();
}

export function normalizeProblemSlug(slug, url = "") {
  if (!slug && url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("geeksforgeeks.org")) {
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length > 0) return parts[parts.length - 1];
      } else if (u.hostname.includes("leetcode.com")) {
        const parts = u.pathname.split("/").filter(Boolean);
        const idx = parts.indexOf("problems");
        if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
      }
    } catch (e) {}
  }
  if (!slug) return "";
  let s = slug.trim().toLowerCase().replace(/\/$/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length > 0) {
    s = parts[parts.length - 1];
  }
  if (!url || !url.toLowerCase().includes("leetcode.com")) {
    s = s.replace(/-\d{5,}$/, "");
  }
  return s;
}

export function classifyDifficulty(diffVal) {
  if (!diffVal) return "medium";
  const d = diffVal.toString().toLowerCase().trim();
  if (d === "1" || d === "easy" || d === "e") return "easy";
  if (d === "3" || d === "hard" || d === "h") return "hard";
  return "medium";
}

export function approachDisplayName(code) {
  if (!code) return "Optimal";
  const c = code.toLowerCase().trim();
  if (c === "bf" || c === "brute_force" || c.includes("brute")) return "Brute Force";
  if (c === "ba" || c === "better" || c.includes("better")) return "Better";
  return "Optimal";
}
