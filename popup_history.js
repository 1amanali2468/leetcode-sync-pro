// popup_history.js – Handles solve history panel rendering and note edits.
// Loaded as an ES module by popup.js.

import { el, STORAGE_KEYS, filterState } from "./popup.js";
import { escapeHtml, isSafeUrl, approachDisplayName, getValidIdToken } from "./popup_helpers.js";
import { renderStats, formatRelativeDate } from "./popup_stats.js";
import { getFirestoreApiUrl } from "./firebase-config.js";
import { renderCollectionOptions } from "./popup_sheets.js";

export function openNotesModal(entry, approachLabel) {
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
      const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
      const hist = storedHistory[STORAGE_KEYS.history] || [];
      const updatedHistory = hist.map((h) => {
        if (h.slug === entry.slug && h.approach === entry.approach) {
          return { ...h, notes: newNotes };
        }
        return h;
      });
      await chrome.storage.local.set({ [STORAGE_KEYS.history]: updatedHistory });

      entry.notes = newNotes;

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

export async function renderHistory() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
  let history = stored[STORAGE_KEYS.history] || [];
  const originalLen = history.length;

  history = history.filter(entry => {
    if (entry.isStarredOnly) return false;
    const cleanApp = (entry.approach || "").toLowerCase().trim();
    return cleanApp && !cleanApp.includes("notes") && !cleanApp.includes("description") && cleanApp !== "approaches";
  });

  let gfgUpdated = false;
  history.forEach(entry => {
    const title = entry.title || "";
    const slug  = entry.slug  || "";

    const trailingNum = title.match(/(\d+)$/);
    if (trailingNum && (entry.id === "0" || entry.id === 0 || !entry.url)) {
      const cleanTitle = title.slice(0, title.length - trailingNum[1].length).trim();
      const cleanSlug  = slug.replace(/-?\d+$/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+$/, "");
      entry.id    = "";
      entry.title = cleanTitle || title;
      entry.slug  = cleanSlug  || slug;
      entry.url   = `https://www.geeksforgeeks.org/problems/${cleanSlug || slug}/1`;
      gfgUpdated  = true;
    }

    if ((entry.url || "").includes("geeksforgeeks") && (entry.id === "0" || entry.id === 0)) {
      entry.id   = "";
      gfgUpdated = true;
    }

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

  const uniqueMap = new Map();
  history.forEach((entry) => {
    const key = `${entry.slug}-${entry.approach}`;
    const existing = uniqueMap.get(key);
    if (!existing || new Date(entry.savedAt) > new Date(existing.savedAt)) {
      uniqueMap.set(key, entry);
    }
  });
  const displayedHistory = Array.from(uniqueMap.values());
  displayedHistory.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));

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
        <a class="history-item-title day-details-title-link" href="${safeProblemUrl}" target="_blank" title="Open Problem">${entry.id && entry.id !== "0" && entry.id !== "0" && entry.id !== 0 ? escapeHtml(entry.id) + ". " : ""}${escapedTitle}</a>
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

    const delBtn = item.querySelector(".history-delete-btn");
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const slug = delBtn.dataset.slug;
      const approach = delBtn.dataset.approach;
      const appName = approachDisplayName(approach);
      
      if (confirm(`Delete history record for "${entry.title}" (${appName})?`)) {
        const version = entry.version || 1;
        const updated = history.filter((h) => !(h.slug === slug && h.approach === approach && (h.version || 1) === version));
        await chrome.storage.local.set({ [STORAGE_KEYS.history]: updated });

        const safeId = `${slug}-${approach}-v${version}`.replace(/[^a-zA-Z0-9_-]/g, "");
        const storedDeletes = await chrome.storage.local.get("deletedSolves");
        const currentDeletes = storedDeletes.deletedSolves || [];
        await chrome.storage.local.set({ deletedSolves: [...new Set([...currentDeletes, safeId])] });
        
        const authData = await chrome.storage.local.get("auth_user");
        const authUser = authData.auth_user;
        if (authUser && authUser.uid) {
          const idToken = await getValidIdToken(authUser);
          if (idToken) {
            const uid = authUser.uid;
            const baseUrl = getFirestoreApiUrl();
            
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
