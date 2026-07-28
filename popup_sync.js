// popup_sync.js – Handles GitHub repository settings persistence, sync cloud data, and README syncing/parsing.
// Loaded as an ES module by popup.js.

import { el, STORAGE_KEYS, applySettings } from "./popup.js";
import { escapeHtml, isSafeUrl, approachDisplayName, getValidIdToken, convertFromFirestoreFields, convertToFirestoreFields, normalizeProblemSlug } from "./popup_helpers.js";
import { getLocalDateString, todayStr, renderStats } from "./popup_stats.js";
import { renderHistory } from "./popup_history.js";
import { renderCalendar } from "./popup_calendar.js";
import { getFirestoreApiUrl } from "./firebase-config.js";
import { batchWriteToFirestore } from "./firestore_sync.js";


export async function persistSettings() {
  const settings = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const existing = stored[STORAGE_KEYS.settings] || {};
  const src = el.profileAvatar.src;
  return {
    token:     existing.token || "",
    clientId:  existing.clientId || "",
    owner:     el.owner.value.trim(),
    repo:      el.repo.value.trim(),
    branch:    el.branch.value.trim(),
    basePath:  el.basePath.value.trim(),
    avatarUrl: src && !src.endsWith("popup.html") ? src : "",
    streakReminderEnabled: el.streakReminderEnabled ? el.streakReminderEnabled.checked : true,
  };
}

export async function disconnectGitHub() {
  if (!confirm("Disconnect from GitHub?")) return;
  await chrome.storage.local.remove(["auth_user", "githubSettings", "leetsyncSettings", "github_token", "github_profile"]);
  window.location.reload();
}

export async function loadGitHubRepositories(token, selectedRepo) {
  if (!token) return;
  el.repoSelectContainer.classList.remove("hidden");
  el.repo.classList.add("hidden");
  el.toggleNewRepoBtn.classList.remove("hidden");
  el.repoSelect.innerHTML = '<option value="">-- Loading Repos --</option>';

  try {
    const response = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated",
      { headers: githubHeaders(token) }
    );
    if (!response.ok) throw new Error(`Failed to load repos: ${response.status}`);
    const repos = await response.json();
    el.repoSelect.innerHTML = '<option value="">-- Select Repo --</option>';
    repos.forEach((repo) => {
      const opt = document.createElement("option");
      opt.value = repo.name;
      opt.textContent = repo.name;
      if (repo.name === selectedRepo) opt.selected = true;
      el.repoSelect.appendChild(opt);
    });
    if (selectedRepo && !repos.some((r) => r.name === selectedRepo)) {
      const opt = document.createElement("option");
      opt.value = selectedRepo;
      opt.textContent = selectedRepo;
      opt.selected = true;
      el.repoSelect.appendChild(opt);
    }
  } catch {
    el.repoSelectContainer.classList.add("hidden");
    el.repo.classList.remove("hidden");
    el.toggleNewRepoBtn.classList.add("hidden");
  }
}

export async function createNewRepository() {
  const repoName = el.newRepoName.value.trim();
  if (!repoName) { setResult("Please enter a repository name.", "error"); return; }

  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const settings = stored[STORAGE_KEYS.settings] || {};
  const token = settings.token;
  if (!token) {
    setResult("GitHub token not found. Please log in again.", "error");
    return;
  }

  el.createNewRepoBtn.disabled = true;
  el.createNewRepoBtn.textContent = "Creating...";
  try {
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: githubHeaders(token),
      body: JSON.stringify({ name: repoName, private: true, auto_init: true }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || `Failed to create repo: ${response.status}`);
    }
    const newRepo = await response.json();
    setResult(`Repository '${newRepo.name}' created!`, "success");
    el.newRepoArea.classList.add("hidden");
    el.repoSelectContainer.classList.remove("hidden");
    el.toggleNewRepoBtn.classList.remove("hidden");
    el.repo.value = newRepo.name;
    await persistSettings();
    await loadGitHubRepositories(token, newRepo.name);
  } catch (error) {
    setResult(error.message, "error");
  } finally {
    el.createNewRepoBtn.disabled = false;
    el.createNewRepoBtn.textContent = "Create";
  }
}

function setResult(msg, type) {
  el.resultText.textContent = msg;
  el.resultText.className = `result ${type}`.trim();
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function syncCloudData() {
  const syncBtn = document.getElementById("btnManualSync");
  const statusText = document.getElementById("cloudSyncStatusText");

  if (statusText) {
    statusText.textContent = "Syncing...";
    statusText.style.color = "var(--clr-primary)";
  }

  if (syncBtn) {
    syncBtn.classList.add("spinning");
    syncBtn.disabled = true;
  }

  const storedData = await chrome.storage.local.get(["auth_user", STORAGE_KEYS.history, STORAGE_KEYS.settings]);
  const authUser = storedData.auth_user;
  if (!authUser || !authUser.uid) {
    if (syncBtn) {
      syncBtn.classList.remove("spinning");
      syncBtn.disabled = false;
    }
    if (statusText) {
      statusText.textContent = "Not logged in";
      statusText.style.color = "#dc2626";
    }
    return;
  }

  const idToken = await getValidIdToken(authUser);
  if (!idToken) {
    if (syncBtn) {
      syncBtn.classList.remove("spinning");
      syncBtn.disabled = false;
    }
    if (statusText) {
      statusText.textContent = "Session expired. Log in again.";
      statusText.style.color = "#dc2626";
    }
    return;
  }

  const uid = authUser.uid;
  const baseUrl = getFirestoreApiUrl();
  const headers = { 
    "Content-Type": "application/json",
    "Authorization": `Bearer ${idToken}`
  };

  try {
    const settingsRes = await fetch(`${baseUrl}/users/${uid}`, { headers });
    if (settingsRes.ok) {
      const settingsDoc = await settingsRes.json();
      const cloudSettings = convertFromFirestoreFields(settingsDoc.fields || {});
      if (cloudSettings && Object.keys(cloudSettings).length > 0) {
        const localStored = await chrome.storage.local.get("githubSettings");
        const localSettings = localStored.githubSettings || {};
        
        const mergedSettings = { ...cloudSettings, ...localSettings };
        await chrome.storage.local.set({ githubSettings: mergedSettings });
        applySettings(mergedSettings);
      }
    } else if (settingsRes.status !== 404) {
      console.error(`Failed to fetch settings from Firestore: ${settingsRes.status}`);
    }

    const cloudHistory = [];
    let pageToken = "";
    let fetchSuccess = true;

    do {
      const url = `${baseUrl}/users/${uid}/history?pageSize=300` + (pageToken ? `&pageToken=${pageToken}` : "");
      const historyRes = await fetch(url, { headers });

      if (historyRes.ok) {
        const historyDoc = await historyRes.json();
        const docs = (historyDoc.documents || []).map(doc => {
          return convertFromFirestoreFields(doc.fields || {});
        });
        cloudHistory.push(...docs);
        pageToken = historyDoc.nextPageToken || "";
      } else {
        console.error(`Failed to fetch history page from Firestore: ${historyRes.status}`);
        fetchSuccess = false;
        if (statusText) {
          statusText.textContent = `❌ Error (History: ${historyRes.status})`;
          statusText.style.color = "#dc2626";
        }
        break;
      }
    } while (pageToken);

    if (fetchSuccess) {
      const localHistory = storedData[STORAGE_KEYS.history] || [];

      const merged = [...localHistory];
      cloudHistory.forEach(cloudItem => {
        const idx = merged.findIndex(h => h.slug === cloudItem.slug && h.approach === cloudItem.approach);
        if (idx !== -1) {
          const localDate = new Date(merged[idx].savedAt || 0);
          const cloudDate = new Date(cloudItem.savedAt || 0);
          if (cloudDate > localDate) {
            merged[idx] = cloudItem;
          } else if (cloudDate.getTime() === localDate.getTime()) {
            merged[idx] = { ...merged[idx], ...cloudItem };
          }
        } else {
          merged.push(cloudItem);
        }
      });

      await chrome.storage.local.set({ [STORAGE_KEYS.history]: merged });
      
      const updates = [];
      for (const localItem of localHistory) {
        const cloudMatch = cloudHistory.find(c => c.slug === localItem.slug && c.approach === localItem.approach && (c.version || 1) === (localItem.version || 1));
        const needsUpload = !cloudMatch || 
                            new Date(localItem.savedAt || 0) > new Date(cloudMatch.savedAt || 0) ||
                            (localItem.notes || "") !== (cloudMatch.notes || "") ||
                            localItem.isFavorite !== cloudMatch.isFavorite;

        if (needsUpload) {
          updates.push(localItem);
        }
      }

      if (updates.length > 0) {
        await batchWriteToFirestore(uid, idToken, { updates });
      }

      renderHistory();
      renderStats();
      renderCalendar();
      if (statusText) {
        statusText.textContent = "✅ Connected & Synced";
        statusText.style.color = "#22c55e";
      }
    }
  } catch (err) {
    console.error("Cloud sync failed:", err);
    if (statusText) {
      statusText.textContent = `❌ Error: ${err.message}`;
      statusText.style.color = "#dc2626";
    }
  } finally {
    if (syncBtn) {
      syncBtn.classList.remove("spinning");
      syncBtn.disabled = false;
    }
  }
}

export async function fetchGitHubRepoSolves() {
  const statusText = document.getElementById("repoFetchStatus");
  const btn = document.getElementById("btnFetchGitHubRepoSolves");

  if (!statusText || !btn) return;

  statusText.textContent = "⏳ Fetching settings...";
  statusText.style.color = "var(--clr-primary)";
  btn.disabled = true;

  try {
    const stored = await chrome.storage.local.get(["auth_user", "githubSettings", STORAGE_KEYS.history]);
    const authUser = stored.auth_user;
    const settings = stored.githubSettings || {};
    const localHistory = stored[STORAGE_KEYS.history] || [];

    if (!authUser || !authUser.uid) {
      throw new Error("You must be logged in to sync solved history.");
    }

    const token = settings.token;
    const owner = settings.owner;
    const repo = settings.repo;
    const branch = settings.branch || "main";

    if (!token || !owner || !repo) {
      throw new Error("GitHub integration settings (token, owner, repo) are missing.");
    }

    statusText.textContent = "⏳ Fetching repository file list...";
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/vnd.github.v3+json"
      }
    });

    if (!treeRes.ok) {
      throw new Error(`Failed to fetch Git tree: ${treeRes.status} ${treeRes.statusText}`);
    }

    const treeData = await treeRes.json();
    const files = treeData.tree || [];

    const readmeFiles = files.filter(f => f.type === "blob" && f.path.toLowerCase().endsWith("readme.md"));

    const importedHistory = [];

    if (readmeFiles.length > 0) {
      statusText.textContent = `⏳ Found ${readmeFiles.length} README files. Importing contents...`;
      
      for (let i = 0; i < readmeFiles.length; i++) {
        const file = readmeFiles[i];
        statusText.textContent = `⏳ Syncing README ${i + 1}/${readmeFiles.length}: ${file.path}`;

        try {
          const fileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${file.sha}`, {
            headers: {
              "Authorization": `token ${token}`,
              "Accept": "application/vnd.github.v3+json"
            }
          });

          if (fileRes.ok) {
            const fileData = await fileRes.json();
            const base64Content = fileData.content.replace(/\s/g, "");
            const decodedText = decodeURIComponent(escape(atob(base64Content)));
            
            const parsedSolves = parseReadmeMetadata(decodedText, file.path, files, { owner, repo, branch });
            if (parsedSolves && parsedSolves.length > 0) {
              importedHistory.push(...parsedSolves);
            }
          }
        } catch (err) {
          console.error(`Failed to parse README at ${file.path}:`, err);
        }
      }
    }

    statusText.textContent = "⏳ Scanning code files in the repository for additional solves...";
    
    const codeExtensions = {
      "py": "python", "py3": "python3", "cpp": "cpp", "cc": "cpp", "cxx": "cpp",
      "java": "java", "js": "javascript", "ts": "typescript", "go": "go", "rs": "rust",
      "kt": "kotlin", "cs": "csharp"
    };

    const parsedSlugs = new Set();
    importedHistory.forEach(h => parsedSlugs.add(`${h.slug}-${h.approach}`));

    const projectFoldersBlacklist = [
      "node_modules", "venv", "env", ".venv", ".git", ".github", "build", "dist",
      "target", "bin", "obj", "public", "assets", "components", "views",
      "controllers", "models", "routes", "middlewares", "services", "utils", "helpers"
    ];

    const projectFilesBlacklist = [
      "index", "main", "app", "server", "client", "config", "setup", "manage",
      "utils", "helper", "test", "tests", "spec", "api", "package", "tsconfig",
      "gulpfile", "package-lock", "yarn", "vite.config", "next.config"
    ];

    files.forEach(file => {
      if (file.type !== "blob") return;
      
      const pathLower = file.path.toLowerCase();
      if (pathLower.startsWith(".") || pathLower.includes("/.") || pathLower.endsWith(".md") || pathLower.endsWith(".json") || pathLower.endsWith(".png") || pathLower.endsWith(".jpg") || pathLower.endsWith(".txt") || pathLower.endsWith(".css") || pathLower.endsWith(".html")) {
        return;
      }

      const parts = file.path.split("/");
      const hasBlacklistedFolder = parts.some(p => projectFoldersBlacklist.includes(p.toLowerCase()));
      if (hasBlacklistedFolder) return;

      const filename = parts.pop();
      const parentFolder = parts.pop() || "";

      const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
      if (!extMatch) return;
      const ext = extMatch[1].toLowerCase();
      const lang = codeExtensions[ext];
      if (!lang) return;

      const nameWithoutExt = filename.substring(0, filename.lastIndexOf(".")).toLowerCase();
      if (projectFilesBlacklist.includes(nameWithoutExt)) return;

      const startsWithDigits = parentFolder.match(/^\d+/) || filename.match(/^\d+/);
      
      const containsDSAKeywords = pathLower.includes("leetcode") || 
                                  pathLower.includes("solutions") || 
                                  pathLower.includes("problems") || 
                                  pathLower.includes("solved") || 
                                  pathLower.includes("dsa") || 
                                  pathLower.includes("coding") || 
                                  pathLower.includes("codeforces") || 
                                  pathLower.includes("gfg") || 
                                  pathLower.includes("algorithms") ||
                                  repo.toLowerCase().includes("leetcode") ||
                                  repo.toLowerCase().includes("solved") ||
                                  repo.toLowerCase().includes("dsa") ||
                                  repo.toLowerCase().includes("problems") ||
                                  repo.toLowerCase().includes("solutions");

      const parentPath = file.path.substring(0, file.path.lastIndexOf("/"));
      const hasSiblingReadme = readmeFiles.some(rf => {
        const rfParent = rf.path.substring(0, rf.path.lastIndexOf("/"));
        return rfParent === parentPath;
      });

      if (!startsWithDigits && !containsDSAKeywords && !hasSiblingReadme) {
        return;
      }

      let rawSlug = "";
      let problemId = "";

      if (parentFolder && parentFolder !== "leetcode" && parentFolder !== "solutions" && parentFolder !== "src" && parentFolder !== "dsa") {
        rawSlug = parentFolder;
      } else {
        rawSlug = filename.substring(0, filename.lastIndexOf("."));
      }

      const idMatch = rawSlug.match(/^(\d+)[-._]?/);
      if (idMatch) {
        problemId = parseInt(idMatch[1], 10).toString();
        rawSlug = rawSlug.substring(idMatch[0].length);
      }

      const slug = rawSlug.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      if (!slug) return;

      const title = slug.split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      let approach = "oa";
      const fnLower = filename.toLowerCase();
      if (fnLower.includes("brute") || fnLower.includes("bf")) approach = "bf";
      else if (fnLower.includes("better") || fnLower.includes("ba")) approach = "ba";
      else {
        const appMatch = fnLower.match(/-(optimal|brute|better|bf|ba|oa)-v\d+/);
        if (appMatch) {
          const m = appMatch[1];
          approach = m === "optimal" ? "oa" : (m === "better" ? "ba" : (m === "brute" ? "bf" : m));
        }
      }

      const uniqKey = `${slug}-${approach}`;
      if (parsedSlugs.has(uniqKey)) return;
      parsedSlugs.add(uniqKey);

      const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`;

      importedHistory.push({
        id: problemId,
        title: title,
        slug: slug,
        difficulty: "Medium",
        url: "",
        savedAt: new Date().toISOString(),
        approach: approach,
        notes: "",
        timeSpent: "",
        collection: "",
        topic: "Other",
        pattern: "None",
        githubUrl: githubUrl,
        isFavorite: false,
        revisionCount: 1,
        revisionCompleted: false,
        revisionCompletedAt: null
      });
    });

    if (importedHistory.length === 0) {
      throw new Error("Could not find or parse any solve records (READMEs or code files) in this repository.");
    }

    const mergedHistory = [...localHistory];
    importedHistory.forEach(importedItem => {
      const idx = mergedHistory.findIndex(h => h.slug === importedItem.slug && h.approach === importedItem.approach);
      if (idx !== -1) {
        const localDate = new Date(mergedHistory[idx].savedAt || 0);
        const importedDate = new Date(importedItem.savedAt || 0);
        if (importedDate > localDate) {
          mergedHistory[idx] = { ...mergedHistory[idx], ...importedItem };
        }
      } else {
        mergedHistory.push(importedItem);
      }
    });

    await chrome.storage.local.set({ [STORAGE_KEYS.history]: mergedHistory });

    statusText.textContent = `⏳ Merging with Firestore cloud database...`;
    await syncCloudData();

    statusText.textContent = `✅ Sync Complete! Imported/Synced ${importedHistory.length} items.`;
    statusText.style.color = "#22c55e";

    renderHistory();
    renderStats();
    renderCalendar();

  } catch (err) {
    statusText.textContent = `❌ Sync Failed: ${err.message}`;
    statusText.style.color = "#dc2626";
  } finally {
    btn.disabled = false;
  }
}

export function parseReadmeMetadata(markdown, filePath, allFiles, githubInfo = {}) {
  const { owner, repo, branch = "main" } = githubInfo;

  const titleMatch = markdown.match(/^#\s+(?:\[?(\d+)\]?[-.\s]+)?(.*)$/m);
  if (!titleMatch) return null;

  const problemId = titleMatch[1] || "";
  const problemTitle = titleMatch[2].trim();

  let difficulty = "Medium";
  const diffTableMatch = markdown.match(/Difficulty-(Easy|Medium|Hard)/i);
  if (diffTableMatch) {
    difficulty = diffTableMatch[1];
  } else {
    const diffMatch = markdown.match(/Difficulty:\s*\*?([a-zA-Z]+)\*?/i) || markdown.match(/\*\*Difficulty\*\*:\s*([^\n\r]+)/i);
    if (diffMatch) difficulty = diffMatch[1].trim();
  }

  let url = "";
  const urlTableMatch = markdown.match(/\[(?:LeetCode|CodeForces|GeeksforGeeks|Coding Platform|Link)\]\((https?:\/\/[^\)]+)\)/i);
  if (urlTableMatch) {
    url = urlTableMatch[1].trim();
  } else {
    const urlMatch = markdown.match(/\*\*LeetCode\*\*:\s*\[[^\]]+\]\(([^)]+)\)/i) || markdown.match(/leetcode\.com\/problems\/([a-zA-Z0-9-]+)/i);
    if (urlMatch) {
      url = urlMatch[0].startsWith("http") ? urlMatch[0] : `https://${urlMatch[0]}`;
    }
  }

  let topics = [];
  let mainPattern = "None";
  const tableRowMatch = markdown.match(/\|\s*\[[^\]]+\]\([^\)]+\)\s*\|\s*!\[[^\]]*\]\([^\)]+\)\s*\|\s*([^|]+)\|\s*([^|]+)\|/i);
  if (tableRowMatch) {
    const rawTopics = tableRowMatch[1].replace(/`/g, "").trim();
    topics = rawTopics ? rawTopics.split(",").map(t => t.trim()) : [];
    mainPattern = tableRowMatch[2].replace(/`/g, "").trim() || "None";
  } else {
    const topicMatch = markdown.match(/\*\*Topics\*\*:\s*([^\n\r]+)/i);
    topics = topicMatch ? topicMatch[1].split(",").map(t => t.trim()) : [];
    const patternMatchMain = markdown.match(/\*\*Pattern\*\*:\s*([^\n\r]+)/i);
    mainPattern = patternMatchMain ? patternMatchMain[1].trim() : "None";
  }

  const pathParts = filePath.split("/");
  const folderName = pathParts[pathParts.length - 2] || "";
  const slug = folderName.replace(/^\d+-/, "") || problemTitle.toLowerCase().replace(/\s+/g, "-");

  const solvesList = [];
  const APPROACHES_HEADER = "## Approaches";

  if (markdown.includes(APPROACHES_HEADER)) {
    const splitIdx = markdown.indexOf(APPROACHES_HEADER);
    const approachesRaw = markdown.slice(splitIdx + APPROACHES_HEADER.length).trim();

    const blocks = approachesRaw.split("### ").slice(1);

    blocks.forEach(block => {
      const lines = block.split("\n");
      const approachLabel = lines[0].trim().toLowerCase();
      if (!approachLabel || approachLabel.includes("notes") || approachLabel.includes("description") || approachLabel === "approaches") return;

      const timeMatch = block.match(/Time(?:\s*Complexity)?\s*\|\s*`([^`]+)`/i);
      const spaceMatch = block.match(/Space(?:\s*Complexity)?\s*\|\s*`([^`]+)`/i);
      const timeSpentMatch = block.match(/Time\s*Spent\s*\|\s*`([^`]+)`/i);
      const collectionMatch = block.match(/Collection\s*\|\s*`([^`]+)`/i);
      const topicMatchSingle = block.match(/Topic(?:\s*Tag)?\s*\|\s*`([^`]+)`/i);
      const patternMatch = block.match(/Pattern(?:\s*Used)?\s*\|\s*`([^`]+)`/i);

      let notes = "";
      const notesMatch = block.match(/####?\s*(?:📝\s*)?Notes/i);
      if (notesMatch) {
        const idx = notesMatch.index;
        const dividerText = notesMatch[0];
        notes = block.substring(idx + dividerText.length).trim();
        notes = notes.replace(/^>\s*/gm, "");
        if (notes === "_No notes added._") notes = "";
      }

      let githubUrl = "";
      if (Array.isArray(allFiles) && owner && repo) {
        const parentParts = filePath.split("/");
        parentParts.pop();
        const parentFolder = parentParts.join("/");

        const siblings = allFiles.filter(f => 
          f.type === "blob" && 
          f.path.startsWith(parentFolder + "/") && 
          f.path.toLowerCase() !== filePath.toLowerCase()
        );

        const normApproach = approachLabel.toLowerCase();
        let matchedSib = siblings.find(sib => {
          const fn = sib.path.split("/").pop().toLowerCase();
          if (normApproach.includes("optimal") || normApproach === "oa" || normApproach.includes("(oa)")) {
            return fn.includes("optimal") || fn.includes("-oa-") || fn.includes("solution") || fn.includes("sol");
          }
          if (normApproach.includes("better") || normApproach === "ba" || normApproach.includes("(ba)")) {
            return fn.includes("better") || fn.includes("-ba-");
          }
          if (normApproach.includes("brute") || normApproach === "bf" || normApproach.includes("(bf)")) {
            return fn.includes("brute") || fn.includes("-bf-") || fn.includes("force");
          }
          return fn.includes(normApproach);
        });

        if (!matchedSib && siblings.length > 0) {
          matchedSib = siblings[0];
        }

        if (matchedSib) {
          githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${matchedSib.path}`;
        }
      }

      if (!githubUrl && owner && repo) {
        githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
      }

      solvesList.push({
        id: problemId,
        title: problemTitle,
        slug: slug,
        difficulty: difficulty,
        url: url,
        savedAt: new Date().toISOString(),
        approach: (approachLabel.includes("(oa)") || approachLabel.includes("optimal")) ? "oa" :
                  (approachLabel.includes("(ba)") || approachLabel.includes("better")) ? "ba" :
                  (approachLabel.includes("(bf)") || approachLabel.includes("brute")) ? "bf" : approachLabel,
        notes: notes,
        timeSpent: timeSpentMatch ? timeSpentMatch[1].trim() : "",
        collection: collectionMatch ? collectionMatch[1].trim() : "",
        topic: topicMatchSingle ? topicMatchSingle[1].trim() : (topics[0] || "Other"),
        pattern: patternMatch ? patternMatch[1].trim() : mainPattern,
        githubUrl: githubUrl,
        isFavorite: false,
        revisionCount: 1,
        revisionCompleted: false,
        revisionCompletedAt: null
      });
    });
  }

  if (solvesList.length === 0 && Array.isArray(allFiles)) {
    const parentParts = filePath.split("/");
    parentParts.pop();
    const parentFolder = parentParts.join("/");

    const siblings = allFiles.filter(f => 
      f.type === "blob" && 
      f.path.startsWith(parentFolder + "/") && 
      f.path.toLowerCase() !== filePath.toLowerCase()
    );

    siblings.forEach(sib => {
      const filename = sib.path.split("/").pop();
      const extMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
      if (!extMatch) return;

      const ext = extMatch[1].toLowerCase();
      const extToLang = {
        "py": "python", "py3": "python3", "cpp": "cpp", "cc": "cpp", "cxx": "cpp",
        "java": "java", "js": "javascript", "ts": "typescript", "go": "go", "rs": "rust"
      };
      if (!extToLang[ext]) return;

      let approach = "oa";
      if (filename.toLowerCase().includes("brute") || filename.toLowerCase().includes("bf")) {
        approach = "bf";
      } else if (filename.toLowerCase().includes("better") || filename.toLowerCase().includes("ba")) {
        approach = "ba";
      } else {
        const appMatch = filename.match(/-(OPTIMAL|BRUTE|BETTER|bf|ba|oa)-v\d+/i);
        if (appMatch) {
          const matchedApp = appMatch[1].toLowerCase();
          approach = matchedApp === "optimal" ? "oa" : (matchedApp === "better" ? "ba" : (matchedApp === "brute" ? "bf" : matchedApp));
        }
      }

      solvesList.push({
        id: problemId,
        title: problemTitle,
        slug: slug,
        difficulty: difficulty,
        url: url,
        savedAt: new Date().toISOString(),
        approach: approach,
        notes: "",
        timeSpent: "",
        collection: "",
        topic: topics[0] || "Other",
        pattern: "None",
        isFavorite: false,
        revisionCount: 1,
        revisionCompleted: false,
        revisionCompletedAt: null
      });
    });
  }

  return solvesList;
}
