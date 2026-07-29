# Automated Static Analysis Report

## background.js
- Line 110: [Missing await on storage] `chrome.storage.local.get(["githubSettings", "leetsyncHistory"]).then(async (stored) => {`
- Line 218: [Missing await on storage] `chrome.storage.local.get("githubSettings").then((stored) => {`
- Line 271: [Console logs (Production leak)] `console.log(`[LeetSync DEBUG] Sheet status: slug="${slug}", platform="${platform}", cleanSlug="${cleanSlug}"`);`
- Line 276: [Console logs (Production leak)] `console.log(`[LeetSync DEBUG] Loaded ${allProblems.length} combined problems`);`
- Line 302: [Swallowed Errors] `} catch (e) {}`
- Line 308: [Console logs (Production leak)] `console.log(`[LeetSync DEBUG] Match result: ${match ? `"${match.slug}" in [${matchedSheets.join(", ")}]` : "NO MATCH"}`);`
- Line 394: [Hardcoded URL] `? `https://www.geeksforgeeks.org/problems/${cleanSlug}/1``
- Line 416: [Hardcoded URL] `const response = await fetch("https://github.com/login/device/code", {`
- Line 481: [Hardcoded URL] `const response = await fetch("https://github.com/login/oauth/access_token", {`
- Line 771: [Console logs (Production leak)] `console.log("Successfully queued submission in pendingGithubSync.");`
- Line 787: [Console logs (Production leak)] `console.log(`Processing ${queue.length} pending solutions in GitHub sync queue...`);`
- Line 798: [Console logs (Production leak)] `console.log(`Successfully synced queued solution to GitHub: ${submission.title}`);`
- Line 824: [Console logs (Production leak)] `console.log("All pending GitHub solutions synced successfully and queue cleared.");`

## background_sync.js
- Line 17: [Console logs (Production leak)] `console.log(`Successfully synced ${updates.length} updates and ${deletes.length} deletes to Firestore.`);`
- Line 54: [Console logs (Production leak)] `console.log("Successfully synced settings to Firestore.");`
- Line 87: [Console logs (Production leak)] `console.log("Processing pending Firestore sync queue...");`
- Line 197: [Console logs (Production leak)] `console.log("Firebase ID token expired or close to expiration. Refreshing...");`
- Line 198: [Hardcoded URL] `const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`, {`
- Line 213: [Console logs (Production leak)] `console.log("Firebase ID token refreshed successfully.");`

## content.js
- Line 81: [DOM innerHTML] `topicSelect.innerHTML = "";`

## content_ui.js
- Line 265: [DOM innerHTML] `overlay.innerHTML = ``
- Line 387: [Magic Numbers] `setTimeout(() => overlay.classList.add("show"), 10);`
- Line 400: [Magic Numbers] `setTimeout(() => { favBtn.style.transform = "scale(1)"; }, 150);`
- Line 422: [DOM innerHTML] `sheetSection.innerHTML = ``
- Line 428: [DOM innerHTML] `sheetSection.innerHTML = ``
- Line 483: [Missing await on storage] `chrome.storage.local.get(["customSheets"], (st) => {`
- Line 629: [Magic Numbers] `setTimeout(() => overlay.remove(), 250);`
- Line 794: [Magic Numbers] `setTimeout(closeModal, 2000);`
- Line 810: [Magic Numbers] `setTimeout(closeModal, 4000);`
- Line 826: [Magic Numbers] `setTimeout(closeModal, 1500);`
- Line 833: [Magic Numbers] `setTimeout(closeModal, 4000);`
- Line 840: [Magic Numbers] `setTimeout(closeModal, 4000);`
- Line 859: [DOM innerHTML] `selectEl.innerHTML = "";`
- Line 908: [DOM innerHTML] `topicSelect.innerHTML = "";`
- Line 949: [Console logs (Production leak)] `console.log("Successfully sent LEETSYNC_QUEUE_GITHUB_SYNC message.");`

## content_utils.js
- Line 93: [Swallowed Errors] `} catch (_) {}`
- Line 244: [DOM innerHTML] `widget.innerHTML = ``

## firebase-config.js
- Line 21: [Hardcoded URL] `export const FIREBASE_AUTH_API = `https://identitytoolkit.googleapis.com/v1`;`

## github.js
- Line 240: [Hardcoded URL] `? "![Easy](https://img.shields.io/badge/Difficulty-Easy-16a34a?style=flat-square)"`
- Line 242: [Hardcoded URL] `? "![Medium](https://img.shields.io/badge/Difficulty-Medium-d97706?style=flat-square)"`
- Line 244: [Hardcoded URL] `? "![Hard](https://img.shields.io/badge/Difficulty-Hard-dc2626?style=flat-square)"`
- Line 245: [Hardcoded URL] `: `![${difficulty}](https://img.shields.io/badge/Difficulty-${difficulty}-64748b?style=flat-square)`;`

## history_manager.js
- Line 14: [Swallowed Errors] `} catch (e) {}`

## injected.js
- Line 42: [Swallowed Errors] `} catch (_) {}`
- Line 110: [Swallowed Errors] `} catch (_) {}`

## login.js
- Line 45: [Hardcoded URL] `const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user&state=${state}`;`
- Line 73: [Hardcoded URL] `const tokenRes = await fetch("https://github.com/login/oauth/access_token", {`
- Line 109: [Hardcoded URL] `requestUri: "http://localhost",`
- Line 137: [DOM innerHTML] `githubBtn.innerHTML = ``
- Line 149: [DOM innerHTML] `githubBtn.innerHTML = ``
- Line 248: [Console logs (Production leak)] `console.log("Starting cloud sync for UID:", uid);`
- Line 253: [Console logs (Production leak)] `console.log("Settings fetch status:", settingsRes.status);`
- Line 258: [Console logs (Production leak)] `console.log("Downloaded settings:", cloudSettings);`
- Line 282: [Console logs (Production leak)] `console.log("Settings document not found in cloud, uploading local settings...");`
- Line 297: [Console logs (Production leak)] `console.log("Local settings upload status:", patchRes.status);`
- Line 312: [Console logs (Production leak)] `console.log("History fetch status:", historyRes.status);`
- Line 329: [Console logs (Production leak)] `console.log(`Downloaded ${cloudHistory.length} history documents total`);`
- Line 354: [Console logs (Production leak)] `console.log("Merged history successfully saved locally");`
- Line 366: [Console logs (Production leak)] `console.log(`Uploaded ${updates.length} missing solves to cloud`);`
- Line 371: [Console logs (Production leak)] `console.log(`Uploading ${localHistory.length} local history items to cloud...`);`
- Line 373: [Console logs (Production leak)] `console.log(`Uploaded all local history solves successfully`);`

## popup.js
- Line 180: [Magic Numbers] `setTimeout(syncCloudData, 100);`
- Line 270: [DOM innerHTML] `difficultyOptionsDiv.innerHTML = "";`
- Line 342: [DOM innerHTML] `topicOptionsDiv.innerHTML = "";`
- Line 498: [DOM innerHTML] `patternOptionsDiv.innerHTML = "";`
- Line 687: [Missing await on storage] `chrome.storage.local.get(STORAGE_KEYS.history, (stored) => {`
- Line 703: [Missing await on storage] `chrome.storage.local.get(STORAGE_KEYS.history, (stored) => {`
- Line 719: [Missing await on storage] `chrome.storage.local.get(STORAGE_KEYS.history, (stored) => {`
- Line 744: [Missing await on storage] `chrome.storage.local.get(STORAGE_KEYS.settings, (res) => {`
- Line 865: [DOM innerHTML] `patternSelect.innerHTML = "";`

## popup_calendar.js
- Line 41: [DOM innerHTML] `el.calendarGrid.innerHTML = "";`
- Line 170: [DOM innerHTML] `el.calendarDayDetailsList.innerHTML = "";`
- Line 174: [DOM innerHTML] `el.calendarDayDetailsList.innerHTML = `<p class="empty-state">No problems solved on this day.</p>`;`
- Line 217: [DOM innerHTML] `item.innerHTML = ``
- Line 271: [DOM innerHTML] `dropdown.innerHTML = ``

## popup_helpers.js
- Line 55: [Console logs (Production leak)] `console.log("Firebase ID token expired or close to expiration. Refreshing...");`
- Line 56: [Hardcoded URL] `const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`, {`
- Line 71: [Console logs (Production leak)] `console.log("Firebase ID token refreshed successfully.");`

## popup_history.js
- Line 20: [DOM innerHTML] `notesModalContainer.innerHTML = "";`
- Line 24: [DOM innerHTML] `wrapper.innerHTML = ``
- Line 147: [Hardcoded URL] `entry.url   = `https://www.geeksforgeeks.org/problems/${cleanSlug || slug}/1`;`
- Line 158: [Hardcoded URL] `entry.url   = `https://www.geeksforgeeks.org/problems/${cleanSlug || slug}/1`;`
- Line 171: [DOM innerHTML] `el.historyList.innerHTML = "";`
- Line 174: [DOM innerHTML] `el.historyList.innerHTML =`
- Line 271: [DOM innerHTML] `el.historyList.innerHTML = '<p class="empty-state">No matching solutions found.</p>';`
- Line 305: [DOM innerHTML] `item.innerHTML = ``
- Line 393: [Console logs (Production leak)] `console.log(`Deleted ${safeId} from Firestore`);`

## popup_sheets.js
- Line 33: [Swallowed Errors] `} catch (e) {}`
- Line 47: [DOM innerHTML] `collectionOptionsDiv.innerHTML = "";`
- Line 128: [DOM innerHTML] `container.innerHTML = `<div class="empty-state" style="padding: 20px; text-align: center; font-size: 12px; color: var(--clr-muted);">Please import a sheet in Settings first.</div>`;`
- Line 156: [DOM innerHTML] `container.innerHTML = "";`
- Line 158: [Hardcoded URL] `const LEETCODE_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;">`
- Line 163: [Hardcoded URL] `const GFG_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2F8D46" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;`
- Line 164: [Hardcoded URL] `const GITHUB_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;`
- Line 193: [DOM innerHTML] `table.innerHTML = ``
- Line 322: [DOM innerHTML] `platLink.innerHTML = `<img src="${chrome.runtime.getURL('tuf.jpg')}" style="width:15px; height:15px; border-radius:50%; object-fit:cover; vertical-align:middle;" />`;`
- Line 324: [DOM innerHTML] `platLink.innerHTML = GFG_SVG;`
- Line 326: [DOM innerHTML] `platLink.innerHTML = LEETCODE_SVG;`
- Line 369: [DOM innerHTML] `ghLink.innerHTML = GITHUB_SVG;`
- Line 376: [DOM innerHTML] `disabledGh.innerHTML = GITHUB_SVG;`
- Line 444: [DOM innerHTML] `table.innerHTML = ``
- Line 576: [DOM innerHTML] `platLink.innerHTML = `<img src="${chrome.runtime.getURL('tuf.jpg')}" style="width:15px; height:15px; border-radius:50%; object-fit:cover; vertical-align:middle;" />`;`
- Line 578: [DOM innerHTML] `platLink.innerHTML = GFG_SVG;`
- Line 580: [DOM innerHTML] `platLink.innerHTML = LEETCODE_SVG;`
- Line 623: [DOM innerHTML] `ghLink.innerHTML = GITHUB_SVG;`
- Line 630: [DOM innerHTML] `disabledGh.innerHTML = GITHUB_SVG;`
- Line 651: [DOM innerHTML] `subtopicHeader.innerHTML = ``
- Line 684: [DOM innerHTML] `header.innerHTML = ``

## popup_stats.js
- Line 137: [DOM innerHTML] `el.topicPillList.innerHTML = "";`
- Line 141: [DOM innerHTML] `el.topicPillList.innerHTML = `<p class="empty-state" style="padding: 10px 0; font-size: 10.5px; width: 100%;">No topics tracked yet. Save a solution with a topic tag!</p>`;`
- Line 154: [DOM innerHTML] `pill.innerHTML = ``
- Line 178: [DOM innerHTML] `el.popupRevisionList.innerHTML = "";`
- Line 180: [DOM innerHTML] `el.popupRevisionList.innerHTML = `<p class="empty-state">🎉 All caught up! No revisions due today.</p>`;`
- Line 201: [DOM innerHTML] `item.innerHTML = ``
- Line 440: [Hardcoded URL] `xmlns="http://www.w3.org/TR/REC-html40">`

## popup_sync.js
- Line 45: [DOM innerHTML] `el.repoSelect.innerHTML = '<option value="">-- Loading Repos --</option>';`
- Line 54: [DOM innerHTML] `el.repoSelect.innerHTML = '<option value="">-- Select Repo --</option>';`
- Line 477: [Hardcoded URL] `const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`;`
- Line 567: [Hardcoded URL] `url = urlMatch[0].startsWith("http") ? urlMatch[0] : `https://${urlMatch[0]}`;`
- Line 653: [Hardcoded URL] `githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${matchedSib.path}`;`
- Line 658: [Hardcoded URL] `githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;`

## potd-fetcher.js
- Line 12: [Console logs (Production leak)] `console.log("LeetSync: Loaded POTD data from cache for date:", todayStr);`
- Line 19: [Console logs (Production leak)] `console.log("LeetSync: Cache miss/expired. Fetching fresh POTD data...");`
- Line 25: [Hardcoded URL] `url: "https://www.naukri.com/code360/problem-of-the-day",`
- Line 103: [Hardcoded URL] `url: "https://practice.geeksforgeeks.org/problem-of-the-day",`
- Line 110: [Hardcoded URL] `const res = await fetch("https://practiceapi.geeksforgeeks.org/api/v1/problems-of-day/problem/today/");`
- Line 127: [Swallowed Errors] `} catch (e) {}`
- Line 134: [Hardcoded URL] `url: json.problem_url || "https://practice.geeksforgeeks.org/problem-of-the-day",`

## sheet-loader.js
- Line 115: [Console logs (Production leak)] `console.debug(`[LeetSync] All Combined: ${total} unique problems`);`
- Line 120: [Console logs (Production leak)] `console.debug("[LeetSync] Contribution per sheet (includes overlaps):", bySheet);`
- Line 128: [Console logs (Production leak)] `console.debug("[LeetSync] Problems UNIQUE to only one sheet:", uniquePerSheet);`
- Line 287: [DOM innerHTML] `selectEl.innerHTML = "";`

## dashboard_modules/notes_modal.js
- Line 29: [DOM innerHTML] `el.notesModalContainer.innerHTML = "";`
- Line 73: [DOM innerHTML] `wrapper.innerHTML = ``

## dashboard_modules/overview.js
- Line 65: [DOM innerHTML] `el.heatmapGrid.innerHTML = "";`
- Line 126: [DOM innerHTML] `el.recentSolvesList.innerHTML = "";`
- Line 130: [DOM innerHTML] `el.recentSolvesList.innerHTML = `<tr><td colspan="6" class="empty-state">No solves found in your history yet!</td></tr>`;`
- Line 139: [DOM innerHTML] `tdTitle.innerHTML = `<strong>${escapeHtml(entry.title || "Unknown")}</strong>`;`

## dashboard_modules/potd.js
- Line 30: [DOM innerHTML] `container.innerHTML = "";`
- Line 81: [Console logs (Production leak)] `console.log("LeetSync: Obsolete cache detected. Re-fetching fresh POTD data...");`
- Line 88: [Hardcoded URL] `gfg: "https://practice.geeksforgeeks.org/problem-of-the-day",`
- Line 89: [Hardcoded URL] `code360: "https://www.naukri.com/code360/problem-of-the-day"`
- Line 105: [DOM innerHTML] `card.innerHTML = ``
- Line 130: [DOM innerHTML] `container.innerHTML = `<div style="color:var(--clr-muted); font-size:12px; padding:12px; text-align:center; grid-column:1/-1;">Failed to load daily challenges. Please refresh or check connection.</div>`;`

## dashboard_modules/revision.js
- Line 11: [DOM innerHTML] `el.revisionListOverdue.innerHTML = "";`
- Line 12: [DOM innerHTML] `el.revisionListToday.innerHTML = "";`
- Line 13: [DOM innerHTML] `el.revisionListUpcoming.innerHTML = "";`
- Line 71: [DOM innerHTML] `if (overdueCount === 0) el.revisionListOverdue.innerHTML = `<div class="empty-state">No pending overdue revisions.</div>`;`
- Line 72: [DOM innerHTML] `if (todayCount === 0) el.revisionListToday.innerHTML = `<div class="empty-state">No reviews scheduled for today.</div>`;`
- Line 73: [DOM innerHTML] `if (upcomingCount === 0) el.revisionListUpcoming.innerHTML = `<div class="empty-state">No future revisions scheduled.</div>`;`

## dashboard_modules/settings.js
- Line 72: [Magic Numbers] `setTimeout(() => el.syncStatus.textContent = "Idle", 3000);`
- Line 167: [Console logs (Production leak)] `console.log("Custom sheets migrated to normalized format successfully.");`
- Line 203: [Hardcoded URL] `const xlsxUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx&gid=${gid}`;`
- Line 391: [Swallowed Errors] `} catch(e) {}`
- Line 599: [Swallowed Errors] `} catch(e) {}`
- Line 635: [Swallowed Errors] `} catch(e) {}`
- Line 878: [DOM innerHTML] `list.innerHTML = "";`
- Line 1155: [Hardcoded URL] `xmlns="http://www.w3.org/TR/REC-html40">`

## dashboard_modules/sheets_view.js
- Line 58: [Swallowed Errors] `} catch (e) {}`
- Line 248: [DOM innerHTML] `el.btnSheetViewToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>`;`
- Line 252: [DOM innerHTML] `el.btnSheetViewToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`;`
- Line 368: [DOM innerHTML] `container.innerHTML = ``
- Line 463: [DOM innerHTML] `container.innerHTML = ``
- Line 483: [DOM innerHTML] `optionsContainer.innerHTML = "";`
- Line 500: [DOM innerHTML] `listWrapper.innerHTML = "";`
- Line 510: [DOM innerHTML] `addRow.innerHTML = ``
- Line 525: [DOM innerHTML] `label.innerHTML = ``
- Line 537: [DOM innerHTML] `label.innerHTML = ``
- Line 640: [Missing await on storage] `chrome.storage.local.get("customStarredLists").then((stored) => {`
- Line 702: [DOM innerHTML] `pillsContainer.innerHTML = "";`
- Line 706: [DOM innerHTML] `allPill.innerHTML = `All <span class="pill-count">${allCompleted}/${allTotal}</span>`;`
- Line 718: [DOM innerHTML] `pill.innerHTML = `${escapeHtml(cleanDisplayName(topicName))} <span class="pill-count">${counts.completed}/${counts.total}</span>`;`
- Line 743: [DOM innerHTML] `container.innerHTML = "";`
- Line 787: [DOM innerHTML] `container.innerHTML = "";`
- Line 838: [DOM innerHTML] `container.innerHTML = "";`
- Line 989: [DOM innerHTML] `subtopicHeader.innerHTML = ``
- Line 1047: [DOM innerHTML] `header.innerHTML = ``
- Line 1093: [Hardcoded URL] `const LEETCODE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" id="leetcode" style="vertical-align: middle;">`
- Line 1098: [Hardcoded URL] `const GFG_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#2F8D46" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M21.45 14.315c-.143.28-.334.532-.565.745a3.691 3.691 0 0 1-1.104.695 4.51 4.51 0 0 1-3.116-.016 3.79 3.79 0 0 1-2.135-2.078 3.571 3.571 0 0 1-.13-.353h7.418a4.26 4.26 0 0 1-.368 1.008zm-11.99-.654a3.793 3.793 0 0 1-2.134 2.078 4.51 4.51 0 0 1-3.117.016 3.7 3.7 0 0 1-1.104-.695 2.652 2.652 0 0 1-.564-.745 4.221 4.221 0 0 1-.368-1.006H9.59c-.038.12-.08.238-.13.352zm14.501-1.758a3.849 3.849 0 0 0-.082-.475l-9.634-.008a3.932 3.932 0 0 1 1.143-2.348c.363-.35.79-.625 1.26-.809a3.97 3.97 0 0 1 4.484.957l1.521-1.49a5.7 5.7 0 0 0-1.922-1.357 6.283 6.283 0 0 0-2.544-.49 6.35 6.35 0 0 0-2.405.457 6.007 6.007 0 0 0-1.963 1.276 6.142 6.142 0 0 0-1.325 1.94 5.862 5.862 0 0 0-.466 1.864h-.063a5.857 5.857 0 0 0-.467-1.865 6.13 6.13 0 0 0-1.325-1.939A6 6 0 0 0 8.21 6.34a6.698 6.698 0 0 0-4.949.031A5.708 5.708 0 0 0 1.34 7.73l1.52 1.49a4.166 4.166 0 0 1 4.484-.958c.47.184.898.46 1.26.81.368.36.66.792.859 1.268.146.344.242.708.285 1.08l-9.635.008A4.714 4.714 0 0 0 0 12.457a6.493 6.493 0 0 0 .345 2.127 4.927 4.927 0 0 0 1.08 1.783c.528.56 1.17 1 1.88 1.293a6.454 6.454 0 0 0 2.504.457c.824.005 1.64-.15 2.404-.457a5.986 5.986 0 0 0 1.964-1.277 6.116 6.116 0 0 0 1.686-3.076h.273a6.13 6.13 0 0 0 1.686 3.077 5.99 5.99 0 0 0 1.964 1.276 6.345 6.345 0 0 0 2.405.457 6.45 6.45 0 0 0 2.502-.457 5.42 5.42 0 0 0 1.882-1.293 4.928 4.928 0 0 0 1.08-1.783A6.52 6.52 0 0 0 24 12.457a4.757 4.757 0 0 0-.039-.554z"/></svg>`;`
- Line 1100: [Hardcoded URL] `const GITHUB_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`;`
- Line 1216: [DOM innerHTML] `platLink.innerHTML = STRIVER_SVG;`
- Line 1218: [DOM innerHTML] `platLink.innerHTML = GFG_SVG;`
- Line 1220: [DOM innerHTML] `platLink.innerHTML = LEETCODE_SVG;`
- Line 1258: [DOM innerHTML] `ghLink.innerHTML = GITHUB_SVG;`
- Line 1265: [DOM innerHTML] `disabledGh.innerHTML = GITHUB_SVG;`

## dashboard_modules/smart_lists.js
- Line 87: [DOM innerHTML] `starPopover.innerHTML = ``
- Line 310: [DOM innerHTML] `container.innerHTML = "";`
- Line 319: [DOM innerHTML] `item.innerHTML = ``
- Line 353: [DOM innerHTML] `item.innerHTML = ``
- Line 397: [Missing await on storage] `chrome.storage.local.get("customSmartLists").then((storedSmart) => {`
- Line 410: [Missing await on storage] `chrome.storage.local.get(STORAGE_KEYS.history).then((storedHist) => {`
- Line 456: [DOM innerHTML] `container.innerHTML = "";`
- Line 476: [DOM innerHTML] `listHeader.innerHTML = ``

## dashboard_modules/ui_helpers.js
- Line 159: [DOM innerHTML] `table.innerHTML = ``

