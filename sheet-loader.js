// sheet-loader.js - ES Module for dynamic sheet loading

const ACTIVE_SHEET_KEY = "leetsyncActiveSheet";
const sheetCache = {};
let manifestCache = null;

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
          if (typeof pRef === "string" && registry && registry[pRef]) {
            p = registry[pRef];
          }
          if (p && p.slug) {
            let slug = p.slug.trim().toLowerCase();
            const url = p.leetcodeUrl || p.url || "";
            if (url.includes("geeksforgeeks.org") || slug.match(/-[0-9]+$/)) {
              slug = slug.replace(/-[0-9]+$/, "");
            }
            result[topicName][subtopicName].push({
              ...p,
              slug: slug
            });
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
    for (const [key, obj] of Object.entries(customSheets)) {
      if (obj && obj.data) {
        customSheetsData[key] = denormalizeSheetData(obj.data, registry);
      }
    }

    const combined = getCombinedSheetsData(builtinMap, customSheetsData);
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

          if (url.includes("geeksforgeeks.org") || slug.match(/-[0-9]+$/)) {
            slug = slug.replace(/-[0-9]+$/, "");
          }

          cleaned[topic][subtopic].push({
            title: p.title || p.name || slug,
            difficulty: p.difficulty || "Medium",
            leetcodeUrl: url,
            slug: slug
          });
        });
      }
    }
  }
  return cleaned;
}

function getCombinedSheetsData(builtinSheetsMap, customSheetsMap) {
  const combined = { "All Combined": { "All Problems": [] } };
  const globalSlugs = new Set();

  const addProblems = (sheet) => {
    if (!sheet) return;
    for (const [topic, subtopics] of Object.entries(sheet)) {
      for (const [subtopic, problems] of Object.entries(subtopics)) {
        if (Array.isArray(problems)) {
          problems.forEach(p => {
            const slug = p.slug?.trim().toLowerCase();
            if (!slug || globalSlugs.has(slug)) return;

            globalSlugs.add(slug);
            combined["All Combined"]["All Problems"].push({
              title: p.title || p.name,
              difficulty: p.difficulty || "Medium",
              leetcodeUrl: p.leetcodeUrl,
              slug: slug
            });
          });
        }
      }
    }
  };

  // Add all loaded built-in sheets
  for (const sheet of Object.values(builtinSheetsMap)) {
    addProblems(sheet);
  }

  // Add all custom sheets
  for (const sheet of Object.values(customSheetsMap)) {
    addProblems(sheet);
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

  // 2. Build custom options list and sort alphabetically
  const customOptions = [];
  for (const [key, obj] of Object.entries(customSheets)) {
    // Prevent rendering if duplicates with static options
    if (manifest.some(m => m.id === key)) continue;
    customOptions.push({ value: `custom_${key}`, text: `⭐ ${obj.name || key}` });
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
              if (pUrl.includes("geeksforgeeks.org") || slug.match(/-[0-9]+$/)) {
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
