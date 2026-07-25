// background_sync.js – Handles real-time cloud Firestore sync and token refresh logic.
// Loaded as an ES module by background.js.

import { FIREBASE_CONFIG } from "./firebase-config.js";
import { batchWriteToFirestore, convertToFirestoreFields } from "./firestore_sync.js";

// Register real-time sync listeners
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") return;
  if (!changes.leetsyncHistory && !changes.githubSettings && !changes.deletedSolves) return;

  const authData = await chrome.storage.local.get("auth_user");
  const authUser = authData.auth_user;
  if (!authUser || !authUser.uid) return;

  const uid = authUser.uid;
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/users/${uid}`;

  const hasHistoryOrSettings = changes.leetsyncHistory || changes.githubSettings;
  const hasDeletions = changes.deletedSolves && (changes.deletedSolves.newValue || []).length > 0;
  if (!hasHistoryOrSettings && !hasDeletions) return;

  const idToken = await getValidIdToken(authUser);
  if (!idToken) {
    console.warn("Could not obtain a valid Firebase ID token. Sync skipped.");
    return;
  }

  const updates = [];
  const deletes = [];

  // Tombstone Deletion Sync
  if (changes.deletedSolves) {
    const deletedIds = changes.deletedSolves.newValue || [];
    if (deletedIds.length > 0) {
      deletes.push(...deletedIds);
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

    updates.push(...changedEntries);
  }

  if (updates.length > 0 || deletes.length > 0) {
    try {
      await batchWriteToFirestore(uid, idToken, { updates, deletes });
      if (deletes.length > 0) {
        await chrome.storage.local.set({ deletedSolves: [] });
      }
    } catch (err) {
      console.error("Firestore batch sync failed:", err);
    }
  }

  // 2. Settings Sync
  if (changes.githubSettings) {
    const newSettings = changes.githubSettings.newValue || {};
    try {
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

