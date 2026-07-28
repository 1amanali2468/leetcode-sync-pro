// history_manager.js
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
    s = s.replace(/-?\d+$/, "").replace(/-+$/, "");
  }
  return s;
}

export function isProblemCompleted(solves) {
  if (!solves || !solves.length) return false;
  return solves.some(s => !s.isStarredOnly);
}

export function isProblemStarred(solves) {
  if (!solves || !solves.length) return false;
  return solves.some(s => s.isFavorite || (s.starredLists && s.starredLists.length > 0));
}

// Background Mutation Wrappers (To prevent storage race conditions)

export async function toggleProblemFromList(problem, listName, add) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "LEETSYNC_UPDATE_HISTORY", action: "TOGGLE_LIST", payload: { problem, listName, add } }, (response) => {
      if (response && response.ok) resolve(response.history);
      else reject(new Error(response?.error || "Unknown error toggling list"));
    });
  });
}

export async function toggleProblemBookmark(problem, add) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "LEETSYNC_UPDATE_HISTORY", action: "TOGGLE_BOOKMARK", payload: { problem, add } }, (response) => {
      if (response && response.ok) resolve(response.history);
      else reject(new Error(response?.error || "Unknown error toggling bookmark"));
    });
  });
}

export async function toggleProblemCompletion(problem, completed) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "LEETSYNC_UPDATE_HISTORY", action: "TOGGLE_COMPLETION", payload: { problem, completed } }, (response) => {
      if (response && response.ok) resolve(response.history);
      else reject(new Error(response?.error || "Unknown error toggling completion"));
    });
  });
}

export async function deleteHistoryEntry(docId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "LEETSYNC_UPDATE_HISTORY", action: "DELETE_ENTRY", payload: { docId } }, (response) => {
      if (response && response.ok) resolve(response.history);
      else reject(new Error(response?.error || "Unknown error deleting entry"));
    });
  });
}

// Pure Logic functions for background.js to apply

export function applyToggleList(history, problem, listName, add) {
  const targetSlug = normalizeProblemSlug(problem.slug, problem.leetcodeUrl || problem.url);
  let updated = false;
  const newHistory = history.map(h => {
    const s = normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl);
    if (s === targetSlug) {
      updated = true;
      let lists = h.starredLists || [];
      if (h.isFavorite && !lists.map(l => l.toLowerCase()).includes("favorite")) {
        lists.push("Favorite");
      }
      if (add) {
        if (!lists.map(l => l.toLowerCase()).includes(listName.toLowerCase())) {
          lists.push(listName);
        }
      } else {
        lists = lists.filter(l => l.toLowerCase() !== listName.toLowerCase());
      }
      // If favorite is removed via list, update isFavorite
      if (!add && listName.toLowerCase() === "favorite") h.isFavorite = false;
      // If favorite is added via list, update isFavorite
      if (add && listName.toLowerCase() === "favorite") h.isFavorite = true;
      
      h.starredLists = lists;
    }
    return h;
  });

  if (!updated && add) {
    newHistory.unshift({
      id: "",
      title: problem.title,
      slug: problem.slug,
      difficulty: problem.difficulty || "Medium",
      url: problem.leetcodeUrl || problem.url || "",
      savedAt: null,
      approach: "oa",
      language: "python",
      notes: "",
      githubUrl: "",
      isFavorite: listName.toLowerCase() === "favorite",
      starredLists: [listName],
      isStarredOnly: true
    });
  }
  return newHistory;
}

export function applyToggleBookmark(history, problem, add) {
  const targetSlug = normalizeProblemSlug(problem.slug, problem.leetcodeUrl || problem.url);
  let updated = false;
  const newHistory = history.map(h => {
    if (normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug) {
      updated = true;
      h.isFavorite = add;
      let lists = h.starredLists || [];
      if (add) {
        if (!lists.map(l => l.toLowerCase()).includes("favorite")) lists.push("Favorite");
      } else {
        lists = lists.filter(l => l.toLowerCase() !== "favorite");
      }
      h.starredLists = lists;
    }
    return h;
  });

  if (!updated && add) {
    newHistory.unshift({
      id: "",
      title: problem.title,
      slug: problem.slug,
      difficulty: problem.difficulty || "Medium",
      url: problem.leetcodeUrl || problem.url || "",
      savedAt: null,
      approach: "oa",
      language: "python",
      notes: "",
      githubUrl: "",
      isFavorite: true,
      starredLists: ["Favorite"],
      isStarredOnly: true
    });
  }
  return newHistory;
}

export function applyToggleCompletion(history, problem, completed) {
  const targetSlug = normalizeProblemSlug(problem.slug, problem.leetcodeUrl || problem.url);
  let newHistory = [...history];
  let docIdsToDelete = [];

  if (completed) {
    const existingIndex = newHistory.findIndex(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug);
    if (existingIndex !== -1) {
      const entry = newHistory[existingIndex];
      if (entry.isStarredOnly) {
        entry.isStarredOnly = false;
        entry.savedAt = new Date().toISOString();
      }
    } else {
      newHistory.unshift({
        id: "",
        title: problem.title,
        slug: problem.slug,
        difficulty: problem.difficulty || "Medium",
        url: problem.leetcodeUrl || problem.url || "",
        savedAt: new Date().toISOString(),
        approach: "oa",
        language: "python",
        notes: "",
        githubUrl: "",
        isFavorite: false,
        revisionCount: 1,
        revisionCompleted: false,
        revisionCompletedAt: null,
        readmePath: "",
        isStarredOnly: false
      });
    }
  } else {
    const matchingEntries = newHistory.filter(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug);
    const hasStars = matchingEntries.some(h => h.isFavorite || (h.starredLists && h.starredLists.length > 0));
    newHistory = newHistory.filter(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) !== targetSlug);
    docIdsToDelete = [...new Set(matchingEntries.map(entry =>
      `${entry.slug}-${entry.approach || "oa"}-v${entry.version || 1}`.replace(/[^a-zA-Z0-9_-]/g, "")
    ))];
    if (hasStars) {
      const starEntry = matchingEntries.find(h => h.isFavorite || (h.starredLists && h.starredLists.length > 0)) || matchingEntries[0];
      newHistory.unshift({
        id: "",
        title: starEntry.title,
        slug: starEntry.slug,
        difficulty: starEntry.difficulty || "Medium",
        url: starEntry.url || "",
        savedAt: null,
        approach: "oa",
        language: "python",
        notes: "",
        githubUrl: "",
        isFavorite: starEntry.isFavorite,
        starredLists: starEntry.starredLists || (starEntry.isFavorite ? ["Favorite"] : []),
        isStarredOnly: true
      });
    }
  }
  return { history: newHistory, deletes: docIdsToDelete };
}

export function applyDeleteEntry(history, docId) {
  const newHistory = history.filter(h => {
    const entryId = `${h.slug}-${h.approach || "oa"}-v${h.version || 1}`.replace(/[^a-zA-Z0-9_-]/g, "");
    return entryId !== docId;
  });
  return newHistory;
}

export function mergeSolveWithStars(existingEntry, newEntry) {
  const merged = { ...newEntry };
  if (existingEntry.isFavorite) merged.isFavorite = true;
  if (existingEntry.starredLists && existingEntry.starredLists.length > 0) {
    const currentLists = new Set(merged.starredLists || []);
    existingEntry.starredLists.forEach(l => currentLists.add(l));
    merged.starredLists = Array.from(currentLists);
  }
  return merged;
}

export function mergeNewSolveIntoHistory(history, newEntry) {
  let existingIndex = -1;
  const targetApproach = (newEntry.approach === "custom" ? newEntry.customName : newEntry.approach).toLowerCase();
  
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    if (h.slug === newEntry.slug && h.approach.toLowerCase() === targetApproach && (h.version || 1) === (newEntry.version || 1)) {
      existingIndex = i;
      break;
    }
  }
  if (existingIndex !== -1) {
    history[existingIndex] = mergeSolveWithStars(history[existingIndex], newEntry);
  } else {
    const placeholderIndex = history.findIndex(h => h.slug === newEntry.slug && h.isStarredOnly);
    if (placeholderIndex !== -1) {
      newEntry = mergeSolveWithStars(history[placeholderIndex], newEntry);
      history.splice(placeholderIndex, 1);
    }
    history.unshift(newEntry);
  }
  return history;
}
