// content_ui.js – Handles UI elements, styling, modals, and dropdown overlays for content scripts.
// Runs in the same isolated world context as content_utils.js and content.js.

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function injectStyles() {
  if (document.getElementById("leetsync-styles")) return;
  const style = document.createElement("style");
  style.id = "leetsync-styles";
  style.textContent = `
    #leetsync-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 999999;
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    #leetsync-modal-overlay.show { opacity: 1; }
 
    .leetsync-modal {
      background: #ffffff;
      border-radius: 10px;
      width: 375px;
      max-width: 90vw;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
      border: 1px solid #e2e8f0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transform: scale(0.95);
      transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
    }
    #leetsync-modal-overlay.show .leetsync-modal { transform: scale(1); }
 
    .leetsync-modal-header {
      padding: 7px 12px;
      background: linear-gradient(135deg, #1e3a5f 0%, #185abc 100%);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .leetsync-modal-header h3 {
      margin: 0;
      font-size: 12.5px;
      font-weight: 700;
      color: #ffffff;
    }
    .leetsync-close-btn {
      background: rgba(255,255,255,0.15);
      border: 0;
      font-size: 11px;
      color: #ffffff;
      cursor: pointer;
      border-radius: 4px;
      padding: 2px 5px;
      transition: background 0.2s;
    }
    .leetsync-close-btn:hover { background: rgba(255,255,255,0.3); }
 
    .leetsync-modal-body {
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .leetsync-prob-info {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .leetsync-prob-title { font-size: 13px; font-weight: 700; color: #1e293b; }
    .leetsync-badge {
      font-size: 9.5px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 4px;
      text-transform: capitalize;
    }
    .leetsync-badge.easy   { color: #166534; background: #dcfce7; }
    .leetsync-badge.medium { color: #854d0e; background: #fef9c3; }
    .leetsync-badge.hard   { color: #991b1b; background: #fee2e2; }
 
    .leetsync-label {
      font-size: 10.5px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 2px;
      display: block;
    }
    .leetsync-segmented {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      background: #f1f5f9;
      padding: 3px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .leetsync-segmented label { cursor: pointer; text-align: center; margin: 0; }
    .leetsync-segmented input { position: absolute; opacity: 0; pointer-events: none; }
    .leetsync-segmented span {
      display: block;
      padding: 3px 0;
      font-size: 10.5px;
      font-weight: 600;
      color: #64748b;
      border-radius: 4px;
      transition: all 0.2s ease;
    }
    .leetsync-segmented input:checked + span {
      background: #185abc;
      color: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
 
    .leetsync-input, .leetsync-textarea, .leetsync-select {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 11.5px;
      color: #1e293b;
      background: #ffffff;
      box-sizing: border-box;
      font-family: inherit;
    }
    .leetsync-input:focus, .leetsync-textarea:focus, .leetsync-select:focus {
      outline: 2px solid #185abc;
      outline-offset: -1px;
    }
    .leetsync-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .leetsync-textarea { resize: vertical; min-height: 32px; }
 
    .leetsync-modal-footer {
      padding: 8px 12px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 6px;
    }
    .leetsync-btn {
      padding: 4.5px 10px;
      font-size: 11.5px;
      font-weight: 600;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 0;
    }
    .leetsync-btn-secondary { background: #ffffff; color: #475569; border: 1px solid #cbd5e1; }
    .leetsync-btn-secondary:hover { background: #f1f5f9; }
    .leetsync-btn-primary { background: #185abc; color: #ffffff; }
    .leetsync-btn-primary:hover { background: #154f9f; }
    .leetsync-btn-primary:disabled { opacity: 0.65; cursor: not-allowed; }
 
    .leetsync-result { font-size: 10.5px; text-align: center; margin-top: 0px; min-height: 12px; font-weight: 500; }
    .leetsync-result.success { color: #166534; }
    .leetsync-result.error   { color: #991b1b; }
    .leetsync-hidden { display: none !important; }
 
    .leetsync-folder-preview {
      font-size: 9px;
      color: #64748b;
      margin-top: 1px;
      font-family: monospace;
      background: #f1f5f9;
      padding: 1.5px 4px;
      border-radius: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .leetsync-fav-btn {
      transition: transform 0.2s;
    }
    .leetsync-fav-btn:hover {
      transform: scale(1.15);
    }
    #leetsync-timer-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 30px;
      color: #f8fafc;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: transform 0.2s, opacity 0.2s;
    }
    #leetsync-timer-widget:hover {
      transform: scale(1.05);
    }
    #leetsync-timer-widget button {
      background: none;
      border: 0;
      color: #38bdf8;
      cursor: pointer;
      font-size: 11px;
      padding: 2px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;
    }
    #leetsync-timer-widget button:hover {
      color: #0ea5e9;
    }
    .leetsync-timer-text {
      font-family: monospace;
      font-size: 12.5px;
      color: #f8fafc;
      min-width: 38px;
      text-align: center;
    }
  `;
  document.head.appendChild(style);
}

function showModal(submission, details, timeSpentStr) {
  currentSubmission = submission;
  currentDetails = details;

  injectStyles();

  const oldOverlay = document.getElementById("leetsync-modal-overlay");
  if (oldOverlay) oldOverlay.remove();

  const overlay = document.createElement("div");
  overlay.id = "leetsync-modal-overlay";

  const diffClass = escapeHtml((details.difficulty || "medium").toLowerCase());
  const cleanTitle = escapeHtml(details.title || "");
  const cleanNum = details.questionFrontendId ? escapeHtml(details.questionFrontendId) + ". " : "";
  const cleanDiff = escapeHtml(details.difficulty || "Medium");

  overlay.innerHTML = `
    <div class="leetsync-modal">
      <div class="leetsync-modal-header">
        <h3>⚡ LeetSync Pro – Solution Saved</h3>
        <button type="button" class="leetsync-close-btn" id="leetsync-close-modal">✕</button>
      </div>

      <div class="leetsync-modal-body">
        <div class="leetsync-prob-info" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="leetsync-prob-title">${cleanNum}${cleanTitle}</span>
            <span class="leetsync-badge ${diffClass}">${cleanDiff}</span>
          </div>
          <button type="button" id="leetsync-fav-btn" class="leetsync-fav-btn" title="Toggle Favorite" style="background: none; border: none; cursor: pointer; font-size: 20px; padding: 0 4px; line-height: 1; transition: transform 0.2s;">🤍</button>
        </div>

        <div>
          <span class="leetsync-label">Approach</span>
          <div class="leetsync-segmented">
            <label><input type="radio" name="leetsync-approach" value="bf"><span>Brute</span></label>
            <label><input type="radio" name="leetsync-approach" value="ba"><span>Better</span></label>
            <label><input type="radio" name="leetsync-approach" value="oa" checked><span>Optimal</span></label>
            <label><input type="radio" name="leetsync-approach" value="custom"><span>Custom</span></label>
          </div>
        </div>

        <div id="leetsync-custom-name-container" class="leetsync-hidden">
          <label class="leetsync-label">Custom Approach Name</label>
          <input type="text" id="leetsync-custom-name" class="leetsync-input" placeholder="e.g. two-pointer">
        </div>

        <div class="leetsync-grid-2">
          <div>
            <span class="leetsync-label">Topic</span>
            <select id="leetsync-topic-select" class="leetsync-select">
              <option value="">⏳ Loading topics...</option>
            </select>
          </div>
          <div>
            <span class="leetsync-label">Pattern Used</span>
            <div id="leetsync-pattern-select-wrap">
              <select id="leetsync-pattern-select" class="leetsync-select">
                <option value="">⏳ Loading patterns...</option>
              </select>
            </div>
            <div id="leetsync-other-pattern-wrap" class="leetsync-hidden" style="position: relative;">
              <input type="text" id="leetsync-other-pattern" class="leetsync-input" placeholder="Custom Pattern (e.g. Kadane's)" style="padding-right:30px;">
              <button type="button" id="leetsync-pattern-reset" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#ef4444;font-weight:bold;font-size:14px;padding:0;">✕</button>
            </div>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: -6px;">
          <div class="leetsync-folder-preview" id="leetsync-folder-preview">📁 Loading...</div>
        </div>

        <div class="leetsync-grid-2">
          <div>
            <label class="leetsync-label">Time Complexity</label>
            <div id="leetsync-time-select-wrap">
              <select id="leetsync-time-select" class="leetsync-select">
                <option value="O(1)">O(1)</option>
                <option value="O(log n)">O(log n)</option>
                <option value="O(n)" selected>O(n)</option>
                <option value="O(n log n)">O(n log n)</option>
                <option value="O(n^2)">O(n²)</option>
                <option value="O(n^3)">O(n³)</option>
                <option value="O(2^n)">O(2ⁿ)</option>
                <option value="O(n!)">O(n!)</option>
                <option value="__other__">✏️ Custom...</option>
              </select>
            </div>
            <div id="leetsync-time-custom-wrap" class="leetsync-hidden" style="position:relative;">
              <input type="text" id="leetsync-time-custom" class="leetsync-input" placeholder="e.g. O(n log k)" style="padding-right:30px;">
              <button type="button" id="leetsync-time-reset" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#ef4444;font-weight:bold;font-size:14px;padding:0;">✕</button>
            </div>
          </div>
          <div>
            <label class="leetsync-label">Space Complexity</label>
            <div id="leetsync-space-select-wrap">
              <select id="leetsync-space-select" class="leetsync-select">
                <option value="O(1)" selected>O(1)</option>
                <option value="O(log n)">O(log n)</option>
                <option value="O(n)">O(n)</option>
                <option value="O(n log n)">O(n log n)</option>
                <option value="O(n^2)">O(n²)</option>
                <option value="__other__">✏️ Custom...</option>
              </select>
            </div>
            <div id="leetsync-space-custom-wrap" class="leetsync-hidden" style="position:relative;">
              <input type="text" id="leetsync-space-custom" class="leetsync-input" placeholder="e.g. O(k)" style="padding-right:30px;">
              <button type="button" id="leetsync-space-reset" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#ef4444;font-weight:bold;font-size:14px;padding:0;">✕</button>
            </div>
          </div>
        </div>

        <div class="leetsync-grid-2">
          <div>
            <span class="leetsync-label">Time Spent</span>
            <input type="text" id="leetsync-time-spent" class="leetsync-input" placeholder="e.g. 15m 30s" value="${timeSpentStr || ''}">
          </div>
        </div>

        <div id="leetsync-sheet-section" style="margin-top:2px;">
          <div id="leetsync-sheet-loading" style="font-size:11px; color:var(--clr-muted, #94a3b8); padding:4px 0;">⏳ Checking sheets...</div>
        </div>

        <div>
          <label class="leetsync-label">Notes (optional)</label>
          <textarea id="leetsync-notes" class="leetsync-textarea" placeholder="e.g. HashMap use kiya..."></textarea>
        </div>

        <div class="leetsync-result" id="leetsync-res-msg"></div>
      </div>

      <div class="leetsync-modal-footer">
        <button type="button" class="leetsync-btn leetsync-btn-secondary" id="leetsync-cancel-btn">Cancel</button>
        <button type="button" class="leetsync-btn leetsync-btn-primary" id="leetsync-save-btn">Save to GitHub</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add("show"), 10);

  if (isGFGProblemPage()) {
    populateTopicsAndPatternsForGFG(overlay, details);
  }

  const favBtn = overlay.querySelector("#leetsync-fav-btn");
  let isFavorite = false;
  if (favBtn) {
    favBtn.addEventListener("click", () => {
      isFavorite = !isFavorite;
      favBtn.textContent = isFavorite ? "❤️" : "🤍";
      favBtn.style.transform = "scale(1.2)";
      setTimeout(() => { favBtn.style.transform = "scale(1)"; }, 150);
    });
  }

  // ── Sheet Status Section ──────────────────────────────────────────────────
  const sheetSection = overlay.querySelector("#leetsync-sheet-section");
  const currentSlug = getProblemSlug();
  const currentPlatform = isGFGProblemPage() ? "gfg" : "leetcode";
  const defaultSheetKey = currentPlatform;
  const defaultSheetName = currentPlatform === "gfg" ? "GFG" : "LeetCode";

  if (sheetSection && currentSlug) {
    chrome.runtime.sendMessage(
      { type: "LEETSYNC_GET_SHEET_STATUS", payload: { slug: currentSlug, platform: currentPlatform } },
      (resp) => {
        if (chrome.runtime.lastError) {
          console.warn("[LeetSync] Sheet status fetch error:", chrome.runtime.lastError.message);
          return;
        }
        const allSheets = (resp?.sheets || []);

        if (allSheets.length > 0) {
          sheetSection.innerHTML = `
            <div style="font-size:11.5px; color:var(--clr-muted,#94a3b8); line-height:1.6;">
              <span style="font-weight:700; color:var(--clr-text,#f1f5f9);">📋 In sheets:</span>
              ${allSheets.map(s => `<span style="display:inline-block; margin:2px 4px 2px 0; padding:2px 7px; border-radius:10px; background:rgba(99,102,241,0.18); color:#a5b4fc; font-size:10.5px; font-weight:600;">${escapeHtml(s)}</span>`).join("")}
            </div>`;
        } else {
          sheetSection.innerHTML = `
            <div style="display:flex; align-items:center; gap:7px; flex-wrap:wrap;">
              <span class="leetsync-label" style="margin:0; white-space:nowrap;">➕ Add to sheet</span>
              <select id="leetsync-sheet-add-select" class="leetsync-select" style="flex:1; min-width:130px; max-width:200px;">
              </select>
            </div>
            <div id="leetsync-sheet-new-wrap" style="display:none; gap:6px; margin-top:5px; align-items:center;">
              <input type="text" id="leetsync-sheet-new-name" class="leetsync-input" placeholder="Sheet name..." style="flex:1; font-size:12px;">
              <button type="button" id="leetsync-sheet-create-btn" class="leetsync-btn leetsync-btn-primary" style="padding:4px 12px; font-size:11.5px; white-space:nowrap;">Create &amp; Add</button>
            </div>
            <div id="leetsync-sheet-add-msg" style="font-size:11px; min-height:14px; margin-top:3px;"></div>`;

          const BUILTIN_KEYS = new Set([
            "apnacollege_dsa_sheet", "collegewallah_dsa_master_sheet", "fraz_dsa_sheet",
            "leetcode_75", "leetcode_top_100_liked", "love_babbar_dsa_sheet",
            "neetcode_150", "striver_a2z_sheet", "top_interview_150", "gfg_160",
            "gfg", "leetcode"
          ]);

          const sel = sheetSection.querySelector("#leetsync-sheet-add-select");
          const msgEl = sheetSection.querySelector("#leetsync-sheet-add-msg");
          const newWrap = sheetSection.querySelector("#leetsync-sheet-new-wrap");

          function doAdd(sheetKey, sheetName) {
            msgEl.textContent = "⏳ Adding...";
            msgEl.style.color = "#94a3b8";

            const topicSelect = overlay.querySelector("#leetsync-topic-select");
            const selectedTopic = topicSelect ? topicSelect.value.trim() : "";

            chrome.runtime.sendMessage({
              type: "LEETSYNC_ADD_TO_SHEET",
              payload: {
                sheetKey,
                sheetName,
                problem: {
                  slug: currentSlug,
                  title: details.title || currentSlug,
                  difficulty: details.difficulty || "Medium",
                  url: window.location.href,
                  platform: currentPlatform,
                  topic: selectedTopic || "General"
                }
              }
            }, (res) => {
              if (res?.ok) {
                msgEl.textContent = res.alreadyExisted ? `ℹ️ Already in "${sheetName}"` : `✅ Added to "${sheetName}"!`;
                msgEl.style.color = res.alreadyExisted ? "#94a3b8" : "#4ade80";
              } else {
                msgEl.textContent = "❌ Failed: " + (res?.error || "Unknown error");
                msgEl.style.color = "#f87171";
              }
            });
          }

          chrome.storage.local.get(["customSheets"], (st) => {
            const customSheets = st.customSheets || {};

            const placeholderOpt = document.createElement("option");
            placeholderOpt.value = "";
            placeholderOpt.disabled = true;
            placeholderOpt.selected = true;
            placeholderOpt.textContent = "Select sheet...";
            sel.appendChild(placeholderOpt);

            const defOpt = document.createElement("option");
            defOpt.value = defaultSheetKey;
            defOpt.textContent = defaultSheetName;
            defOpt.dataset.sheetName = defaultSheetName;
            sel.appendChild(defOpt);

            let hasCustom = false;
            for (const [key, obj] of Object.entries(customSheets)) {
              if (BUILTIN_KEYS.has(key)) continue;
              if (!hasCustom) {
                const sepEl = document.createElement("option");
                sepEl.disabled = true;
                sepEl.textContent = "── Your Sheets ──";
                sel.appendChild(sepEl);
                hasCustom = true;
              }
              const opt = document.createElement("option");
              opt.value = key;
              opt.textContent = "⭐ " + (obj.name || key);
              opt.dataset.sheetName = obj.name || key;
              sel.appendChild(opt);
            }

            const sepEl2 = document.createElement("option");
            sepEl2.disabled = true;
            sepEl2.textContent = "──────────";
            sel.appendChild(sepEl2);
            const newOpt = document.createElement("option");
            newOpt.value = "__new__";
            newOpt.textContent = "+ Create New Sheet...";
            sel.appendChild(newOpt);
          });

          sel.addEventListener("change", () => {
            msgEl.textContent = "";
            if (sel.value === "__new__") {
              newWrap.style.display = "flex";
            } else {
              newWrap.style.display = "none";
              const chosenKey = sel.value;
              const chosenName = sel.options[sel.selectedIndex]?.dataset?.sheetName || chosenKey;
              doAdd(chosenKey, chosenName);
            }
          });

          sheetSection.querySelector("#leetsync-sheet-create-btn")?.addEventListener("click", () => {
            const nameInput = sheetSection.querySelector("#leetsync-sheet-new-name");
            const newName = nameInput?.value.trim();
            if (!newName) { msgEl.textContent = "⚠️ Enter a sheet name."; msgEl.style.color = "#fbbf24"; return; }
            const newKey = newName.toLowerCase().replace(/[^a-z0-9]/g, "_");
            newWrap.style.display = "none";
            doAdd(newKey, newName);
            if (nameInput) nameInput.value = "";
          });
        }
      }
    );
  }

  const closeBtn = overlay.querySelector("#leetsync-close-modal");
  const cancelBtn = overlay.querySelector("#leetsync-cancel-btn");
  const saveBtn = overlay.querySelector("#leetsync-save-btn");
  const resMsg = overlay.querySelector("#leetsync-res-msg");
  const radios = overlay.querySelectorAll('input[name="leetsync-approach"]');
  const customContainer = overlay.querySelector("#leetsync-custom-name-container");
  const customInput = overlay.querySelector("#leetsync-custom-name");

  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.value === "custom") {
        customContainer.classList.remove("leetsync-hidden");
        customInput.focus();
      } else {
        customContainer.classList.add("leetsync-hidden");
      }
    });
  });

  const timeSelect = overlay.querySelector("#leetsync-time-select");
  const timeSelectWrap = overlay.querySelector("#leetsync-time-select-wrap");
  const timeCustomWrap = overlay.querySelector("#leetsync-time-custom-wrap");
  const timeCustomInput = overlay.querySelector("#leetsync-time-custom");
  const timeReset = overlay.querySelector("#leetsync-time-reset");
  if (timeSelect && timeSelectWrap && timeCustomWrap) {
    timeSelect.addEventListener("change", () => {
      if (timeSelect.value === "__other__") {
        timeSelectWrap.classList.add("leetsync-hidden");
        timeCustomWrap.classList.remove("leetsync-hidden");
        if (timeCustomInput) { timeCustomInput.value = ""; timeCustomInput.focus(); }
      }
    });
    if (timeReset) {
      timeReset.addEventListener("click", () => {
        if (timeCustomInput) timeCustomInput.value = "";
        timeCustomWrap.classList.add("leetsync-hidden");
        timeSelectWrap.classList.remove("leetsync-hidden");
        timeSelect.value = "O(n)";
      });
    }
  }

  const spaceSelect = overlay.querySelector("#leetsync-space-select");
  const spaceSelectWrap = overlay.querySelector("#leetsync-space-select-wrap");
  const spaceCustomWrap = overlay.querySelector("#leetsync-space-custom-wrap");
  const spaceCustomInput = overlay.querySelector("#leetsync-space-custom");
  const spaceReset = overlay.querySelector("#leetsync-space-reset");
  if (spaceSelect && spaceSelectWrap && spaceCustomWrap) {
    spaceSelect.addEventListener("change", () => {
      if (spaceSelect.value === "__other__") {
        spaceSelectWrap.classList.add("leetsync-hidden");
        spaceCustomWrap.classList.remove("leetsync-hidden");
        if (spaceCustomInput) { spaceCustomInput.value = ""; spaceCustomInput.focus(); }
      }
    });
    if (spaceReset) {
      spaceReset.addEventListener("click", () => {
        if (spaceCustomInput) spaceCustomInput.value = "";
        spaceCustomWrap.classList.add("leetsync-hidden");
        spaceSelectWrap.classList.remove("leetsync-hidden");
        spaceSelect.value = "O(1)";
      });
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      closeModal();
    } else if (e.key === "Enter" && document.activeElement?.id !== "leetsync-notes") {
      e.preventDefault();
      saveBtn.click();
    }
  };

  const closeModal = () => {
    document.removeEventListener("keydown", handleKeyDown);
    overlay.classList.remove("show");
    setTimeout(() => overlay.remove(), 250);
  };

  document.addEventListener("keydown", handleKeyDown);

  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  saveBtn.addEventListener("click", async () => {
    resMsg.textContent = "";
    resMsg.className = "leetsync-result";
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    const resetBtn = (msg) => {
      resMsg.textContent = msg;
      resMsg.classList.add("error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Save to GitHub";
    };

    try {
      if (!isChromeAlive()) {
        resetBtn("Extension context lost. Please refresh the page and try again.");
        return;
      }

      const selectedRadio = overlay.querySelector('input[name="leetsync-approach"]:checked').value;
      const customName = customInput.value.trim();

      const timeSelect = overlay.querySelector("#leetsync-time-select");
      let timeComplexity = timeSelect ? timeSelect.value : "";
      if (timeComplexity === "__other__") {
        const timeCustom = overlay.querySelector("#leetsync-time-custom");
        timeComplexity = timeCustom ? timeCustom.value.trim() : "";
      }

      const spaceSelect = overlay.querySelector("#leetsync-space-select");
      let spaceComplexity = spaceSelect ? spaceSelect.value : "";
      if (spaceComplexity === "__other__") {
        const spaceCustom = overlay.querySelector("#leetsync-space-custom");
        spaceComplexity = spaceCustom ? spaceCustom.value.trim() : "";
      }
      const notes = overlay.querySelector("#leetsync-notes").value.trim();

      if (selectedRadio === "custom" && !customName) {
        resetBtn("Please enter a custom approach name.");
        return;
      }

      const stored = await chrome.storage.local.get("githubSettings");
      const settings = stored.githubSettings;

      const hasGithubSettings = settings && settings.token && settings.owner && settings.repo;

      const topicSelect = overlay.querySelector("#leetsync-topic-select");
      const selectedTopic = topicSelect ? topicSelect.value : "";

      const submissionPayload = {
        ...currentSubmission,
        questionFrontendId: currentDetails.questionFrontendId,
        difficulty: currentDetails.difficulty,
        content: currentDetails.content,
        topicTags: selectedTopic ? [{ name: selectedTopic }] : (currentDetails.topicTags || []),
        title: currentDetails.title,
        titleSlug: currentDetails.titleSlug,
      };

      const patternSelect = overlay.querySelector("#leetsync-pattern-select");
      const otherPatternInput = overlay.querySelector("#leetsync-other-pattern");
      let selectedPattern = patternSelect ? patternSelect.value : "";
      if (selectedPattern === "__other__") {
        selectedPattern = otherPatternInput ? otherPatternInput.value.trim() : "";
      }

      const selectedCollection = "";

      const storedHistory = await chrome.storage.local.get("leetsyncHistory");
      const hist = storedHistory.leetsyncHistory || [];
      const slug = submissionPayload.titleSlug || submissionPayload.slug;
      const targetApproach = selectedRadio === "custom" ? customName : selectedRadio;

      const approachSolves = hist.filter(h => h.slug === slug && h.approach === targetApproach);
      
      const nowStr = new Date().toISOString();
      const todayStrVal = nowStr.split("T")[0];
      const sameDayEntry = approachSolves.find(s => {
        const dateStr = s.savedAt ? s.savedAt.split("T")[0] : "";
        return dateStr === todayStrVal;
      });

      let version;
      if (sameDayEntry) {
        version = sameDayEntry.version || 1;
      } else {
        const maxVersion = approachSolves.reduce((max, s) => Math.max(max, s.version || 1), 0);
        version = maxVersion + 1;
      }

      let mergedNotes = notes.trim();
      if (approachSolves.length > 0) {
        const sortedSolves = [...approachSolves].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
        const latestExistingSolve = sortedSolves.find(s => s.notes && s.notes.trim() !== "");
        if (latestExistingSolve) {
          const prevNotes = latestExistingSolve.notes.trim();
          if (mergedNotes !== "" && prevNotes !== mergedNotes && !prevNotes.includes(mergedNotes)) {
            mergedNotes = prevNotes + "\n\n---\n\n" + mergedNotes;
          } else if (mergedNotes === "") {
            mergedNotes = prevNotes;
          }
        }
      }

      const saveOptions = {
        approach: selectedRadio,
        customName,
        timeComplexity,
        spaceComplexity,
        notes: mergedNotes,
        selectedTopic,
        pattern: selectedPattern,
        collection: selectedCollection,
        timeSpent: overlay.querySelector("#leetsync-time-spent") ? overlay.querySelector("#leetsync-time-spent").value.trim() : "",
        version: version
      };

      let localSaved = true;
      let localError = "";
      const historyEntry = {
        id: submissionPayload.questionFrontendId || "0",
        title: submissionPayload.title,
        slug: submissionPayload.titleSlug || submissionPayload.slug,
        url: submissionPayload.url || "",
        difficulty: submissionPayload.difficulty || "Medium",
        approach: saveOptions.approach === "custom" ? saveOptions.customName : saveOptions.approach,
        language: submissionPayload.language,
        topic: saveOptions.selectedTopic || "",
        pattern: saveOptions.pattern || "",
        notes: saveOptions.notes || "",
        githubUrl: "",
        savedAt: new Date().toISOString(),
        isFavorite: isFavorite,
        collection: saveOptions.collection || "",
        timeSpent: saveOptions.timeSpent || "",
        readmePath: "",
        version: version
      };

      try {
        await saveToHistory(historyEntry);
      } catch (historyErr) {
        localSaved = false;
        localError = historyErr.message || "Storage error";
      }

      if (!localSaved) {
        resetBtn(`⚠️ Local history save failed: ${localError}`);
        return;
      }

      if (!hasGithubSettings) {
        resMsg.textContent = "✅ Saved locally. Connect GitHub in extension popup to sync.";
        resMsg.className = "leetsync-result success";
        saveBtn.textContent = "Saved Local!";
        setTimeout(closeModal, 2000);
        return;
      }

      chrome.runtime.sendMessage(
        {
          type: "LEETSYNC_SAVE_TO_GITHUB",
          payload: { settings, submission: submissionPayload, saveOptions },
        },
        async (response) => {
          try {
            if (chrome.runtime.lastError) {
              await enqueuePendingGithubSync(submissionPayload, saveOptions, settings);
              resMsg.textContent = "⚠️ Saved locally, but GitHub sync queued (context lost).";
              resMsg.className = "leetsync-result warning";
              saveBtn.textContent = "Saved (Pending Sync)";
              setTimeout(closeModal, 4000);
              return;
            }
            if (response && response.ok) {
              const githubUrl = response.result?.solutionUrl || "";
              const readmePath = response.result?.readmePath || "";
              try {
                historyEntry.githubUrl = githubUrl;
                historyEntry.readmePath = readmePath;
                await saveToHistory(historyEntry);
              } catch (updateErr) {
                console.error("Failed to update history with GitHub URL:", updateErr);
              }
              resMsg.textContent = "✅ Saved to GitHub successfully!";
              resMsg.className = "leetsync-result success";
              saveBtn.textContent = "Saved!";
              setTimeout(closeModal, 1500);
            } else {
              await enqueuePendingGithubSync(submissionPayload, saveOptions, settings);
              const errMsg = response?.error || "Upload failed";
              resMsg.textContent = `⚠️ Saved locally, but GitHub sync queued: ${errMsg}`;
              resMsg.className = "leetsync-result warning";
              saveBtn.textContent = "Saved (Pending Sync)";
              setTimeout(closeModal, 4000);
            }
          } catch (innerErr) {
            await enqueuePendingGithubSync(submissionPayload, saveOptions, settings);
            resMsg.textContent = `⚠️ Saved locally, but GitHub sync queued: ${innerErr.message}`;
            resMsg.className = "leetsync-result warning";
            saveBtn.textContent = "Saved (Pending Sync)";
            setTimeout(closeModal, 4000);
          }
        }
      );
    } catch (err) {
      resetBtn(err.message || "Unexpected error. Please refresh the page.");
    }
  });
}

function populatePatternDropdown(selectEl, topicName, overlay) {
  const patternSelectWrap = overlay.querySelector("#leetsync-pattern-select-wrap");
  const otherWrap = overlay.querySelector("#leetsync-other-pattern-wrap");
  const otherInput = overlay.querySelector("#leetsync-other-pattern");
  const patternReset = overlay.querySelector("#leetsync-pattern-reset");

  if (otherWrap) otherWrap.classList.add("leetsync-hidden");
  if (patternSelectWrap) patternSelectWrap.classList.remove("leetsync-hidden");

  selectEl.innerHTML = "";
  
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "🧩 No pattern / standard solve";
  selectEl.appendChild(noneOpt);

  const patterns = TOPIC_PATTERNS[topicName?.toLowerCase()] || [];
  patterns.forEach((pat) => {
    const opt = document.createElement("option");
    opt.value = pat;
    opt.textContent = pat;
    selectEl.appendChild(opt);
  });

  const sepEl = document.createElement("option");
  sepEl.disabled = true;
  sepEl.textContent = "──────────";
  selectEl.appendChild(sepEl);

  const otherOpt = document.createElement("option");
  otherOpt.value = "__other__";
  otherOpt.textContent = "✏️ Custom Pattern...";
  selectEl.appendChild(otherOpt);

  selectEl.addEventListener("change", () => {
    if (selectEl.value === "__other__") {
      if (patternSelectWrap) patternSelectWrap.classList.add("leetsync-hidden");
      if (otherWrap) { otherWrap.classList.remove("leetsync-hidden"); }
      if (otherInput) { otherInput.value = ""; otherInput.focus(); }
    }
  });

  if (patternReset) {
    patternReset.addEventListener("click", () => {
      if (otherInput) otherInput.value = "";
      if (otherWrap) otherWrap.classList.add("leetsync-hidden");
      if (patternSelectWrap) patternSelectWrap.classList.remove("leetsync-hidden");
      selectEl.value = "";
    });
  }
}

function populateTopicsAndPatternsForGFG(overlay, details) {
  const topicSelect = overlay.querySelector("#leetsync-topic-select");
  const folderPreview = overlay.querySelector("#leetsync-folder-preview");
  const patternSelect = overlay.querySelector("#leetsync-pattern-select");
  
  if (topicSelect) {
    topicSelect.innerHTML = "";
    const noneOpt = document.createElement("option");
    noneOpt.value = "";
    noneOpt.textContent = "📂 No topic folder (save in base)";
    topicSelect.appendChild(noneOpt);

    const topics = getGFGTopics();
    topics.forEach((t, idx) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = `🏷 ${t}`;
      if (idx === 0) opt.selected = true;
      topicSelect.appendChild(opt);
    });

    const updatePreview = () => {
      const selected = topicSelect.value;
      const num = getGFGNumber() || "?";
      const title = getProblemSlug();
      folderPreview.textContent = selected
        ? `📁 .../${selected}/${num}-${title}/`
        : `📁 .../${num}-${title}/`;
    };
    topicSelect.addEventListener("change", updatePreview);
    updatePreview();

    if (patternSelect) {
      populatePatternDropdown(patternSelect, topicSelect.value, overlay);
      topicSelect.addEventListener("change", () => {
        populatePatternDropdown(patternSelect, topicSelect.value, overlay);
      });
    }
  }
}

async function enqueuePendingGithubSync(submission, saveOptions, settings) {
  try {
    chrome.runtime.sendMessage({
      type: "LEETSYNC_QUEUE_GITHUB_SYNC",
      payload: { submission, saveOptions, settings }
    });
    console.log("Successfully sent LEETSYNC_QUEUE_GITHUB_SYNC message.");
  } catch (e) {
    console.error("Failed to send LEETSYNC_QUEUE_GITHUB_SYNC message:", e);
  }
}
