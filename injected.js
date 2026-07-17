// injected.js – Runs in MAIN world (same JS context as LeetCode/GFG React app)
// Declared via manifest "world": "MAIN" — no inline script injection needed.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  if (window.__leetSyncProInstalled) return;
  window.__leetSyncProInstalled = true;

  // Stores the submission_id from the real /submit/ POST.
  // Only when /check/ returns Accepted for THIS id do we show the modal.
  // This prevents Run (interpret_solution) from triggering the modal.
  let pendingSubmissionId = null;

  // ── Helper: Extract code from Monaco or Ace editors ────────────────────────
  function extractCode() {
    try {
      if (typeof monaco !== "undefined") {
        if (typeof monaco.editor.getEditors === "function") {
          const editors = monaco.editor.getEditors();
          for (const ed of editors) {
            if (typeof ed.hasWidgetFocus === "function" && ed.hasWidgetFocus()) {
              const m = ed.getModel();
              if (m) return m.getValue();
            }
          }
          if (editors.length > 0) {
            const m = editors[0].getModel();
            if (m) return m.getValue();
          }
        }
        const models = monaco.editor.getModels();
        if (models && models.length > 0) {
          return models[0].getValue();
        }
      }
      if (typeof ace !== "undefined" && ace.edit) {
        const aceEl = document.querySelector(".ace_editor");
        if (aceEl) {
          return ace.edit(aceEl).getValue();
        }
      }
    } catch (_) {}
    return "";
  }

  // ── Fetch Interceptor ────────────────────────────────────────────────────────
  // 1. Track POST to /problems/{slug}/submit/  → capture submission_id
  // 2. Watch GET  to /submissions/detail/{id}/check/ → fire only if ids match

  const _originalFetch = window.fetch.bind(window);

  window.fetch = async function (...args) {
    const response = await _originalFetch(...args);

    try {
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0]?.url || "";
      const method = (args[1]?.method || "GET").toUpperCase();

      // ── Step 1: Capture the real submission_id from the Submit POST ──────────
      // /problems/{slug}/submit/ → response contains { submission_id: 12345 }
      // /problems/{slug}/interpret_solution/ is for Run — we ignore it.
      if (method === "POST" && url.includes("/submit/") && !url.includes("/interpret_solution/")) {
        response
          .clone()
          .json()
          .then((data) => {
            if (data && data.submission_id) {
              pendingSubmissionId = String(data.submission_id);
            }
          })
          .catch(() => {});
      }

      // ── Step 2: Check verdict — only act if it's our real submission ─────────
      // Both Run and Submit poll this endpoint, so we guard with pendingSubmissionId.
      if (url.includes("/submissions/detail/") && url.includes("/check/")) {
        response
          .clone()
          .json()
          .then((data) => {
            if (!data || data.status_msg !== "Accepted") return;

            const checkId = String(data.submission_id || "");

            // Ignore if this check doesn't belong to the pending real submission
            if (!pendingSubmissionId || checkId !== pendingSubmissionId) return;

            // Consume — reset so subsequent Runs don't re-trigger
            pendingSubmissionId = null;

            const code = extractCode();

            window.postMessage(
              {
                type: "LEETSYNC_SUBMISSION_ACCEPTED",
                runtime: data.status_runtime || "",
                memory: data.status_memory || "",
                language: data.lang || "",
                code: code,
                submissionId: checkId,
              },
              "*"
            );
          })
          .catch(() => {});
      }
    } catch (_) {}

    return response;
  };

  // ── Monaco Code Bridge ───────────────────────────────────────────────────────
  // content.js can request the full editor code at any time by sending
  // LEETSYNC_GET_CODE. We reply with LEETSYNC_CODE_EXTRACTED.

  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      !event.data ||
      event.data.type !== "LEETSYNC_GET_CODE"
    ) {
      return;
    }

    const code = extractCode();
    window.postMessage({ type: "LEETSYNC_CODE_EXTRACTED", code }, "*");
  });
})();
