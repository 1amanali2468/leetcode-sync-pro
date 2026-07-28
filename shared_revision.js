export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayOffset(dateStr, offsetDays) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getRevisionDueDate(entry) {
  if (entry.customRevisionDueDate) {
    const d = new Date(entry.customRevisionDueDate);
    if (!isNaN(d.getTime())) return d;
  }
  if (!entry.savedAt) return null;
  const d = new Date(entry.lastRevisionAt || entry.savedAt);
  const rev = entry.revisionCount || 1;
  let offset = 3;
  if (rev === 2) offset = 7;
  else if (rev === 3) offset = 15;
  else if (rev >= 4) offset = 30;
  
  d.setDate(d.getDate() + offset);
  return d;
}

export function isRevisionDue(entry, targetDateStr = null) {
  if (entry.revisionCompleted && entry.revisionCompletedAt === (targetDateStr || todayStr())) {
    return false;
  }
  const dueDate = getRevisionDueDate(entry);
  if (!dueDate) return false;
  
  if (targetDateStr) {
    const tDate = new Date(targetDateStr);
    tDate.setHours(23, 59, 59, 999);
    return dueDate <= tDate;
  } else {
    const now = new Date();
    return dueDate <= now;
  }
}

export function getDueRevisions(history, targetDateStr = null) {
  const latestBySlug = {};
  history.forEach(entry => {
    if (entry.isStarredOnly) return;
    if (!latestBySlug[entry.slug]) {
      latestBySlug[entry.slug] = entry;
    } else {
      const d1 = new Date(entry.savedAt || 0);
      const d2 = new Date(latestBySlug[entry.slug].savedAt || 0);
      if (d1 > d2) {
        latestBySlug[entry.slug] = entry;
      }
    }
  });

  const dueList = [];
  for (const slug in latestBySlug) {
    const entry = latestBySlug[slug];
    if (isRevisionDue(entry, targetDateStr)) {
      dueList.push(entry);
    }
  }
  return dueList;
}
