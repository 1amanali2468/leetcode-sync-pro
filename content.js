// content.js – Runs in ISOLATED world
// Main orchestrator script that listens for page navigation, accepted submissions, and sets observers.
// Relies on content_utils.js and content_ui.js being loaded beforehand.
// ─────────────────────────────────────────────────────────────────────────────

// ── Listen for Accepted signal from injected.js ───────────────────────────────
window.addEventListener("message", async (event) => {
  if (
    event.source !== window ||
    !event.data ||
    event.data.type !== "LEETSYNC_SUBMISSION_ACCEPTED"
  ) {
    return;
  }

  if (!isLeetCodeProblemPage()) return;

  const { runtime, memory, language, code, submissionId } = event.data;

  let finalCode = code;
  if (!finalCode) {
    finalCode = await getCodeFromPage();
  }
  if (!finalCode) {
    finalCode = getCodeFallback();
  }

  const submissionPayload = {
    title: getProblemTitle(),
    slug: getProblemSlug(),
    url: location.href,
    language: language || getLanguage(),
    code: finalCode,
    runtime,
    memory,
    submissionId,
    capturedAt: new Date().toISOString(),
  };

  const fallbackDetails = {
    questionFrontendId: getProblemNumberFromDOM() || "",
    title: submissionPayload.title,
    titleSlug: submissionPayload.slug,
    difficulty: getDifficultyFromDOM() || "Medium",
    content: "",
    topicTags: [],
  };

  pauseTimer();
  const timeSpentStr = formatTimeSpent(timerSeconds);

  showModal(submissionPayload, fallbackDetails, timeSpentStr);

  if (isChromeAlive()) {
    chrome.runtime.sendMessage(
      {
        type: "LEETSYNC_FETCH_PROBLEM_DETAILS",
        payload: { titleSlug: submissionPayload.slug },
      },
      (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.ok && response.details) {
          currentDetails = response.details;

          const overlay = document.getElementById("leetsync-modal-overlay");
          if (overlay) {
            const titleEl = overlay.querySelector(".leetsync-prob-title");
            if (titleEl) {
              titleEl.textContent = `${currentDetails.questionFrontendId ? currentDetails.questionFrontendId + ". " : ""}${currentDetails.title}`;
            }
            const badgeEl = overlay.querySelector(".leetsync-badge");
            if (badgeEl) {
              const diffClass = (currentDetails.difficulty || "medium").toLowerCase();
              badgeEl.className = `leetsync-badge ${diffClass}`;
              badgeEl.textContent = currentDetails.difficulty || "Medium";
            }
            const topicSelect = overlay.querySelector("#leetsync-topic-select");
            const folderPreview = overlay.querySelector("#leetsync-folder-preview");
            if (topicSelect) {
              const tags = currentDetails.topicTags || [];
              topicSelect.innerHTML = "";
              const noneOpt = document.createElement("option");
              noneOpt.value = "";
              noneOpt.textContent = "📂 No topic folder (save in base)";
              topicSelect.appendChild(noneOpt);

              tags.forEach((tag, idx) => {
                const opt = document.createElement("option");
                opt.value = tag.name;
                opt.textContent = `🏷 ${tag.name}`;
                if (idx === 0) opt.selected = true;
                topicSelect.appendChild(opt);
              });

              const updatePreview = () => {
                const selected = topicSelect.value;
                folderPreview.textContent = selected
                  ? `📁 .../${selected}/${currentDetails.questionFrontendId || "?"}-${currentDetails.title || ""}/`
                  : `📁 .../${currentDetails.questionFrontendId || "?"}-${currentDetails.title || ""}/`;
              };
              topicSelect.addEventListener("change", updatePreview);
              updatePreview();

              const patternSelect = overlay.querySelector("#leetsync-pattern-select");
              if (patternSelect) {
                populatePatternDropdown(patternSelect, topicSelect.value, overlay);
                topicSelect.addEventListener("change", () => {
                  populatePatternDropdown(patternSelect, topicSelect.value, overlay);
                });
              }
            }
          }
        }
      }
    );
  }
});

// ── GFG Mutation Observer & Scraping Logic ───────────────────────────────────
let gfgObserver = null;
let gfgSubmissionProcessed = false;
let gfgSubmitClicked = false;

document.addEventListener("click", (e) => {
  const target = e.target;
  if (target) {
    const isSubmit = target.id === "submit-btn" || 
                     (target.textContent && target.textContent.trim().toLowerCase() === "submit") ||
                     target.classList.contains("problems_submit_button") ||
                     (typeof target.className === "string" && target.className.includes("submit"));
    if (isSubmit) {
      gfgSubmitClicked = true;
      gfgSubmissionProcessed = false;
    }
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    gfgSubmitClicked = true;
    gfgSubmissionProcessed = false;
  }
});

function initGFGObserver() {
  if (!isGFGProblemPage()) {
    if (gfgObserver) {
      gfgObserver.disconnect();
      gfgObserver = null;
    }
    return;
  }

  if (gfgObserver) return;

  gfgObserver = new MutationObserver(() => {
    const text = document.body.innerText;
    const hasSuccess = text.includes("Problem Solved Successfully") || text.includes("Correct Answer");
    
    if (hasSuccess && gfgSubmitClicked) {
      if (!gfgSubmissionProcessed) {
        gfgSubmissionProcessed = true;
        gfgSubmitClicked = false;
        handleGFGSuccess();
      }
    } else if (!hasSuccess) {
      gfgSubmissionProcessed = false;
    }
  });

  gfgObserver.observe(document.body, { childList: true, subtree: true });
}

async function handleGFGSuccess() {
  const text = document.body.innerText;
  
  const timeMatch = text.match(/(?:Time\s*Taken|Time)\s*[:\-]?\s*([0-9.]+\s*(?:s|sec|ms)?)/i);
  const runtime = timeMatch ? timeMatch[1].trim() : "";

  const memMatch = text.match(/(?:Memory|Space\s*Used)\s*[:\-]?\s*([0-9.]+\s*(?:mb|kb|bytes)?)/i);
  const memory = memMatch ? memMatch[1].trim() : "";

  const code = await getCodeFromPage();

  const submissionPayload = {
    title: getProblemTitle(),
    slug: getProblemSlug(),
    url: location.href,
    language: getLanguage(),
    code: code || getCodeFallback(),
    runtime: runtime,
    memory: memory,
    submissionId: "gfg-" + Date.now(),
    capturedAt: new Date().toISOString(),
  };

  const fallbackDetails = {
    questionFrontendId: "",
    title: submissionPayload.title,
    titleSlug: submissionPayload.slug,
    difficulty: getDifficultyFromDOM() || "Medium",
    content: getGFGDescription(),
    topicTags: [],
  };

  pauseTimer();
  const timeSpentStr = formatTimeSpent(timerSeconds);

  showModal(submissionPayload, fallbackDetails, timeSpentStr);
}

// ── SPA URL Observer & Timer Boot ────────────────────────────────────────────
if (isLeetCodeProblemPage() || isGFGProblemPage()) {
  initTimer();
}
initGFGObserver();

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (isLeetCodeProblemPage() || isGFGProblemPage()) {
      initTimer();
    } else {
      removeTimerWidget();
    }
    initGFGObserver();
  }
}, 1000);
