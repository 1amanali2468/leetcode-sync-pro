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
    // Attempting to fetch practice GFG POTD html to scrape title & difficulty
    const res = await fetch("https://practice.geeksforgeeks.org/problem-of-the-day");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    
    // Parse using DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    
    // Search meta tags or script contents
    let title = "";
    let slug = "";
    let difficulty = "Medium";
    
    // 1. Try to extract from og:title
    const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
    if (ogTitle && ogTitle.includes("|")) {
      title = ogTitle.split("|")[0].trim();
    } else if (ogTitle) {
      title = ogTitle.trim();
    }
    
    // 2. Try scraping the main problem title elements
    if (!title) {
      const mainHeading = doc.querySelector(".problem-title, h1, h2");
      if (mainHeading) {
        title = mainHeading.textContent.trim();
      }
    }
    
    // Find difficulty tag from HTML markup
    const diffElement = doc.querySelector(".problem-difficulty, .difficulty");
    if (diffElement) {
      difficulty = diffElement.textContent.trim();
    }

    if (title) {
      // Derive slug from title
      slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return {
        title,
        url: "https://practice.geeksforgeeks.org/problem-of-the-day",
        difficulty: difficulty || "Medium",
        slug,
        tags: []
      };
    }
  } catch (e) {
    console.warn("LeetSync GFG fetch/scrape failed:", e);
  }
  return defaultObj;
}
