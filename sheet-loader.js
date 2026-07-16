// sheet-loader.js - ES Module for dynamic sheet loading

const ACTIVE_SHEET_KEY = "leetsyncActiveSheet";
const sheetCache = {};
let manifestCache = null;

// Call this whenever customSheets storage changes to bust stale cache entries
export function clearSheetCache(sheetId) {
  if (sheetId) {
    delete sheetCache[sheetId];
  } else {
    // Clear all custom sheet entries
    for (const key of Object.keys(sheetCache)) {
      if (key.startsWith("custom_") || key === "all_imported_sheets") {
        delete sheetCache[key];
      }
    }
  }
}


export async function getBuiltinManifest() {
  if (manifestCache) return manifestCache;
  try {
    const url = chrome.runtime.getURL("data/builtin-sheets/manifest.json");
    const res = await fetch(url);
    manifestCache = await res.json();
    return manifestCache;
  } catch (e) {
    console.error("Failed to load built-in sheets manifest:", e);
    return [];
  }
}

export function denormalizeSheetData(sheetData, registry) {
  if (!sheetData) return {};
  const result = {};
  for (const [topicName, subtopics] of Object.entries(sheetData)) {
    result[topicName] = {};
    for (const [subtopicName, problems] of Object.entries(subtopics)) {
      result[topicName][subtopicName] = [];
      if (Array.isArray(problems)) {
        problems.forEach(pRef => {
          let p = pRef;
          if (typeof pRef === "string") {
            if (registry && registry[pRef]) {
              const reg = registry[pRef];
              p = {
                slug: pRef,
                title: reg.t || pRef,
                difficulty: reg.d || "Medium",
                leetcodeUrl: reg.u || ""
              };
            } else {
              // Registry fallback to prevent problems from disappearing in custom/imported sheets
              const slug = pRef.trim().toLowerCase();
              p = {
                slug,
                title: slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
                difficulty: "Medium",
                leetcodeUrl: ""
              };
            }
          }
          if (p && p.slug) {
            let slug = p.slug.trim().toLowerCase();
            const url = p.leetcodeUrl || p.url || "";
            if (url.includes("geeksforgeeks.org") || (url === "" && slug.match(/-\d{5,}$/))) {
              slug = slug.replace(/-[0-9]+$/, "");
            }
            result[topicName][subtopicName].push({ ...p, slug });
          }
        });
      }
    }
  }
  return result;
}

export async function loadSheet(sheetId) {
  if (!sheetId) return {};
  if (sheetCache[sheetId]) return sheetCache[sheetId];

  // Handle combined aggregation
  if (sheetId === "all_imported_sheets") {
    const manifest = await getBuiltinManifest();
    const promises = manifest.map(m => loadSheet(m.id));
    const loadedBuiltin = await Promise.all(promises);
    
    const builtinMap = {};
    manifest.forEach((m, idx) => {
      builtinMap[m.id] = loadedBuiltin[idx];
    });

    const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
    const customSheets = stored.customSheets || {};
    const registry = stored.customSheetsRegistry || {};
    const customSheetsData = {};

    // Build name maps for sheet attribution
    const builtinNames = {};
    manifest.forEach(m => { builtinNames[m.id] = m.name; });
    const customNames = {};

    for (const [key, obj] of Object.entries(customSheets)) {
      if (obj && obj.data) {
        customSheetsData[key] = denormalizeSheetData(obj.data, registry);
        customNames[key] = obj.name || key;
      }
    }

    const combined = getCombinedSheetsData(builtinMap, customSheetsData, builtinNames, customNames);

    // Debug breakdown — open DevTools console to see this
    const total = combined["All Combined"]["All Problems"].length;
    console.debug(`[LeetSync] All Combined: ${total} unique problems`);
    const bySheet = {};
    combined["All Combined"]["All Problems"].forEach(p => {
      (p.sheetsIn || []).forEach(s => { bySheet[s] = (bySheet[s] || 0) + 1; });
    });
    console.debug("[LeetSync] Contribution per sheet (includes overlaps):", bySheet);
    const uniquePerSheet = {};
    combined["All Combined"]["All Problems"].forEach(p => {
      if ((p.sheetsIn || []).length === 1) {
        const s = p.sheetsIn[0];
        uniquePerSheet[s] = (uniquePerSheet[s] || 0) + 1;
      }
    });
    console.debug("[LeetSync] Problems UNIQUE to only one sheet:", uniquePerSheet);

    sheetCache["all_imported_sheets"] = combined;
    return combined;
  }

  // Handle custom sheets
  if (sheetId.startsWith("custom_")) {
    const customKey = sheetId.substring(7);
    const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
    const customSheets = stored.customSheets || {};
    const registry = stored.customSheetsRegistry || {};
    const data = denormalizeSheetData(customSheets[customKey]?.data || {}, registry);
    sheetCache[sheetId] = sanitizeSheetData(data);
    return sheetCache[sheetId];
  }

  // Handle standard built-in sheets
  try {
    const url = chrome.runtime.getURL(`data/builtin-sheets/${sheetId}.json`);
    const res = await fetch(url);
    const data = await res.json();
    sheetCache[sheetId] = sanitizeSheetData(data);
    return sheetCache[sheetId];
  } catch (e) {
    console.error(`Failed to load built-in sheet: ${sheetId}`, e);
    return {};
  }
}

// Clean up placeholders like $undefined and sanitize titles/slugs
function sanitizeSheetData(sheet) {
  if (!sheet) return {};
  const cleaned = {};
  for (const [topic, subtopics] of Object.entries(sheet)) {
    cleaned[topic] = {};
    for (const [subtopic, problems] of Object.entries(subtopics)) {
      cleaned[topic][subtopic] = [];
      if (Array.isArray(problems)) {
        problems.forEach(p => {
          let slug = p.slug?.trim().toLowerCase() || "";
          if (slug.includes("$undefined") || slug === "undefined" || !slug) return;

          let url = p.leetcodeUrl || p.url || "";
          if (url.includes("$undefined") || url.includes("undefined")) {
            url = `https://leetcode.com/problems/${slug}`;
          }

          if (url.includes("geeksforgeeks.org") || (url === "" && slug.match(/-\d{5,}$/))) {
            slug = slug.replace(/-[0-9]+$/, "");
          }

          cleaned[topic][subtopic].push({
            title: p.title || p.name || slug,
            difficulty: p.difficulty || "Medium",
            leetcodeUrl: url,
            slug
          });
        });
      }
    }
  }
  return cleaned;
}
function getCombinedSheetsData(builtinSheetsMap, customSheetsMap, builtinNames = {}, customNames = {}) {
  const combined = { "All Combined": { "All Problems": [] } };
  const globalSlugs = new Set();
  
  // Maps to find the canonical problem object already added
  const slugToProblem = {}; // slug -> problemObject
  const urlToProblem = {};  // url -> problemObject

  const addProblems = (sheet, sheetName) => {
    if (!sheet) return;
    for (const [topic, subtopics] of Object.entries(sheet)) {
      for (const [subtopic, problems] of Object.entries(subtopics)) {
        if (Array.isArray(problems)) {
          problems.forEach(p => {
            const slug = p.slug?.trim().toLowerCase();
            if (!slug) return;

            const url = (p.leetcodeUrl || p.url || "").trim().toLowerCase().replace(/\/$/, "");
            
            // Check if this problem (by slug or by URL) was already added
            let existingProblem = slugToProblem[slug];
            if (!existingProblem && url && urlToProblem[url]) {
              existingProblem = urlToProblem[url];
            }

            if (existingProblem) {
              // Duplicate found! Just add the sheetName to its sheetsIn array
              if (sheetName && !existingProblem.sheetsIn.includes(sheetName)) {
                existingProblem.sheetsIn.push(sheetName);
              }
              // Also map this slug/URL to the existing problem so future lookups also find it
              slugToProblem[slug] = existingProblem;
              if (url) urlToProblem[url] = existingProblem;
            } else {
              // New unique problem! Create the canonical object
              const newProblem = {
                title: p.title || p.name,
                difficulty: p.difficulty || "Medium",
                leetcodeUrl: p.leetcodeUrl || p.url || "",
                slug,
                sheetsIn: sheetName ? [sheetName] : []
              };
              
              combined["All Combined"]["All Problems"].push(newProblem);
              
              // Register in maps
              slugToProblem[slug] = newProblem;
              if (url) urlToProblem[url] = newProblem;
            }
          });
        }
      }
    }
  };

  // Add all loaded built-in sheets
  for (const [id, sheet] of Object.entries(builtinSheetsMap)) {
    addProblems(sheet, builtinNames[id] || id);
  }

  // Add all custom sheets
  for (const [key, sheet] of Object.entries(customSheetsMap)) {
    addProblems(sheet, customNames[key] || key);
  }

  return combined;
}
// Persist and populate select element options
export async function populateSheetDropdown(selectEl, includeCombined) {
  if (!selectEl) return;

  const manifest = await getBuiltinManifest();
  const stored = await chrome.storage.local.get(["customSheets", ACTIVE_SHEET_KEY]);
  const customSheets = stored.customSheets || {};
  let currentSelection = stored[ACTIVE_SHEET_KEY];

  // 1. Build built-in options list and sort alphabetically
  const builtinOptions = manifest.map(m => ({ value: m.id, text: m.name }));
  builtinOptions.sort((a, b) => a.text.localeCompare(b.text));

  // 2. Build custom options list with platform-aware icons
  const customOptions = [];
  const PLATFORM_SHEET_KEYS = new Set(["gfg", "leetcode"]);
  for (const [key, obj] of Object.entries(customSheets)) {
    // Prevent rendering if duplicates with static options
    if (manifest.some(m => m.id === key)) continue;
    let icon;
    if (key === "gfg") icon = "🟢";
    else if (key === "leetcode") icon = "🔵";
    else icon = "⭐";
    customOptions.push({ value: `custom_${key}`, text: `${icon} ${obj.name || key}` });
  }
  customOptions.sort((a, b) => a.text.localeCompare(b.text));

  // 3. Clear and populate dropdown
  selectEl.innerHTML = "";

  // Add "All Sheets (Combined)" option at the very top if included
  if (includeCombined) {
    const opt = document.createElement("option");
    opt.value = "all_imported_sheets";
    opt.textContent = "All Sheets (Combined)";
    selectEl.appendChild(opt);
  }

  builtinOptions.forEach(optData => {
    const opt = document.createElement("option");
    opt.value = optData.value;
    opt.textContent = optData.text;
    selectEl.appendChild(opt);
  });

  customOptions.forEach(optData => {
    const opt = document.createElement("option");
    opt.value = optData.value;
    opt.textContent = optData.text;
    selectEl.appendChild(opt);
  });

  // 4. Restore selection, falling back to striver_a2z_sheet by default
  const validValues = Array.from(selectEl.options).map(o => o.value);
  if (currentSelection && validValues.includes(currentSelection)) {
    selectEl.value = currentSelection;
  } else {
    const defaultVal = validValues.includes("striver_a2z_sheet") ? "striver_a2z_sheet" : (validValues[0] || "");
    selectEl.value = defaultVal;
    await chrome.storage.local.set({ [ACTIVE_SHEET_KEY]: defaultVal });
  }

  // Add change event listener to automatically save selection
  selectEl.addEventListener("change", async () => {
    await chrome.storage.local.set({ [ACTIVE_SHEET_KEY]: selectEl.value });
  });
}

export async function getCrossSheetMap() {
  try {
    const url = chrome.runtime.getURL("data/builtin-sheets/cross_sheet_frequency.json");
    const res = await fetch(url);
    const baseMap = await res.json();

    const manifest = await getBuiltinManifest();
    const stored = await chrome.storage.local.get("customSheets");
    const customSheets = stored.customSheets || {};

    for (const [sheetKey, sheetObj] of Object.entries(customSheets)) {
      if (manifest.some(m => m.id === sheetKey || m.name === sheetObj.name)) continue;

      const sheetName = `⭐ ${sheetObj.name || sheetKey}`;
      const sheetData = sheetObj.data || {};
      
      for (const [topic, subtopics] of Object.entries(sheetData)) {
        for (const [subtopic, problems] of Object.entries(subtopics)) {
          if (Array.isArray(problems)) {
            problems.forEach(p => {
              let slug = (typeof p === "string" ? p : p.slug)?.trim().toLowerCase();
              if (!slug) return;

              const pUrl = (typeof p === "object" ? (p.leetcodeUrl || p.url) : "") || "";
              if (pUrl.includes("geeksforgeeks.org") || (pUrl === "" && slug.match(/-\d{5,}$/))) {
                slug = slug.replace(/-[0-9]+$/, "");
              }

              if (!baseMap[slug]) {
                baseMap[slug] = [];
              }
              if (!baseMap[slug].includes(sheetName)) {
                baseMap[slug].push(sheetName);
              }
            });
          }
        }
      }
    }
    return baseMap;
  } catch (e) {
    console.error("Failed to load cross sheet frequency map:", e);
    return {};
  }
}
