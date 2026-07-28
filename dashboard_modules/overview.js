// dashboard_modules/overview.js - Dashboard Overview Screen Controller
import { el, STORAGE_KEYS, state } from "./state.js";
import { openNotesModal } from "./notes_modal.js";
import { escapeHtml } from "./ui_helpers.js";

export async function renderOverview() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.history, STORAGE_KEYS.streak]);
  const history = data[STORAGE_KEYS.history] || [];
  const streakInfo = data[STORAGE_KEYS.streak] || { streak: 0 };

  // 1. Streak count
  el.streakNum.textContent = streakInfo.streak || 0;

  // 2. Solve Breakdown Donuts calculation
  const counts = { easy: 0, medium: 0, hard: 0 };
  const uniqueSlugs = new Set();
  
  history.forEach(h => {
    if (h.isStarredOnly) return;
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

export function setupHeatmapControls() {
  el.btnPrevYear.addEventListener("click", () => {
    state.currentYear--;
    el.heatmapYear.textContent = state.currentYear;
    renderOverview();
  });
  el.btnNextYear.addEventListener("click", () => {
    state.currentYear++;
    el.heatmapYear.textContent = state.currentYear;
    renderOverview();
  });
}

export function renderHeatmap(history) {
  el.heatmapGrid.innerHTML = "";

  // Index history by local date string YYYY-MM-DD
  const dateMap = {};
  history.forEach(h => {
    if (h.isStarredOnly) return;
    if (h.savedAt) {
      const dStr = h.savedAt.split("T")[0];
      dateMap[dStr] = (dateMap[dStr] || 0) + 1;
    }
  });

  // Calculate grid representing the currentYear
  const firstDay = new Date(state.currentYear, 0, 1);
  const lastDay = new Date(state.currentYear, 11, 31);
  
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
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 53; c++) {
      const dayIdx = c * 7 + r;
      const dateVal = daysToShow[dayIdx];
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";

      if (dateVal.getFullYear() === state.currentYear) {
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
        cell.style.opacity = "0.1";
      }
      el.heatmapGrid.appendChild(cell);
    }
  }
}

export function renderRecentSolvesList(history) {
  el.recentSolvesList.innerHTML = "";
  
  const recent = history.filter(h => !h.isStarredOnly).slice(0, 10);
  if (recent.length === 0) {
    el.recentSolvesList.innerHTML = `<tr><td colspan="6" class="empty-state">No solves found in your history yet!</td></tr>`;
    return;
  }

  recent.forEach(entry => {
    const tr = document.createElement("tr");

    // Title
    const tdTitle = document.createElement("td");
    tdTitle.innerHTML = `<strong>${escapeHtml(entry.title || "Unknown")}</strong>`;
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
