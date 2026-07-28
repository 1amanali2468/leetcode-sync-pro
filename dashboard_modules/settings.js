// dashboard_modules/settings.js - Settings Screen, Sync and Custom Sheets Manager Controller
import { el, STORAGE_KEYS, state } from "./state.js";
import { populateSheetDropdown as populateSheetDropdownHelper, clearSheetCache } from "../sheet-loader.js";
import { cleanDisplayName, normalizeProblemSlug, classifyDifficulty, escapeHtml } from "./ui_helpers.js";
// Registered by dashboard.js to avoid circular import
let _renderSheets = null;
let _getActiveSheetProblems = null;
export function registerSheetCallbacksForSettings({ renderSheets, getActiveSheetProblems }) {
  _renderSheets = renderSheets;
  _getActiveSheetProblems = getActiveSheetProblems;
}

let onSettingsChangeCallback = null;

export function registerSettingsChangeCallback(cb) {
  onSettingsChangeCallback = cb;
}

export function setupSettingsListeners() {
  if (!el.btnSaveSettings) return;
  el.btnSaveSettings.addEventListener("click", saveSettings);
  el.btnDisconnect.addEventListener("click", disconnect);
  if (el.btnImportCustomSheet) {
    el.btnImportCustomSheet.addEventListener("click", handleCustomSheetImport);
  }
}

export async function saveSettings() {
  el.btnSaveSettings.disabled = true;
  el.btnSaveSettings.textContent = "Saving...";

  const newSettings = {
    repo: el.txtRepo.value.trim(),
    branch: el.txtBranch.value.trim(),
    basePath: el.txtBasePath.value.trim()
  };

  const data = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const existing = data[STORAGE_KEYS.settings] || {};
  const merged = { ...existing, ...newSettings };

  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: merged });
  
  el.btnSaveSettings.disabled = false;
  el.btnSaveSettings.textContent = "Save Configurations";
  alert("Settings saved successfully!");
}



export async function disconnect() {
  if (!confirm("Are you sure you want to disconnect? This will log you out and clear local cache.")) return;
  await chrome.storage.local.remove(["auth_user", "githubSettings", "leetsyncSettings", "github_token", "github_profile"]);
  alert("Disconnected! Reloading page...");
  window.location.reload();
}

export async function syncCloudData() {
  chrome.runtime.sendMessage({ type: "SYNC_FIRESTORE_DATA" });
}

export async function forceSync() {
  el.syncStatus.textContent = "Syncing...";
  chrome.runtime.sendMessage({ type: "SYNC_FIRESTORE_DATA" }, (response) => {
    if (chrome.runtime.lastError) {
      el.syncStatus.textContent = "Error";
    } else {
      el.syncStatus.textContent = "Synced";
      if (onSettingsChangeCallback) {
        onSettingsChangeCallback();
      }
      setTimeout(() => el.syncStatus.textContent = "Idle", 3000);
    }
  });
}

export async function populateSheetDropdown() {
  const select = el.sheetSelect;
  if (!select) return;

  await populateSheetDropdownHelper(select, true);

  if (_renderSheets) _renderSheets();

  await renderCustomSheetsManager();
}

export async function migrateCustomSheets() {
  const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
  const customSheets = stored.customSheets || {};
  let registry = stored.customSheetsRegistry || {};
  let migrated = false;

  if (!customSheets["gfg"]) {
    customSheets["gfg"] = { name: "GFG", isPlatformSheet: true, data: { "General": { "Problems": [] } } };
    migrated = true;
  }
  if (!customSheets["leetcode"]) {
    customSheets["leetcode"] = { name: "LeetCode", isPlatformSheet: true, data: { "General": { "Problems": [] } } };
    migrated = true;
  }

  for (const [sheetKey, sheetObj] of Object.entries(customSheets)) {
    if (sheetObj && sheetObj.data) {
      let sheetMigrated = false;
      const newData = {};
      
      for (const [topicName, subtopics] of Object.entries(sheetObj.data)) {
        newData[topicName] = {};
        for (const [subtopicName, problems] of Object.entries(subtopics)) {
          newData[topicName][subtopicName] = [];
          if (Array.isArray(problems)) {
            problems.forEach(p => {
              if (p && typeof p === "object" && !Array.isArray(p)) {
                const slug = p.slug || p.title?.toLowerCase().replace(/[^a-z0-9]/g, "-");
                if (slug) {
                  registry[slug] = {
                    t: p.title || slug,
                    d: p.difficulty || "Medium",
                    u: p.leetcodeUrl || `https://leetcode.com/problems/${slug}/`
                  };
                  newData[topicName][subtopicName].push(slug);
                  sheetMigrated = true;
                }
              } else {
                newData[topicName][subtopicName].push(p);
              }
            });
          }
        }
      }
      if (sheetMigrated) {
        sheetObj.data = newData;
        migrated = true;
      }
    }
  }
  
  const activeSlugs = new Set();
  for (const [sheetKey, sheetObj] of Object.entries(customSheets)) {
    if (sheetObj && sheetObj.data) {
      for (const [topicName, subtopics] of Object.entries(sheetObj.data)) {
        for (const [subtopicName, problems] of Object.entries(subtopics)) {
          if (Array.isArray(problems)) {
            problems.forEach(p => {
              if (typeof p === "string") activeSlugs.add(p);
            });
          }
        }
      }
    }
  }
  
  let gcDone = false;
  for (const slug of Object.keys(registry)) {
    if (!activeSlugs.has(slug)) {
      delete registry[slug];
      gcDone = true;
    }
  }
  
  if (migrated || gcDone) {
    await chrome.storage.local.set({
      customSheets,
      customSheetsRegistry: registry
    });
    console.log("Custom sheets migrated to normalized format successfully.");
  }
}

export async function handleCustomSheetImport() {
  const url = el.txtCustomSheetUrl.value.trim();
  let displayName = el.txtCustomSheetName.value.trim();
  const statusEl = el.importStatus;

  if (!url) {
    alert("Please enter a valid sheet resource URL!");
    return;
  }

  el.btnImportCustomSheet.disabled = true;
  el.btnImportCustomSheet.textContent = "Importing...";
  statusEl.style.color = "var(--clr-primary)";
  statusEl.textContent = "⏳ Fetching page content...";

  try {
    let parsedData = {};

    if (url.includes("docs.google.com/spreadsheets")) {
      statusEl.textContent = "⏳ Extracting spreadsheet components...";
      const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!sheetIdMatch) {
        throw new Error("Could not extract spreadsheet ID from the URL.");
      }
      const spreadsheetId = sheetIdMatch[1];
      
      let gid = "0";
      const gidMatch = url.match(/[?&]gid=([0-9]+)/) || url.match(/#gid=([0-9]+)/);
      if (gidMatch) {
        gid = gidMatch[1];
      }
      
      const xlsxUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx&gid=${gid}`;
      const response = await fetch(xlsxUrl);
      if (!response.ok) {
        throw new Error("Could not fetch the Google Sheet. Please verify it is shared as 'Anyone with the link can view'.");
      }
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      const files = {};
      
      let idx = 0;
      while (idx < bytes.length - 46) {
        if (bytes[idx] === 0x50 && bytes[idx+1] === 0x4B && bytes[idx+2] === 0x01 && bytes[idx+3] === 0x02) {
          const compressionMethod = bytes[idx + 10] | (bytes[idx + 11] << 8);
          const compressedSize = bytes[idx + 20] | (bytes[idx + 21] << 8) | (bytes[idx + 22] << 16) | (bytes[idx + 23] << 24);
          const filenameLen = bytes[idx + 28] | (bytes[idx + 29] << 8);
          const extraFieldLen = bytes[idx + 30] | (bytes[idx + 31] << 8);
          const commentLen = bytes[idx + 32] | (bytes[idx + 33] << 8);
          const localHeaderOffset = bytes[idx + 42] | (bytes[idx + 43] << 8) | (bytes[idx + 44] << 16) | (bytes[idx + 45] << 24);
          
          const filenameBytes = bytes.slice(idx + 46, idx + 46 + filenameLen);
          const filename = new TextDecoder().decode(filenameBytes);
          
          const lhIdx = localHeaderOffset;
          if (lhIdx < bytes.length - 30) {
            const lhFilenameLen = bytes[lhIdx + 26] | (bytes[lhIdx + 27] << 8);
            const lhExtraFieldLen = bytes[lhIdx + 28] | (bytes[lhIdx + 29] << 8);
            const dataOffset = lhIdx + 30 + lhFilenameLen + lhExtraFieldLen;
            const compressedData = bytes.slice(dataOffset, dataOffset + compressedSize);
            
            if (filename.includes("sheet") || filename.includes("sharedStrings") || filename.includes("rels")) {
              let decompressedText = "";
              if (compressionMethod === 8) {
                const decompressed = await decompressDeflateRaw(compressedData);
                decompressedText = new TextDecoder().decode(decompressed);
              } else if (compressionMethod === 0) {
                decompressedText = new TextDecoder().decode(compressedData);
              }
              files[filename] = decompressedText;
            }
          }
          idx += 46 + filenameLen + extraFieldLen + commentLen;
        } else {
          idx++;
        }
      }
      
      const sheetXml = files["xl/worksheets/sheet1.xml"];
      const relsXml = files["xl/worksheets/_rels/sheet1.xml.rels"];
      const sharedStringsXml = files["xl/sharedStrings.xml"];
      
      if (!sheetXml || !relsXml || !sharedStringsXml) {
        throw new Error("Invalid or incomplete Google Sheet structure received.");
      }
      
      if (!displayName) {
        const titleMatch = sheetXml.match(/<sheetName[^>]*name="([^"]+)"/i);
        displayName = titleMatch ? titleMatch[1].replace(/ - Google Sheets/i, "").trim() : "Google Sheet DSA";
        if (displayName.length > 40) displayName = displayName.substring(0, 37) + "...";
      }
      
      const sharedStrings = [];
      const siRegex = /<si>([\s\S]*?)<\/si>/gi;
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/gi;
      let siMatch;
      while ((siMatch = siRegex.exec(sharedStringsXml)) !== null) {
        const siContent = siMatch[1];
        let text = "";
        let tMatch;
        while ((tMatch = tRegex.exec(siContent)) !== null) {
          text += tMatch[1];
        }
        sharedStrings.push(text);
      }
      
      const relationships = {};
      const relRegex = /<Relationship\s+[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/gi;
      let relMatch;
      while ((relMatch = relRegex.exec(relsXml)) !== null) {
        relationships[relMatch[1]] = relMatch[2];
      }
      
      const cellHyperlinks = {};
      const hyperlinkRegex = /<hyperlink\s+([^>]+?)\/>/gi;
      let hlMatch;
      while ((hlMatch = hyperlinkRegex.exec(sheetXml)) !== null) {
        const attrs = hlMatch[1];
        const refMatch = attrs.match(/ref="([^"]+)"/);
        const idMatch = attrs.match(/r:id="([^"]+)"/);
        if (refMatch && idMatch) {
          cellHyperlinks[refMatch[1]] = relationships[idMatch[1]] || "";
        }
      }
      
      const grid = {};
      const rowRegex = /<row\s+r="(\d+)"[^>]*>([\s\S]*?)<\/row>/gi;
      const cRegex = /<c\s+([^>]+?)(?:\/>|>([\s\S]*?)<\/c>)/gi;
      const vRegex = /<v>([^<]+)<\/v>/i;
      
      let rowMatch;
      while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
        const rowNum = parseInt(rowMatch[1], 10);
        const rowContent = rowMatch[2];
        grid[rowNum] = {};
        
        let cMatch;
        while ((cMatch = cRegex.exec(rowContent)) !== null) {
          const attrs = cMatch[1];
          const cContent = cMatch[2] || "";
          
          const rMatch = attrs.match(/r="([A-Z]+)(\d+)"/);
          if (rMatch) {
            const colLetter = rMatch[1];
            const tMatch = attrs.match(/t="([^"]+)"/);
            const type = tMatch ? tMatch[1] : "";
            
            const vMatch = vRegex.exec(cContent);
            if (vMatch) {
              const val = vMatch[1];
              let finalVal = val;
              if (type === "s") {
                const sIdx = parseInt(val, 10);
                finalVal = sharedStrings[sIdx] || "";
              }
              grid[rowNum][colLetter] = finalVal;
            }
          }
        }
      }
      
      const rawParsed = {};
      let currentTopic = "General";
      let currentSubtopic = "Problems";
      let pendingTitle = "";
      
      const sortedRowNums = Object.keys(grid).map(n => parseInt(n, 10)).sort((a, b) => a - b);
      
      sortedRowNums.forEach(rowNum => {
        const row = grid[rowNum];
        
        const hasC = !!row["C"];
        const hasD = !!row["D"];
        const hasE = !!row["E"];
        
        let topicVal = "";
        let subtopicVal = "";
        let problemVal = "";
        
        if (hasE) {
          problemVal = row["E"];
          if (hasC && hasD) {
            topicVal = row["C"];
            subtopicVal = row["D"];
          } else if (hasD) {
            subtopicVal = row["D"];
          } else if (hasC) {
            subtopicVal = row["C"];
          }
        } else if (hasD) {
          problemVal = row["D"];
          if (hasC) {
            subtopicVal = row["C"];
          }
        } else if (hasC) {
          problemVal = row["C"];
        }
        
        const diffVal = row["G"] ? row["G"].trim() : "Medium";
        
        if (topicVal && topicVal.trim() !== "Topic") {
          currentTopic = topicVal.trim();
        }
        if (subtopicVal && subtopicVal.trim() !== "Subtopic") {
          currentSubtopic = subtopicVal.trim();
        }
        
        const cellRef = `F${rowNum}`;
        const url = cellHyperlinks[cellRef];
        
        if (url && (url.includes("leetcode.com") || url.includes("geeksforgeeks.org"))) {
          const problemName = (problemVal ? problemVal.trim() : "") || pendingTitle || "Coding Problem";
          if (problemName === "Problem Name") return;
          
          let slug = "";
          try {
            const urlObj = new URL(url);
            const match = urlObj.pathname.match(/\/problems\/([a-zA-Z0-9_-]+)/);
            if (match) slug = match[1];
          } catch(e) {}
          if (!slug) {
            slug = problemName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
          }
          
          const difficulty = classifyDifficulty(diffVal);
          
          const tKey = currentTopic.replace(/^[0-9]+\s*[.)-]?\s+/, "").trim();
          const sKey = currentSubtopic.replace(/^[0-9]+\s*[.)-]?\s+/, "").trim();
          
          if (!rawParsed[tKey]) rawParsed[tKey] = {};
          if (!rawParsed[tKey][sKey]) rawParsed[tKey][sKey] = [];
          
          rawParsed[tKey][sKey].push({
            title: problemName,
            slug: slug,
            difficulty: difficulty,
            leetcodeUrl: url
          });
          pendingTitle = "";
        } else {
          const vals = Object.entries(row)
            .filter(([col, val]) => col !== "A" && col !== "B" && val && val.trim().length > 0)
            .map(([col, val]) => val.trim());
          if (vals.length === 1 && vals[0] !== "DSA Master Sheet") {
            pendingTitle = vals[0];
          }
        }
      });
      
      let topicIdx = 1;
      for (const [topic, subtopics] of Object.entries(rawParsed)) {
        const stepNum = String(topicIdx).padStart(2, "0");
        const cleanTopic = topic.replace(/^[0-9]+\s*[.)-]?\s+/, "").trim();
        const topicName = `Step ${stepNum}: ${cleanTopic}`;
        parsedData[topicName] = {};
        topicIdx++;
        
        let subIdx = 1;
        for (const [subtopic, problems] of Object.entries(subtopics)) {
          const lecNum = String(subIdx).padStart(2, "0");
          const cleanSub = subtopic.replace(/^[0-9]+\s*[.)-]?\s+/, "").trim();
          const subtopicName = `Lec ${lecNum}: ${cleanSub}`;
          parsedData[topicName][subtopicName] = problems;
          subIdx++;
        }
      }
    } else if (url.includes("leetcode.com/studyplan/")) {
      statusEl.textContent = "⏳ Querying LeetCode GraphQL API...";
      const studyPlanMatch = url.match(/\/studyplan\/([a-zA-Z0-9-_]+)/);
      if (!studyPlanMatch) {
        throw new Error("Could not extract Study Plan slug from the URL.");
      }
      const planSlug = studyPlanMatch[1];
      
      const query = `
        query studyPlanV2Detail($planSlug: String!) {
          studyPlanV2Detail(planSlug: $planSlug) {
            name
            slug
            planSubGroups {
              name
              slug
              questions {
                title
                titleSlug
                difficulty
              }
            }
          }
        }
      `;
      
      const response = await fetch('https://leetcode.com/graphql/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: { planSlug }
        })
      });
      
      if (!response.ok) {
        throw new Error(`LeetCode API returned status ${response.status}`);
      }
      
      const result = await response.json();
      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0].message);
      }
      
      const detail = result.data?.studyPlanV2Detail;
      if (!detail) {
        throw new Error("No study plan details returned from LeetCode.");
      }
      
      if (!displayName) {
        displayName = detail.name || "LeetCode Study Plan";
      }
      
      let topicIdx = 1;
      detail.planSubGroups.forEach(group => {
        const cleanTopicName = group.name || "General";
        const stepNum = String(topicIdx).padStart(2, "0");
        const topicName = `Step ${stepNum}: ${cleanTopicName}`;
        const subtopicName = "Problems";
        
        if (!parsedData[topicName]) {
          parsedData[topicName] = {};
        }
        parsedData[topicName][subtopicName] = [];
        
        group.questions.forEach(q => {
          parsedData[topicName][subtopicName].push({
            title: q.title,
            slug: q.titleSlug,
            difficulty: classifyDifficulty(q.difficulty),
            leetcodeUrl: `https://leetcode.com/problems/${q.titleSlug}/`
          });
        });
        topicIdx++;
      });
    } else {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load page. Server returned: ${response.status}`);
      }
      
      statusEl.textContent = "⏳ Parsing HTML structure...";
      const htmlText = await response.text();
      const docParser = new DOMParser();
      const doc = docParser.parseFromString(htmlText, "text/html");

      if (!displayName) {
        displayName = doc.title ? doc.title.replace(/[\r\n\t]+/g, " ").trim() : "Custom Imported Sheet";
        if (displayName.length > 40) displayName = displayName.substring(0, 37) + "...";
      }

      if (url.includes("takeuforward.org") || htmlText.includes("self.__next_f.push")) {
      const segments = [];
      const segmentRegex = /self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)/g;
      let segMatch;
      while ((segMatch = segmentRegex.exec(htmlText)) !== null) {
        segments.push(segMatch[1]);
      }
      const rawData = segments.join("");
      
      const searchStr = '\\"sections\\":[';
      const startIdx = rawData.indexOf(searchStr);
      if (startIdx !== -1) {
        const arrayStartIdx = startIdx + searchStr.length - 1;
        let bracketCount = 0;
        let endIdx = -1;
        for (let i = arrayStartIdx; i < rawData.length; i++) {
          const char = rawData[i];
          if (char === '[') bracketCount++;
          else if (char === ']') {
            bracketCount--;
            if (bracketCount === 0) {
              endIdx = i;
              break;
            }
          }
        }
        
        if (endIdx !== -1) {
          try {
            const arrayString = rawData.substring(arrayStartIdx, endIdx + 1);
            const jsonString = arrayString
              .replace(/\\"/g, '"')
              .replace(/\\u0022/g, '"')
              .replace(/\\\\/g, '\\');
            
            const sections = JSON.parse(jsonString);
            sections.forEach((sec, secIdx) => {
              if (sec.category_name && sec.subcategories) {
                const stepNum = String(secIdx + 1).padStart(2, "0");
                const cleanCategory = sec.category_name.replace(/^[0-9]+\s*[.)-]?\s+/, "").replace(/^Step\s*\d+\s*:\s*/i, "").trim();
                const topicName = `Step ${stepNum}: ${cleanCategory}`;
                if (!parsedData[topicName]) parsedData[topicName] = {};
                
                sec.subcategories.forEach((sub, subIdx) => {
                  const lecNum = String(subIdx + 1).padStart(2, "0");
                  const cleanSubcategory = sub.subcategory_name.replace(/^[0-9]+\s*[.)-]?\s+/, "").replace(/^Lec\s*\d+\s*:\s*/i, "").trim();
                  const subtopicName = `Lec ${lecNum}: ${cleanSubcategory}`;
                  if (!parsedData[topicName][subtopicName]) parsedData[topicName][subtopicName] = [];
                  
                  sub.problems.forEach(p => {
                    let pUrl = p.leetcode;
                    if (!pUrl || pUrl === "$undefined") {
                      if (p.plus && (p.plus.includes("leetcode.com") || p.plus.includes("geeksforgeeks.org"))) {
                        pUrl = p.plus;
                      } else if (p.article && (p.article.includes("leetcode.com") || p.article.includes("geeksforgeeks.org"))) {
                        pUrl = p.article;
                      } else {
                        pUrl = p.article || "";
                      }
                    }
                    
                    let slug = "";
                    if (pUrl) {
                      try {
                        const cleanUrl = pUrl.split("#")[0].split("?")[0];
                        const urlObj = new URL(cleanUrl);
                        const match = urlObj.pathname.match(/\/problems\/([a-zA-Z0-9_-]+)/);
                        if (match) slug = match[1];
                      } catch(e) {}
                    }
                    if (!slug) {
                      slug = p.problem_name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
                    }
                    
                    parsedData[topicName][subtopicName].push({
                      title: p.problem_name.trim(),
                      slug: slug,
                      difficulty: classifyDifficulty(p.difficulty),
                      leetcodeUrl: pUrl
                    });
                  });
                });
              }
              else if (sec.topic && sec.problems) {
                const stepNum = String(secIdx + 1).padStart(2, "0");
                const cleanTopic = sec.topic.replace(/^[0-9]+\s*[.)-]?\s+/, "").replace(/^Step\s*\d+\s*:\s*/i, "").trim();
                const topicName = `Step ${stepNum}: ${cleanTopic}`;
                if (!parsedData[topicName]) parsedData[topicName] = {};
                
                const subName = sec.subTopic || sec.subtopic || "General";
                const cleanSub = subName.replace(/^[0-9]+\s*[.)-]?\s+/, "").replace(/^Lec\s*\d+\s*:\s*/i, "").trim();
                const subtopicName = `Lec 01: ${cleanSub}`;
                if (!parsedData[topicName][subtopicName]) parsedData[topicName][subtopicName] = [];
                
                sec.problems.forEach(p => {
                  const pUrl = p.problemUrl || p.url || "";
                  if (!pUrl || (!pUrl.includes("leetcode.com") && !pUrl.includes("geeksforgeeks.org"))) return;
                  
                  let slug = "";
                  try {
                    const cleanUrl = pUrl.split("#")[0].split("?")[0];
                    const urlObj = new URL(cleanUrl);
                    const match = urlObj.pathname.match(/\/problems\/([a-zA-Z0-9_-]+)/);
                    if (match) slug = match[1];
                  } catch(e) {}
                  
                  const pName = p.title || p.problemName || p.name || "Coding Problem";
                  if (!slug) {
                    slug = pName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
                  }
                  
                  parsedData[topicName][subtopicName].push({
                    title: pName.trim(),
                    slug: slug,
                    difficulty: classifyDifficulty(p.difficulty),
                    leetcodeUrl: pUrl
                  });
                });
              }
            });
          } catch (jsonErr) {
            console.error("Failed to parse Next.js hydration payload", jsonErr);
          }
        }
      }
    }

    if (Object.keys(parsedData).length === 0) {
      const links = doc.querySelectorAll('a[href*="leetcode.com/problems"], a[href*="geeksforgeeks.org/problems"]');
      if (links.length > 0) {
        statusEl.textContent = `⏳ Compiling ${links.length} problems...`;
        links.forEach(link => {
          try {
            const urlStr = link.href;
            const urlObj = new URL(urlStr);
            const pathname = urlObj.pathname;
            const hostname = urlObj.hostname;
            let slug = "";
            let title = link.textContent.trim() || "";
            
            const rawParentText = link.parentElement ? link.parentElement.textContent : "";
            const difficulty = classifyDifficulty(rawParentText);

            if (hostname.includes("leetcode.com") || hostname.includes("geeksforgeeks.org")) {
              const match = pathname.match(/\/problems\/([a-zA-Z0-9_-]+)/);
              if (match) slug = match[1];
            }

            if (!slug) return;

            if (!title || title.length > 80 || title.includes("https")) {
              title = slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            }

            let topicName = "General DSA Problems";
            let subtopicName = "Imported List";

            let parent = link.parentElement;
            let limit = 8;
            let foundTopic = null;
            let foundSubtopic = null;

            while (parent && limit > 0) {
              if (parent.className && typeof parent.className === "string") {
                if (parent.className.includes("kt-accordion-panel") || parent.className.includes("wp-block-kadence-accordion")) {
                  let prev = parent.previousElementSibling;
                  while (prev) {
                    if (prev.className && typeof prev.className === "string" && prev.className.includes("kt-accordion-header")) {
                      foundTopic = prev.textContent.trim();
                      break;
                    }
                    prev = prev.previousElementSibling;
                  }
                }
              }

              let sibling = parent.previousElementSibling;
              while (sibling) {
                const tag = sibling.tagName ? sibling.tagName.toLowerCase() : "";
                if (tag === "h3" || tag === "h4") {
                  if (!foundSubtopic) foundSubtopic = sibling.textContent.trim();
                } else if (tag === "h2") {
                  if (!foundTopic) foundTopic = sibling.textContent.trim();
                }
                sibling = sibling.previousElementSibling;
              }

              if (foundTopic && foundSubtopic) break;
              parent = parent.parentElement;
              limit--;
            }

            if (!foundTopic) {
              let prev = link.previousElementSibling;
              while (prev) {
                const tag = prev.tagName ? prev.tagName.toLowerCase() : "";
                if (tag === "h2" || tag === "h3") {
                  foundTopic = prev.textContent.trim();
                  break;
                }
                prev = prev.previousElementSibling;
              }
            }

            if (foundTopic) topicName = foundTopic.replace(/^[0-9.\s▶📂]+/, "").trim();
            if (foundSubtopic) subtopicName = foundSubtopic.replace(/^[0-9.\s▶📂]+/, "").trim();

            if (topicName.length > 60) topicName = topicName.substring(0, 57) + "...";
            if (subtopicName.length > 60) subtopicName = subtopicName.substring(0, 57) + "...";

            if (!parsedData[topicName]) parsedData[topicName] = {};
            if (!parsedData[topicName][subtopicName]) parsedData[topicName][subtopicName] = [];

            const exists = parsedData[topicName][subtopicName].some(p => p.slug === slug);
            if (!exists) {
              parsedData[topicName][subtopicName].push({
                title,
                slug,
                difficulty,
                leetcodeUrl: urlStr
              });
            }
          } catch (err) {
            console.error("Link parse skipped:", err);
          }
        });
      }
    }
  }

  if (Object.keys(parsedData).length === 0) {
    throw new Error("Could not extract any LeetCode/GFG coding links from this page!");
  }

  const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
  const customSheets = stored.customSheets || {};
  const registry = stored.customSheetsRegistry || {};
  const sheetKey = displayName.toLowerCase().replace(/[^a-z0-9]/g, "_");

  const normalizedData = {};
  for (const [topicName, subtopics] of Object.entries(parsedData)) {
    normalizedData[topicName] = {};
    for (const [subtopicName, problems] of Object.entries(subtopics)) {
      normalizedData[topicName][subtopicName] = [];
      if (Array.isArray(problems)) {
        problems.forEach(p => {
          if (p.slug) {
            registry[p.slug] = {
              t: p.title,
              d: p.difficulty,
              u: p.leetcodeUrl
            };
            normalizedData[topicName][subtopicName].push(p.slug);
          }
        });
      }
    }
  }

  customSheets[sheetKey] = {
    name: displayName,
    url: url,
    data: normalizedData
  };

  await chrome.storage.local.set({ 
    customSheets,
    customSheetsRegistry: registry
  });
  
  statusEl.style.color = "var(--clr-easy)";
  statusEl.textContent = `✅ Successfully imported "${displayName}"!`;

  el.txtCustomSheetUrl.value = "";
  el.txtCustomSheetName.value = "";

  if (onSettingsChangeCallback) {
    onSettingsChangeCallback();
  }

  el.sheetSelect.value = `custom_${sheetKey}`;
  if (_renderSheets) _renderSheets();

  setTimeout(() => {
    statusEl.textContent = "";
  }, 4000);

  } catch (err) {
    statusEl.style.color = "var(--clr-hard)";
    statusEl.textContent = `❌ Import Failed: ${err.message}`;
    console.error(err);
  } finally {
    el.btnImportCustomSheet.disabled = false;
    el.btnImportCustomSheet.textContent = "Fetch & Import Sheet";
  }
}

export async function decompressDeflateRaw(compressedBytes) {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(compressedBytes);
  writer.close();
  const response = new Response(ds.readable);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function renderCustomSheetsManager() {
  const manager = document.getElementById("customSheetsManager");
  const list = document.getElementById("customSheetsList");
  if (!manager || !list) return;

  const stored = await chrome.storage.local.get("customSheets");
  const customSheets = stored.customSheets || {};

  const staticKeys = [
    "apnacollege_dsa_sheet",
    "collegewallah_dsa_master_sheet",
    "fraz_dsa_sheet",
    "leetcode_75",
    "leetcode_top_100_liked",
    "love_babbar_dsa_sheet",
    "neetcode_150",
    "striver_a2z_sheet",
    "top_interview_150",
    "gfg_160",
    "gfg",
    "leetcode"
  ];
  const keys = Object.keys(customSheets).filter(k => !staticKeys.includes(k));
  if (keys.length === 0) {
    list.style.display = "none";
    const header = manager.querySelector("h4");
    if (header) header.style.display = "none";
    const btnBackup = document.getElementById("btnBackupSheets");
    if (btnBackup) btnBackup.style.display = "none";
    manager.style.display = "block";
    return;
  }

  manager.style.display = "block";
  list.style.display = "flex";
  const header = manager.querySelector("h4");
  if (header) header.style.display = "block";
  const btnBackup = document.getElementById("btnBackupSheets");
  if (btnBackup) btnBackup.style.display = "block";

  list.innerHTML = "";

  for (const [key, sheetObj] of Object.entries(customSheets)) {
    if (staticKeys.includes(key)) continue;
    const row = document.createElement("div");
    row.style = "display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--clr-border); border-radius: var(--radius); transition: var(--transition);";

    const leftContainer = document.createElement("div");
    leftContainer.style = "display: flex; align-items: center; gap: 8px;";

    const nameSpan = document.createElement("span");
    nameSpan.style = "font-weight: 700; font-size: 13px; color: var(--clr-text);";
    nameSpan.textContent = sheetObj.name || key;
    leftContainer.appendChild(nameSpan);

    const rightContainer = document.createElement("div");
    rightContainer.style = "display: flex; align-items: center; gap: 8px;";

    const isPerm = !!sheetObj.isPermanent;

    const lockBtn = document.createElement("button");
    lockBtn.style = "background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; line-height: 1; display: inline-flex; transition: var(--transition);";
    lockBtn.title = isPerm ? "Unmark as Permanent (Unlock)" : "Mark as Permanent (Lock)";
    lockBtn.textContent = isPerm ? "🔒" : "🔓";
    lockBtn.addEventListener("click", async () => {
      sheetObj.isPermanent = !isPerm;
      await chrome.storage.local.set({ customSheets });
      await populateSheetDropdown();
    });
    rightContainer.appendChild(lockBtn);

    const renameBtn = document.createElement("button");
    renameBtn.style = "background: none; border: none; cursor: pointer; font-size: 14px; padding: 4px; line-height: 1; display: inline-flex; transition: var(--transition);";
    renameBtn.title = "Rename Sheet";
    renameBtn.textContent = "✏️";
    renameBtn.addEventListener("click", async () => {
      const oldName = sheetObj.name || key;
      const newName = prompt(`Enter new name for "${oldName}":`, oldName);
      if (newName !== null && newName.trim() !== "") {
        sheetObj.name = newName.trim();
        await chrome.storage.local.set({ customSheets });
        await populateSheetDropdown();
      }
    });
    rightContainer.appendChild(renameBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "danger-btn";
    delBtn.style = "padding: 4px 8px; font-size: 11px; font-weight: 800; line-height: 1; border-radius: 4px;";
    delBtn.textContent = "🗑️ Delete";
    delBtn.addEventListener("click", async () => {
      if (confirm(`Are you sure you want to delete "${sheetObj.name || key}"?`)) {
        await deleteCustomSheet(key);
      }
    });

    if (isPerm) {
      delBtn.style.display = "none";
      row.style.borderColor = "var(--clr-primary)";
      row.style.background = "rgba(56, 189, 248, 0.03)";
    }

    rightContainer.appendChild(delBtn);

    row.appendChild(leftContainer);
    row.appendChild(rightContainer);
    list.appendChild(row);
  }
}

export async function deleteCustomSheet(key) {
  const stored = await chrome.storage.local.get("customSheets");
  const customSheets = stored.customSheets || {};

  if (customSheets[key]) {
    if (customSheets[key].isPermanent) {
      console.warn("Attempted to delete permanent sheet: " + key);
      return;
    }
    
    delete customSheets[key];
    await chrome.storage.local.set({ customSheets });

    const select = el.sheetSelect;
    if (select && select.value === `custom_${key}`) {
      select.value = "";
      state.activeTopicName = null;
      if (_renderSheets) _renderSheets();
    }
  }
}

export function setupBackupRestoreListeners() {
  const btnBackup = document.getElementById("btnBackupSheets");
  const btnRestore = document.getElementById("btnRestoreSheets");
  const fileInput = document.getElementById("fileRestoreInput");

  if (btnBackup && !btnBackup.dataset.listenerAdded) {
    btnBackup.dataset.listenerAdded = "true";
    btnBackup.addEventListener("click", async () => {
      const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
      const customSheets = stored.customSheets || {};
      const registry = stored.customSheetsRegistry || {};
      if (Object.keys(customSheets).length === 0) {
        alert("No sheets to export!");
        return;
      }
      const backupObj = {
        version: "2.0",
        customSheets,
        customSheetsRegistry: registry
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "leetsync_dsa_sheets_backup.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    });
  }

  if (btnRestore && !btnRestore.dataset.listenerAdded) {
    btnRestore.dataset.listenerAdded = "true";
    btnRestore.addEventListener("click", () => {
      fileInput?.click();
    });
  }

  if (fileInput && !fileInput.dataset.listenerAdded) {
    fileInput.dataset.listenerAdded = "true";
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (typeof imported !== "object" || Array.isArray(imported)) {
            throw new Error("Invalid backup file format!");
          }

          const stored = await chrome.storage.local.get(["customSheets", "customSheetsRegistry"]);
          const customSheets = stored.customSheets || {};
          const registry = stored.customSheetsRegistry || {};

          if (imported.version === "2.0" && imported.customSheets) {
            Object.assign(customSheets, imported.customSheets);
            Object.assign(registry, imported.customSheetsRegistry || {});
          } else {
            Object.assign(customSheets, imported);
          }

          await chrome.storage.local.set({ 
            customSheets,
            customSheetsRegistry: registry
          });
          
          await migrateCustomSheets();
          alert("Sheets restored successfully!");
          await populateSheetDropdown();
        } catch (err) {
          alert("Error restoring backup: " + err.message);
        }
        fileInput.value = "";
      };
      reader.readAsText(file);
    });
  }
}

export async function exportActiveSheetToExcel() {
  const problems = await (_getActiveSheetProblems ? _getActiveSheetProblems() : Promise.resolve([]));
  if (problems.length === 0) {
    alert("No problems found in the active sheet to export!");
    return;
  }

  const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = storedHistory[STORAGE_KEYS.history] || [];
  
  const solvedMap = {};
  history.forEach(h => {
    if (h.slug) {
      const slug = h.slug.trim().toLowerCase();
      if (!solvedMap[slug]) {
        solvedMap[slug] = [];
      }
      solvedMap[slug].push(h);
    }
  });

  const diffStyle = {
    easy:   "background:#f0fdf4;color:#166534;",
    medium: "background:#fffbeb;color:#92400e;",
    hard:   "background:#fef2f2;color:#991b1b;",
  };

  const approachDisplayNameExcel = (app) => {
    if (app === "brute") return "Brute";
    if (app === "better") return "Better";
    if (app === "optimal") return "Optimal";
    return (app || "").toUpperCase();
  };

  const headingCells = [
    "#", "Title", "Topic", "Subtopic", "Difficulty", "Status", "Revision", "Time Spent", "Star", "Date", "Notes", "LeetCode/GFG Link", "GitHub Link"
  ].map(h => `<th x:autofilter="all" style="background:#0f172a;color:#ffffff;font-weight:bold;padding:10px 14px;border:1px solid #334155;font-size:12px;text-align:center;white-space:nowrap;font-family:'Segoe UI',sans-serif;">${h}</th>`)
   .join("");

  const dataRows = problems.map((prob, i) => {
    const slug = prob.slug?.trim().toLowerCase();
    const solves = solvedMap[slug] || [];
    const isCompleted = solves.length > 0;
    const diff = (prob.difficulty || "").toLowerCase();
    const rowStyle = diffStyle[diff] || "background:#f8fafc;";
    const tdStyle = `padding:8px 12px;border:1px solid #cbd5e1;font-size:11.5px;font-family:'Segoe UI',sans-serif;`;

    const statusVal = isCompleted ? "Completed" : "Pending";
    const starVal = solves.some(s => s.isFavorite) ? "⭐" : "—";
    const revCount = solves.length > 0 ? (solves[0].revisionCount || 1) : "—";
    const timeSpentVal = solves.length > 0 ? (solves[0].timeSpent || "—") : "—";
    const dateVal = (solves.length > 0 && solves[0].savedAt) ? new Date(solves[0].savedAt).toLocaleDateString() : "—";

    const problemUrl = prob.leetcodeUrl || `https://leetcode.com/problems/${slug}/`;
    const titleLink = `<a href="${escapeHtml(problemUrl)}" style="color:#0284c7;text-decoration:underline;font-weight:600;">${escapeHtml(prob.title)}</a>`;
    const leetcodeCell = `<a href="${escapeHtml(problemUrl)}" style="color:#0284c7;text-decoration:underline;font-weight:600;">Open Link</a>`;

    const uniqueApproachesList = [];
    const seenApproaches = new Set();
    solves.forEach(h => {
      if (!seenApproaches.has(h.approach)) {
        seenApproaches.add(h.approach);
        uniqueApproachesList.push(h);
      }
    });

    const mergedApproaches = uniqueApproachesList.map(h => approachDisplayNameExcel(h.approach)).join(", ") || "—";
    const mergedGithubLinks = uniqueApproachesList.map(h => {
      const label = escapeHtml(approachDisplayNameExcel(h.approach));
      if (h.githubUrl) {
        return `<a href="${escapeHtml(h.githubUrl)}" style="color:#0284c7;text-decoration:underline;">${label} Link</a>`;
      }
      return `${label}: —`;
    }).join("<br>") || "—";

    const mergedNotes = uniqueApproachesList.map(h => {
      const label = escapeHtml(approachDisplayNameExcel(h.approach));
      let safeNotes = escapeHtml(h.notes?.trim() || "");
      const notesContent = safeNotes ? safeNotes.replace(/\n+/g, "<br>") : "—";
      return `<b>[${label}]</b>: ${notesContent}`;
    }).join("<br>") || "—";

    return `
      <tr style="${rowStyle}">
        <td style="${tdStyle}text-align:center;vertical-align:top;">${i + 1}</td>
        <td style="${tdStyle}font-weight:600;vertical-align:top;color:#0f172a;">${titleLink}</td>
        <td style="${tdStyle}vertical-align:top;">${escapeHtml(cleanDisplayName(prob.topicName) || "—")}</td>
        <td style="${tdStyle}vertical-align:top;">${escapeHtml(cleanDisplayName(prob.subtopicName) || "—")}</td>
        <td style="${tdStyle}text-align:center;font-weight:700;vertical-align:top;">${prob.difficulty}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;font-weight:600;">${statusVal}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${solves.length > 0 ? "Rev " + revCount : "—"}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${timeSpentVal}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${starVal}</td>
        <td style="${tdStyle}text-align:center;vertical-align:top;">${dateVal}</td>
        <td style="${tdStyle}max-width:300px;white-space:normal;vertical-align:top;">${mergedNotes}</td>
        <td style="${tdStyle}vertical-align:top;text-align:center;">${leetcodeCell}</td>
        <td style="${tdStyle}vertical-align:top;text-align:center;">${mergedGithubLinks}</td>
      </tr>`;
  }).join("\n");

  const selectedSheetName = el.sheetSelect.options[el.sheetSelect.selectedIndex]?.text || "DSA Sheet";

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <!--[if gte mso 9]>
      <xml><x:ExcelWorkbook><x:ExcelWorksheets>
        <x:ExcelWorksheet><x:Name>DSA Sheet Progress</x:Name>
        <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        <x:AutoFilter x:range="A4:M${problems.length + 4}"/>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets></x:ExcelWorkbook></xml>
      <![endif]-->
    </head>
    <body style="font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:20px;">
      <table border="1" cellspacing="0" cellpadding="0"
             style="border-collapse:collapse;font-family:'Segoe UI',sans-serif;width:100%;border:1px solid #cbd5e1;">
        <thead>
          <tr style="height: 42px;">
            <th colspan="13" style="background:#1e3a8a;color:#ffffff;font-size:16px;font-weight:bold;text-align:center;vertical-align:middle;font-family:'Segoe UI',sans-serif;border:1px solid #1e3a8a;">⚡ LeetSync Pro — ${escapeHtml(selectedSheetName)} Progress Report</th>
          </tr>
          <tr style="height: 24px;">
            <th colspan="13" style="background:#f1f5f9;color:#475569;font-size:10.5px;text-align:center;vertical-align:middle;font-weight:600;font-family:'Segoe UI',sans-serif;border:1px solid #cbd5e1;">Generated on: ${new Date().toLocaleString()} · Total Problems: ${problems.length}</th>
          </tr>
          <tr style="height: 10px;"><th colspan="13" style="border:none;background:#ffffff;"></th></tr>
          <tr style="mso-filter:auto;">${headingCells}</tr>
        </thead>
        <tbody>${dataRows}</tbody>
      </table>
    </body>
    </html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  
  const cleanSheetName = selectedSheetName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  link.download = `leetsync-sheet-${cleanSheetName}-${new Date().toISOString().slice(0, 10)}.xls`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
