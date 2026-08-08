#!/usr/bin/env node
/**
 * seed-breach-index.js — Admin script to seed the breach_index and
 * user_breach_lookups collections in Firestore.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node seed-breach-index.js
 *
 * Input: breaches.json  (array of breach objects, see schema below)
 * Output: writes to Firestore breach_index + user_breach_lookups prefix index
 *
 * Breach object schema:
 * {
 *   id: string,              // unique slug e.g. "mobikwik-2021"
 *   name: string,            // display name e.g. "MobiKwik 2021"
 *   date: string,            // "2021-02"
 *   dataTypes: string[],     // ["phone", "email", "address"]
 *   source: string,          // "hibp" | "manual" | "public"
 *   phoneHashPrefixes: string[]  // first 5 hex chars of SHA-256(+91<phone>)
 * }
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function seed() {
  const breachesPath = path.join(__dirname, "breaches.json");
  if (!fs.existsSync(breachesPath)) {
    console.error("breaches.json not found. Create it with your breach data.");
    process.exit(1);
  }

  const breaches = JSON.parse(fs.readFileSync(breachesPath, "utf8"));
  console.log(`Seeding ${breaches.length} breaches…`);

  const batch = db.batch();
  let batchCount = 0;

  // Build reverse index: prefix → breach IDs
  const prefixIndex = {};

  for (const breach of breaches) {
    // Write breach document
    const breachRef = db.collection("breach_index").doc(breach.id);
    batch.set(breachRef, {
      id: breach.id,
      name: breach.name,
      date: breach.date,
      dataTypes: breach.dataTypes,
      source: breach.source,
      seededAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batchCount++;

    // Index phone hash prefixes
    for (const prefix of breach.phoneHashPrefixes || []) {
      if (!prefixIndex[prefix]) prefixIndex[prefix] = [];
      prefixIndex[prefix].push(breach.id);
    }

    // Commit in chunks of 400 (leave headroom)
    if (batchCount >= 400) {
      await batch.commit();
      console.log(`  Committed ${batchCount} breach docs`);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`  Committed remaining ${batchCount} breach docs`);
  }

  // Write prefix index
  console.log(`Writing ${Object.keys(prefixIndex).length} prefix index entries…`);
  const prefixBatch = db.batch();
  let prefixCount = 0;

  for (const [prefix, ids] of Object.entries(prefixIndex)) {
    const ref = db.collection("user_breach_lookups").doc(prefix);
    prefixBatch.set(ref, { breachIds: ids });
    prefixCount++;

    if (prefixCount >= 400) {
      await prefixBatch.commit();
      console.log(`  Committed ${prefixCount} prefix entries`);
      prefixCount = 0;
    }
  }

  if (prefixCount > 0) {
    await prefixBatch.commit();
    console.log(`  Committed remaining ${prefixCount} prefix entries`);
  }

  console.log("Done.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
