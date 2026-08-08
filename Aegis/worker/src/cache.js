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

// Used by Phase 5 later, stubbed here so the shape exists from day one
export async function incrementReportCount(db, hashOrDomain, type) {
  const ref = db.collection('threat_signals').doc(hashOrDomain);
  return db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    const count = (doc.exists ? doc.data().reportCount : 0) + 1;
    t.set(ref, { hashOrDomain, type, reportCount: count }, { merge: true });
    return count;
  });
}
