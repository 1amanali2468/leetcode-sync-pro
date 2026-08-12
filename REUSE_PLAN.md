# Reuse Plan

This document classifies existing files and functions into categories to maximize safe reuse while transitioning to the new stack.

### 1. Reuse As-Is
*No logic changes, just move to V2 folder.*
- **`data/*.json` (Built-in Sheets):** The JSON data structures for Striver, Fraz, and GFG160 are perfectly valid.
  - *Risk:* None.
  - *Dependency:* Must be imported into the new Dexie initialization script.

### 2. Reuse After Small Refactor
*Logic is sound, but needs minor structural updates.*
- **`shared_revision.js`:**
  - `getRevisionDueDate`, `isRevisionDue`, `getDueRevisions`.
  - *Refactor:* Change generic `entry` params to strict Zod-typed objects.
  - *Risk:* Low.
  - *Tests required:* Vitest unit tests for date calculation edges.
- **`shared_constants.js`:**
  - `DIFFICULTY_COLORS`, `PLATFORM_URLS`.
  - *Refactor:* Convert to TypeScript `enum` or `const` assertions.
- **`content_utils.js` (Scraping logic):**
  - `getGFGNumber`, `getGFGDescription`, `parseGFGUrl`.
  - *Refactor:* Remove DOM manipulation (`innerHTML`), keep only the string extraction functions. Export them as pure functions.

### 3. Port to TypeScript
*Logic is good, but needs strict typing and modernization.*
- **`history_manager.js`:**
  - `normalizeProblemSlug`, `mergeNewSolveIntoHistory`, `mergeSolveWithStars`.
  - *Reason:* History merging is the most critical part of the app. It must be ported to TypeScript with explicit interfaces to prevent data corruption.
  - *Tests required:* High coverage required for merge conflicts.
- **`injected.js`:**
  - The `XMLHttpRequest` and `fetch` monkey-patching logic.
  - *Reason:* Safest way to detect LeetCode/GFG successful submissions. Needs TS types for the injected payloads.
- **`github.js` & `firebase-config.js`:**
  - `saveSolutionToGitHub`, `updateSolutionNotesInGitHub`.
  - *Reason:* API REST calls are valid, but they must be wrapped in `GithubService` and `FirestoreService` classes.
- **`sheet-loader.js`:**
  - `denormalizeSheetData`, `getCombinedSheetsData`.
  - *Reason:* The logic to cross-reference sheet arrays is valid, but must be adapted to run a one-time Dexie table population rather than running on every render.

### 4. Replace Completely
*These files are incompatible with modern React/WXT.*
- **`popup.js`, `dashboard.js`, `content_ui.js`:**
  - *Reason:* Heavy reliance on `.innerHTML` and imperative DOM queries (`document.getElementById`). React handles this declaratively.
- **`dashboard_modules/*.js`:**
  - *Reason:* Must be rewritten as `.tsx` functional components using Tailwind.
- **`background.js` (Event bindings):**
  - *Reason:* WXT provides cleaner `defineBackground` syntax. The old manual queue system will be replaced by Dexie background sync.

### 5. Delete / Deprecate
*These files serve no purpose in V2.*
- **`static_analysis.js`, `update_bg.js`:** One-off scripts.
- **`*.html` files:** WXT automatically generates HTML entries for React apps.
- **Heavy SVG strings in `popup_sheets.js`:** Will be replaced by `lucide-react` icons or separate `.svg` imports.
