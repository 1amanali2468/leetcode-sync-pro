// popup_calendar.js – Handles calendar rendering, day details, and spaced repetition revisions.
// Loaded as an ES module by popup.js.

import { el, STORAGE_KEYS } from "./popup.js";
import { escapeHtml, isSafeUrl, approachDisplayName } from "./popup_helpers.js";
import { getLocalDateString, todayStr, renderStats } from "./popup_stats.js";

export const calendarState = {
  selectedDate: new Date(),
  currentDate: new Date(),
  activeDropdownBtn: null
};

export async function renderCalendar() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = (stored[STORAGE_KEYS.history] || []).filter(h => !h.isStarredOnly);

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

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const year = calendarState.currentDate.getFullYear();
  const month = calendarState.currentDate.getMonth();
  if (el.calendarMonthYear) {
    el.calendarMonthYear.textContent = `${monthNames[month]} ${year}`;
  }

  if (!el.calendarGrid) return;
  el.calendarGrid.innerHTML = "";

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  const prevMonthYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthTotalDays - i;
    const cellDate = new Date(prevMonthYear, prevMonth, dayNum);
    const cell = createCalendarCell(cellDate, false, historyByDate);
    el.calendarGrid.appendChild(cell);
  }

  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const cellDate = new Date(year, month, dayNum);
    const cell = createCalendarCell(cellDate, true, historyByDate);
    el.calendarGrid.appendChild(cell);
  }

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

  renderSelectedDayDetails(historyByDate);
}

export function createCalendarCell(date, isCurrentMonth, historyByDate) {
  const cell = document.createElement("div");
  cell.className = "calendar-day";
  if (!isCurrentMonth) {
    cell.className += " other-month";
  }

  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  
  const today = new Date();
  const isToday = date.getDate() === today.getDate() && 
                  date.getMonth() === today.getMonth() && 
                  date.getFullYear() === today.getFullYear();
  if (isToday) {
    cell.className += " today";
  }

  const isSelected = date.getDate() === calendarState.selectedDate.getDate() && 
                      date.getMonth() === calendarState.selectedDate.getMonth() && 
                      date.getFullYear() === calendarState.selectedDate.getFullYear();
  if (isSelected) {
    cell.className += " selected";
  }

  const numLabel = document.createElement("span");
  numLabel.className = "calendar-day-num";
  numLabel.textContent = date.getDate();
  cell.appendChild(numLabel);

  const dayHistory = historyByDate[dateStr] || [];
  if (dayHistory.length > 0) {
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

  cell.addEventListener("click", () => {
    calendarState.selectedDate = date;
    
    const prevSelected = el.calendarGrid.querySelector(".calendar-day.selected");
    if (prevSelected) {
      prevSelected.classList.remove("selected");
    }
    cell.classList.add("selected");

    renderSelectedDayDetails(historyByDate);
  });

  return cell;
}

export function renderSelectedDayDetails(historyByDate) {
  const dateStr = `${calendarState.selectedDate.getFullYear()}-${String(calendarState.selectedDate.getMonth() + 1).padStart(2, '0')}-${String(calendarState.selectedDate.getDate()).padStart(2, '0')}`;
  
  if (el.calendarSelectedDateStr) {
    el.calendarSelectedDateStr.textContent = calendarState.selectedDate.toLocaleDateString("en-US", {
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

    const revBtn = item.querySelector(".revision-btn");
    revBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleRevisionDropdown(revBtn, entry);
    });

    el.calendarDayDetailsList.appendChild(item);
  });
}

export function removeDropdown(dropdown) {
  if (!dropdown) return;
  if (dropdown.closeListener) {
    document.removeEventListener("click", dropdown.closeListener);
  }
  dropdown.remove();
  calendarState.activeDropdownBtn = null;
}

export function toggleRevisionDropdown(revBtn, entry) {
  const oldDropdown = document.querySelector(".revision-floating-dropdown");
  if (oldDropdown) {
    const wasSame = (calendarState.activeDropdownBtn === revBtn);
    removeDropdown(oldDropdown);
    if (wasSame) {
      return;
    }
  }

  const panel = document.querySelector(".calendar-panel");
  if (!panel) return;

  calendarState.activeDropdownBtn = revBtn;

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

  const rect = revBtn.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const top = rect.bottom - panelRect.top;
  const right = panelRect.right - rect.right;

  dropdown.style.top = `${top + 4}px`;
  dropdown.style.right = `${right}px`;

  panel.appendChild(dropdown);

  dropdown.querySelectorAll(".rev-drop-opt").forEach(btn => {
    btn.addEventListener("click", async () => {
      const days = parseInt(btn.dataset.days);
      await setRevision(entry.slug, days);
      removeDropdown(dropdown);
    });
  });

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

  dropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });

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

export async function setRevision(slug, days) {
  const d = new Date(calendarState.selectedDate);
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

export function getRevisionDueDate(entry) {
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

export function isRevisionDue(entry) {
  const today = todayStr();
  let isCompleted = !!entry.revisionCompleted;
  let completedAt = entry.revisionCompletedAt || "";

  if (isCompleted && completedAt !== today) {
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

export function getDueRevisions(history) {
  const latestBySlug = {};
  history.forEach(entry => {
    if (entry.isStarredOnly) return;
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

export async function updateProblemRevisionSettings(slug, settings) {
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
