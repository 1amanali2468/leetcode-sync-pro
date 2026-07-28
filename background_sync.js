// background_sync.js – Handles real-time cloud Firestore sync and token refresh logic.
// Loaded as an ES module by background.js.

import { FIREBASE_CONFIG } from "./firebase-config.js";
import { batchWriteToFirestore } from "./firestore_sync.js";
import { convertToFirestoreFields } from "./firestore_core.js";

// Helper to perform the actual sync operations
async function performSync(uid, idToken, updates, deletes, settingsToUpload, queue) {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/users/${uid}`;
  let queueChanged = false;

  // 1. Sync History (Updates & Deletes)
  if (updates.length > 0 || deletes.length > 0) {
    try {
      await batchWriteToFirestore(uid, idToken, { updates, deletes });
      console.log(`Successfully synced ${updates.length} updates and ${deletes.length} deletes to Firestore.`);
      queue.updates = [];
      queue.deletes = [];
      queueChanged = true;
    } catch (err) {
      console.error("Firestore batch sync failed, keeping in queue:", err);
      queue.updates = updates;
      queue.deletes = deletes;
      queueChanged = true;
    }
  }

  // 2. Sync Settings
  if (settingsToUpload && Object.keys(settingsToUpload).length > 0) {
    try {
      const uploadPayload = { ...settingsToUpload };
      delete uploadPayload.token;
      delete uploadPayload.avatarUrl;

      const firestoreDoc = convertToFirestoreFields(uploadPayload);
      const res = await fetch(`${baseUrl}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify(firestoreDoc)
      });
      if (res.ok) {
        console.log("Successfully synced settings to Firestore.");
        queue.settings = null;
        queueChanged = true;
      } else {
        throw new Error(`PATCH returned status ${res.status}`);
      }
    } catch (err) {
      console.error("Firestore settings sync failed, keeping in queue:", err);
      queue.settings = settingsToUpload;
      queueChanged = true;
    }
  }

  if (queueChanged) {
    if (queue.updates.length === 0 && queue.deletes.length === 0 && !queue.settings) {
      await chrome.storage.local.remove("pendingFirestoreSync");
    } else {
      await chrome.storage.local.set({ pendingFirestoreSync: queue });
    }
  }
}

// Function to process the pending sync queue
export async function processPendingSync() {
  const authData = await chrome.storage.local.get("auth_user");
  const authUser = authData.auth_user;
  if (!authUser || !authUser.uid) return;

  const pendingData = await chrome.storage.local.get("pendingFirestoreSync");
  const queue = pendingData.pendingFirestoreSync;
  if (!queue) return;

  if (queue.updates?.length > 0 || queue.deletes?.length > 0 || queue.settings) {
    console.log("Processing pending Firestore sync queue...");
    const idToken = await getValidIdToken(authUser);
    if (!idToken) return;

    await performSync(authUser.uid, idToken, queue.updates || [], queue.deletes || [], queue.settings, queue);
  }
}

// Register real-time sync listeners
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes.leetsyncHistory && !changes.githubSettings && !changes.deletedSolves) return;

  const authData = await chrome.storage.local.get("auth_user");
  const authUser = authData.auth_user;
  if (!authUser || !authUser.uid) return;

  const pendingData = await chrome.storage.local.get("pendingFirestoreSync");
  const queue = pendingData.pendingFirestoreSync || { updates: [], deletes: [], settings: null };

  const updates = [...(queue.updates || [])];
  const deletes = [...(queue.deletes || [])];

  // 1. History Sync
  if (changes.leetsyncHistory) {
    const newHistory = changes.leetsyncHistory.newValue || [];
    const oldHistory = changes.leetsyncHistory.oldValue || [];

    const changedEntries = newHistory.filter(newEntry => {
      const oldEntry = oldHistory.find(h => h.slug === newEntry.slug && h.approach === newEntry.approach && (h.version || 1) === (newEntry.version || 1));
      if (!oldEntry) return true; // Newly added solve!
      
      return newEntry.savedAt !== oldEntry.savedAt ||
             newEntry.notes !== oldEntry.notes ||
             newEntry.isFavorite !== oldEntry.isFavorite ||
             newEntry.collection !== oldEntry.collection ||
             newEntry.revisionCount !== oldEntry.revisionCount ||
             newEntry.revisionCompleted !== oldEntry.revisionCompleted;
    });

    changedEntries.forEach(newUp => {
      const idx = updates.findIndex(u => u.slug === newUp.slug && u.approach === newUp.approach && (u.version || 1) === (newUp.version || 1));
      if (idx !== -1) {
        updates[idx] = newUp;
      } else {
        updates.push(newUp);
      }
    });
  }

  if (changes.deletedSolves && (changes.deletedSolves.newValue || []).length > 0) {
    const deletedIds = changes.deletedSolves.newValue || [];
    deletedIds.forEach(dId => {
      if (!deletes.includes(dId)) {
        deletes.push(dId);
      }
      const uIdx = updates.findIndex(u => u.id === dId);
      if (uIdx !== -1) updates.splice(uIdx, 1);
    });
  }

  // 3. Settings Sync
  let settingsToUpload = queue.settings;
  if (changes.githubSettings) {
    settingsToUpload = changes.githubSettings.newValue || {};
  }

  if (updates.length === 0 && deletes.length === 0 && (!settingsToUpload || Object.keys(settingsToUpload).length === 0)) {
    return;
  }

  const idToken = await getValidIdToken(authUser);
  if (!idToken) {
    console.warn("Could not obtain a valid Firebase ID token. Queuing sync for later retry.");
    queue.updates = updates;
    queue.deletes = deletes;
    queue.settings = settingsToUpload;
    await chrome.storage.local.set({ pendingFirestoreSync: queue });
    return;
  }

  await performSync(authUser.uid, idToken, updates, deletes, settingsToUpload, queue);

  if (changes.deletedSolves && (changes.deletedSolves.newValue || []).length > 0) {
    await chrome.storage.local.set({ deletedSolves: [] });
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
  if (exp && (exp - Date.now() > 5 * 60 * 1000)) {
    return authUser.idToken;
  }
  
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
    
    await chrome.storage.local.set({ auth_user: authUser });
    console.log("Firebase ID token refreshed successfully.");
    return authUser.idToken;
  } catch (err) {
    console.error("Token refresh failed:", err);
    return "";
  }
}
