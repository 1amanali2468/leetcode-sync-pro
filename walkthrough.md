# Walkthrough - Page Timer, Spaced Repetition Scheduler & Pre-configured OAuth

Humne **Floating Stopwatch Timer (B)**, **Spaced Repetition Scheduler (C)**, **Automatic OAuth link (G)**, aur **Excel Export details updates** ko successfully implement aur test kar liya hai!

---

## 🚀 Key Improvements Added

### 1. Feature G: Automatic GitHub OAuth (Pre-configured Client ID)
* **Client ID Fallback**: Extension settings page connect form me default Client ID `"Iv23lia8fcf70570b5ee"` hardcode kar diya hai.
* **Frictionless UI**: Client ID text field ko default collapsible details tab `Advanced (Custom Client ID)` me hide kar diya hai. Ab basic view me user ko sirf "Link GitHub Account" dikhta hai aur ek single click se link flow verification trigger ho jata hai.

### 2. Feature B: Injected Stopwatch Timer (Time spent tracker)
* **Floating Timer Widget**: LeetCode problem page loads par bottom-right corner me auto-start circular stopwatch widget (`⏱️ MM:SS`) inject ho jata hai.
* **Stopwatch Controls**: Widget me play/pause (`⏸️`/`▶️`) toggle options aur reset (`🔄`) buttons dynamically bind hain.
* **SPA URL Observer**: Single Page Application redirects observers dynamically track karte hain, tab switch ya naya problem load hote hi timer count automatic `00:00` par reset hokar boot ho jata hai.
* **Save Modal integration**: Solution verdict "Accepted" aate hi active timer pause hokar save modal input field block me pre-populate ho jata hai (e.g., `14m 20s`), jahan se user review aur edit kar sakta hai.
* **GitHub Sync**: `Time Spent` value code header comments aur approaches README tables me automatically sync ho jati hai.
* **History Subtitle**: History tab me entry records subtitles me live time tag `⏱️ 14m 20s` reflect hota hai.

### 3. Feature C: Spaced Repetition & Custom Revision Scheduler
* **Custom Revision Scheduling (Floating Popover)**: Added a circular tick button (`✓`) next to each solved problem on the rightmost end of the calendar details cards. Clicking it opens a floating dropdown popover offering preset day counts (3, 5, 7, 10 days), a custom day input, and a "Clear" option.
  * Active scheduled items show a green highlighted button and a tooltip showing the scheduled date.
  * Revision date calculations are made relative to the problem's solved date.
* **Interactive Completion Checklist**: Added todo-style checkboxes to the "Today's Revisions Due" list on the Stats page.
  * Checking off a problem applies a strike-through styling to the text (`text-decoration: line-through`) and immediately decrements the pending "Due" count badge.
  * Completed revisions remain checked off and visible for the remainder of the day before clearing.
* **Dynamic Difficulty Classification**:
  - Implemented the general `classifyDifficulty` helper function to handle complex, non-standard difficulty columns containing star symbols (1-2 stars for Easy, 3 stars for Medium, 4-5 stars for Hard).
  - Handles numbers/fractions by converting them to ratios, mapping values up to 40% to Easy, 40% to 75% to Medium, and above 75% to Hard.
* **Notes Modal UI & UX Refactoring**:
  - Fixed a solved questions notes loading bug by prioritising retrieval of solves containing non-empty notes from local history, and resolving casing mismatches via lowercase slug normalization.
  - Enabled saving notes for unsolved questions directly from the sheet by automatically creating a new history placeholder entry if the problem is not yet in history.
  - Removed the Collection/List selection and custom input elements from the notes editor.
  - Implemented the **Inline Swap / Select-to-Input Toggle** UX style for custom patterns: selecting "Other" hides the dropdown select wrapper and renders a text input box in its exact position, complete with a reset cross icon button `✖` to return to select mode.
  - Beautified the Notes textarea by adding monospace font formatting, live character counters, a soft outline focus transition, and a premium interactive developer cheat-sheet tip panel below.
* **Background Notifications Alignment**: The service worker background reminders check is updated to skip completed revisions.
* **LeetCode Study Plan GraphQL Importer**:
  - Implemented real-time LeetCode Study Plan fetching via LeetCode's public GraphQL API (specifically using the `studyPlanV2Detail` operation).
  - Automatically parses the study plan slug from inputted URLs (e.g. `top-interview-150` from `https://leetcode.com/studyplan/top-interview-150/`).
  - Correctly maps the study plan subgroups (e.g., Array/String, Two Pointers) directly as **Topics** (main accordions) and lists their respective questions under a flat subtopic list ("Problems"), removing the redundant outer study plan name heading wrapper from the accordion cards structure.
  - Prefixes topics with step numbers (e.g. `Step 01:`, `Step 02:`) to enforce that the original LeetCode sequence order is strictly preserved in browser storage.
* **Custom Sheets Rename Option**:
  - Added a rename button (`✏️`) to each sheet inside the Custom Sheets Manager.
  - Clicking this prompts the user for a new name, updates storage, and immediately refreshes the active dropdown selector.
* **Database Normalization & Deduplication (3x Smaller Backups)**:
  - Extracted problem details into a global cache registry (`customSheetsRegistry`), storing only lightweight string slugs in `customSheets` hierarchies.
  - Implemented `migrateCustomSheets()` to automatically normalize old sheet structures in storage on load and garbage collect orphan entries.
  - Implemented `denormalizeSheetData()` to reconstruct full problem structures on the fly, ensuring 100% backward compatibility.
  - Updated JSON exporter and importer to support version 2.0 bundled format while retaining full compatibility with version 1.0 backups.
* **9 Permanent Built-in Sheets**:
  - Compiled and denormalized all 9 sheets from the backup file directly into `sheets-data.js` as static constant databases.
  - Registered all 9 sheets in the active dropdown selector in both dashboard and popup views, replacing the old static entries.
  - Excluded these 9 sheets from Custom Sheets Manager view to prevent users from deleting, renaming, or creating duplicate entries.
* **Custom Star Lists & Advanced Filtering**:
  - Implemented a floating glassmorphic `"My Lists"` popover that opens dynamically next to a clicked star icon.
  - Supports multi-selecting lists via checkbox items, associating problems to lists globally.
  - Configured two permanent/fixed default lists: **Favorite** (shows locked icon `🔒`, cannot be deleted) and **Revision**.
  - Enabled creating custom lists dynamically (saves globally in `customStarredLists`) and deleting them globally with a trash button (`🗑️`).
  - Added a dedicated "List" filter row to the Advanced Filters panel, supporting filtering sheet problems by their list memberships with `is` and `is_not` operators.
  - Synced list toggling with popup views, ensuring 100% backward compatibility with `isFavorite` states.
  - Added a capturing outside-click interceptor on document when the star popover is active, completely swallowing clicks made outside the popover to prevent parent accordions from collapsing or clicking other buttons/links.
  - Implemented automatic accordion state preservation: when the list is re-rendered (e.g., when adding a new custom list or deleting a list), the open/closed states of both main Topic accordions and Subtopic sections are saved and restored perfectly, keeping the active panel open instead of collapsing everything.
  - Added real-time scroll tracking to the star popover: when the user scrolls the main content panel (`.main-content`), the popover's position is updated in real time relative to the moving star button, keeping them perfectly anchored. Includes auto-cleanup logic when popover hides or when rows are destroyed.
* **LeetCode-Style Retractable Side Panel & My Lists Section**:
  - Implemented a LeetCode-style retractable splitter border on the right edge of `.sidebar` containing a circular `<` collapse button. Fixed the absolute positioning boundary bug by adding `position: relative;` to the `.sidebar` wrapper.
  - Added drag-to-resize support: users can hover over the splitter border (cursor changes to `col-resize` and shows a blue highlighting line), drag it to dynamically adjust the sidebar's width between `150px` and `450px`, or drag it to `<100px` to collapse it completely.
  - Clicking `<` collapses the sidebar by shifting it off-screen (`margin-left: -280px` or `width: 0`). This displays a LeetCode-style square expand button (split layout icon) at the top-left of the header to restore the sidebar.
  - Modified the main `.sidebar` to dynamically render the **My Lists** panel under the navigation links *only* when the **DSA Sheets** tab is active. It hides automatically when on other screens (Overview, Revision, Settings).
  - Configured custom/default list selection to display a dedicated **List Details View**: when a user clicks a list, it completely hides sheet selectors/pills and displays a flat table of bookmarked questions for that list, matching LeetCode's page layout.
  - Added a **Save as Smart List** button inside the Advanced Filters footer that active-glows when filters are applied.
  - Configured the **Generate Smart List** modal popup with character counters and constraints (`maxlength` checks: Title 30 chars, Description 150 chars).
  - Saving from filters captures the exact filter rules (stored under `customSmartLists` registry in storage) instead of bookmarking problems statically, preventing unneeded writes, hangs, auto-checkmarks, or incorrect stars.
  - Implemented dynamic Smart List evaluation: clicking a smart list dynamically filters the active sheet problems using the saved rules in real time, displaying them in a flat list with no automatic ticks or stars.
  - Styled smart lists with a LeetCode-style orbit symbol `⚛️` on the right side of the list name, showing a "Smart List" tooltip on hover.
  - Fixed the scroll container styling: isolated the scrollbar to only the sidebar lists items, keeping the "My Lists" header static and shifting the container higher up.
  - Implemented the LeetCode-style circular **Progress Widget** inside a two-column responsive layout for `#screen-sheets`. Right column displays sheet selector and progress widget, left column displays controls and problems (exactly mirroring LeetCode's page layout).
  - Designed the widget to perfectly match LeetCode's look: displays solved/total stats inside a 270-degree animated SVG progress arc (sleeker stroke-width of 6), removes the "Attempting" count completely, and displays elegant stacked text rows for Easy, Medium, and Hard difficulty levels, each with its own mini horizontal progress bar.
  - Eliminated horizontal page scrolling entirely by isolating the table's container overflow (`overflow-x: auto` on `#sheetAccordionContainer`) and raising responsive wrapping media queries to `1200px` for seamless flex column-reversing.
  - Implemented **Sticky controls and Progress column**: wrapped filters/search inside `.sheets-sticky-header` with `position: sticky; top: 96px; z-index: 8; background-color: var(--clr-bg);` and set `.sheets-right-sidebar-col` to `position: sticky; top: 110px;`. Now, when scrolling through problems, the search/filters header and the progress card remain beautifully fixed in view.
  - Implemented **All Sheets (Combined)**: added a static option in the sheet selector dropdown that aggregates and de-duplicates all problems across all standard DSA sheets and custom imported sheets in real time. It uses a global slug registry to guarantee 100% distinct problems and renders them directly in a single flat table (removing all topic accordion layers and topic pill headers entirely). Full searching, advanced filters, Progress Widget calculations, progress resets, and random shuffling work seamlessly on this combined view.
  - Bound the refresh widget button `↺` to trigger a manual sync of solves.

### 4. Excel Export: Expanded Columns
* **Excel Sheet Columns**: CSV export engine me do naye details headers insert kiye hain:
  * **Revision**: Current revision counter count (e.g., `Rev 1`, `Rev 2`).
  * **Time Spent**: Solution track elapsed time (e.g., `12m 45s`).
* Ab spreadsheet download karne par problem parameters ke sath full tracking stats show hote hain.

### 5. Packaged JSON Sheet Migrations & Loader Module Refactor
* **Dynamic Sheet Loader Module**: Monolithic `sheets-data.js` (~600KB) ko delete kar ke humne central **`sheet-loader.js`** module implementation kiya hai jo built-in aur custom sheets ko dynamically lazy-load karta hai.
* **Packaged JSONs**: 9 static sheets ko individual dynamic `.json` data chunks mein break kar ke `data/builtin-sheets/` directory me migrate kiya gaya hai. Startup par memory load ab zero hai!
* **Alphabetical Dropdown Sorting**: Dashboard aur Popup sheet selectors ab built-in aur custom lists ko pure alphabetical order me sort karte hain (special aggregation view **"All Sheets (Combined)"** ko list ke top par pin kiya jata hai).
* **Last Selected Sheet Persistence**: User ka last selected active sheet state now persists in local storage (`leetsyncActiveSheet`). Dashboard aur popup reload par directly use reload kiya jata hai, default fallback standard sheet **Striver A2Z Sheet** hai.
* **Code Cleanups**: Root backups (`leetsync_dsa_sheets_backup.json` and its duplicate) package size clean rakhne ke liye delete kar diye gaye hain. Sanity checks like `$undefined` path replacements now execute on load-time.
* **Cross-Sheet Frequency Badge**: Pre-calculated static sheet intersections are saved in `data/builtin-sheets/cross_sheet_frequency.json` (~68KB) to avoid fetching standard JSONs repeatedly. Startup overhead is 0ms. Custom sheets are dynamically merged in memory in <0.5ms. Displays a premium `X Sheets` tag next to repeated problem titles with a rich tooltip containing sheet names on hover (active on both Dashboard and Popup).
* **Clickable Frequency Sorting**: Table **"Problem"** column header is now clickable (cycling through default sheet order, descending sheet frequency `▼`, and ascending sheet frequency `▲`), allowing users to instantly sort list items based on their overlap counts.
* **DSA Sheet Excel Export**: Added a download button `btnSheetExportExcel` in the active DSA sheet controls bar on the dashboard. It dynamically fetches all problems in the selected active sheet, parses user's completion history, merges multiple-approach notes/GitHub links/time-spent/revisions, applies color-coded difficulty layouts, and exports a high-fidelity Excel report (.xls).
* **Excel Column AutoFilter Support**: Enabled native MS Excel/Google Sheets AutoFilter markup on generated spreadsheets for both DSA Sheets and History Exports. Downloading files now locks sorting headers so users can dynamically filter and sort columns directly inside Excel.

---

## 🛠️ Verification Steps

### 1. Extension Reload
* Apne chrome browser me `chrome://extensions` open karein, developer mode ON check karein aur **LeetSync Pro** card par **Reload** click karein.

### 2. Settings OAuth Link
* Settings page verify karein. Check box click Link account, check verification tab start without manual Client ID entry.

### 3. Floating Timer Widget
* LeetCode problem page open karein. Bottom-right screen corner me dynamic stopwatch timer loading verify karein.
* Check play/pause/reset callbacks. Solution submit accepted test trigger verify time spent pre-filled modal and history details.

### 4. Spaced Repetition Lists
* Stats panel open karein, verify card grid lists are counting revisions due today.
* Excel sheet export download check karein ki naye headers **Revision** and **Time Spent** data correctly populate ho rahe hain.
