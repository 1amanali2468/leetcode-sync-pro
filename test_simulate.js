const fs = require('fs');

function sanitizeSheetData(sheet) {
  if (!sheet) return {};
  const cleaned = {};
  for (const topic in sheet) {
    cleaned[topic] = {};
    for (const subtopic in sheet[topic]) {
      cleaned[topic][subtopic] = [];
      sheet[topic][subtopic].forEach(p => {
        let slug = (p.slug || "").trim().toLowerCase();
        let url = p.leetcodeUrl || p.url || "";
        if (url.includes("geeksforgeeks.org")) {
          slug = slug.replace(/-*(\d+)$/, "").replace(/-+$/, "");
        }
        cleaned[topic][subtopic].push({ title: p.title || slug, slug, leetcodeUrl: url });
      });
    }
  }
  return cleaned;
}

function getCombined(manifest, baseMap) {
  const allProblems = [];
  manifest.forEach(m => {
    const raw = JSON.parse(fs.readFileSync('data/builtin-sheets/' + m.id + '.json', 'utf8'));
    const sheet = sanitizeSheetData(raw);
    for (const topic in sheet) {
      for (const subtopic in sheet[topic]) {
        sheet[topic][subtopic].forEach(p => {
          let existing = allProblems.find(ep => ep.slug === p.slug);
          if (existing) {
            if (!existing.sheetsIn.includes(m.name)) existing.sheetsIn.push(m.name);
          } else {
            allProblems.push({ ...p, sheetsIn: [m.name] });
          }
        });
      }
    }
  });
  return allProblems;
}

const manifest = JSON.parse(fs.readFileSync('data/builtin-sheets/manifest.json', 'utf8'));
const allProblems = getCombined(manifest, {});

const cleanSlug = "missing-number-in-array";
const match = allProblems.find(p => p.slug === cleanSlug);
console.log("Match found?", match ? match.sheetsIn : "NO");

const check2 = allProblems.find(p => p.slug === "smallest-positive-missing-number");
console.log("Match 2 found?", check2 ? check2.sheetsIn : "NO");

