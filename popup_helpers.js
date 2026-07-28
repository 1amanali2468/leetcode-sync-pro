// popup_helpers.js – Shared utilities, formatting, and authentication helpers for popup views.
// Loaded as an ES module by popup.js and other sub-modules.

import { FIREBASE_CONFIG } from "./firebase-config.js";
import { convertFromFirestoreFields, convertToFirestoreFields } from "./firestore_core.js";
import { getJwtExpiration } from "./auth_core.js";

export { convertFromFirestoreFields, convertToFirestoreFields, getJwtExpiration };

export function approachDisplayName(code) {
  const clean = (code || "").toLowerCase().trim();
  if (clean.includes("optimal") || clean === "oa" || clean.includes("(oa)")) return "OA";
  if (clean.includes("better") || clean === "ba" || clean.includes("(ba)")) return "BA";
  if (clean.includes("brute") || clean === "bf" || clean.includes("(bf)")) return "BF";
  return clean.toUpperCase();
}

export function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isSafeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (e) {
    return false;
  }
}

export { normalizeProblemSlug } from "./history_manager.js";

export function cleanDisplayName(name) {
  if (!name) return "";
  let clean = name.replace(/^(Step|Lec)\s*\d+\s*:\s*/i, "");
  return clean.replace(/^[0-9]+\s*[.)-]?\s+/, "");
}

export async function getValidIdToken(authUser) {
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
