# Migration Phases

This phased plan guarantees a zero-downtime migration to the V2 architecture without breaking the V1 extension during development.

### Phase 0: Documentation and Parity
- **Goal:** Deep analysis and generation of specs.
- **Output:** The 5 Markdown documentation files.

### Phase 1: Scaffold WXT V2
- **Goal:** Initialize `leetsync-pro-v2` separate from V1.
- **Tools:** `npx wxt@latest init`. Select React + TS. Setup Tailwind + Vitest.
- **Risks:** Setup configuration conflicts.
- **Safety:** Completely isolated from `leetcode-sync-pro` folder.

### Phase 2: Core Logic Porting
- **Goal:** Port string manipulation and business logic to TypeScript.
- **Files Involved:** `src/core/slug.ts`, `src/core/history.ts`.
- **Tests Required:** Vitest specs matching slug normalization outputs against historical V1 outputs.

### Phase 3: Dexie Database & Data Migration
- **Goal:** Define the Dexie schema (`src/db/database.ts`).
- **New Code:** Create `migration.ts` that triggers on install. It reads `chrome.storage.local.get("leetsyncHistory")` and parses the old flat JSON array into the normalized relational tables (`problems`, `solves`, `notes`, `lists`, `revisions`).
- **Tests Required:** Verify that all data from a mock 5MB V1 history JSON translates perfectly to Dexie tables without data loss.

### Phase 4: Background Queues & Sync Logic
- **Goal:** Rebuild the service worker utilizing the Dexie `syncQueue` table.
- **Modules Involved:** `src/entrypoints/background.ts`, `src/services/github.ts`, `src/services/firestore.ts`.
- **Risks:** Dropping messages.
- **Tests Required:** Mock network failures and verify that Zod-validated payloads successfully enqueue in Dexie and retry.

### Phase 5: Content Scripts
- **Goal:** Inject submission listeners into LeetCode/GFG.
- **Modules Involved:** `injected.ts`, `content/leetcode.ts`.
- **New Code:** Render the Save Widget using an isolated React root attached to a Shadow DOM (via WXT Content Script UI) to prevent LeetCode/GFG CSS from breaking the widget.

### Phase 6: React UI (Popup & Dashboard)
- **Goal:** Rebuild the UI using React, Tailwind, and Shadcn UI.
- **Modules Involved:** `src/entrypoints/popup`, `src/entrypoints/dashboard`.
- **New Code:** Use `dexie-react-hooks` (`useLiveQuery`) to bind UI directly to Dexie. Use Zustand for UI themes/filter states.
- **Tests Required:** Playwright E2E tests for modal opening, filtering, and tab switching.

### Phase 7: GitHub OAuth Cloudflare Worker
- **Goal:** Secure the OAuth flow.
- **New Code:** Write a simple `worker.ts` hosted on Cloudflare. It accepts a `code` and exchanges it using the stored Client Secret. Update the Extension to hit this worker instead of GitHub directly.
- **Safety Notes:** Do not commit the Worker's `wrangler.toml` secret to GitHub.

### Phase 8: Comprehensive Testing
- **Goal:** Verify end-to-end functionality.
- **Tests Required:** Playwright tests for Dashboard rendering, Vitest for all logic, and manual verification of GFG/LeetCode DOM injection across different layouts.

### Phase 9: Browser Compatibility
- **Goal:** Ensure cross-browser support.
- **Action:** Build targets for Firefox and Edge via WXT configuration. Fix any specific manifest strictness issues (e.g. Firefox MV2 vs MV3 backgrounds).

### Phase 10: Release Preparation
- **Goal:** Final build and publishing.
- **Checklist:** Obfuscation enabled, production assets optimized, `console.log` stripped, permissions audited.
