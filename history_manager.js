// history_manager.js - Centralized module for managing solve history, bookmarks, and list annotations.

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

export async function toggleProblemFromList(problem, listName, add) {
  const STORAGE_KEY = "leetsyncHistory";
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  let history = stored[STORAGE_KEY] || [];
  let updated = false;

  const targetSlug = normalizeProblemSlug(problem.slug, problem.leetcodeUrl || problem.url);

  history = history.map(h => {
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
      const isFavorite = lists.length > 0;
      return { ...h, starredLists: lists, isFavorite };
    }
    return h;
  });

  if (!updated && add) {
    const nowStr = new Date().toISOString();
    const newEntry = {
      id: "",
      title: problem.title,
      slug: problem.slug,
      difficulty: problem.difficulty || "Medium",
      url: problem.leetcodeUrl || problem.url || "",
      savedAt: nowStr,
      approach: "oa",
      language: "python",
      notes: "",
      githubUrl: "",
      isFavorite: true,
      starredLists: [listName],
      revisionCount: 1,
      revisionCompleted: false,
      revisionCompletedAt: null,
      readmePath: "",
      isStarredOnly: true // Key flag: starred but not solved
    };
    history.unshift(newEntry);
  }

  // Clean up any entry that is starred-only and has no more active stars/favorites
  history = history.filter(h => {
    if (h.isStarredOnly && !h.isFavorite && (!h.starredLists || h.starredLists.length === 0)) {
      return false; // remove
    }
    return true;
  });

  await chrome.storage.local.set({ [STORAGE_KEY]: history });
  return history;
}

export async function toggleProblemCompletion(problem, completed) {
  const STORAGE_KEY = "leetsyncHistory";
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  let history = stored[STORAGE_KEY] || [];
  const targetSlug = normalizeProblemSlug(problem.slug, problem.leetcodeUrl || problem.url);

  if (completed) {
    const existingIndex = history.findIndex(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug);
    if (existingIndex !== -1) {
      const entry = history[existingIndex];
      if (entry.isStarredOnly) {
        // Promote starred-only entry to completed solve
        entry.isStarredOnly = false;
        entry.savedAt = new Date().toISOString(); // Set solved date
      }
    } else {
      // Create new completed solve entry
      const nowStr = new Date().toISOString();
      const newEntry = {
        id: "",
        title: problem.title,
        slug: problem.slug,
        difficulty: problem.difficulty || "Medium",
        url: problem.leetcodeUrl || problem.url || "",
        savedAt: nowStr,
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
      };
      history.unshift(newEntry);
    }
  } else {
    // Unticking the problem
    const matchingEntries = history.filter(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug);
    const hasStars = matchingEntries.some(h => h.isFavorite || (h.starredLists && h.starredLists.length > 0));

    // Filter out all matching entries from local history
    history = history.filter(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) !== targetSlug);

    // Queue doc ids to delete from Firestore
    const docIdsToDelete = [...new Set(matchingEntries.map(entry =>
      `${entry.slug}-${entry.approach || "oa"}-v${entry.version || 1}`.replace(/[^a-zA-Z0-9_-]/g, "")
    ))];
    const storedDeletes = await chrome.storage.local.get("deletedSolves");
    const currentDeletes = storedDeletes.deletedSolves || [];
    await chrome.storage.local.set({ deletedSolves: [...new Set([...currentDeletes, ...docIdsToDelete])] });

    if (hasStars) {
      // If the problem was starred, keep a starred-only placeholder
      const starEntry = matchingEntries.find(h => h.isFavorite || (h.starredLists && h.starredLists.length > 0)) || matchingEntries[0];
      const placeholder = {
        ...starEntry,
        isStarredOnly: true,
        id: "",
        githubUrl: ""
      };
      history.unshift(placeholder);
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: history });
  return history;
}

export function mergeSolveWithStars(history, entry) {
  const targetSlug = normalizeProblemSlug(entry.slug, entry.url || entry.leetcodeUrl);
  const existingEntries = history.filter(h => normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug);
  
  existingEntries.forEach(ex => {
    if (ex.isFavorite) entry.isFavorite = true;
    if (ex.starredLists && ex.starredLists.length > 0) {
      if (!entry.starredLists) entry.starredLists = [];
      ex.starredLists.forEach(list => {
        if (!entry.starredLists.includes(list)) entry.starredLists.push(list);
      });
    }
  });

  const newHistory = history.filter(h => !(normalizeProblemSlug(h.slug, h.url || h.leetcodeUrl) === targetSlug && h.isStarredOnly));
  return newHistory;
}

export function mergeNewSolveIntoHistory(history, entry) {
  // Normalize incoming entry's slug to clean form before persisting
  const targetSlug = normalizeProblemSlug(entry.slug, entry.url);
  entry.slug = targetSlug || entry.slug;

  // Use direct slug comparison (consistent with original behaviour) for existing entries
  const slugEntries = history.filter((h) => h.slug === targetSlug || normalizeProblemSlug(h.slug, h.url) === targetSlug);
  let maxRev = 0;
  let existingCustomDueDate = null;

  slugEntries.forEach((h) => {
    if (h.revisionCount && h.revisionCount > maxRev) {
      maxRev = h.revisionCount;
    }
    if (h.customRevisionDueDate) {
      existingCustomDueDate = h.customRevisionDueDate;
    }
  });

  const newRevCount = maxRev + 1;
  const nowStr = new Date().toISOString();
  const todayStrVal = nowStr.split("T")[0];

  entry.revisionCount = newRevCount;
  entry.lastRevisionAt = nowStr;

  if (existingCustomDueDate) {
    entry.customRevisionDueDate = existingCustomDueDate;
    entry.revisionCompleted = true;
    entry.revisionCompletedAt = todayStrVal;
  }

  const entryDateStr = entry.savedAt ? entry.savedAt.split("T")[0] : todayStrVal;
  const dupIndex = history.findIndex(
    (h) => (h.slug === targetSlug || normalizeProblemSlug(h.slug, h.url) === targetSlug) &&
           h.approach === entry.approach &&
           (h.version || 1) === (entry.version || 1) &&
           (h.savedAt ? h.savedAt.split("T")[0] : "") === entryDateStr
  );

  if (dupIndex !== -1) {
    entry.isFavorite = entry.isFavorite || history[dupIndex].isFavorite;
    history.splice(dupIndex, 1);
  }

  const existingEntries = history.filter(h => h.slug === targetSlug || normalizeProblemSlug(h.slug, h.url) === targetSlug);
  existingEntries.forEach(ex => {
    if (ex.isFavorite) entry.isFavorite = true;
    if (ex.starredLists && ex.starredLists.length > 0) {
      if (!entry.starredLists) entry.starredLists = [];
      ex.starredLists.forEach(list => {
        if (!entry.starredLists.includes(list)) entry.starredLists.push(list);
      });
    }
  });

  let cleanHistory = history.filter(h => !((h.slug === targetSlug || normalizeProblemSlug(h.slug, h.url) === targetSlug) && h.isStarredOnly));

  cleanHistory.unshift(entry);

  cleanHistory.forEach((h) => {
    if (h.slug === targetSlug || normalizeProblemSlug(h.slug, h.url) === targetSlug) {
      h.revisionCount = newRevCount;
      h.lastRevisionAt = nowStr;
      if (existingCustomDueDate) {
        h.customRevisionDueDate = existingCustomDueDate;
        h.revisionCompleted = true;
        h.revisionCompletedAt = todayStrVal;
      }
      if (h.approach === entry.approach) {
        h.notes = entry.notes;
      }
    }
  });

  if (cleanHistory.length > 5000) cleanHistory.pop();
  return cleanHistory;
}
