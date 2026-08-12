# V2 Architecture Plan

This document dictates the final architecture for `leetsync-pro-v2`, strictly adhering to the approved tech stack (WXT, TypeScript, React, Tailwind, Dexie, Firebase Auth/Firestore, Cloudflare Workers).

## 1. Folder Structure & Module Boundaries
```text
leetsync-pro-v2/
├── package.json
├── wxt.config.ts
├── src/
│   ├── entrypoints/
│   │   ├── background.ts      (Background Service Worker)
│   │   ├── content/           (Lightweight Content Scripts)
│   │   ├── popup/             (React Popup UI)
│   │   └── dashboard/         (React Dashboard UI)
│   ├── core/                  (Pure business logic: slug.ts, history.ts, revision.ts)
│   ├── services/              (External APIs: firestore.ts, github.ts, auth.ts)
│   ├── db/                    (Dexie schema and operations)
│   ├── components/            (Reusable React components)
│   └── data/                  (Built-in JSON sheets)
```

## 2. Dexie Schema (Primary Local Source of Truth)
Dexie IndexedDB will act as the master cache and primary data source for the extension.
```typescript
db.version(1).stores({
  // Metadata about unique problems
  problems: '&slug, title, difficulty, leetcodeUrl, gfgUrl',
  
  // Specific solutions mapped to problems. Composite ID: `${slug}-${approach}-v${version}`
  solves: '&id, slug, approach, version, language, savedAt, code, runtime, memory, githubPath',
  
  // Notes tied to specific solutions
  notes: '&solveId, content, updatedAt',
  
  // Tags/Lists/Favorites tied to the generic problem
  lists: '&slug, isFavorite, *customLists',
  
  // Spaced repetition data tied to a specific solution
  revisions: '&solveId, dueDate, nextInterval',
  
  // Sheet metadata and problem mappings
  sheets: '&id, name, author, type',
  sheetProblems: '[sheetId+slug], step, subtopic',
  
  // Background processing queue
  syncQueue: '++id, action, payload, status, createdAt',
  
  // App settings
  settings: '&key, value'
});
```

## 3. Data & Sync Model
- **Code Viewing Flow:** Dashboard reads code directly from Dexie `solves` table. If `code` is null/missing (e.g. fresh install sync), the background worker fetches the file from GitHub via `githubPath` metadata and caches it in Dexie.
- **GitHub Role:** Primary remote backup for accepted solution code. Retains exact V1 folder format (`Difficulty/Slug/Slug-Approach-vVersion.ext`).
- **Firestore Role:** Remote backup for user metadata (`notes`, `lists`, `revisions`, `settings`, `githubPath`). DOES NOT store full code snippets.
- **Conflict Resolution:** "Latest Edit Wins". `updatedAt` timestamps dictate whether local Dexie state overrides Firestore state, or vice versa, during initial sync.

## 4. GitHub OAuth Security
- Extension uses `browser.identity.launchWebAuthFlow` pointing to `https://oauth.leetsync.workers.dev`.
- User logs in, GitHub redirects to Worker with a `code`.
- Cloudflare Worker holds the GitHub Client Secret safely on the server, exchanges `code` for `access_token`, and returns token to the extension.
- Token is stored locally in `browser.storage.session` and NEVER synced to Firestore.

## 5. Security & Browser Compatibility Strategy
- **Permissions:** Will request only `storage`, `identity`, and declarative network/activeTab perms. `<all_urls>` will be removed in favor of strict `*://leetcode.com/*` and `*://*.geeksforgeeks.org/*` matches.
- **Compatibility:** WXT compiles separate manifests for Chrome, Edge, and Firefox automatically.
- **Dynamic Execution:** Absolutely no `.innerHTML` bindings for remote/user data. All text is passed via React `{children}`, inherently safe from XSS.

## 6. Future Readiness
- **Paid Features:** Architecture supports gating via Firebase Custom Claims (checked in `auth.ts`), without implementing payments now.
- **AI Readiness:** Clean separation of the `code` column in Dexie allows easy future background batching for local LLM or API analysis.
