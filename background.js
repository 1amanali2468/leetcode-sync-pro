import { saveSolutionToGitHub, updateSolutionNotesInGitHub } from "./github.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";

let pollingIntervalId = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LEETSYNC_SAVE_TO_GITHUB") {
    saveSolutionToGitHub(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "LEETSYNC_SAVE_CUSTOM_SOLVE") {
    const payload = message.payload;
    chrome.storage.local.get(["githubSettings", "leetsyncHistory"]).then(async (stored) => {
      try {
        const settings = stored.githubSettings || {};
        const history = stored.leetsyncHistory || [];

        // 1. Reconstruct title slug & sanitize
        const slug = payload.title.toLowerCase().trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        if (!slug) throw new Error("Invalid problem title");

        // Determine correct version count (same approach/day check)
        let version = 1;
        const entryDateStr = new Date().toISOString().split("T")[0];
        const sameDaySolves = history.filter(
          (h) => h.slug === slug && 
                 h.approach === payload.approach && 
                 (h.savedAt ? h.savedAt.split("T")[0] : "") === entryDateStr
        );

        if (sameDaySolves.length > 0) {
          version = sameDaySolves[0].version || 1;
        } else {
          const approachSolves = history.filter((h) => h.slug === slug && h.approach === payload.approach);
          if (approachSolves.length > 0) {
            const maxVersion = Math.max(...approachSolves.map(s => s.version || 1));
            version = maxVersion + 1;
          }
        }

        const submission = {
          title: payload.title,
          questionFrontendId: "",
          titleSlug: slug,
          difficulty: payload.difficulty || "Medium",
          url: payload.link || "",
          language: payload.language,
          code: payload.code,
          runtime: "",
          memory: "",
          topicTags: payload.topic ? [{ name: payload.topic }] : []
        };

        const saveOptions = {
          approach: payload.approach,
          customName: (payload.approach === "bf" || payload.approach === "ba" || payload.approach === "oa") ? "" : payload.approach,
          timeComplexity: payload.timeComplexity || "N/A",
          spaceComplexity: payload.spaceComplexity || "N/A",
          timeSpent: payload.timeSpent || "",
          selectedTopic: payload.topic || "Other",
          pattern: payload.pattern || "None",
          collection: payload.collection || "",
          notes: payload.notes || ""
        };

        // 2. Commit to GitHub (only if githubSettings are fully connected)
        let githubUrl = "";
        let readmePath = "";
        if (settings.token && settings.owner && settings.repo) {
          const result = await saveSolutionToGitHub({ settings, submission, saveOptions });
          githubUrl = result.solutionUrl || "";
          readmePath = result.readmePath || "";
        }

        // 3. Save to history locally
        const slugEntries = history.filter((h) => h.slug === slug);
        let maxRev = 0;
        let existingCustomDueDate = null;
        slugEntries.forEach((h) => {
          if (h.revisionCount && h.revisionCount > maxRev) maxRev = h.revisionCount;
          if (h.customRevisionDueDate) existingCustomDueDate = h.customRevisionDueDate;
        });

        const newRevCount = maxRev + 1;
        const nowStr = new Date().toISOString();

        const entry = {
          id: "",
          title: payload.title,
          slug: slug,
          difficulty: payload.difficulty || "Medium",
          approach: payload.approach,
          language: payload.language,
          timeComplexity: payload.timeComplexity || "N/A",
          spaceComplexity: payload.spaceComplexity || "N/A",
          topic: payload.topic || "Other",
          pattern: payload.pattern || "None",
          notes: payload.notes || "",
          githubUrl: githubUrl,
          savedAt: nowStr,
          isFavorite: false,
          collection: payload.collection || "",
          timeSpent: payload.timeSpent || "",
          readmePath: readmePath,
          version: version,
          revisionCount: newRevCount,
          lastRevisionAt: nowStr
        };

        if (existingCustomDueDate) {
          entry.customRevisionDueDate = existingCustomDueDate;
          entry.revisionCompleted = true;
          entry.revisionCompletedAt = entryDateStr;
        }

        const dupIndex = history.findIndex(
          (h) => h.slug === slug && 
                 h.approach === payload.approach && 
                 (h.savedAt ? h.savedAt.split("T")[0] : "") === entryDateStr
        );

        if (dupIndex !== -1) {
          entry.isFavorite = entry.isFavorite || history[dupIndex].isFavorite;
          history.splice(dupIndex, 1);
        }

        history.unshift(entry);

        history.forEach((h) => {
          if (h.slug === slug) {
            h.revisionCount = newRevCount;
            h.lastRevisionAt = nowStr;
            if (existingCustomDueDate) {
              h.customRevisionDueDate = existingCustomDueDate;
              h.revisionCompleted = true;
              h.revisionCompletedAt = entryDateStr;
            }
            if (h.approach === payload.approach) {
              h.notes = payload.notes;
            }
          }
        });

        if (history.length > 5000) history.pop();
        await chrome.storage.local.set({ leetsyncHistory: history });

        sendResponse({ ok: true });
      } catch (err) {
        console.error("Custom solve save failed:", err);
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }

  if (message?.type === "LEETSYNC_UPDATE_NOTES") {
    chrome.storage.local.get("githubSettings").then((stored) => {
      const settings = stored.githubSettings || {};
      updateSolutionNotesInGitHub({
        settings,
        readmePath: message.payload.readmePath,
        approach: message.payload.approach,
        notes: message.payload.notes,
        slug: message.payload.slug,
        title: message.payload.title,
        topic: message.payload.topic,
        id: message.payload.id,
        language: message.payload.language,
        version: message.payload.version
      })
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
    });
    return true;
  }

  if (message?.type === "LEETSYNC_START_DEVICE_FLOW") {
    startDeviceFlow(message.payload.clientId)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "LEETSYNC_CANCEL_DEVICE_FLOW") {
    cancelDeviceFlow()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "LEETSYNC_FETCH_PROBLEM_DETAILS") {
    fetchLeetCodeProblemDetails(message.payload.titleSlug)
      .then((details) => sendResponse({ ok: true, details }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "LEETSYNC_GET_SHEET_STATUS") {
    (async () => {
      try {
        const slug = (message.payload?.slug || "").toLowerCase();
        const platform = message.payload?.platform || "leetcode";
        const isGFG = platform === "gfg";
        const cleanSlug = isGFG ? slug.replace(/-?(\d+)$/, "") : slug;

        // 1. Check built-in cross-sheet frequency map
        const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
        const customSheets = stored.customSheets || {};
        const matchedSheets = [];

        // Read cross_sheet_frequency.json via fetch
        try {
          const url = chrome.runtime.getURL("data/builtin-sheets/cross_sheet_frequency.json");
          const res = await fetch(url);
          const baseMap = await res.json();
          if (baseMap[cleanSlug] && Array.isArray(baseMap[cleanSlug])) {
            matchedSheets.push(...baseMap[cleanSlug]);
          }
        } catch (e) { /* ignore */ }

        // 2. Check custom sheets
        for (const [sheetKey, sheetObj] of Object.entries(customSheets)) {
          if (!sheetObj?.data) continue;
          const sheetName = sheetObj.name || sheetKey;
          const isSheetGFG = sheetKey === "gfg";
          for (const subtopics of Object.values(sheetObj.data)) {
            for (const problems of Object.values(subtopics)) {
              if (Array.isArray(problems) && problems.some(p => {
                let s = (typeof p === "string" ? p : p?.slug || "").toLowerCase();
                const isProblemGFG = isGFG || isSheetGFG || (typeof p === "object" && (p.leetcodeUrl || p.url || "").includes("geeksforgeeks.org"));
                if (isProblemGFG) {
                  s = s.replace(/-?(\d+)$/, "");
                }
                return s === cleanSlug;
              })) {
                if (!matchedSheets.includes(sheetName)) matchedSheets.push(sheetName);
                break;
              }
            }
          }
        }

        sendResponse({ ok: true, sheets: matchedSheets });
      } catch (e) {
        sendResponse({ ok: false, error: e.message, sheets: [] });
      }
    })();
    return true;
  }

  if (message?.type === "LEETSYNC_ADD_TO_SHEET") {
    (async () => {
      try {
        const { sheetKey, sheetName, problem } = message.payload;
        if (!sheetKey || !problem?.slug) { sendResponse({ ok: false, error: "Invalid payload" }); return; }

        const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
        const customSheets = stored.customSheets || {};
        let registry = stored.customSheetsRegistry || {};

        // Create sheet if it doesn't exist
        if (!customSheets[sheetKey]) {
          const isPlatform = sheetKey === "gfg" || sheetKey === "leetcode";
          customSheets[sheetKey] = {
            name: sheetName || sheetKey,
            isPlatformSheet: isPlatform,
            data: { "General": { "Problems": [] } }
          };
        }

        // Ensure data exists
        if (!customSheets[sheetKey].data) customSheets[sheetKey].data = {};

        const isGFG = problem.platform === "gfg" || (problem.url && problem.url.includes("geeksforgeeks.org"));
        const cleanSlug = isGFG ? problem.slug.toLowerCase().replace(/-?(\d+)$/, "") : problem.slug.toLowerCase();

        // Check if the problem is already present in ANY topic/subtopic of the sheet to avoid duplicates
        let alreadyIn = false;
        for (const [tName, subtopics] of Object.entries(customSheets[sheetKey].data)) {
          for (const [subName, plist] of Object.entries(subtopics || {})) {
            if (Array.isArray(plist)) {
              const found = plist.some(p => {
                let s = (typeof p === "string" ? p : p?.slug || "").toLowerCase();
                if (isGFG) {
                  s = s.replace(/-?(\d+)$/, "");
                }
                return s === cleanSlug;
              });
              if (found) {
                alreadyIn = true;
                break;
              }
            }
          }
          if (alreadyIn) break;
        }

        if (!alreadyIn) {
          const targetTopic = (problem.topic || "General").trim();
          const targetSubtopic = "Problems";

          if (!customSheets[sheetKey].data[targetTopic]) {
            customSheets[sheetKey].data[targetTopic] = {};
          }
          if (!customSheets[sheetKey].data[targetTopic][targetSubtopic]) {
            customSheets[sheetKey].data[targetTopic][targetSubtopic] = [];
          }

          customSheets[sheetKey].data[targetTopic][targetSubtopic].push(cleanSlug);

          // Update registry
          registry[cleanSlug] = {
            t: problem.title || cleanSlug,
            d: problem.difficulty || "Medium",
            u: problem.url || (problem.platform === "gfg"
              ? `https://www.geeksforgeeks.org/problems/${cleanSlug}/1`
              : `https://leetcode.com/problems/${cleanSlug}/`)
          };
        }

        await chrome.storage.local.set({ customSheets, customSheetsRegistry: registry });
        sendResponse({ ok: true, alreadyExisted: alreadyIn });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  return false;
});


async function startDeviceFlow(clientId) {
  stopPolling();
  await chrome.storage.local.remove("deviceFlowState");

  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: "repo"
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GitHub Error: ${response.status} - ${errText || response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  const state = {
    clientId,
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    interval: data.interval || 5,
    status: "pending",
    error: null,
    expiresAt: Date.now() + (data.expires_in || 900) * 1000
  };

  await chrome.storage.local.set({ deviceFlowState: state });
  runPolling(state);

  return state;
}

async function cancelDeviceFlow() {
  stopPolling();
  await chrome.storage.local.remove("deviceFlowState");
}

function stopPolling() {
  if (pollingIntervalId) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
  }
}

function runPolling(state) {
  stopPolling();
  let currentInterval = state.interval * 1000;

  const poll = async () => {
    if (Date.now() > state.expiresAt) {
      state.status = "error";
      state.error = "Verification code expired. Please try again.";
      await chrome.storage.local.set({ deviceFlowState: state });
      stopPolling();
      return;
    }

    try {
      const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          client_id: state.clientId,
          device_code: state.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code"
        })
      });

      if (!response.ok) return;

      const data = await response.json();

      if (data.access_token) {
        stopPolling();

        let username = "";
        let avatarUrl = "";
        try {
          const profile = await fetchGitHubUser(data.access_token);
          username = profile.username;
          avatarUrl = profile.avatarUrl;
        } catch (profileErr) {
          console.error("Profile fetch error:", profileErr);
        }

        const stored = await chrome.storage.local.get("githubSettings");
        const settings = stored.githubSettings || {};
        settings.token = data.access_token;
        settings.clientId = state.clientId;
        if (username) {
          settings.owner = username;
        }
        settings.avatarUrl = avatarUrl;

        await chrome.storage.local.set({ githubSettings: settings });

        state.status = "success";
        state.error = null;
        await chrome.storage.local.set({ deviceFlowState: state });

      } else if (data.error) {
        if (data.error === "authorization_pending") {
          // Keep polling
        } else if (data.error === "slow_down") {
          currentInterval += 5000;
          stopPolling();
          pollingIntervalId = setInterval(poll, currentInterval);
        } else {
          stopPolling();
          state.status = "error";
          state.error = data.error_description || data.error;
          await chrome.storage.local.set({ deviceFlowState: state });
        }
      }
    } catch (err) {
      console.error("Polling fetch error:", err);
    }
  };

  pollingIntervalId = setInterval(poll, currentInterval);
}

async function fetchGitHubUser(token) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) {
    throw new Error("Failed to fetch user profile.");
  }
  const data = await response.json();
  return {
    username: data.login,
    avatarUrl: data.avatar_url
  };
}

async function resumePolling() {
  const res = await chrome.storage.local.get("deviceFlowState");
  if (res.deviceFlowState && res.deviceFlowState.status === "pending") {
    if (Date.now() < res.deviceFlowState.expiresAt) {
      runPolling(res.deviceFlowState);
    } else {
      const state = res.deviceFlowState;
      state.status = "error";
      state.error = "Verification code expired.";
      await chrome.storage.local.set({ deviceFlowState: state });
    }
  }
}

async function fetchLeetCodeProblemDetails(titleSlug) {
  const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        titleSlug
        content
        difficulty
        topicTags {
          name
          slug
        }
      }
    }
  `;

  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      query,
      variables: { titleSlug }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch LeetCode data: ${response.statusText}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  return result.data.question;
}

// ── Streak Reminder Alarm ─────────────────────────────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "streak-reminder") {
    checkStreakAndNotify();
  }
});

async function checkStreakAndNotify() {
  const now = new Date();
  const hours = now.getHours();

  // Remind between 6 PM (18:00) and 10 PM (22:00) local time
  if (hours < 18 || hours > 22) {
    return;
  }

  // Check if reminders are enabled
  const storedSettings = await chrome.storage.local.get("githubSettings");
  const settings = storedSettings.githubSettings || {};
  const isEnabled = settings.hasOwnProperty("streakReminderEnabled") ? settings.streakReminderEnabled : true;
  if (!isEnabled) {
    return;
  }

  const todayStr = getLocalDateString(now);
  const stored = await chrome.storage.local.get("leetsyncHistory");
  const history = stored.leetsyncHistory || [];

  // ── 1. Check Streak Reminder ──────────────────────────────────────────────
  const hasSolvedToday = history.some(h => getLocalDateString(h.savedAt) === todayStr);
  const lastNotif = await chrome.storage.local.get("lastNotificationDate");
  if (lastNotif.lastNotificationDate !== todayStr && !hasSolvedToday) {
    const { streak } = calcStreak(history);
    const message = streak > 0 
      ? `Aapki 🔥 ${streak}-day streak tootne wali hai! Aaj ka question solve karein.`
      : "Aapne aaj koi problem solve nahi ki hai. Ek question solve karke apni streak shuru karein!";

    chrome.notifications.create("streak-reminder-notif", {
      type: "basic",
      iconUrl: "icon.png",
      title: "⚡ LeetSync Pro – Maintain your Streak!",
      message: message,
      priority: 2
    });

    await chrome.storage.local.set({ lastNotificationDate: todayStr });
  }

  // ── 2. Check Revision Reminders ───────────────────────────────────────────
  const lastRevNotif = await chrome.storage.local.get("lastRevisionNotifDate");
  if (lastRevNotif.lastRevisionNotifDate !== todayStr) {
    const dueList = getDueRevisions(history);
    const pendingDueList = dueList.filter(e => !e.revisionCompleted);
    if (pendingDueList.length > 0) {
      chrome.notifications.create("revision-reminder-notif", {
        type: "basic",
        iconUrl: "icon.png",
        title: "📅 LeetSync Pro – Revision Reminder!",
        message: `Aapke aaj 🔥 ${pendingDueList.length} questions revision ke liye pending hain. Practice start karein!`,
        priority: 1
      });
      await chrome.storage.local.set({ lastRevisionNotifDate: todayStr });
    }
  }
}

function getLocalDateString(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function calcStreak(history) {
  if (!history.length) return { streak: 0 };
  const dates = [...new Set(
    history.map((h) => getLocalDateString(h.savedAt)).filter(Boolean)
  )].sort().reverse();
  if (!dates.length) return { streak: 0 };
  const today = getLocalDateString(new Date());
  const yesterday = dayOffset(-1);
  if (dates[0] !== today && dates[0] !== yesterday) {
    return { streak: 0 };
  }
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const expected = dayOffset(-i);
    if (dates[i] === expected) {
      streak++;
    } else {
      break;
    }
  }
  return { streak };
}

function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Setup the alarm on install & startup
chrome.runtime.onInstalled.addListener(() => {
  setupStreakReminderAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  setupStreakReminderAlarm();
});

function setupStreakReminderAlarm() {
  chrome.alarms.get("streak-reminder", (alarm) => {
    if (!alarm) {
      chrome.alarms.create("streak-reminder", {
        delayInMinutes: 1,      // initial check
        periodInMinutes: 120    // check every 2 hours
      });
    }
  });
}

resumePolling();
setupStreakReminderAlarm();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getRevisionDueDate(entry) {
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

function isRevisionDue(entry) {
  const dueDate = getRevisionDueDate(entry);
  if (!dueDate) return false;
  
  const today = todayStr();
  const isCompleted = !!entry.revisionCompleted;
  const completedAt = entry.revisionCompletedAt || "";

  if (isCompleted) {
    return completedAt === today;
  }

  const compareStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
  return today >= compareStr;
}

function getDueRevisions(history) {
  const latestBySlug = {};
  history.forEach(entry => {
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

// ── Real-Time Cloud Firestore Sync Engine ─────────────────────────────────────

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes.leetsyncHistory && !changes.githubSettings && !changes.deletedSolves) return;

  const authData = await chrome.storage.local.get("auth_user");
  const authUser = authData.auth_user;
  if (!authUser || !authUser.uid) return;

  const uid = authUser.uid;
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/users/${uid}`;

  // Get token only if we have active changes to sync
  const hasHistoryOrSettings = changes.leetsyncHistory || changes.githubSettings;
  const hasDeletions = changes.deletedSolves && (changes.deletedSolves.newValue || []).length > 0;
  if (!hasHistoryOrSettings && !hasDeletions) return;

  const idToken = await getValidIdToken(authUser);
  if (!idToken) {
    console.warn("Could not obtain a valid Firebase ID token. Sync skipped.");
    return;
  }

  // Tombstone Deletion Sync
  if (changes.deletedSolves) {
    const deletedIds = changes.deletedSolves.newValue || [];
    if (deletedIds.length > 0) {
      for (const docId of deletedIds) {
        try {
          await fetch(`${baseUrl}/history/${docId}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${idToken}`
            }
          });
          console.log(`Firestore tombstone deleted docId: ${docId}`);
        } catch (err) {
          console.error("Firestore tombstone delete failed:", docId, err);
        }
      }
      await chrome.storage.local.set({ deletedSolves: [] });
    }
  }


  // 1. History Sync
  if (changes.leetsyncHistory) {
    const newHistory = changes.leetsyncHistory.newValue || [];
    const oldHistory = changes.leetsyncHistory.oldValue || [];

    const changedEntries = newHistory.filter(newEntry => {
      const oldEntry = oldHistory.find(h => h.slug === newEntry.slug && h.approach === newEntry.approach);
      if (!oldEntry) return true; // Newly added solve!
      
      return newEntry.savedAt !== oldEntry.savedAt ||
             newEntry.notes !== oldEntry.notes ||
             newEntry.isFavorite !== oldEntry.isFavorite ||
             newEntry.collection !== oldEntry.collection ||
             newEntry.revisionCount !== oldEntry.revisionCount ||
             newEntry.revisionCompleted !== oldEntry.revisionCompleted;
    });

    for (const entry of changedEntries) {
      try {
        const docId = `${entry.slug}-${entry.approach}-v${entry.version || 1}`.replace(/[^a-zA-Z0-9_-]/g, "");
        const firestoreDoc = convertToFirestoreFields(entry);
        
        await fetch(`${baseUrl}/history/${docId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify(firestoreDoc)
        });
      } catch (err) {
        console.error("Firestore history sync failed:", entry.slug, err);
      }
    }
  }

  // 2. Settings Sync
  if (changes.githubSettings) {
    const newSettings = changes.githubSettings.newValue || {};
    try {
      // Strip secrets before syncing settings to cloud
      const settingsToUpload = { ...newSettings };
      delete settingsToUpload.token;
      delete settingsToUpload.avatarUrl;

      const firestoreDoc = convertToFirestoreFields(settingsToUpload);
      await fetch(`${baseUrl}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify(firestoreDoc)
      });
    } catch (err) {
      console.error("Firestore settings sync failed:", err);
    }
  }
});

function getJwtExpiration(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return 0;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp * 1000;
  } catch (e) {
    return 0;
  }
}

async function getValidIdToken(authUser) {
  if (!authUser || !authUser.idToken || !authUser.refreshToken) {
    return "";
  }
  
  const exp = getJwtExpiration(authUser.idToken);
  // If the token is valid for more than 5 minutes, use it
  if (exp && (exp - Date.now() > 5 * 60 * 1000)) {
    return authUser.idToken;
  }
  
  // Refresh the token
  try {
    console.log("Firebase ID token expired or close to expiration. Refreshing...");
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(authUser.refreshToken)}`
    });
    
    if (!res.ok) throw new Error("Failed to refresh token");
    const data = await res.json();
    
    authUser.idToken = data.id_token;
    authUser.refreshToken = data.refresh_token || authUser.refreshToken;
    
    // Save updated authState to storage
    await chrome.storage.local.set({ auth_user: authUser });
    console.log("Firebase ID token refreshed successfully.");
    return authUser.idToken;
  } catch (err) {
    console.error("Token refresh failed:", err);
    return "";
  }
}

function convertToFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      fields[key] = { stringValue: value };
    } else if (typeof value === "number") {
      fields[key] = { doubleValue: value };
    } else if (typeof value === "boolean") {
      fields[key] = { booleanValue: value };
    } else if (Array.isArray(value)) {
      fields[key] = {
        arrayValue: {
          values: value.map(v => ({ stringValue: String(v) }))
        }
      };
    }
  }
  return { fields };
}

