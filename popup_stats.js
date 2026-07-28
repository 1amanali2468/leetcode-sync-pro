// popup_stats.js – Handles statistics panel rendering, streak calculations, and solve report exports.
// Loaded as an ES module by popup.js.

import { el, STORAGE_KEYS, filterState } from "./popup.js";
import { escapeHtml, isSafeUrl, approachDisplayName } from "./popup_helpers.js";
import { updateProblemRevisionSettings, renderCalendar } from "./popup_calendar.js";
import { getDueRevisions } from "./shared_revision.js";

export function getLocalDateString(savedAt) {
  if (!savedAt) return "";
  const d = new Date(savedAt);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function isSameLocalDate(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

export function calcStreak(history) {
  const solvedHistory = history.filter(h => !h.isStarredOnly);
  if (!solvedHistory.length) return { streak: 0, lastDate: null };

  const dates = [...new Set(
    solvedHistory.map((h) => getLocalDateString(h.savedAt)).filter(Boolean)
  )].sort().reverse();

  if (!dates.length) return { streak: 0, lastDate: null };

  const today  = todayStr();
  const yesterday = dayOffset(-1);

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

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatRelativeDate(iso) {
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

export async function renderStats() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = stored[STORAGE_KEYS.history] || [];

  const counts = { easy: 0, medium: 0, hard: 0 };
  const uniqueSlugs = new Set();
  for (const entry of history) {
    if (entry.isStarredOnly) continue;
    if (!uniqueSlugs.has(entry.slug)) {
      uniqueSlugs.add(entry.slug);
      const d = (entry.difficulty || "").toLowerCase();
      if (d === "easy")   counts.easy++;
      else if (d === "medium") counts.medium++;
      else if (d === "hard")   counts.hard++;
    }
  }
  if (el.statTotal) el.statTotal.textContent  = uniqueSlugs.size;
  if (el.statEasy) el.statEasy.textContent   = counts.easy;
  if (el.statMedium) el.statMedium.textContent = counts.medium;
  if (el.statHard) el.statHard.textContent   = counts.hard;

  const { streak } = calcStreak(history);
  if (el.statStreak) el.statStreak.textContent = streak;

  const todayStrVal = getLocalDateString(new Date());
  const solvedTodaySlugs = new Set();
  for (const entry of history) {
    if (entry.isStarredOnly) continue;
    if (getLocalDateString(entry.savedAt) === todayStrVal) {
      solvedTodaySlugs.add(entry.slug);
    }
  }
  if (el.statSolvedToday) el.statSolvedToday.textContent = solvedTodaySlugs.size;

  const topicCounts = {};
  const processedSlugs = new Set();

  for (const entry of history) {
    if (entry.isStarredOnly) continue;
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
    const sortedTopics = Object.entries(topicCounts).sort((a, b) => b[1].total - a[1].total);
    
    if (sortedTopics.length === 0) {
      el.topicPillList.innerHTML = `<p class="empty-state" style="padding: 10px 0; font-size: 10.5px; width: 100%;">No topics tracked yet. Save a solution with a topic tag!</p>`;
    } else {
      sortedTopics.forEach(([topic, data]) => {
        const pill = document.createElement("div");
        pill.className = "topic-stat-pill";
        
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
        const safeLeetcodeUrl = isSafeUrl(entry.url) ? entry.url : "#";
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

          entry.revisionCount = newCount;
          entry.lastRevisionAt = isChecked ? new Date().toISOString() : null;
          entry.revisionCompleted = isChecked;
          entry.revisionCompletedAt = isChecked ? todayStr() : null;

          renderStats();
          renderCalendar();
        });

        el.popupRevisionList.appendChild(item);
      });
    }
  }
}

export async function exportCSV() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = stored[STORAGE_KEYS.history] || [];

  if (!history.length) {
    alert("No history to export yet!");
    return;
  }

  const uniqueMap = new Map();
  history.forEach((entry) => {
    const key = entry.slug;
    const existing = uniqueMap.get(key);
    if (!existing || new Date(entry.savedAt) > new Date(existing.savedAt)) {
      uniqueMap.set(key, entry);
    }
  });
  const displayedHistory = Array.from(uniqueMap.values());

  const query = el.historySearch ? el.historySearch.value.trim().toLowerCase() : "";

  const selectedDiffs = filterState.difficulties.map(d => d.toLowerCase());

  let filterTopic = "";
  if (filterState.topicMode === "__other__") {
    const topicCustom = document.getElementById("historyFilterTopicCustom");
    filterTopic = topicCustom ? topicCustom.value.trim().toLowerCase() : "";
  }
  const selectedTopics = filterState.topics.map(t => t.toLowerCase());

  let filterPattern = "";
  if (filterState.patternMode === "__other__") {
    const patternCustom = document.getElementById("historyFilterPatternCustom");
    filterPattern = patternCustom ? patternCustom.value.trim().toLowerCase() : "";
  }
  const selectedPatterns = filterState.patterns.map(p => p.toLowerCase());

  let filterCollection = "";
  if (filterState.collectionMode === "__other__") {
    const collectionCustom = document.getElementById("historyFilterCollectionCustom");
    filterCollection = collectionCustom ? collectionCustom.value.trim().toLowerCase() : "";
  }
  const selectedCollections = filterState.collections.map(c => c.toLowerCase());

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

    const matchesFav = !filterState.fav || !!entry.isFavorite;

    let matchesTopic = true;
    if (filterState.topicMode === "__other__") {
      matchesTopic = !filterTopic || topic.includes(filterTopic);
    } else if (selectedTopics.length > 0) {
      matchesTopic = selectedTopics.includes(topic);
    }

    let matchesPattern = true;
    if (filterState.patternMode === "__other__") {
      matchesPattern = !filterPattern || pattern.includes(filterPattern);
    } else if (selectedPatterns.length > 0) {
      matchesPattern = selectedPatterns.includes(pattern);
    }

    let matchesCollection = true;
    if (filterState.collectionMode === "__other__") {
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

  filtered.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));

  const diffStyle = {
    easy:   "background:#f0fdf4;color:#166534;",
    medium: "background:#fffbeb;color:#92400e;",
    hard:   "background:#fef2f2;color:#991b1b;",
  };

  const headingCells = ["#", "Title", "Difficulty", "Approach", "Revision", "Time Spent", "Topic", "Pattern", "Collection", "Favorite", "Date", "Notes", "Link", "GitHub Link"]
    .map((h) => `<th x:autofilter="all" style="background:#0f172a;color:#ffffff;font-weight:bold;padding:10px 14px;border:1px solid #334155;font-size:12px;text-align:center;white-space:nowrap;font-family:'Segoe UI',sans-serif;">${h}</th>`)
    .join("");

  const dataRows = filtered.map((entry, i) => {
    const diff     = (entry.difficulty || "").toLowerCase();
    const rowStyle = diffStyle[diff] || "background:#f8fafc;";
    const tdStyle  = `padding:8px 12px;border:1px solid #cbd5e1;font-size:11.5px;font-family:'Segoe UI',sans-serif;`;

    const problemUrl = (entry.url && entry.url.startsWith("http")) 
      ? entry.url 
      : `https://leetcode.com/problems/${entry.slug || ""}/`;
    const leetcodeCell = `<a href="${escapeHtml(problemUrl)}" style="color:#0284c7;text-decoration:underline;font-weight:600;">Open Link</a>`;

    const solvesForThisProblem = history.filter(h => h.slug === entry.slug);
    
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
