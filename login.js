import { FIREBASE_CONFIG, FIREBASE_AUTH_API, getFirestoreApiUrl } from "./firebase-config.js";
import { batchWriteToFirestore } from "./firestore_sync.js";


// UI Elements
const errorText = document.getElementById("errorText");
const githubBtn = document.getElementById("githubBtn");
const redirectUriDisplay = document.getElementById("redirectUriDisplay");
const authCard = document.getElementById("authCard");
const successCard = document.getElementById("successCard");
const countdownEl = document.getElementById("countdown");
const btnCloseTab = document.getElementById("btnCloseTab");

function getOAuthRedirectUri() {
  return chrome.identity.getRedirectURL();
}

if (redirectUriDisplay) {
  redirectUriDisplay.textContent = getOAuthRedirectUri();
}


// GitHub Web Flow Login (launchWebAuthFlow with CSRF protection)
githubBtn.addEventListener("click", async () => {
  errorText.classList.add("hidden");
  const clientId = FIREBASE_CONFIG.githubClientId;
  const clientSecret = FIREBASE_CONFIG.githubClientSecret;
  if (!clientId || clientId.startsWith("YOUR_") || !clientSecret || clientSecret.startsWith("YOUR_")) {
    showError("Please configure your GitHub Client ID & Secret in firebase-config.js first!");
    return;
  }

  githubBtn.disabled = true;
  githubBtn.textContent = "Connecting to GitHub...";

  try {
    const redirectUri = getOAuthRedirectUri();
    const state = Math.random().toString(36).substring(2);
    
    // Save state to check it on redirect (CSRF Protection)
    await chrome.storage.local.set({ oauth_state: state });

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user&state=${state}`;

    chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    }, async (redirectUrl) => {
      try {
        if (chrome.runtime.lastError || !redirectUrl) {
          throw new Error(chrome.runtime.lastError?.message || "Authorization cancelled or failed.");
        }

        const urlObj = new URL(redirectUrl);
        const code = urlObj.searchParams.get("code");
        const returnedState = urlObj.searchParams.get("state");

        // Verify state (CSRF mitigation)
        const stored = await chrome.storage.local.get("oauth_state");
        if (!returnedState || returnedState !== stored.oauth_state) {
          throw new Error("Security check failed: State verification mismatch (potential CSRF).");
        }

        if (!code) {
          throw new Error("No authorization code returned from GitHub.");
        }

        githubBtn.textContent = "Exchanging token...";

        // Exchange code for token
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            redirect_uri: redirectUri
          })
        });

        if (!tokenRes.ok) {
          throw new Error(`Token exchange failed: ${tokenRes.statusText}`);
        }

        const tokenData = await tokenRes.json();
        if (tokenData.error) {
          throw new Error(tokenData.error_description || tokenData.error);
        }

        const token = tokenData.access_token;
        if (!token) {
          throw new Error("No access token returned from GitHub.");
        }

        githubBtn.textContent = "Signing in to LeetSync Cloud...";

        // Authenticate with Firebase
        const firebaseRes = await fetch(`${FIREBASE_AUTH_API}/accounts:signInWithIdp?key=${FIREBASE_CONFIG.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postBody: `access_token=${token}&providerId=github.com`,
            requestUri: "http://localhost",
            returnSecureToken: true,
            returnIdSecureToken: true
          })
        });

        if (!firebaseRes.ok) {
          const errData = await firebaseRes.json();
          throw new Error(errData.error?.message || "Firebase GitHub sign in failed");
        }

        const authResult = await firebaseRes.json();
        if (!authResult.idToken) {
          throw new Error("Firebase Authentication did not return an ID token.");
        }

        // Store GitHub connection settings LOCALLY only (DO NOT sync token to cloud!)
        const settingsStored = await chrome.storage.local.get("githubSettings");
        const settings = settingsStored.githubSettings || {};
        settings.token = token;
        settings.owner = authResult.screenName || authResult.email.split("@")[0];
        await chrome.storage.local.set({ githubSettings: settings });

        // Handle final success flow
        await handleAuthSuccess(authResult);

      } catch (err) {
        githubBtn.disabled = false;
        githubBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.11.82-.26.82-.577v-2.234c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.82 1.102.82 2.222v3.293c0 .319.22.694.825.576C20.565 21.795 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          Sign In with GitHub
        `;
        showError(err.message);
      }
    });

  } catch (err) {
    githubBtn.disabled = false;
    githubBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.11.82-.26.82-.577v-2.234c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.43.372.82 1.102.82 2.222v3.293c0 .319.22.694.825.576C20.565 21.795 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
      </svg>
      Sign In with GitHub
    `;
    showError(err.message);
  }
});

function showError(msg) {
  let friendlyMsg = msg;
  if (msg.includes("OPERATION_NOT_ALLOWED")) {
    friendlyMsg = "❌ Firebase Config Error: You must enable 'Email/Password' under Firebase Console -> Authentication -> Sign-in method!";
  } else if (msg.includes("EMAIL_EXISTS")) {
    friendlyMsg = "❌ Email already registered. Click the 'Log In' tab to sign in.";
  } else if (msg.includes("INVALID_EMAIL")) {
    friendlyMsg = "❌ Please enter a valid email address.";
  } else if (msg.includes("WEAK_PASSWORD")) {
    friendlyMsg = "❌ Password must be at least 6 characters long.";
  } else if (msg.includes("INVALID_LOGIN_CREDENTIALS") || msg.includes("INVALID_PASSWORD") || msg.includes("EMAIL_NOT_FOUND")) {
    friendlyMsg = "❌ Incorrect email or password. Please verify your details.";
  } else {
    friendlyMsg = "❌ Error: " + msg;
  }
  
  errorText.textContent = friendlyMsg;
  errorText.classList.remove("hidden");
}

async function handleAuthSuccess(authResult) {
  // Store user auth state locally
  await chrome.storage.local.set({
    auth_user: {
      uid: authResult.localId,
      email: authResult.email || "",
      username: authResult.screenName || "",
      providerId: authResult.providerId || "github.com",
      idToken: authResult.idToken,
      refreshToken: authResult.refreshToken
    }
  });

  // Pull existing settings and solves from Firestore and merge with local storage
  try {
    await syncFromFirestore(authResult.localId, authResult.idToken);
  } catch (err) {
    console.error("Firestore initial sync failed:", err);
  }

  // Show Success Screen
  if (authCard && successCard) {
    authCard.classList.add("hidden");
    successCard.classList.remove("hidden");
    
    // Bind manual close button
    if (btnCloseTab) {
      btnCloseTab.addEventListener("click", () => {
        safeCloseTab();
      });
    }

    // Start 3-second countdown
    let timeLeft = 3;
    const interval = setInterval(() => {
      timeLeft--;
      if (countdownEl) countdownEl.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(interval);
        safeCloseTab();
      }
    }, 1000);
  } else {
    // Fallback if elements not found
    safeCloseTab();
  }
}

function safeCloseTab() {
  if (chrome.tabs && chrome.tabs.getCurrent) {
    chrome.tabs.getCurrent((tab) => {
      if (tab && tab.id) {
        chrome.tabs.remove(tab.id);
      } else {
        window.close();
      }
    });
  } else {
    window.close();
  }
}

async function syncFromFirestore(uid, idToken) {
  const baseUrl = getFirestoreApiUrl();
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${idToken}`
  };

  console.log("Starting cloud sync for UID:", uid);

  try {
    // 1. Sync settings first
    const settingsRes = await fetch(`${baseUrl}/users/${uid}`, { headers });
    console.log("Settings fetch status:", settingsRes.status);
    
    if (settingsRes.ok) {
      const settingsDoc = await settingsRes.json();
      const cloudSettings = convertFromFirestoreFields(settingsDoc.fields || {});
      console.log("Downloaded settings:", cloudSettings);
      
      const localStored = await chrome.storage.local.get("githubSettings");
      const localSettings = localStored.githubSettings || {};
      
      // Merge local settings (like the freshly obtained OAuth token) to prevent overwrite
      const mergedSettings = { ...cloudSettings, ...localSettings };
      
      if (Object.keys(mergedSettings).length > 0) {
        await chrome.storage.local.set({ githubSettings: mergedSettings });
        
        // Strip secrets before uploading to cloud
        const settingsToUpload = { ...mergedSettings };
        delete settingsToUpload.token;
        delete settingsToUpload.avatarUrl;

        // Upload merged settings back to Firestore
        await fetch(`${baseUrl}/users/${uid}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(convertToFirestoreFields(settingsToUpload))
        });
      }
    } else if (settingsRes.status === 404) {
      console.log("Settings document not found in cloud, uploading local settings...");
      // If user doc doesn't exist in cloud, upload our current local settings
      const localStored = await chrome.storage.local.get("githubSettings");
      const localSettings = localStored.githubSettings;
      if (localSettings && Object.keys(localSettings).length > 0) {
        // Strip secrets before uploading to cloud
        const settingsToUpload = { ...localSettings };
        delete settingsToUpload.token;
        delete settingsToUpload.avatarUrl;

        const patchRes = await fetch(`${baseUrl}/users/${uid}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(convertToFirestoreFields(settingsToUpload))
        });
        console.log("Local settings upload status:", patchRes.status);
      }
    } else {
      const errorJson = await settingsRes.json().catch(() => ({}));
      throw new Error(`Settings sync failed: ${settingsRes.status} ${JSON.stringify(errorJson)}`);
    }

    // 2. Sync history
    const cloudHistory = [];
    let pageToken = "";
    let fetchSuccess = true;

    do {
      const url = `${baseUrl}/users/${uid}/history?pageSize=300` + (pageToken ? `&pageToken=${pageToken}` : "");
      const historyRes = await fetch(url, { headers });
      console.log("History fetch status:", historyRes.status);

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
        break;
      }
    } while (pageToken);

    if (fetchSuccess) {
      console.log(`Downloaded ${cloudHistory.length} history documents total`);

      const stored = await chrome.storage.local.get("leetsyncHistory");
      const localHistory = stored.leetsyncHistory || [];

      if (cloudHistory.length > 0) {
        // Merge logic: cloud data overwrites local if newer or not exists
        const merged = [...localHistory];
        cloudHistory.forEach(cloudItem => {
          const idx = merged.findIndex(h => h.slug === cloudItem.slug && h.approach === cloudItem.approach && (h.version || 1) === (cloudItem.version || 1));
          if (idx !== -1) {
            const localDate = new Date(merged[idx].savedAt || 0);
            const cloudDate = new Date(cloudItem.savedAt || 0);
            if (cloudDate > localDate) {
              merged[idx] = cloudItem;
            } else if (cloudDate.getTime() === localDate.getTime()) {
              // Overwrite with cloud edits (like updated notes/favorites)
              merged[idx] = { ...merged[idx], ...cloudItem };
            }
          } else {
            merged.push(cloudItem);
          }
        });

        await chrome.storage.local.set({ leetsyncHistory: merged });
        console.log("Merged history successfully saved locally");
        
        // Also upload any local history solves that are NOT in cloud yet
        const updates = [];
        for (const localItem of localHistory) {
          const cloudMatch = cloudHistory.find(c => c.slug === localItem.slug && c.approach === localItem.approach && (c.version || 1) === (localItem.version || 1));
          if (!cloudMatch) {
            updates.push(localItem);
          }
        }
        if (updates.length > 0) {
          await batchWriteToFirestore(uid, idToken, { updates });
          console.log(`Uploaded ${updates.length} missing solves to cloud`);
        }
      } else {
        // First time login - upload all local history if any
        if (localHistory.length > 0) {
          console.log(`Uploading ${localHistory.length} local history items to cloud...`);
          await batchWriteToFirestore(uid, idToken, { updates: localHistory });
          console.log(`Uploaded all local history solves successfully`);
        }
      }
    } else {
      throw new Error("History sync failed. Check console logs for details.");
    }
  } catch (err) {
    console.error("Failed to sync history with Firestore:", err);
    showError("Sync Error: " + err.message);
    // Keep tab open to display sync error
    throw err;
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

function convertFromFirestoreFields(fields) {
  const obj = {};
  for (const [key, valObj] of Object.entries(fields)) {
    if (valObj.hasOwnProperty("stringValue")) {
      obj[key] = valObj.stringValue;
    } else if (valObj.hasOwnProperty("doubleValue")) {
      obj[key] = Number(valObj.doubleValue);
    } else if (valObj.hasOwnProperty("integerValue")) {
      obj[key] = Number(valObj.integerValue);
    } else if (valObj.hasOwnProperty("booleanValue")) {
      obj[key] = valObj.booleanValue;
    } else if (valObj.hasOwnProperty("arrayValue")) {
      const values = valObj.arrayValue.values || [];
      obj[key] = values.map(v => v.stringValue || "");
    }
  }
  return obj;
}
