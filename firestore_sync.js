// firestore_sync.js – Shared utilities for batched Firestore writes
// Can be imported by background scripts, popup scripts, and login script.

import { FIREBASE_CONFIG } from "./firebase-config.js";

import { convertToFirestoreFields } from "./firestore_core.js";

/**
 * Performs a batched transaction write (updates and deletes) to Firestore
 * by chunking operations into groups of 500.
 * 
 * @param {string} uid User's Firebase UID
 * @param {string} idToken User's valid JWT ID Token
 * @param {Object} options Object containing arrays of updates and deletes
 * @param {Array} options.updates Array of flat objects representing problem solves to upload. Must contain slug, approach, and version.
 * @param {Array} options.deletes Array of Firestore document ID strings to delete.
 */
export async function batchWriteToFirestore(uid, idToken, { updates = [], deletes = [] }) {
  if (!updates.length && !deletes.length) return;

  const projectId = FIREBASE_CONFIG.projectId;
  const dbPrefix = `projects/${projectId}/databases/(default)/documents/users/${uid}/history`;

  const allWrites = [];

  // 1. Build update writes (creates or completely overwrites documents)
  for (const item of updates) {
    const safeId = `${item.slug}-${item.approach}-v${item.version || 1}`.replace(/[^a-zA-Z0-9_-]/g, "");
    allWrites.push({
      update: {
        name: `${dbPrefix}/${safeId}`,
        fields: convertToFirestoreFields(item).fields
      }
    });
  }

  // 2. Build delete writes
  for (const docId of deletes) {
    allWrites.push({
      delete: `${dbPrefix}/${docId}`
    });
  }

  // 3. Chunk and execute writes in batches of 500
  const batchSize = 500;
  for (let i = 0; i < allWrites.length; i += batchSize) {
    const chunk = allWrites.slice(i, i + batchSize);
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;

    const response = await fetch(commitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${idToken}`
      },
      body: JSON.stringify({ writes: chunk })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Firestore commit batch failed: ${response.status} - ${errorText}`);
    }
  }
}
