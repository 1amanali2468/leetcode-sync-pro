// dashboard_modules/potd.js - Daily Challenge POTD Component
import { getDailyPOTD } from "../potd-fetcher.js";
import { STORAGE_KEYS } from "./state.js";
import { escapeHtml } from "./ui_helpers.js";

export async function renderPOTDWidget() {
  const container = document.getElementById("potdGridContainer");
  const streakBadge = document.getElementById("potdStreakProgress");
  if (!container) return;

  try {
    const potdData = await getDailyPOTD();
    const stored = await chrome.storage.local.get(STORAGE_KEYS.history);
    const history = stored[STORAGE_KEYS.history] || [];

    // Filter today's solves
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySolves = history.filter(h => {
      if (!h.savedAt) return false;
      const solveDateStr = new Date(h.savedAt).toISOString().slice(0, 10);
      return solveDateStr === todayStr;
    });

    // Segment today's solves by platform
    const lcSolves = todaySolves.filter(h => !h.url || h.url.includes("leetcode.com"));
    const gfgSolves = todaySolves.filter(h => h.url && h.url.includes("geeksforgeeks.org"));
    const cnSolves = todaySolves.filter(h => h.url && (h.url.includes("codingninjas.com") || h.url.includes("naukri.com/code360")));

    let solvedCount = 0;
    container.innerHTML = "";

    const platforms = [
      { 
        key: "leetcode", 
        name: "LeetCode", 
        class: "leetcode", 
        logo: "🟨", 
        checkSolved: (info) => {
          const slug = info.slug?.trim().toLowerCase();
          return lcSolves.some(h => h.slug?.trim().toLowerCase() === slug || (info.title && h.title?.toLowerCase() === info.title.toLowerCase()));
        },
        getTitle: (info) => info.title
      },
      { 
        key: "gfg", 
        name: "GeeksforGeeks", 
        class: "gfg", 
        logo: "🟩", 
        checkSolved: (info) => {
          const slug = info.slug?.trim().toLowerCase();
          if (!slug || slug === "problem-of-the-day" || slug === "") {
            return gfgSolves.length > 0;
          }
          return gfgSolves.some(h => {
            const hSlug = (h.slug || "").trim().toLowerCase();
            return hSlug === slug || hSlug.replace(/-*(\d+)$/, "").replace(/-+$/, "") === slug.replace(/-*(\d+)$/, "").replace(/-+$/, "");
          });
        },
        getTitle: (info) => {
          const slug = info.slug?.trim().toLowerCase();
          if (!slug || slug === "problem-of-the-day" || slug === "") {
            return gfgSolves[0] ? gfgSolves[0].title : info.title;
          }
          return info.title;
        }
      },
      { 
        key: "code360", 
        name: "Code 360", 
        class: "codingninjas", 
        logo: "🟧", 
        checkSolved: () => cnSolves.length > 0,
        getTitle: (info) => {
          return cnSolves.length > 0 ? cnSolves[0].title : info.title;
        }
      }
    ];

    // Self-healing: if cache is old and doesn't contain new code360 key, clear and re-fetch
    if (potdData && !potdData.code360) {
      console.log("LeetSync: Obsolete cache detected. Re-fetching fresh POTD data...");
      await chrome.storage.local.remove("leetsyncPotdCache");
      return renderPOTDWidget();
    }

    const fallbackUrls = {
      leetcode: "https://leetcode.com/problemset/all/",
      gfg: "https://practice.geeksforgeeks.org/problem-of-the-day",
      code360: "https://www.naukri.com/code360/problem-of-the-day"
    };

    platforms.forEach(p => {
      const info = potdData[p.key] || {};
      const isSolved = p.checkSolved(info);
      const displayTitle = p.getTitle(info);
      const targetUrl = info.url || fallbackUrls[p.key] || "#";

      if (isSolved) solvedCount++;

      const card = document.createElement("div");
      card.className = `potd-card ${p.class} ${isSolved ? "solved" : ""}`;
      
      const diffLower = (info.difficulty || "Medium").toLowerCase();
      
      card.innerHTML = `
        <div>
          <div class="potd-card-platform">
            <span>${p.logo}</span>
            <span>${p.name}</span>
          </div>
          <div class="potd-card-title" title="${escapeHtml(displayTitle || "")}">
            ${escapeHtml(displayTitle || "Daily Coding Challenge")}
          </div>
        </div>
        <div class="potd-card-footer">
          <span class="potd-card-diff ${diffLower}">${escapeHtml(info.difficulty || "Medium")}</span>
          <a href="${escapeHtml(targetUrl)}" target="_blank" class="potd-card-btn">
            ${isSolved ? "✅ Solved" : "Solve Now ↗"}
          </a>
        </div>
      `;
      container.appendChild(card);
    });

    if (streakBadge) {
      streakBadge.textContent = `Today's Solves: ${solvedCount}/${platforms.length}`;
    }
  } catch (e) {
    console.error("LeetSync: Failed to render POTD widget:", e);
    container.innerHTML = `<div style="color:var(--clr-muted); font-size:12px; padding:12px; text-align:center; grid-column:1/-1;">Failed to load daily challenges. Please refresh or check connection.</div>`;
  }
}
