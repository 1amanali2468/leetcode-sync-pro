const GITHUB_API = "https://api.github.com";

export async function saveSolutionToGitHub(payload) {
  const { settings, submission, saveOptions } = payload;
  validatePayload(settings, submission, saveOptions);

  const folderPath = buildFolderPath(submission, settings, saveOptions);
  const extension = languageToExtension(submission.language);
  
  const slug = submission.titleSlug || submission.slug || sanitizeFileName(submission.title || "problem");
  const rawApproach = saveOptions.approach === "custom" ? saveOptions.customName : saveOptions.approach;
  const approachCode = sanitizeFileName(rawApproach).toUpperCase();
  const version = saveOptions.version || 1;
  
  const fileName = submission.questionFrontendId
    ? `${slug}-${submission.questionFrontendId}-${approachCode}-v${version}`
    : `${slug}-${approachCode}-v${version}`;
  const solutionPath = `${folderPath}/${fileName}.${extension}`;
  const readmePath = `${folderPath}/README.md`;

  const solutionBody = buildSolutionBody(submission, saveOptions);

  // Fetch existing README if any
  let existingReadmeContent = "";
  const existingFile = await getExistingFile(settings, readmePath);
  if (existingFile?.content) {
    existingReadmeContent = fromBase64(existingFile.content);
  }

  const readmeBody = buildReadmeBody(submission, saveOptions, existingReadmeContent, version);

  const timestamp = new Date().toLocaleString("en-US", { 
    year: "numeric", month: "short", day: "numeric", 
    hour: "2-digit", minute: "2-digit", second: "2-digit" 
  });

  const solutionResult = await upsertFile({
    settings,
    path: solutionPath,
    content: solutionBody,
    message: saveOptions.commitMessage || `Sync: ${submission.title} (${approachCode} v${version}) at ${timestamp}`
  });

  const readmeResult = await upsertFile({
    settings,
    path: readmePath,
    content: readmeBody,
    message: `Sync README: ${submission.title} at ${timestamp}`,
    existingFile
  });

  return {
    solutionPath,
    readmePath,
    solutionUrl: solutionResult.content?.html_url,
    readmeUrl: readmeResult.content?.html_url
  };
}

async function upsertFile({ settings, path, content, message, existingFile }) {
  const fileInfo = existingFile !== undefined ? existingFile : await getExistingFile(settings, path);
  const body = {
    message,
    content: toBase64(content),
    branch: settings.branch || undefined
  };

  if (fileInfo?.sha) {
    body.sha = fileInfo.sha;
  }

  const response = await fetch(
    `${GITHUB_API}/repos/${settings.owner}/${settings.repo}/contents/${encodePath(path)}`,
    {
      method: "PUT",
      headers: githubHeaders(settings.token),
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    throw new Error(await formatGitHubError(response, `Could not save ${path}`));
  }

  return response.json();
}

async function getExistingFile(settings, path) {
  const branchQuery = settings.branch ? `?ref=${encodeURIComponent(settings.branch)}` : "";
  const response = await fetch(
    `${GITHUB_API}/repos/${settings.owner}/${settings.repo}/contents/${encodePath(path)}${branchQuery}`,
    { headers: githubHeaders(settings.token) }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await formatGitHubError(response, `Could not check ${path}`));
  }

  return response.json();
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

// Tag name → clean folder name mapping (used for both dropdown display and path building)
const TAG_FOLDER_MAP = {
  "array": "Arrays",
  "string": "Strings",
  "hash table": "Hash-Table",
  "dynamic programming": "DP",
  "math": "Math",
  "sorting": "Sorting",
  "greedy": "Greedy",
  "depth-first search": "DFS",
  "breadth-first search": "BFS",
  "binary search": "Binary-Search",
  "matrix": "Matrix",
  "two pointers": "Two-Pointers",
  "bit manipulation": "Bit-Manipulation",
  "stack": "Stack",
  "heap (priority queue)": "Heap",
  "backtracking": "Backtracking",
  "graph": "Graphs",
  "tree": "Trees",
  "linked list": "Linked-Lists",
  "sliding window": "Sliding-Window",
  "trie": "Trie",
  "union find": "Union-Find"
};

function buildFolderPath(submission, settings, saveOptions) {
  // Replace spaces in title with hyphens
  const formattedTitle = (submission.title || "Unknown Problem")
    .trim()
    .replace(/\s+/g, "-");
  
  // Format folder as {number}-{title} e.g. 1-Two-Sum (LeetCode)
  // For GFG (no number), just use title e.g. Next-Larger-Element
  const folderName = submission.questionFrontendId
    ? `${submission.questionFrontendId}-${formattedTitle}`
    : formattedTitle;
  const titleFolder = sanitizePathSegment(folderName);
  
  // Use user-selected topic from modal (saveOptions.selectedTopic)
  // If user chose "No folder", selectedTopic will be ""
  let topicFolder = "";
  const selectedTag = saveOptions?.selectedTopic || "";
  if (selectedTag) {
    const norm = selectedTag.toLowerCase().trim();
    topicFolder = TAG_FOLDER_MAP[norm] || sanitizePathSegment(selectedTag);
  }
  
  const base = sanitizePath(settings.basePath || "");
  
  if (base) {
    return topicFolder ? `${base}/${topicFolder}/${titleFolder}` : `${base}/${titleFolder}`;
  }
  return topicFolder ? `${topicFolder}/${titleFolder}` : titleFolder;
}

// Generates the code file body. It appends single-line comments at the top 
// containing the user-inputted Topic and Pattern alongside problem metadata.
function buildSolutionBody(submission, saveOptions) {
  const approachCode = (saveOptions.approach === "custom" ? saveOptions.customName : saveOptions.approach).toUpperCase();
  const lang = (submission.language || "").toLowerCase();

  // Pick the right single-line comment prefix for this language
  const cPrefix = getCommentPrefix(lang);

  const headerLines = [
    `${cPrefix} Problem  : ${submission.title}`,
    `${cPrefix} URL      : ${submission.url}`,
    `${cPrefix} Approach : ${approachCode}`,
    `${cPrefix} Topic    : ${saveOptions.selectedTopic || "Not set"}`,
    `${cPrefix} Pattern  : ${saveOptions.pattern || "Not set"}`,
    `${cPrefix} Collection : ${saveOptions.collection || "Not set"}`,
    `${cPrefix} Time     : ${saveOptions.timeComplexity || "Not set"}`,
    `${cPrefix} Space    : ${saveOptions.spaceComplexity || "Not set"}`,
    `${cPrefix} Time Spent: ${saveOptions.timeSpent || "Not set"}`
  ];

  // Append notes block only if the user wrote something
  const notes = saveOptions.notes?.trim();
  if (notes) {
    headerLines.push(`${cPrefix}`);
    headerLines.push(`${cPrefix} Notes:`);
    notes.split("\n").forEach(line => headerLines.push(`${cPrefix}   ${line}`));
  }

  headerLines.push(""); // blank line before code

  return `${headerLines.join("\n")}\n${submission.code || `${cPrefix} Paste your solution here.`}\n`;
}

// Returns the single-line comment prefix for common LeetCode languages
function getCommentPrefix(lang) {
  const hashLangs = ["python", "python3", "ruby", "r"];
  const dashLangs = ["mysql", "sql", "mssql"];
  if (hashLangs.includes(lang)) return "#";
  if (dashLangs.includes(lang)) return "--";
  return "//"; // JS, TS, Java, C, C++, C#, Go, Kotlin, Swift, Scala, Rust, PHP
}

// Generates the README.md content. It adds the user-inputted Topic and Pattern 
// to both the static header metadata and the per-approach metrics table.
function buildReadmeBody(submission, saveOptions, existingContent = "", version = 1) {
  const title = submission.title || "Problem";
  const number = submission.questionFrontendId || "";
  const difficulty = submission.difficulty || "Unknown";
  const url = submission.url || "";
  const topics = (submission.topicTags || []).map(t => t.name).join(", ") || "None";
  const description = submission.content || "Description not available.";

  // Dynamic Platform Name & Link
  let platformName = "LeetCode";
  if (url) {
    if (url.includes("codeforces.com")) platformName = "CodeForces";
    else if (url.includes("geeksforgeeks.org")) platformName = "GeeksforGeeks";
    else if (!url.includes("leetcode.com")) platformName = "Coding Platform";
  } else {
    platformName = "Offline / Custom";
  }
  const platformLink = url ? `[${platformName}](${url})` : "Offline Solve";

  // Gorgeous Shields.io badges for GitHub READMEs
  const difficultyBadge = difficulty.toLowerCase() === "easy"
    ? "![Easy](https://img.shields.io/badge/Difficulty-Easy-16a34a?style=flat-square)"
    : difficulty.toLowerCase() === "medium"
      ? "![Medium](https://img.shields.io/badge/Difficulty-Medium-d97706?style=flat-square)"
      : difficulty.toLowerCase() === "hard"
        ? "![Hard](https://img.shields.io/badge/Difficulty-Hard-dc2626?style=flat-square)"
        : `![${difficulty}](https://img.shields.io/badge/Difficulty-${difficulty}-64748b?style=flat-square)`;

  // ── Parse existing README ────────────────────────────────────────────────
  const APPROACHES_MARKER = "## Approaches";
  let headerSection = "";
  let approachesRaw = "";

  if (existingContent && existingContent.includes(APPROACHES_MARKER)) {
    const splitIdx = existingContent.indexOf(APPROACHES_MARKER);
    headerSection = existingContent.slice(0, splitIdx).trim();
    approachesRaw = existingContent.slice(splitIdx + APPROACHES_MARKER.length).trim();
  } else {
    headerSection = [
      `# ${number ? `${number}. ` : ""}${title}`,
      "",
      `| Platform | Difficulty | Topics | Pattern |`,
      `| :--- | :--- | :--- | :--- |`,
      `| ${platformLink} | ${difficultyBadge} | \`${topics.split(", ").join("`, `")}\` | \`${saveOptions.pattern || "None"}\` |`,
      "",
      "---",
      "",
      "## Problem Description",
      "",
      description,
    ].join("\n");
  }

  // ── Build the new/updated approach block ────────────────────────────────
  const approachLabel = (saveOptions.approach === "custom"
    ? saveOptions.customName
    : approachFullName(saveOptions.approach)
  );
  const approachCode = approachLabel.toUpperCase();

  const notesContent = saveOptions.notes?.trim()
    ? saveOptions.notes.trim()
    : "_No notes added._";

  const collectionVal = saveOptions.collection || "N/A";

  const approachId = (saveOptions.approach === "custom"
    ? `custom-${saveOptions.customName.toLowerCase().replace(/[^a-z0-9]/g, "")}`
    : saveOptions.approach.toLowerCase()
  );

  const newBlock = [
    `### ${approachCode}`,
    `<!-- leetsync:approach=${approachId} -->`,
    "",
    `| Metric | Value |`,
    `| :--- | :--- |`,
    `| ⏱️ Time Complexity | \`${saveOptions.timeComplexity || "N/A"}\` |`,
    `| 🗄️ Space Complexity | \`${saveOptions.spaceComplexity || "N/A"}\` |`,
    `| ⏳ Time Spent | \`${saveOptions.timeSpent || "N/A"}\` |`,
    `| 📁 Topic Tag | \`${saveOptions.selectedTopic || "N/A"}\` |`,
    `| 🧩 Pattern Used | \`${saveOptions.pattern || "N/A"}\` |`,
    `| 📦 Collection | \`${collectionVal}\` |`,
    submission.runtime ? `| 🚀 Runtime | \`${submission.runtime}\` |` : false,
    submission.memory ? `| 💾 Memory | \`${submission.memory}\` |` : false,
    "",
    "#### 📝 Notes",
    "",
    `> ${notesContent.replace(/\n/g, "\n> ")}`,
    ""
  ].filter(line => line !== false && line !== undefined).join("\n");

  // ── Merge into existing approaches ──────────────────────────────────────
  let updatedApproaches;
  const BLOCK_SEPARATOR = "### ";

  if (approachesRaw) {
    const blocks = approachesRaw.split(BLOCK_SEPARATOR).filter(Boolean);
    let replaced = false;

    const updated = blocks.map(block => {
      // 1. Try stable marker match first
      const markerMatch = block.match(/<!--\s*leetsync:approach=([a-z0-9-]+)\s*-->/i);
      if (markerMatch) {
        if (markerMatch[1].toLowerCase() === approachId.toLowerCase()) {
          replaced = true;
          return newBlock.replace(BLOCK_SEPARATOR, ""); // remove leading ###
        }
        return block;
      }

      // 2. Fallback to flexible matching for legacy blocks
      const firstLine = block.split("\n")[0].toLowerCase().trim();
      const codeLower = approachCode.toLowerCase().trim();

      // Flexible overlap matching (e.g. "OPTIMAL" vs "OPTIMAL APPROACH (OA)")
      const isMatch = (
        firstLine.startsWith(codeLower) ||
        codeLower.startsWith(firstLine) ||
        (codeLower.includes("optimal") && firstLine.includes("optimal")) ||
        (codeLower.includes("better") && firstLine.includes("better")) ||
        (codeLower.includes("brute") && firstLine.includes("brute"))
      );

      if (isMatch) {
        replaced = true;
        return newBlock.replace(BLOCK_SEPARATOR, ""); // remove leading ###
      }
      return block;
    });

    if (replaced) {
      updatedApproaches = updated.map(b => `${BLOCK_SEPARATOR}${b.trimStart()}`).join("\n\n---\n\n");
    } else {
      updatedApproaches = `${approachesRaw}\n\n---\n\n${newBlock}`;
    }
  } else {
    updatedApproaches = newBlock;
  }

  return `${headerSection}\n\n${APPROACHES_MARKER}\n\n${updatedApproaches}\n`;
}

// Human-readable approach names for README headings
function approachFullName(code) {
  const names = { bf: "Brute Force (BF)", ba: "Better Approach (BA)", oa: "Optimal Approach (OA)" };
  return names[code?.toLowerCase()] || code?.toUpperCase() || "Solution";
}

function languageToExtension(language = "") {
  let normalized = language.toLowerCase().trim();
  const map = {
    c: "c",
    "c++": "cpp",
    cpp: "cpp",
    csharp: "cs",
    "c#": "cs",
    go: "go",
    golang: "go",
    java: "java",
    javascript: "js",
    js: "js",
    kotlin: "kt",
    mysql: "sql",
    php: "php",
    python: "py",
    python3: "py",
    ruby: "rb",
    rust: "rs",
    scala: "scala",
    swift: "swift",
    typescript: "ts"
  };

  if (map[normalized]) return map[normalized];

  // Try partial/includes matches for custom variants (e.g. "Javascript (Node.js)" or "Python3")
  if (normalized.includes("c++") || normalized.includes("cpp")) return "cpp";
  if (normalized.includes("javascript") || normalized.includes("js")) return "js";
  if (normalized.includes("python") || normalized.includes("py")) return "py";
  if (normalized.includes("c#") || normalized.includes("csharp")) return "cs";
  if (normalized.includes("java")) return "java";

  return "txt";
}

function sanitizePath(path) {
  return path
    .split("/")
    .map(sanitizePathSegment)
    .filter(Boolean)
    .join("/");
}

function sanitizePathSegment(value) {
  return String(value)
    .trim()
    .replace(/[\\:*?"<>|#%{}^~[\]`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .slice(0, 80);
}

function sanitizeFileName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "solution";
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function toBase64(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function fromBase64(value) {
  return decodeURIComponent(escape(atob(value)));
}

async function formatGitHubError(response, fallback) {
  try {
    const data = await response.json();
    return `${fallback}: ${response.status} ${data.message || response.statusText}`;
  } catch {
    return `${fallback}: ${response.status} ${response.statusText}`;
  }
}

function validatePayload(settings, submission, saveOptions) {
  const missing = [];
  if (!settings?.token) missing.push("GitHub token");
  if (!settings?.owner) missing.push("GitHub owner");
  if (!settings?.repo) missing.push("GitHub repo");
  if (!submission?.title) missing.push("problem title");
  if (!saveOptions?.approach) missing.push("approach");

  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(", ")}`);
  }
}

export async function updateSolutionNotesInGitHub(payload) {
  const { settings, readmePath, approach, notes, slug, title, topic, id, language } = payload;
  
  let targetPath = readmePath;
  if (!targetPath) {
    // Reconstruct the path matching buildFolderPath logic
    const formattedTitle = (title || "Unknown Problem")
      .trim()
      .replace(/\s+/g, "-");
    const folderName = `${id || "0"}-${formattedTitle}`;
    
    const titleFolder = sanitizePathSegment(folderName);
    
    let topicFolder = "";
    if (topic) {
      const norm = topic.toLowerCase().trim();
      topicFolder = TAG_FOLDER_MAP[norm] || sanitizePathSegment(topic);
    }
    
    const base = sanitizePath(settings.basePath || "");
    let folderPath = "";
    if (base) {
      folderPath = topicFolder ? `${base}/${topicFolder}/${titleFolder}` : `${base}/${titleFolder}`;
    } else {
      folderPath = topicFolder ? `${topicFolder}/${titleFolder}` : titleFolder;
    }
    targetPath = `${folderPath}/README.md`;
  }
  
  if (!settings?.token) {
    throw new Error("GitHub Authentication Token is missing. Please sign in again.");
  }
  if (!settings?.owner) {
    throw new Error("GitHub Owner is missing. Please check your settings.");
  }
  if (!settings?.repo) {
    throw new Error("GitHub Repository is not selected. Please select/configure your repository in the settings tab first.");
  }
  if (!targetPath) {
    throw new Error("Readme path could not be resolved.");
  }
  if (!approach) {
    throw new Error("Approach is missing.");
  }

  // Fetch the existing README
  const existingFile = await getExistingFile(settings, targetPath);
  if (!existingFile || !existingFile.content) {
    throw new Error("README.md not found on GitHub");
  }

  const content = fromBase64(existingFile.content);

  // Split on "## Approaches" to separate header/description from solution approaches
  const SOLUTIONS_HEADER = "## Approaches";
  const parts = content.split(SOLUTIONS_HEADER);
  if (parts.length < 2) {
    throw new Error("Invalid README format: '## Approaches' header not found");
  }

  const headerPart = parts[0] + SOLUTIONS_HEADER + "\n\n";
  const approachesRaw = parts.slice(1).join(SOLUTIONS_HEADER);

  // Split approach blocks by "### "
  const BLOCK_SEPARATOR = "### ";
  const blocks = approachesRaw.split(BLOCK_SEPARATOR);
  
  // Find and update the notes inside the target approach block
  const targetApproachCode = approach.toUpperCase();
  const version = payload.version;

  let found = false;
  const updatedBlocks = blocks.map((block, index) => {
    // The first block before any "### " contains whitespace, links, or is empty
    if (index === 0) return block;

    // Check if this block corresponds to our approach code (e.g. "OPTIMAL APPROACH (OA)")
    if (block.trimStart().startsWith(targetApproachCode) || block.includes(`(${targetApproachCode})`)) {
      found = true;
      const notesMatch = block.match(/####?\s*(?:📝\s*)?Notes/i);
      if (notesMatch) {
        const dividerIndex = notesMatch.index;
        const dividerText = notesMatch[0];
        const beforeNotes = block.substring(0, dividerIndex);
        const afterNotes = block.substring(dividerIndex + dividerText.length);

        const sepIndex = afterNotes.indexOf("\n\n---\n\n");
        let divider = "";
        if (sepIndex !== -1) {
          divider = afterNotes.substring(sepIndex);
        }

        const newNotesContent = notes.trim() ? notes.trim() : "_No notes added._";
        const formattedNotes = `> ${newNotesContent.replace(/\n/g, "\n> ")}`;
        return beforeNotes + "#### 📝 Notes\n\n" + formattedNotes + "\n" + divider;
      } else {
        const newNotesContent = notes.trim() ? notes.trim() : "_No notes added._";
        const formattedNotes = `> ${newNotesContent.replace(/\n/g, "\n> ")}`;
        const cleanBlock = block.trimEnd();
        return cleanBlock + "\n\n" + "#### 📝 Notes" + "\n\n" + formattedNotes + "\n\n";
      }
    }
    return block;
  });

  if (!found) {
    throw new Error(`Approach '${approach}' not found in README.md`);
  }

  const updatedReadmeBody = headerPart + updatedBlocks.join(BLOCK_SEPARATOR);

  // Write back to GitHub
  await upsertFile({
    settings,
    path: targetPath,
    content: updatedReadmeBody,
    message: `Updated notes for ${targetApproachCode} (Version ${version || 1}) in README.md`,
    existingFile
  });

  // ── ALSO UPDATE SOLUTION CODE FILE COMMENTS ────────────────────────────────
  if (language) {
    try {
      const folderPath = targetPath.substring(0, targetPath.lastIndexOf("/"));
      const ext = languageToExtension(language);
      const versionSuffix = version ? `-v${version}` : "";
      const solutionFileName = `${slug}-${id || "0"}-${targetApproachCode}${versionSuffix}.${ext}`;
      const solutionPath = folderPath ? `${folderPath}/${solutionFileName}` : solutionFileName;

      const solutionFile = await getExistingFile(settings, solutionPath);
      if (solutionFile && solutionFile.content) {
        let codeContent = fromBase64(solutionFile.content);
        const cPrefix = getCommentPrefix(language.toLowerCase());

        const lines = codeContent.split("\n");
        let notesStartIdx = -1;
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
          if (lines[i].trim().startsWith(`${cPrefix} Notes:`)) {
            notesStartIdx = i;
            break;
          }
        }

        let updatedLines;
        const newNotesLines = [];
        if (notes.trim()) {
          newNotesLines.push(`${cPrefix}`);
          newNotesLines.push(`${cPrefix} Notes:`);
          notes.trim().split("\n").forEach(line => newNotesLines.push(`${cPrefix}   ${line}`));
        }

        if (notesStartIdx !== -1) {
          let headerEndIdx = notesStartIdx;
          while (headerEndIdx < lines.length && (lines[headerEndIdx].trim().startsWith(cPrefix) || lines[headerEndIdx].trim() === "")) {
            headerEndIdx++;
          }
          
          updatedLines = [
            ...lines.slice(0, notesStartIdx),
            ...newNotesLines,
            ...lines.slice(headerEndIdx)
          ];
        } else {
          // If "Notes:" is not in the file, find where the header comments end and insert them
          let metaEndIdx = 0;
          while (metaEndIdx < lines.length && (lines[metaEndIdx].trim().startsWith(cPrefix) || lines[metaEndIdx].trim() === "")) {
            metaEndIdx++;
          }
          while (metaEndIdx > 0 && lines[metaEndIdx - 1].trim() === "") {
            metaEndIdx--;
          }
          updatedLines = [
            ...lines.slice(0, metaEndIdx),
            ...newNotesLines,
            "",
            ...lines.slice(metaEndIdx)
          ];
        }

        const updatedCodeBody = updatedLines.join("\n");

        await upsertFile({
          settings,
          path: solutionPath,
          content: updatedCodeBody,
          message: `Updated notes in solution file ${solutionFileName}`,
          existingFile: solutionFile
        });
      }
    } catch (e) {
      console.warn("Failed to update notes in solution code file:", e);
    }
  }
}
