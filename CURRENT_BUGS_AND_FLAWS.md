# Current Bugs and Flaws

This document details all significant issues inside the current Vanilla JS extension that must be resolved.

### 1. Exposed GitHub Client Secret
- **File/Location:** `login.js` (Lines 45, 73).
- **Category:** Security Issue.
- **Problem:** The OAuth client secret is processed inside the extension's frontend code. Anyone can unpack the `.crx` file or inspect the network tab to steal the secret and hijack the OAuth app.
- **User Impact:** App suspension by GitHub.
- **Severity:** **Critical**.
- **Recommended Fix:** Extract the token exchange (`POST https://github.com/login/oauth/access_token`) to a secure Cloudflare Worker. Do this during the V2 migration (Phase 7).

### 2. Massive `.innerHTML` UI Bottlenecks
- **File/Location:** `dashboard_modules/sheets_view.js` (Lines 743, 787, 838), `content_ui.js` (Line 422), `popup_history.js`.
- **Category:** Performance / Security.
- **Problem:** Building 1000+ line tables using template literals and injecting via `.innerHTML` blocks the main thread. It also risks DOM XSS if variables aren't perfectly escaped.
- **User Impact:** The dashboard lags heavily when switching sheet tabs. Slow UI on weak machines.
- **Severity:** **High**.
- **Recommended Fix:** Migrate UI strictly to React (`tsx`) components. React's Virtual DOM surgically updates only changed nodes. Fix during V2 migration.

### 3. `chrome.storage.local` Array Bottleneck
- **File/Location:** `background_sync.js`, `history_manager.js`.
- **Category:** Performance / Design Flaw.
- **Problem:** `leetsyncHistory` is a single massive JSON array. To add one problem, the extension must read the entire 5MB array, parse it, append the item, stringify it, and overwrite it.
- **User Impact:** Storage quota errors and high RAM usage.
- **Severity:** **High**.
- **Recommended Fix:** Migrate to Dexie.js (IndexedDB). IndexedDB allows inserting/updating single records via a primary key without loading the entire dataset into memory. Fix in V2 (Phase 3).

### 4. Flawed Revision / Notes Version Scoping
- **File/Location:** `popup_calendar.js` (`setRevision`), `dashboard_modules/notes_modal.js`.
- **Category:** Logical Flaw.
- **Problem:** Revisions and Notes are often tied to the problem `slug`. However, a user can solve the same problem 3 times (Brute, Better, Optimal). Adding a note currently overwrites or applies to a random version of that slug.
- **User Impact:** Users lose specific notes for their "Brute Force" attempt if they later solve it "Optimally".
- **Severity:** **High**.
- **Recommended Fix:** Strictly tie Revisions, Notes, and Favorites to a composite key: `slug + approach + version` in the new Dexie Schema. Fix in V2.

### 5. Swallowed Errors in JSON / API Calls
- **File/Location:** `dashboard_modules/settings.js` (Lines 391, 599, 635), `history_manager.js` (Line 14).
- **Category:** Maintainability / Testing Gap.
- **Problem:** `catch (e) {}` is used to silently ignore errors. If Firestore changes its API or a custom sheet is malformed, the app just silently fails without console feedback.
- **User Impact:** Impossible to debug why sync stopped working for specific users.
- **Severity:** **Medium**.
- **Recommended Fix:** Use Zod to validate all incoming data. Ban empty catch blocks via ESLint. Fix in V2.

### 6. Un-Awaited / Fragmented Async Storage Calls
- **File/Location:** `popup.js` (Lines 687, 703), `content_ui.js` (Line 483).
- **Category:** Bug / Logical Flaw.
- **Problem:** Uses old callback syntax `chrome.storage.local.get(..., (res) => {})` alongside modern async/await, leading to fragmented execution flows where the UI renders before data is fully loaded.
- **User Impact:** Flickering UI or showing "0 solved" briefly before popping in data.
- **Severity:** **Medium**.
- **Recommended Fix:** Standardize on Dexie Promises via `dexie-react-hooks`.

### 7. Duplicate GitHub Sync / Local Sync Logic
- **File/Location:** `background.js` (queue logic) vs `popup_sync.js` (manual sync).
- **Category:** Code Redundancy.
- **Problem:** The logic to check if a problem exists on GitHub and update the README is scattered.
- **User Impact:** Hard to maintain. Fixing a bug in one place misses the other.
- **Severity:** **Low (but annoying)**.
- **Recommended Fix:** Centralize all GitHub sync into `src/services/github.api.ts`.

---

## Non-blocking Cleanup Backlog

These issues were flagged during static analysis. They are low priority and do not block the V2 migration, but should be resolved naturally as we adopt the new architecture.

- **Production Console Logs:** Files like `background.js`, `login.js`, and `potd-fetcher.js` leave verbose `console.log` statements enabled in production.
- **Hardcoded URLs:** Repeated strings for `firestore.googleapis.com` and `api.github.com` exist across multiple files rather than centralized API endpoints.
- **Repeated SVG/Icon Strings:** Raw multi-line `<svg>` strings are duplicated in `popup_sheets.js` and `dashboard_modules/sheets_view.js`.
- **Large Unoptimized Assets:** `icon.png` is over 1MB, which bloats the extension size significantly.
- **Legacy Helper Scripts:** `update_bg.js`, `test_simulate.js`, and `static_analysis.js` are leftover scripts that should be removed from the final V2 bundle.
- **Magic Numbers:** UI uses arbitrary `setTimeout` delays (e.g., `4000ms`, `150ms`) for visual transitions instead of CSS `transitionend` events.
- **Fragmented Storage Usage:** Keys like `customSheets`, `customSmartLists`, `customStarredLists` are fetched piecemeal without await, leading to scattered UI render triggers.
- **Test Coverage Gaps:** Currently there are no unit tests for critical functions like `normalizeProblemSlug`, leaving future edits vulnerable to regressions.
- **Browser Compatibility Risks:** Relying on generic permissions like `<all_urls>` (in early development stages) can lead to rejection during Chrome Web Store review. V2 will strictly limit origins.
