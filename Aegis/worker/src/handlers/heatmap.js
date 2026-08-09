/**
 * heatmap.js — Pincode-level scam heatmap aggregation
 *
 * Reads propagated threat signals and aggregates by pincode.
 *
 * Performance note: this scans the full threat_signals collection on
 * every call. Fine at hackathon scale. Once the collection exceeds a few
 * thousand docs, switch to an incrementally-maintained pincode_aggregates
 * collection updated inside the incrementReportCount transaction.
 */

export async function getHeatmapData(db) {
  // Only include threats that have been community-verified (propagated)
  const snapshot = await db.collection('threat_signals')
    .where('propagated', '==', true)
    .get();

  const pincodeCounts = {};
  const typeBreakdown = {};

  snapshot.forEach((doc) => {
    const data = doc.data();
    const type = data.type || 'unknown';

    for (const pincode of data.pincodes || []) {
      // Total count
      pincodeCounts[pincode] = (pincodeCounts[pincode] || 0) + 1;

      // Type breakdown per pincode
      if (!typeBreakdown[pincode]) typeBreakdown[pincode] = {};
      typeBreakdown[pincode][type] = (typeBreakdown[pincode][type] || 0) + 1;
    }
  });

  return Object.entries(pincodeCounts)
    .map(([pincode, threatCount]) => ({
      pincode,
      threatCount,
      breakdown: typeBreakdown[pincode] || {},
    }))
    .sort((a, b) => b.threatCount - a.threatCount);
}
