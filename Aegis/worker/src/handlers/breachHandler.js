/**
 * breachHandler.js — Phase 4 BreachRadar
 *
 * Architecture (Option A — self-reported services):
 *  User selects which services they've used → worker matches against
 *  breach_index by service key → returns matching breaches + safety score
 *  + Groq action plans per breach.
 *
 * This is honest: we don't claim per-record inclusion (we don't have
 * HIBP-style structured leak data for these Indian breaches). Instead we
 * tell the user "you used Star Health, which was breached — here's what
 * was exposed and what to do." That's factually accurate and still valuable.
 *
 * Option B upgrade path: when structured hash-indexed breach data becomes
 * available, replace the servicesUsed lookup with a hashPrefix lookup
 * against user_breach_lookups collection (seeded via seed-breach-index.js).
 */

import { generateActionPlan } from '../services/groqActionPlan.js';

// Map of frontend service keys → Firestore breach_index document IDs
const SERVICE_TO_BREACH_IDS = {
  star_health:    ['star_health_2024'],
  cowin:          ['cowin_2023'],
  aadhaar:        ['aadhaar_darkweb_2023'],
  mobikwik:       ['mobikwik_2021'],
  bigbasket:      ['bigbasket_2020'],
  justdial:       ['justdial_2020'],
  dominos:        ['dominos_india_2021'],
  airtel:         ['airtel_2019'],
  facebook:       ['facebook_2021'],
  truecaller:     ['truecaller_2019'],
  railway_irctc:  ['irctc_2022'],
  epfo:           ['epfo_2023'],
};

/**
 * Severity weights for Digital Safety Score calculation.
 * Lower score = more exposed.
 */
const SEVERITY_WEIGHT = { critical: 30, high: 20, medium: 10, low: 5 };

export async function handleBreach(body, db, env) {
  const { servicesUsed } = body;

  if (!Array.isArray(servicesUsed) || servicesUsed.length === 0) {
    return Response.json({ error: 'servicesUsed array required' }, { status: 400 });
  }

  // ── 1. Resolve service keys → breach IDs ─────────────────────────────────
  const breachIdSet = new Set();
  for (const service of servicesUsed) {
    const ids = SERVICE_TO_BREACH_IDS[service] || [];
    ids.forEach((id) => breachIdSet.add(id));
  }

  if (breachIdSet.size === 0) {
    return Response.json({
      found: false,
      safetyScore: 100,
      breaches: [],
      actionPlans: [],
      message: 'None of the selected services appear in our India breach index.',
    });
  }

  // ── 2. Fetch breach records from Firestore ────────────────────────────────
  const breachDocs = await Promise.allSettled(
    [...breachIdSet].map((id) => db.collection('breach_index').doc(id).get())
  );

  const foundBreaches = breachDocs
    .filter((r) => r.status === 'fulfilled' && r.value.exists)
    .map((r) => r.value.data());

  if (foundBreaches.length === 0) {
    return Response.json({
      found: false,
      safetyScore: 100,
      breaches: [],
      actionPlans: [],
      message: 'Breach records not yet seeded. Run seed-breach-index.js.',
    });
  }

  // ── 3. Calculate Digital Safety Score ────────────────────────────────────
  const safetyScore = calculateSafetyScore(foundBreaches);

  // ── 4. Generate Groq action plans per breach ──────────────────────────────
  // Run in parallel — each takes ~1s on Groq free tier
  const actionPlans = await Promise.allSettled(
    foundBreaches.map((breach) => generateActionPlan(breach, env))
  );

  const plans = actionPlans.map((r, i) => ({
    breachId: foundBreaches[i].id,
    breachName: foundBreaches[i].orgName || foundBreaches[i].name,
    steps: r.status === 'fulfilled' ? r.value : [
      'Change passwords on all accounts linked to this service.',
      'Enable two-factor authentication on your banking and email accounts.',
      'Monitor your bank statements for unusual transactions.',
    ],
  }));

  // ── 5. Shape response to match renderBreachCard expectations ─────────────
  return Response.json({
    found: true,
    breachCount: foundBreaches.length,
    safetyScore,
    breaches: foundBreaches.map((b) => ({
      id: b.id,
      name: b.orgName || b.name,
      date: b.date,
      dataTypes: b.dataTypesExposed || b.dataTypes || [],
      severity: b.severity,
      affectedRange: b.affectedRangeDescription || '',
      sourceCitation: b.sourceCitation || '',
    })),
    actionPlans: plans,
    // Legacy field — kept for renderBreachCard compatibility
    actionPlan: plans[0]
      ? Object.fromEntries(
          ['hi', 'en', 'ta', 'te', 'bn', 'mr'].map((lang) => [
            lang,
            plans[0].steps,
          ])
        )
      : null,
  });
}

/**
 * Compute a Digital Safety Score (0–100).
 * Recency-weighted: older breaches matter less.
 */
function calculateSafetyScore(breaches) {
  const now = Date.now();
  let deduction = 0;

  for (const b of breaches) {
    const ageYears = (now - new Date(b.date).getTime()) / (365.25 * 24 * 3600 * 1000);
    // Breaches older than 5 years still matter but weigh 40% of fresh ones
    const recencyMultiplier = Math.max(0.4, 1 - ageYears * 0.12);
    const weight = SEVERITY_WEIGHT[b.severity] ?? 10;
    deduction += weight * recencyMultiplier;
  }

  return Math.max(0, Math.round(100 - deduction));
}
