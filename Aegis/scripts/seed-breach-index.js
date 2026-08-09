#!/usr/bin/env node
/**
 * seed-breach-index.js — Seeds breach_index collection in Firestore.
 *
 * All breaches below are sourced from public disclosures, verified news
 * reports, or official statements. No raw PII is stored — only metadata.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/seed-breach-index.js
 *
 * Run once. Safe to re-run (uses set with merge:false so it overwrites).
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Verified Indian breach records ────────────────────────────────────────────
// Sources cited per entry. Do NOT add entries without a verifiable public source.
const BREACHES = [
  {
    id: 'star_health_2024',
    orgName: 'Star Health and Allied Insurance',
    date: '2024-08-01',
    dataTypesExposed: ['name', 'phone', 'email', 'policy_number', 'health_data', 'address', 'dob'],
    affectedRangeDescription: '~31 million policyholder records',
    severity: 'critical',
    sourceCitation: 'TechCrunch, Reuters, CERT-In advisory — August 2024. Threat actor "xenZen" listed data on Telegram.',
    actionPlanKey: 'insurance_data_breach',
  },
  {
    id: 'cowin_2023',
    orgName: 'CoWIN Vaccination Portal (MoHFW)',
    date: '2023-06-01',
    dataTypesExposed: ['name', 'phone', 'aadhaar_last4', 'dob', 'vaccination_status', 'vaccination_center'],
    affectedRangeDescription: 'Citizen vaccination records accessible via Telegram bot — scale unconfirmed',
    severity: 'high',
    sourceCitation: 'Indian Express, NDTV, and government statements — June 2023. CERT-In investigated.',
    actionPlanKey: 'government_portal_breach',
  },
  {
    id: 'aadhaar_darkweb_2023',
    orgName: 'Unspecified government portal (dark web sale)',
    date: '2023-10-01',
    dataTypesExposed: ['aadhaar_number', 'name', 'phone', 'address'],
    affectedRangeDescription: '815 million Indian records listed for sale on dark web forum',
    severity: 'critical',
    sourceCitation: 'Resecurity report Oct 2023, covered by Reuters, BBC, Washington Post.',
    actionPlanKey: 'aadhaar_exposure',
  },
  {
    id: 'mobikwik_2021',
    orgName: 'MobiKwik',
    date: '2021-03-01',
    dataTypesExposed: ['name', 'phone', 'email', 'address', 'kyc_documents', 'hashed_password'],
    affectedRangeDescription: '~100 million user records including KYC data',
    severity: 'critical',
    sourceCitation: 'Reported by security researcher Rajshekhar Rajaharia, covered by BleepingComputer and Indian media — March 2021.',
    actionPlanKey: 'fintech_breach',
  },
  {
    id: 'bigbasket_2020',
    orgName: 'BigBasket',
    date: '2020-11-01',
    dataTypesExposed: ['name', 'phone', 'email', 'address', 'hashed_password', 'dob'],
    affectedRangeDescription: '~20 million user records',
    severity: 'high',
    sourceCitation: 'Cyble research Nov 2020. BigBasket filed police complaint. Covered by Economic Times, The Hindu.',
    actionPlanKey: 'ecommerce_breach',
  },
  {
    id: 'justdial_2020',
    orgName: 'JustDial',
    date: '2020-04-01',
    dataTypesExposed: ['name', 'phone', 'email', 'address', 'gender', 'dob'],
    affectedRangeDescription: '~100 million user records',
    severity: 'high',
    sourceCitation: 'Security researcher Anurag Sen disclosure, April 2020. Covered by Inc42, TechCrunch.',
    actionPlanKey: 'directory_breach',
  },
  {
    id: 'dominos_india_2021',
    orgName: "Domino's India (Jubilant FoodWorks)",
    date: '2021-05-01',
    dataTypesExposed: ['name', 'phone', 'email', 'address', 'order_history', 'payment_partial'],
    affectedRangeDescription: '~18 crore order details and 1 million credit card records (partial)',
    severity: 'high',
    sourceCitation: 'Alon Gal disclosure May 2021. Covered by BleepingComputer, Hindustan Times, NDTV.',
    actionPlanKey: 'food_delivery_breach',
  },
  {
    id: 'airtel_2019',
    orgName: 'Airtel',
    date: '2019-11-01',
    dataTypesExposed: ['name', 'phone', 'email', 'dob', 'aadhaar_last4', 'imsi'],
    affectedRangeDescription: '~300 million subscriber records potentially exposed via API vulnerability',
    severity: 'high',
    sourceCitation: 'Discovered by Ehraz Ahmed, reported to CERT-In Nov 2019. Covered by Quartz India.',
    actionPlanKey: 'telecom_breach',
  },
  {
    id: 'facebook_2021',
    orgName: 'Facebook (Meta) — India users included',
    date: '2021-04-01',
    dataTypesExposed: ['name', 'phone', 'email', 'dob', 'location', 'facebook_id'],
    affectedRangeDescription: '533 million global users including ~6 million Indian accounts',
    severity: 'medium',
    sourceCitation: 'Alon Gal disclosure April 2021. Covered globally. Facebook confirmed data was scraped.',
    actionPlanKey: 'social_media_breach',
  },
  {
    id: 'truecaller_2019',
    orgName: 'Truecaller',
    date: '2019-05-01',
    dataTypesExposed: ['name', 'phone', 'email', 'gender', 'carrier'],
    affectedRangeDescription: '~4.75 crore Indian user records reportedly sold on dark web',
    severity: 'medium',
    sourceCitation: 'Reported by The Hacker News, May 2019. Truecaller denied breach; records appeared on dark web forums.',
    actionPlanKey: 'directory_breach',
  },
  {
    id: 'irctc_2022',
    orgName: 'IRCTC (Indian Railway Catering and Tourism Corporation)',
    date: '2022-12-01',
    dataTypesExposed: ['name', 'phone', 'email', 'address', 'transaction_history'],
    affectedRangeDescription: '~3 crore passenger records reportedly sold online',
    severity: 'high',
    sourceCitation: 'Reported by Cybernews and Indian media December 2022. IRCTC denied breach; data appeared on dark web.',
    actionPlanKey: 'government_portal_breach',
  },
  {
    id: 'epfo_2023',
    orgName: 'EPFO (Employees Provident Fund Organisation)',
    date: '2023-05-01',
    dataTypesExposed: ['name', 'phone', 'uan_number', 'aadhaar_last4', 'employer_details', 'pf_balance'],
    affectedRangeDescription: 'Reported unauthorized access to member records via third-party service provider',
    severity: 'high',
    sourceCitation: 'Reported by multiple Indian cybersecurity researchers May 2023. EPFO issued advisory to members.',
    actionPlanKey: 'government_portal_breach',
  },
];

async function seed() {
  console.log(`Seeding ${BREACHES.length} breach records to Firestore…\n`);

  for (const breach of BREACHES) {
    try {
      await db.collection('breach_index').doc(breach.id).set({
        ...breach,
        seededAt: new Date().toISOString(),
      });
      console.log(`  ✓ ${breach.id}`);
    } catch (err) {
      console.error(`  ✗ ${breach.id}: ${err.message}`);
    }
  }

  console.log(`\nDone. ${BREACHES.length} breach records seeded.`);
  console.log('\nNext: verify in Firebase Console → Firestore → breach_index collection.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
