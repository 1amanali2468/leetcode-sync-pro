// dashboard_modules/revision.js - Revision Scheduler Controller
import { el, STORAGE_KEYS } from "./state.js";
import { syncCloudData } from "./settings.js";

export function getRevisionDueDate(entry) {
  if (entry.customRevisionDueDate) {
    const d = new Date(entry.customRevisionDueDate);
    if (!isNaN(d.getTime())) return d;
  }
  if (!entry.savedAt) return null;
  const d = new Date(entry.savedAt);
  const rev = entry.revisionCount || 1;
  let offset = 3;
  if (rev === 2) offset = 7;
  else if (rev === 3) offset = 15;
  else if (rev >= 4) offset = 30;

  d.setDate(d.getDate() + offset);
  return d;
}

export async function renderRevisionSchedule() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = data[STORAGE_KEYS.history] || [];

  el.revisionListOverdue.innerHTML = "";
  el.revisionListToday.innerHTML = "";
  el.revisionListUpcoming.innerHTML = "";

  const starred = history.filter(h => h.isFavorite);
  
  let overdueCount = 0;
  let todayCount = 0;
  let upcomingCount = 0;

  const todayStr = new Date().toDateString();
  const nowTime = new Date().getTime();

  starred.forEach(entry => {
    const dueDate = getRevisionDueDate(entry);
    if (!dueDate) return;

    const dueStr = dueDate.toDateString();
    const item = document.createElement("div");
    item.className = "revision-item";

    const left = document.createElement("div");
    left.style = "display:flex; flex-direction:column; gap:2px;";
    const link = document.createElement("a");
    link.href = entry.url || "#";
    link.target = "_blank";
    link.className = "revision-item-title";
    link.textContent = entry.title;
    left.appendChild(link);

    const meta = document.createElement("span");
    meta.className = "revision-item-meta";
    meta.textContent = `Due: ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} (Rev #${entry.revisionCount || 1})`;
    left.appendChild(meta);
    item.appendChild(left);

    // Done/Checked Button
    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn-ico";
    doneBtn.title = "Done with this Revision Cycle";
    doneBtn.textContent = "✔️";
    doneBtn.addEventListener("click", async () => {
      await incrementRevisionCycle(entry.slug);
      renderRevisionSchedule();
    });
    item.appendChild(doneBtn);

    if (dueStr === todayStr) {
      todayCount++;
      el.revisionListToday.appendChild(item);
    } else if (dueDate.getTime() < nowTime) {
      overdueCount++;
      el.revisionListOverdue.appendChild(item);
    } else {
      upcomingCount++;
      el.revisionListUpcoming.appendChild(item);
    }
  });

  if (overdueCount === 0) el.revisionListOverdue.innerHTML = `<div class="empty-state">No pending overdue revisions.</div>`;
  if (todayCount === 0) el.revisionListToday.innerHTML = `<div class="empty-state">No reviews scheduled for today.</div>`;
  if (upcomingCount === 0) el.revisionListUpcoming.innerHTML = `<div class="empty-state">No future revisions scheduled.</div>`;
}

export async function incrementRevisionCycle(slug) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = data[STORAGE_KEYS.history] || [];

  history = history.map(h => {
    if (h.slug === slug) {
      const currentRev = h.revisionCount || 1;
      return {
        ...h,
        revisionCount: currentRev + 1,
        savedAt: new Date().toISOString() // reset solve date to trigger next spaced offset
      };
    }
    return h;
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
  await syncCloudData();
}
