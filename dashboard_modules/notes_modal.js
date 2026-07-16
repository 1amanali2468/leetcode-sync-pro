// dashboard_modules/notes_modal.js - Solution Notes Modal Controller
import { el, STORAGE_KEYS, DASHBOARD_TOPIC_PATTERNS } from "./state.js";
import { escapeHtml } from "./ui_helpers.js";

let onNotesSaveCallback = null;

export function registerNotesSaveCallback(cb) {
  onNotesSaveCallback = cb;
}

export function setupNotesModalListeners() {
  if (!el.notesModalCancelBtn) return;
  el.notesModalCancelBtn.addEventListener("click", () => {
    el.notesModal.classList.add("hidden");
  });
  
  el.notesModal.addEventListener("click", (e) => {
    if (e.target === el.notesModal) {
      el.notesModal.classList.add("hidden");
    }
  });
}

export async function openNotesModal(entry, approachLabel) {
  el.notesModalTitle.textContent = `Edit Solution Notes`;
  el.notesModalSubtitle.textContent = entry.title;
  el.notesModalStatus.textContent = "";

  el.notesModalContainer.innerHTML = "";
  
  // Fetch history to pre-populate tabs
  const storedHistory = await chrome.storage.local.get(STORAGE_KEYS.history);
  const history = storedHistory[STORAGE_KEYS.history] || [];
  
  // Find all existing solves for this problem
  const problemSlug = entry.slug.trim().toLowerCase();
  const solves = history.filter(h => h.slug && h.slug.trim().toLowerCase() === problemSlug);

  // Initialize approach session data
  const sessionData = {
    optimal: { notes: "", pattern: "" },
    better: { notes: "", pattern: "" },
    brute_force: { notes: "", pattern: "" }
  };

  // Populate from history solves
  solves.forEach(s => {
    const appLower = (s.approach || "").toLowerCase().trim();
    if (appLower.includes("optimal") || appLower === "oa" || appLower.includes("(oa)")) {
      sessionData.optimal.notes = s.notes || "";
      sessionData.optimal.pattern = s.pattern && s.pattern !== "None" ? s.pattern : "";
    } else if (appLower.includes("better") || appLower === "ba" || appLower.includes("(ba)")) {
      sessionData.better.notes = s.notes || "";
      sessionData.better.pattern = s.pattern && s.pattern !== "None" ? s.pattern : "";
    } else if (appLower.includes("brute") || appLower === "bf" || appLower.includes("(bf)")) {
      sessionData.brute_force.notes = s.notes || "";
      sessionData.brute_force.pattern = s.pattern && s.pattern !== "None" ? s.pattern : "";
    }
  });

  // Unique patterns list for dropdown
  const patternsSet = new Set();
  Object.values(DASHBOARD_TOPIC_PATTERNS).forEach(pats => {
    pats.forEach(p => patternsSet.add(p));
  });
  history.forEach(h => {
    if (h.pattern && h.pattern !== "None") patternsSet.add(h.pattern);
  });
  const sortedPatterns = Array.from(patternsSet).sort();

  const wrapper = document.createElement("div");
  wrapper.style = "display: flex; flex-direction: column; gap: 16px; margin-top: 10px;";
  wrapper.innerHTML = `
    <!-- Tabs Header -->
    <div class="notes-tabs-header" style="display: flex; border-bottom: 2px solid var(--clr-border); margin-bottom: 4px; gap: 4px;">
      <button type="button" class="notes-tab-btn active" data-tab="optimal" style="flex: 1; padding: 10px 12px; background: none; border: none; border-bottom: 2px solid var(--clr-primary); color: var(--clr-text); font-weight: 700; font-size: 13px; cursor: pointer; text-align: center; outline: none; transition: var(--transition);">Optimal</button>
      <button type="button" class="notes-tab-btn" data-tab="better" style="flex: 1; padding: 10px 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--clr-muted); font-weight: 700; font-size: 13px; cursor: pointer; text-align: center; outline: none; transition: var(--transition);">Better</button>
      <button type="button" class="notes-tab-btn" data-tab="brute_force" style="flex: 1; padding: 10px 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--clr-muted); font-weight: 700; font-size: 13px; cursor: pointer; text-align: center; outline: none; transition: var(--transition);">Brute Force</button>
    </div>

    <!-- Algorithm Pattern (Inline Swap UI) -->
    <div>
      <label style="display: block; font-size: 11px; font-weight: 700; color: var(--clr-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Algorithm Pattern</label>
      
      <div id="notesPatternSelectWrap" style="width: 100%;">
        <select id="notesPatternSelect" class="dashboard-select" style="width: 100%; padding: 8px 12px; font-size: 13px; background-color: var(--clr-surface-card); border: 1px solid var(--clr-border); border-radius: 6px; color: var(--clr-text); outline: none; box-sizing: border-box; height: 38px;">
          <option value="">None / General</option>
          ${sortedPatterns.map(p => `<option value="${p.toLowerCase()}">${p}</option>`).join("")}
          <option value="other">Other (Custom Pattern...)</option>
        </select>
      </div>
      
      <div id="notesPatternInputWrap" class="hidden" style="display: flex; align-items: center; gap: 8px; width: 100%;">
        <input id="notesPatternCustomInput" type="text" class="notes-text-input" style="flex: 1; padding: 8px 12px; font-size: 13px; background-color: var(--clr-surface-card); border: 1px solid var(--clr-border); border-radius: 6px; color: var(--clr-text); outline: none; box-sizing: border-box; height: 38px;" placeholder="Type custom pattern...">
        <button id="notesPatternReset" type="button" style="background: none; border: none; color: var(--clr-muted); font-size: 16px; cursor: pointer; padding: 4px 8px; display: flex; align-items: center; justify-content: center; height: 38px;" title="Back to list">✖</button>
      </div>
    </div>

    <!-- Notes Textarea -->
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <label style="font-size: 11px; font-weight: 700; color: var(--clr-muted); text-transform: uppercase; letter-spacing: 0.5px;">Solution Notes</label>
        <span id="notesCharCount" style="font-size: 11px; color: var(--clr-muted); font-weight: 700;">0 chars</span>
      </div>
      <textarea class="notes-textarea" style="width: 100%; min-height: 180px; font-family: 'Fira Code', 'Courier New', Courier, monospace; font-size: 13px; line-height: 1.5; padding: 12px; background-color: var(--clr-surface-card); border: 1px solid var(--clr-border); border-radius: 6px; color: var(--clr-text); outline: none; resize: vertical; box-sizing: border-box;" placeholder="Write notes for this approach here..."></textarea>
    </div>
  `;
  el.notesModalContainer.appendChild(wrapper);

  const patternSelect = wrapper.querySelector("#notesPatternSelect");
  const patternSelectWrap = wrapper.querySelector("#notesPatternSelectWrap");
  const patternInputWrap = wrapper.querySelector("#notesPatternInputWrap");
  const patternCustomInput = wrapper.querySelector("#notesPatternCustomInput");
  const patternReset = wrapper.querySelector("#notesPatternReset");
  const textarea = wrapper.querySelector(".notes-textarea");
  const charCountSpan = wrapper.querySelector("#notesCharCount");
  const tabButtons = wrapper.querySelectorAll(".notes-tab-btn");

  let activeTab = "optimal";

  const updateCharCount = () => {
    charCountSpan.textContent = `${textarea.value.length} chars`;
  };
  textarea.addEventListener("input", updateCharCount);

  // Helper to load tab data
  const loadTabData = (tabKey) => {
    const data = sessionData[tabKey];
    textarea.value = data.notes || "";
    updateCharCount();

    // Populate pattern UI
    const pat = data.pattern || "";
    if (pat) {
      const matchedOpt = sortedPatterns.find(p => p.toLowerCase() === pat.toLowerCase());
      if (matchedOpt) {
        patternSelect.value = matchedOpt.toLowerCase();
        patternSelectWrap.classList.remove("hidden");
        patternInputWrap.classList.add("hidden");
      } else {
        patternSelect.value = "other";
        patternCustomInput.value = pat;
        patternSelectWrap.classList.add("hidden");
        patternInputWrap.classList.remove("hidden");
      }
    } else {
      patternSelect.value = "";
      patternCustomInput.value = "";
      patternSelectWrap.classList.remove("hidden");
      patternInputWrap.classList.add("hidden");
    }
  };

  // Helper to save current tab data to local session object
  const saveCurrentTabData = () => {
    sessionData[activeTab].notes = textarea.value;
    
    let currentPattern = "";
    if (patternSelectWrap.classList.contains("hidden")) {
      currentPattern = patternCustomInput.value.trim();
    } else if (patternSelect.value !== "") {
      const matchedOpt = sortedPatterns.find(p => p.toLowerCase() === patternSelect.value);
      currentPattern = matchedOpt || patternSelect.value;
    }
    sessionData[activeTab].pattern = currentPattern;
  };

  // Bind tab click handlers
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const newTab = btn.dataset.tab;
      if (newTab === activeTab) return;

      // 1. Save current tab
      saveCurrentTabData();

      // 2. Switch classes
      tabButtons.forEach(b => {
        if (b.dataset.tab === newTab) {
          b.classList.add("active");
          b.style.borderBottomColor = "var(--clr-primary)";
          b.style.color = "var(--clr-text)";
        } else {
          b.classList.remove("active");
          b.style.borderBottomColor = "transparent";
          b.style.color = "var(--clr-muted)";
        }
      });

      // 3. Load next tab
      activeTab = newTab;
      loadTabData(newTab);
    });
  });

  // Load default "Optimal" tab data
  loadTabData("optimal");

  // Pattern selects logic
  patternSelect.addEventListener("change", () => {
    if (patternSelect.value === "other") {
      patternSelectWrap.classList.add("hidden");
      patternInputWrap.classList.remove("hidden");
      patternCustomInput.value = "";
      patternCustomInput.focus();
    }
  });

  patternReset.addEventListener("click", () => {
    patternCustomInput.value = "";
    patternSelect.value = "";
    patternInputWrap.classList.add("hidden");
    patternSelectWrap.classList.remove("hidden");
  });

  el.notesModalSaveBtn.disabled = false;
  el.notesModalCancelBtn.disabled = false;
  el.notesModal.classList.remove("hidden");
  textarea.focus();

  el.notesModalSaveBtn.onclick = async () => {
    // Save current active tab data
    saveCurrentTabData();

    el.notesModalSaveBtn.disabled = true;
    el.notesModalCancelBtn.disabled = true;
    textarea.disabled = true;
    patternSelect.disabled = true;
    patternCustomInput.disabled = true;
    patternReset.disabled = true;
    tabButtons.forEach(b => b.disabled = true);
    el.notesModalStatus.textContent = "⏳ Saving all approaches...";

    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
      let hist = stored[STORAGE_KEYS.history] || [];

      const tabApproaches = {
        optimal: "Optimal",
        better: "Better",
        brute_force: "Brute Force"
      };

      for (const [tabKey, approachName] of Object.entries(tabApproaches)) {
        const tabVal = sessionData[tabKey];
        const hasNotes = tabVal.notes && tabVal.notes.trim() !== "";
        const hasPattern = tabVal.pattern && tabVal.pattern !== "None" && tabVal.pattern.trim() !== "";
        
        // Find existing solved item in history
        let foundIdx = -1;
        for (let i = 0; i < hist.length; i++) {
          const h = hist[i];
          if (h.slug && h.slug.trim().toLowerCase() === problemSlug) {
            const hAppLower = (h.approach || "").toLowerCase().trim();
            if (tabKey === "optimal" && (hAppLower.includes("optimal") || hAppLower === "oa" || hAppLower.includes("(oa)"))) {
              foundIdx = i;
              break;
            } else if (tabKey === "better" && (hAppLower.includes("better") || hAppLower === "ba" || hAppLower.includes("(ba)"))) {
              foundIdx = i;
              break;
            } else if (tabKey === "brute_force" && (hAppLower.includes("brute") || hAppLower === "bf" || hAppLower.includes("(bf)"))) {
              foundIdx = i;
              break;
            }
          }
        }

        if (foundIdx !== -1) {
          // Update existing solve
          hist[foundIdx].notes = tabVal.notes;
          hist[foundIdx].pattern = tabVal.pattern || "None";
        } else if (hasNotes || hasPattern) {
          // Create placeholder history solve if notes exist but solve doesn't
          const nowStr = new Date().toISOString();
          const newEntry = {
            id: entry.id || "",
            title: entry.title,
            slug: entry.slug,
            difficulty: entry.difficulty || "Medium",
            url: entry.leetcodeUrl || `https://leetcode.com/problems/${entry.slug}/`,
            savedAt: nowStr,
            approach: approachName,
            language: entry.language || "python",
            notes: tabVal.notes,
            pattern: tabVal.pattern || "None",
            collection: "None",
            githubUrl: "",
            isFavorite: false,
            revisionCount: 1,
            revisionCompleted: false,
            revisionCompletedAt: null,
            readmePath: ""
          };
          hist.unshift(newEntry);
        }
      }

      await chrome.storage.local.set({ [STORAGE_KEYS.history]: hist });

      // Trigger background notes commit for the current ACTIVE tab approach
      const activeApproachName = tabApproaches[activeTab];
      const activeTabVal = sessionData[activeTab];

      chrome.runtime.sendMessage({
        type: "LEETSYNC_UPDATE_NOTES",
        payload: {
          slug: entry.slug,
          title: entry.title,
          approach: activeApproachName,
          notes: activeTabVal.notes,
          language: entry.language || "python",
          readmePath: entry.readmePath || ""
        }
      }, (response) => {
        el.notesModalSaveBtn.disabled = false;
        el.notesModalCancelBtn.disabled = false;
        textarea.disabled = false;
        patternSelect.disabled = false;
        patternCustomInput.disabled = false;
        patternReset.disabled = false;
        tabButtons.forEach(b => b.disabled = false);

        if (chrome.runtime.lastError || (response && !response.ok)) {
          el.notesModalStatus.textContent = "❌ Sync failed, local notes saved.";
        } else {
          el.notesModalStatus.textContent = "✅ Saved & Synced!";
          setTimeout(() => {
            el.notesModal.classList.add("hidden");
            if (onNotesSaveCallback) {
              onNotesSaveCallback();
            }
          }, 800);
        }
      });
    } catch (e) {
      console.error(e);
      el.notesModalSaveBtn.disabled = false;
      el.notesModalCancelBtn.disabled = false;
      textarea.disabled = false;
      patternSelect.disabled = false;
      patternCustomInput.disabled = false;
      patternReset.disabled = false;
      tabButtons.forEach(b => b.disabled = false);
      el.notesModalStatus.textContent = "❌ Save failed";
    }
  };
}
