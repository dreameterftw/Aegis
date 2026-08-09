/**
 * cache.js — Firestore cache helpers + community propagation
 */

export async function checkCache(db, collection, docId) {
  const doc = await db.collection(collection).doc(docId).get();
  return doc.exists ? { source: 'cache', ...doc.data() } : null;
}

export async function writeCache(db, collection, docId, data) {
  await db.collection(collection).doc(docId).set(
    { ...data, lastSeen: Date.now() },
    { merge: true }
  );
}

/**
 * Increment the community report count for a threat signal.
 * Deduplicates by UID — one report per user per hash.
 * Auto-propagates to the relevant blocklist/cache at 3+ unique reports.
 *
 * @param {object} db
 * @param {string} hashOrDomain   APK SHA-256 or domain hostname
 * @param {'apk'|'link'} type
 * @param {string} uid            Verified Firebase anonymous UID
 * @param {string|null} pincode   Optional 6-digit pincode for heatmap aggregation
 * @returns {Promise<{ count: number, justPropagated: boolean, duplicate: boolean }>}
 */
export async function incrementReportCount(db, hashOrDomain, type, uid, pincode = null) {
  const signalRef = db.collection('threat_signals').doc(hashOrDomain);
  // Flat reporter key — avoids subcollection complexity with our REST client
  // Format: "signal_{hash}_reporter_{uid}" — truncated to stay within Firestore 1500-byte doc ID limit
  const reporterKey = `sig_${hashOrDomain.slice(0, 40)}_uid_${uid.slice(0, 28)}`;
  const reporterRef = db.collection('threat_signal_reporters').doc(reporterKey);

  return db.runTransaction(async (t) => {
    // Check if this UID already reported this exact hash
    const reporterDoc = await t.get(reporterRef);
    if (reporterDoc.exists) {
      const signalDoc = await t.get(signalRef);
      return {
        count: signalDoc.exists ? signalDoc.data().reportCount : 0,
        justPropagated: false,
        duplicate: true,
      };
    }

    const signalDoc = await t.get(signalRef);
    const existing = signalDoc.exists
      ? signalDoc.data()
      : { reportCount: 0, propagated: false, pincodes: [] };

    const count = (existing.reportCount ?? 0) + 1;

    // Accumulate unique pincodes for heatmap
    const existingPincodes = existing.pincodes ?? [];
    const pincodes =
      pincode && !existingPincodes.includes(pincode)
        ? [...existingPincodes, pincode]
        : existingPincodes;

    // Record this reporter so they can't double-count
    t.set(reporterRef, { hashOrDomain, uid, reportedAt: Date.now() });

    // Update signal doc
    t.set(
      signalRef,
      {
        hashOrDomain,
        type,
        reportCount: count,
        pincodes,
        propagated: existing.propagated ?? false,
      },
      { merge: true }
    );

    // Auto-propagate at 3+ independent reports — fires only once
    if (count >= 3 && !existing.propagated) {
      const targetCollection = type === 'apk' ? 'apk_cache' : 'domain_blocklist';
      t.set(
        db.collection(targetCollection).doc(hashOrDomain),
        {
          source: 'community',
          verified: true,
          communityReportCount: count,
          propagatedAt: Date.now(),
        },
        { merge: true }
      );
      t.set(signalRef, { propagated: true }, { merge: true });
      return { count, justPropagated: true, duplicate: false };
    }

    return { count, justPropagated: false, duplicate: false };
  });
}
