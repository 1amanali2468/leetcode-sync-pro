// popup_helpers.js – Shared utilities, formatting, and authentication helpers for popup views.
// Loaded as an ES module by popup.js and other sub-modules.

import { FIREBASE_CONFIG } from "./firebase-config.js";

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

export function normalizeProblemSlug(slug, url = "") {
  let normalized = (slug || "").trim().toLowerCase();
  if (!normalized) return "";
  if ((url || "").includes("geeksforgeeks.org")) {
    normalized = normalized.replace(/-?\d+$/, "").replace(/-+$/, "");
  }
  return normalized;
}

export function cleanDisplayName(name) {
  if (!name) return "";
  let clean = name.replace(/^(Step|Lec)\s*\d+\s*:\s*/i, "");
  return clean.replace(/^[0-9]+\s*[.)-]?\s+/, "");
}

export function convertFromFirestoreFields(fields) {
  const obj = {};
  for (const [key, valObj] of Object.entries(fields)) {
    if (!valObj) continue;
    if ("stringValue" in valObj) {
      obj[key] = valObj.stringValue;
    } else if ("doubleValue" in valObj) {
      obj[key] = Number(valObj.doubleValue);
    } else if ("integerValue" in valObj) {
      obj[key] = Number(valObj.integerValue);
    } else if ("booleanValue" in valObj) {
      obj[key] = valObj.booleanValue;
    } else if ("arrayValue" in valObj) {
      const values = valObj.arrayValue.values || [];
      obj[key] = values.map(v => v.stringValue || "");
    }
  }
  return obj;
}

export function convertToFirestoreFields(obj) {
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

export function getJwtExpiration(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return 0;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.exp * 1000;
  } catch (e) {
    return 0;
  }
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
