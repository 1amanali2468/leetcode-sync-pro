// potd-fetcher.js – Service to fetch and cache daily POTD across coding platforms

const CACHE_KEY = "leetsyncPotdCache";

export async function getDailyPOTD() {
  const todayStr = new Date().toISOString().slice(0, 10);
  
  // Try loading from local cache first
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    if (stored[CACHE_KEY] && stored[CACHE_KEY].date === todayStr) {
      console.log("LeetSync: Loaded POTD data from cache for date:", todayStr);
      return stored[CACHE_KEY].data;
    }
  } catch (e) {
    console.error("LeetSync: Cache load failed:", e);
  }

  console.log("LeetSync: Cache miss/expired. Fetching fresh POTD data...");
  const data = {
    leetcode: await fetchLeetCodePOTD(),
    gfg: await fetchGfgPOTD(),
    code360: {
      title: "Code 360 Daily Challenge",
      url: "https://www.naukri.com/code360/problem-of-the-day",
      difficulty: "Varies",
      slug: ""
    }
  };

  // Cache successfully fetched elements
  try {
    await chrome.storage.local.set({
      [CACHE_KEY]: {
        date: todayStr,
        data: data
      }
    });
  } catch (e) {
    console.error("LeetSync: Failed to cache POTD data:", e);
  }

  return data;
}

// 1. LEETCODE POTD FETCH
async function fetchLeetCodePOTD() {
  const defaultObj = {
    title: "LeetCode Daily Challenge",
    url: "https://leetcode.com/problemset/all/",
    difficulty: "Medium",
    slug: "",
    tags: []
  };

  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          query questionOfToday {
            activeDailyCodingChallengeQuestion {
              date
              link
              question {
                questionFrontendId
                title
                titleSlug
                difficulty
                topicTags {
                  name
                }
              }
            }
          }
        `
      })
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const challenge = json.data?.activeDailyCodingChallengeQuestion;
    if (challenge && challenge.question) {
      return {
        title: challenge.question.title,
        url: `https://leetcode.com${challenge.link}`,
        difficulty: challenge.question.difficulty || "Medium",
        slug: challenge.question.titleSlug || "",
        tags: (challenge.question.topicTags || []).map(t => t.name)
      };
    }
  } catch (e) {
    console.warn("LeetSync LeetCode fetch failed:", e);
  }
  return defaultObj;
}

// 2. GFG POTD FETCH
async function fetchGfgPOTD() {
  const defaultObj = {
    title: "GeeksforGeeks Problem of the Day",
    url: "https://practice.geeksforgeeks.org/problem-of-the-day",
    difficulty: "Medium",
    slug: "",
    tags: []
  };

  try {
    const res = await fetch("https://practiceapi.geeksforgeeks.org/api/v1/problems-of-day/problem/today/");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json && json.problem_name) {
      let slug = "";
      const pUrl = json.problem_url || "";
      if (pUrl) {
        try {
          const cleanUrl = pUrl.split("#")[0].split("?")[0];
          const parts = cleanUrl.split("/").filter(Boolean);
          const idx = parts.indexOf("problems");
          if (idx !== -1 && parts[idx + 1]) {
            let rawSlug = parts[idx + 1];
            // Remove trailing ID suffix like -1587115620 if present
            rawSlug = rawSlug.replace(/-?(\d+)$/, "");
            slug = rawSlug.toLowerCase();
          }
        } catch (e) {}
      }
      if (!slug) {
        slug = json.problem_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      }
      return {
        title: json.problem_name,
        url: json.problem_url || "https://practice.geeksforgeeks.org/problem-of-the-day",
        difficulty: json.difficulty || "Medium",
        slug: slug,
        tags: json.tags?.topic_tags || []
      };
    }
  } catch (e) {
    console.warn("LeetSync GFG fetch failed:", e);
  }
  return defaultObj;
}
