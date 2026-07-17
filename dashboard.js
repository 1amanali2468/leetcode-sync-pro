// dashboard.js – Companion Dashboard Orchestrator
// All feature logic lives in ./dashboard_modules/*.js
// This file: boot, navigation, and wiring only.

import { loadSheet, clearSheetCache } from "./sheet-loader.js";
import { STORAGE_KEYS, el, state } from "./dashboard_modules/state.js";

import { renderOverview, setupHeatmapControls } from "./dashboard_modules/overview.js";
import { renderPOTDWidget } from "./dashboard_modules/potd.js";
import { setupNotesModalListeners, registerNotesSaveCallback } from "./dashboard_modules/notes_modal.js";
import { renderRevisionSchedule } from "./dashboard_modules/revision.js";
import { registerSortCallback } from "./dashboard_modules/ui_helpers.js";
import {
  setupSettingsListeners, registerSettingsChangeCallback, registerSheetCallbacksForSettings,
  forceSync, populateSheetDropdown, migrateCustomSheets, setupBackupRestoreListeners
} from "./dashboard_modules/settings.js";
import {
  setupSheetTabListeners, registerSheetsChangeCallback,
  renderSheets, createProblemRow, filterSheetProblems, getActiveSheetProblems
} from "./dashboard_modules/sheets_view.js";
import {
  setupSmartListListeners, registerSheetsCallbacks,
  renderMyListsSidebar, setupSidebarResize
} from "./dashboard_modules/smart_lists.js";

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);

async function init() {
  // Wire module callbacks first (before any renders)
  registerSheetsChangeCallback(renderSheets);
  registerSettingsChangeCallback(renderAll);
  registerNotesSaveCallback(renderSheets);
  registerSortCallback(renderSheets);
  registerSheetsCallbacks({ renderSheets, createProblemRow, filterSheetProblems, loadSheet });
  registerSheetCallbacksForSettings({ renderSheets, getActiveSheetProblems });

  // Load auth user profile
  const data = await chrome.storage.local.get(["auth_user", STORAGE_KEYS.settings, STORAGE_KEYS.history]);
  const authUser = data.auth_user;
  if (authUser) {
    el.userName.textContent = authUser.username || authUser.displayName || "LeetSync User";
    el.userEmail.textContent = authUser.email || "Sync enabled";
    if (authUser.photoURL) el.avatarImage.src = authUser.photoURL;
  }

  // Load settings into form
  const settings = data[STORAGE_KEYS.settings] || {};
  el.txtRepo.value = settings.repo || "";
  el.txtBranch.value = settings.branch || "main";
  el.txtBasePath.value = settings.basePath || "";

  // Show/hide My Lists sidebar based on initial active screen
  const activeNav = document.querySelector(".nav-item.active");
  const initialScreen = activeNav ? activeNav.dataset.screen : "overview";
  const myListsContainer = document.getElementById("sidebarMyListsContainer");
  if (myListsContainer) {
    myListsContainer.classList.toggle("hidden", initialScreen !== "sheets");
  }

  // Initial render
  await renderAll();

  // Bind all event listeners
  setupNavigation();
  setupSettingsListeners();
  setupSheetTabListeners();
  setupHeatmapControls();
  setupNotesModalListeners();
  setupSmartListListeners();
  setupBackupRestoreListeners();

  if (el.btnManualSync) el.btnManualSync.addEventListener("click", forceSync);
  const btnResetWidget = document.getElementById("btnResetProgressWidget");
  if (btnResetWidget) btnResetWidget.addEventListener("click", forceSync);

  if (el.btnCollapseSidebar) {
    el.btnCollapseSidebar.addEventListener("click", () =>
      document.querySelector(".app-container").classList.add("sidebar-collapsed")
    );
  }
  if (el.btnExpandSidebar) {
    el.btnExpandSidebar.addEventListener("click", () =>
      document.querySelector(".app-container").classList.remove("sidebar-collapsed")
    );
  }

  setupSidebarResize();
}

// ── Global Render Trigger ──────────────────────────────────────────────────
async function renderAll() {
  await migrateCustomSheets();
  await populateSheetDropdown();
  renderOverview();
  renderSheets();
  renderRevisionSchedule();
  renderPOTDWidget();
}

// ── Screen Navigation ──────────────────────────────────────────────────────
function setupNavigation() {
  el.navItems.forEach(btn => {
    btn.addEventListener("click", () => {
      const screen = btn.dataset.screen;

      el.navItems.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      el.screens.forEach(s => s.classList.remove("active"));
      document.getElementById(`screen-${screen}`).classList.add("active");

      state.currentScreen = screen;

      const myListsContainer = document.getElementById("sidebarMyListsContainer");
      if (myListsContainer) {
        if (screen === "sheets") {
          myListsContainer.classList.remove("hidden");
          state.selectedSidebarList = null;
          // Restore controls visibility on sheet tab click
          const topControls = document.querySelector(".sheets-top-controls");
          if (topControls) topControls.style.display = "flex";
          const controlsRow = document.querySelector(".sheet-controls-row");
          if (controlsRow) controlsRow.style.display = "flex";
          const topicPills = document.getElementById("sheetTopicPills");
          if (topicPills) topicPills.style.display = "flex";
        } else {
          myListsContainer.classList.add("hidden");
        }
      }

      // Screen-specific renders
      const screenTitles = {
        overview: ["Overview", "Track your daily progress and statistics."],
        sheets:   ["DSA Sheets Hub", "Progress tracker for Striver A-Z, Blind75, and NeetCode150."],
        revision: ["Revision Board", "Keep retention strong with scheduled Spaced Repetition checks."],
        settings: ["Settings & Repositories", "Configure repository paths and GitHub metadata storage."]
      };
      if (screenTitles[screen]) {
        el.screenTitle.textContent = screenTitles[screen][0];
        el.screenSubtitle.textContent = screenTitles[screen][1];
      }

      if (screen === "overview") renderOverview();
      else if (screen === "sheets") renderSheets();
      else if (screen === "revision") renderRevisionSchedule();
    });
  });
}

// Add onChanged listener to sync data in real-time when solves or sheets are added
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === "local") {
    if (changes.customSheets || changes.customSheetsRegistry) {
      clearSheetCache();
      await populateSheetDropdown();
      renderSheets();
    }
    if (changes.leetsyncHistory) {
      // Re-render everything to update streak count, donuts, recent solves, checkbox checkmarks, etc.
      renderAll();
    }
  }
});

