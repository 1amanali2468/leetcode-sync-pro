import { saveSolutionToGitHub, updateSolutionNotesInGitHub } from "./github.js";
import { FIREBASE_CONFIG } from "./firebase-config.js";
import { mergeSolveWithStars, mergeNewSolveIntoHistory } from "./history_manager.js";
import { loadSheet } from "./sheet-loader.js";
import { processPendingSync } from "./background_sync.js";
import { todayStr, getRevisionDueDate, isRevisionDue, getDueRevisions } from "./shared_revision.js";

let pollingIntervalId = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LEETSYNC_SAVE_TO_GITHUB") {
    saveSolutionToGitHub(message.payload)
      .then((result) => {
        sendResponse({ ok: true, result });
        processPendingGithubSync().catch(err => console.error("Queue retry failed:", err));
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "LEETSYNC_QUEUE_GITHUB_SYNC") {
    const { submission, saveOptions, settings } = message.payload;
    enqueuePendingGithubSync(submission, saveOptions, settings)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "LEETSYNC_SAVE_TO_HISTORY") {
    const { entry } = message.payload;
    chrome.storage.local.get("leetsyncHistory").then(async (stored) => {
      try {
        const history = stored.leetsyncHistory || [];
        const updatedHistory = mergeNewSolveIntoHistory(history, entry);
        await chrome.storage.local.set({ leetsyncHistory: updatedHistory });
        sendResponse({ ok: true, history: updatedHistory });
      } catch (err) {
        console.error("Failed to save history centrally:", err);
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }

  if (message?.type === "LEETSYNC_SAVE_CUSTOM_SOLVE") {
    const payload = message.payload;
    chrome.storage.local.get(["githubSettings", "leetsyncHistory"]).then(async (stored) => {
      try {
        const settings = stored.githubSettings || {};
        let history = stored.leetsyncHistory || [];

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
        let queued = false;
        if (settings.token && settings.owner && settings.repo) {
          try {
            const result = await saveSolutionToGitHub({ settings, submission, saveOptions });
            githubUrl = result.solutionUrl || "";
            readmePath = result.readmePath || "";
          } catch (gitErr) {
            console.error("Failed to commit custom solve to GitHub, queueing...", gitErr);
            await enqueuePendingGithubSync(submission, saveOptions, settings);
            queued = true;
          }
        }

        // 3. Save to history locally
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
          version: version
        };

        const updatedHistory = mergeNewSolveIntoHistory(history, entry);
        await chrome.storage.local.set({ leetsyncHistory: updatedHistory });

        sendResponse({ ok: true, queued });
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
        // Strip trailing numbers & dashes for GFG slugs
        // Use -* (zero or more dashes) since GFG sometimes appends numbers without a dash
        const cleanSlug = isGFG
          ? slug.replace(/-*(\d+)$/, "").replace(/-+$/, "")
          : slug;

        console.log(`[LeetSync DEBUG] Sheet status: slug="${slug}", platform="${platform}", cleanSlug="${cleanSlug}"`);

        const combined = await loadSheet("all_imported_sheets");
        const allProblems = combined?.["All Combined"]?.["All Problems"] || [];

        console.log(`[LeetSync DEBUG] Loaded ${allProblems.length} combined problems`);

        if (allProblems.length === 0) {
          console.warn("[LeetSync DEBUG] No problems loaded — manifest/fetch may have failed");
          sendResponse({ ok: true, sheets: [] });
          return;
        }

        const match = allProblems.find(p => {
          // pSlug: strip trailing numbers (with or without dash) for GFG problems
          const pSlug = (p.slug || "").toLowerCase().replace(/-*(\d+)$/, "").replace(/-+$/, "");
          if (pSlug === cleanSlug) return true;
          const pUrl = (p.leetcodeUrl || p.url || "").toLowerCase();
          if (pUrl) {
            try {
              const u = new URL(pUrl);
              const pathParts = u.pathname.split("/").filter(Boolean);
              if (pathParts.length > 0) {
                let lastPart = pathParts[pathParts.length - 1];
                if (lastPart === "1" && pathParts.length > 1) {
                  lastPart = pathParts[pathParts.length - 2];
                }
                // Use -* to handle both "slug-12345" and "slug12345" GFG URL formats
                const normLastPart = lastPart.replace(/-*(\d+)$/, "").replace(/-+$/, "");
                if (normLastPart === cleanSlug) return true;
              }
            } catch (e) {}
          }
          return false;
        });

        const matchedSheets = match ? (match.sheetsIn || []) : [];
        console.log(`[LeetSync DEBUG] Match result: ${match ? `"${match.slug}" in [${matchedSheets.join(", ")}]` : "NO MATCH"}`);
        sendResponse({ ok: true, sheets: matchedSheets });
      } catch (e) {
        console.error("[LeetSync] LEETSYNC_GET_SHEET_STATUS error:", e);
        sendResponse({ ok: false, error: e.message, sheets: [] });
      }
    })();
    return true;
  }

  if (message?.type === "SYNC_FIRESTORE_DATA") {
    processPendingSync().then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message?.type === "FETCH_GITHUB_SOLVES") {
    // Cannot run DOM-heavy GitHub import in service worker. Return error so user knows to use popup.
    sendResponse({ ok: false, error: "Please use the 'Sync' button in the extension popup to fetch GitHub solves. Background fetch is not supported." });
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
    processPendingSync().catch(err => console.error("Alarm retry sync failed:", err));
    processPendingGithubSync().catch(err => console.error("Alarm retry GitHub sync failed:", err));
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
  processPendingSync().catch(err => console.error("Startup pending sync failed:", err));
  processPendingGithubSync().catch(err => console.error("Startup pending GitHub sync failed:", err));
});

chrome.runtime.onStartup.addListener(() => {
  setupStreakReminderAlarm();
  processPendingSync().catch(err => console.error("Startup pending sync failed:", err));
  processPendingGithubSync().catch(err => console.error("Startup pending GitHub sync failed:", err));
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
processPendingSync().catch(err => console.error("Initial pending sync failed:", err));
processPendingGithubSync().catch(err => console.error("Initial pending GitHub sync failed:", err));




async function enqueuePendingGithubSync(submission, saveOptions, settings) {
  try {
    const data = await chrome.storage.local.get("pendingGithubSync");
    const queue = data.pendingGithubSync || [];
    queue.push({
      submission,
      saveOptions,
      settings,
      queuedAt: new Date().toISOString()
    });
    await chrome.storage.local.set({ pendingGithubSync: queue });
    console.log("Successfully queued submission in pendingGithubSync.");
  } catch (e) {
    console.error("Failed to queue submission in pendingGithubSync:", e);
  }
}

export async function processPendingGithubSync() {
  const data = await chrome.storage.local.get("pendingGithubSync");
  const queue = data.pendingGithubSync || [];
  if (queue.length === 0) return;

  console.log(`Processing ${queue.length} pending solutions in GitHub sync queue...`);
  const remaining = [];
  const storedHistory = await chrome.storage.local.get("leetsyncHistory");
  const history = storedHistory.leetsyncHistory || [];
  let historyChanged = false;

  for (const item of queue) {
    try {
      const { submission, saveOptions, settings } = item;
      const result = await saveSolutionToGitHub({ settings, submission, saveOptions });
      if (result && (result.solutionUrl || result.solutionPath)) {
        console.log(`Successfully synced queued solution to GitHub: ${submission.title}`);
        const githubUrl = result.solutionUrl || "";
        const readmePath = result.readmePath || "";
        
        const idx = history.findIndex(h => h.slug === (submission.titleSlug || submission.slug) && h.approach === (saveOptions.approach === "custom" ? saveOptions.customName : saveOptions.approach) && (h.version || 1) === (saveOptions.version || 1));
        if (idx !== -1) {
          history[idx].githubUrl = githubUrl;
          history[idx].readmePath = readmePath;
          historyChanged = true;
        }
      } else {
        console.warn(`Failed to sync queued solution: ${result?.error}. Retaining in queue.`);
        remaining.push(item);
      }
    } catch (err) {
      console.error("Error processing queued GitHub sync item:", err);
      remaining.push(item);
    }
  }

  if (historyChanged) {
    await chrome.storage.local.set({ leetsyncHistory: history });
  }

  if (remaining.length === 0) {
    await chrome.storage.local.remove("pendingGithubSync");
    console.log("All pending GitHub solutions synced successfully and queue cleared.");
  } else {
    await chrome.storage.local.set({ pendingGithubSync: remaining });
  }
}


