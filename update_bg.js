const fs = require('fs');
let bg = fs.readFileSync('background.js', 'utf8');

// Add new imports from history_manager.js
bg = bg.replace(
  /import \{ mergeSolveWithStars, mergeNewSolveIntoHistory \} from ".\/history_manager.js";/,
  import { mergeSolveWithStars, mergeNewSolveIntoHistory, applyToggleList, applyToggleBookmark, applyToggleCompletion, applyDeleteEntry } from "./history_manager.js";
);

// Inject history write queue logic
const queueLogic = 
const historyWriteQueue = [];
let isWritingHistory = false;

async function processHistoryQueue() {
  if (isWritingHistory) return;
  isWritingHistory = true;
  while (historyWriteQueue.length > 0) {
    const task = historyWriteQueue.shift();
    try {
      await task();
    } catch (e) {
      console.error("Error in history queue:", e);
    }
  }
  isWritingHistory = false;
}

function queueHistoryUpdate(updaterFn) {
  return new Promise((resolve, reject) => {
    historyWriteQueue.push(async () => {
      try {
        const stored = await chrome.storage.local.get("leetsyncHistory");
        let history = stored.leetsyncHistory || [];
        const result = updaterFn(history);
        
        let newHistory = history;
        if (result && result.history) {
          newHistory = result.history;
          if (result.deletes && result.deletes.length > 0) {
            const storedDeletes = await chrome.storage.local.get("deletedSolves");
            const currentDeletes = storedDeletes.deletedSolves || [];
            await chrome.storage.local.set({ deletedSolves: [...new Set([...currentDeletes, ...result.deletes])] });
          }
        } else if (Array.isArray(result)) {
          newHistory = result;
        }
        
        await chrome.storage.local.set({ leetsyncHistory: newHistory });
        resolve(newHistory);
      } catch (err) {
        reject(err);
      }
    });
    processHistoryQueue();
  });
}
;

// Insert the queue logic after the imports
bg = bg.replace(/(import .* from ".*";\r?\n)+/g, match => match + '\n' + queueLogic + '\n');

// Replace LEETSYNC_SAVE_TO_HISTORY with queued version
bg = bg.replace(
  /if \(message\?.type === "LEETSYNC_SAVE_TO_HISTORY"\) \{[\s\S]*?return true;\r?\n\s*\}/,
  if (message?.type === "LEETSYNC_SAVE_TO_HISTORY") {
    queueHistoryUpdate(history => mergeNewSolveIntoHistory(history, message.payload.entry))
      .then(updatedHistory => sendResponse({ ok: true, history: updatedHistory }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
);

// Add listener for LEETSYNC_UPDATE_HISTORY
const updateListener = 
  if (message?.type === "LEETSYNC_UPDATE_HISTORY") {
    const { action, payload } = message;
    let updaterFn;
    
    if (action === "TOGGLE_LIST") {
      updaterFn = history => applyToggleList(history, payload.problem, payload.listName, payload.add);
    } else if (action === "TOGGLE_BOOKMARK") {
      updaterFn = history => applyToggleBookmark(history, payload.problem, payload.add);
    } else if (action === "TOGGLE_COMPLETION") {
      updaterFn = history => applyToggleCompletion(history, payload.problem, payload.completed);
    } else if (action === "DELETE_ENTRY") {
      updaterFn = history => applyDeleteEntry(history, payload.docId);
    }
    
    if (updaterFn) {
      queueHistoryUpdate(updaterFn)
        .then(updatedHistory => sendResponse({ ok: true, history: updatedHistory }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
    } else {
      sendResponse({ ok: false, error: "Unknown action" });
    }
    return true;
  }
;

bg = bg.replace(/chrome\.runtime\.onMessage\.addListener\(\(message, _sender, sendResponse\) => \{/, match => match + updateListener);

fs.writeFileSync('background.js', bg);
console.log('background.js updated successfully');
