# Feature Parity & Requirements Document

**Files Inspected:**
- `manifest.json`
- `background.js`, `background_sync.js`
- `content.js`, `content_ui.js`, `content_utils.js`, `injected.js`
- `github.js`, `login.js`, `firebase-config.js`
- `history_manager.js`, `shared_revision.js`, `sheet-loader.js`
- `popup.js` (and all `popup_*.js`)
- `dashboard.js` (and all `dashboard_modules/*.js`)

This document defines the exact current behavior of LeetSync Pro so that 100% feature parity is maintained in V2.

---

### 1. Platform Detection & Interception (LeetCode)
- **Files/Functions:** `injected.js` (XHR/Fetch interceptor), `content.js`, `content_utils.js` (Observer).
- **Exact Behavior:** `injected.js` hooks into `XMLHttpRequest.prototype.send` and `fetch`. When a submission endpoint (`/submissions/detail/`) returns `"status_msg": "Accepted"`, it emits a `CustomEvent` (`LeetsyncSubmissionSuccess`). `content_utils.js` listens to this, extracts code/runtime/memory, and triggers the UI.
- **Storage/Data Used:** Temporary `window` event payloads.
- **Messages Involved:** Submits `LEETSYNC_SAVE_TO_GITHUB` to background.
- **V2 Module Mapping:** `src/entrypoints/content/leetcode.ts`, `src/entrypoints/injected.ts`.
- **Decision:** **Reuse & Port to TypeScript**. The interceptor logic is robust and avoids DOM scraping limits.

### 2. Platform Detection & Interception (GFG)
- **Files/Functions:** `injected.js`, `content_utils.js` (`parseGFGUrl`, `getGFGTopicsFromNextData`).
- **Exact Behavior:** GFG uses WebSocket or API responses. `injected.js` captures `result.status === "Correct"`. Fallback relies on DOM observer looking for "Problem Solved Successfully".
- **Storage/Data Used:** Extracts `__NEXT_DATA__` for problem topic tags.
- **V2 Module Mapping:** `src/entrypoints/content/gfg.ts`.
- **Decision:** **Reuse & Port to TypeScript**.

### 3. Injected Save UI (Content Script Modal)
- **Files/Functions:** `content_ui.js` (`createSuccessWidget`, `injectCSS`).
- **Exact Behavior:** A floating widget appears on LeetCode/GFG showing the problem name. Allows selecting an approach (Brute, Better, Optimal, Custom). Has a "Notes" textarea and a "Star" button. Auto-closes after saving.
- **Messages Involved:** Sends `LEETSYNC_SAVE_TO_HISTORY` and `LEETSYNC_SAVE_TO_GITHUB`.
- **V2 Module Mapping:** `src/components/content/SaveWidget.tsx`.
- **Decision:** **Replace Completely**. The current `.innerHTML` injection is unsafe and hard to style. Use a pre-compiled React component mounted via WXT Content Script UI.

### 4. GitHub Login & OAuth Exchange
- **Files/Functions:** `login.js` (`getOAuthRedirectUri`, `handleAuthSuccess`).
- **Exact Behavior:** Opens a new tab to `https://github.com/login/oauth/authorize`. Extracts the `code` from the redirect URI, then calls `https://github.com/login/oauth/access_token` with the client secret hardcoded.
- **Storage/Data Used:** Saves token to `chrome.storage.local` (`githubSettings`).
- **Security Issue:** Client secret is exposed.
- **V2 Module Mapping:** `src/services/github.api.ts` & Cloudflare Worker (`/oauth/token`).
- **Decision:** **Replace Completely**. WXT will use `browser.identity.launchWebAuthFlow` pointing to the secure Cloudflare Worker.

### 5. GitHub Code Backup / Export Format
- **Files/Functions:** `github.js` (`buildFolderPath`, `upsertFile`, `buildReadmeBody`).
- **Exact Behavior:** Saves solution as `<Platform>-<Language>/<Slug>/<Slug>-<Approach>-v<Version>.<ext>`. Also creates a `README.md` containing the problem description, links, and difficulty badges.
- **GitHub Behavior:** Uses multiple REST API calls (`GET`, `PUT`) to check existence and upload files.
- **V2 Module Mapping:** `src/services/github.api.ts`.
- **Decision:** **Refactor**. Consolidate REST calls into a single Git Tree commit to avoid API rate limits. Format must remain identical.

### 6. GitHub Import (Syncing past solves)
- **Files/Functions:** `popup_sync.js` (`fetchGitHubRepoSolves`, `parseReadmeMetadata`).
- **Exact Behavior:** Reads the connected GitHub repo tree recursively. Parses paths to determine slug, approach, and version. Reads `README.md` to extract difficulty and LeetCode URLs. Merges into local history.
- **V2 Module Mapping:** `src/core/github-import.ts`.
- **Decision:** **Refactor**. Move out of `popup_sync.js` into a pure core function to prevent popup-closure interruptions.

### 7. Local Offline Save
- **Files/Functions:** `background.js` (Message listener), `history_manager.js` (`mergeNewSolveIntoHistory`).
- **Exact Behavior:** If GitHub is disconnected or offline, it saves directly to `leetsyncHistory` in local storage with `githubUrl: ""`. Enqueues the GitHub payload in `pendingGithubSync`.
- **V2 Module Mapping:** `src/entrypoints/background.ts`.
- **Decision:** **Refactor**. Will write to Dexie `history` table, and enqueue to Dexie `syncQueue` table.

### 8. History Merging & Versioning
- **Files/Functions:** `history_manager.js` (`mergeNewSolveIntoHistory`, `mergeSolveWithStars`).
- **Exact Behavior:** Finds existing solves by `slug + approach + version`. Overwrites if exists, otherwise pushes to the array. Retains `starredLists` and `isFavorite` flags during merges.
- **V2 Module Mapping:** `src/core/history-merger.ts`.
- **Decision:** **Reuse Pure Logic**. Will adapt to Dexie's `put()` upsert behavior based on a composite primary key.

### 9. Notes & Revisions
- **Files/Functions:** `popup_calendar.js` (`setRevision`), `dashboard_modules/notes_modal.js`.
- **Exact Behavior:** Revisions schedule a review date. Revisions are tied to a `slug`. (Note: This is currently flawed as a slug can have multiple approaches).
- **V2 Module Mapping:** `src/core/revision-scheduler.ts`, `src/components/dashboard/NotesModal.tsx`.
- **Decision:** **Refactor**. V2 must strictly tie Notes and Revisions to a unique composite ID (Slug + Approach + Version) in Dexie.

### 10. Favorites & Custom Lists
- **Files/Functions:** `history_manager.js` (`applyToggleList`).
- **Exact Behavior:** Updates `starredLists` array on a history entry. If the problem isn't solved yet, it creates a "placeholder" entry with `isStarredOnly: true`.
- **V2 Module Mapping:** `src/core/history-merger.ts`.
- **Decision:** **Refactor**. V2 will separate this into a relational Dexie table: `problems` (metadata) vs `solves` (code). A bookmark applies to the `problem`.

### 11. Built-in & Custom Sheets
- **Files/Functions:** `sheet-loader.js` (`getBuiltinManifest`, `loadSheet`), `data/` folder.
- **Exact Behavior:** Loads JSON files containing array of problems organized by steps/topics. Cross-references with history to calculate progress.
- **V2 Module Mapping:** `src/data/sheets/`, `src/core/sheets.ts`.
- **Decision:** **Reuse Data As-Is, Refactor Logic**. V2 will load these JSON files directly into a Dexie `sheets` table upon extension install to prevent parsing on every render.

### 12. Dashboard & Popup Analytics (Calendar, Heatmap)
- **Files/Functions:** `dashboard_modules/overview.js`, `popup_stats.js`.
- **Exact Behavior:** Iterates entire history, groups by `savedAt` (day), and renders an SVG-style GitHub heatmap. Calculates current streak and max streak.
- **V2 Module Mapping:** `src/components/dashboard/Heatmap.tsx`.
- **Decision:** **Replace Completely**. Logic will use Dexie indices to group by date in milliseconds, rendering via standard React components.

### 13. Firebase Firestore Sync
- **Files/Functions:** `firestore_sync.js` (`batchWriteToFirestore`), `background_sync.js`.
- **Exact Behavior:** Listens to `chrome.storage.onChanged`. If `leetsyncHistory` changes, finds the diff, and writes up to 500 operations (Firestore batch limit) to the cloud. Only syncs metadata, NOT full code.
- **V2 Module Mapping:** `src/services/firestore.api.ts`.
- **Decision:** **Refactor**. Move away from `onChanged` triggers (flaky). V2 will trigger sync explicitly after a Dexie write succeeds via Zod-validated payloads.

### 14. Message Flows & Queues
- **Files/Functions:** `background.js` (`LEETSYNC_SAVE_TO_HISTORY`), `update_bg.js`.
- **Exact Behavior:** A serial queue processes history updates to prevent race conditions when the popup and content script write simultaneously.
- **V2 Module Mapping:** `src/entrypoints/background.ts`.
- **Decision:** **Replace Completely**. Dexie IndexedDB natively supports ACID transactions, eliminating the need for a manual array-based JavaScript mutex queue.
