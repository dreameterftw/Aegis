/**
 * main.js — CyberSuraksha PWA entry point
 *
 * Wires together:
 *  - Tab navigation
 *  - APK scanner (Phase 2)
 *  - LinkSentry (Phase 3)
 *  - BreachRadar (Phase 4)
 *  - Community signal reporting (Phase 5)
 *  - Push notification subscription (Phase 6)
 *  - Language selector (Phase 6)
 */

import { ensureAnonymousAuth, subscribeToBreachAlerts } from "./firebase-client.js";
import { classifyURL } from "./onnx.js";
import { getPhoneHashPrefix } from "./crypto.js";
import { renderAPKCard, renderLinkCard, renderBreachCard } from "./ui/cards.js";
import { WORKER_URL } from "./config.js";

// ── Language ──────────────────────────────────────────────────────────────────
let currentLang = localStorage.getItem("aegis_lang") || "en";

function t(verdicts) {
  return verdicts?.[currentLang] || verdicts?.en || "";
}

// ── Tab navigation ────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;

    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    document.getElementById(`tab-${target}`).classList.add("active");
  });
});

// ── APK Scanner ───────────────────────────────────────────────────────────────
const apkDropZone = document.getElementById("apkDropZone");
const apkFileInput = document.getElementById("apkFileInput");
const apkResult = document.getElementById("apkResult");
const apkLoading = document.getElementById("apkLoading");

apkDropZone.addEventListener("click", () => apkFileInput.click());
apkDropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") apkFileInput.click();
});

// Drag-and-drop
apkDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  apkDropZone.classList.add("dragover");
});
apkDropZone.addEventListener("dragleave", () => apkDropZone.classList.remove("dragover"));
apkDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  apkDropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) analyzeAPK(file);
});

apkFileInput.addEventListener("change", () => {
  const file = apkFileInput.files[0];
  if (file) analyzeAPK(file);
});

async function analyzeAPK(file) {
  if (!file.name.endsWith(".apk")) {
    showError(apkResult, "Please upload an APK file.");
    return;
  }

  setLoading(apkLoading, apkResult, true);

  try {
    const uid = await ensureAnonymousAuth();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("uid", uid);

    const res = await fetch(`${WORKER_URL}/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();

    apkResult.innerHTML = renderAPKCard(data, t);
    apkResult.classList.remove("hidden");

    // Offer community report for dangerous APKs
    if (data.trustScore < 30) {
      setupCommunityReport(apkResult, data.hash, "apk", uid);
    }
  } catch (err) {
    showError(apkResult, err.message);
  } finally {
    setLoading(apkLoading, apkResult, false);
  }
}

// ── LinkSentry ────────────────────────────────────────────────────────────────
const linkForm = document.getElementById("linkForm");
const linkInput = document.getElementById("linkInput");
const linkResult = document.getElementById("linkResult");
const linkLoading = document.getElementById("linkLoading");

linkForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = linkInput.value.trim();
  if (!url) return;

  setLoading(linkLoading, linkResult, true);

  try {
    // Run ONNX on-device first (fast, free)
    let onnxScore = null;
    try {
      const onnx = await classifyURL(url);
      onnxScore = onnx.score;
    } catch (err) {
      console.warn("ONNX classify failed (model may not be loaded):", err.message);
    }

    const uid = await ensureAnonymousAuth();
    const res = await fetch(`${WORKER_URL}/check-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, onnxScore, uid }),
    });

    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();

    linkResult.innerHTML = renderLinkCard(data, t);
    linkResult.classList.remove("hidden");

    if (data.dangerous) {
      setupCommunityReport(linkResult, data.hostname, "domain", uid);
    }
  } catch (err) {
    showError(linkResult, err.message);
  } finally {
    setLoading(linkLoading, linkResult, false);
  }
});

// Handle incoming share (Web Share Target API)
if (location.pathname === "/share") {
  const params = new URLSearchParams(location.search);
  const sharedText = params.get("text") || params.get("url") || "";
  if (sharedText) {
    linkInput.value = sharedText;
    linkForm.dispatchEvent(new Event("submit"));
    // Switch to LinkSentry tab
    document.querySelector('[data-tab="linksentry"]').click();
  }
}

// ── BreachRadar ───────────────────────────────────────────────────────────────
const breachForm = document.getElementById("breachForm");
const phoneInput = document.getElementById("phoneInput");
const breachResult = document.getElementById("breachResult");
const breachLoading = document.getElementById("breachLoading");
const notifySection = document.getElementById("notifySection");
const notifyBtn = document.getElementById("notifyBtn");

breachForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const phone = phoneInput.value.replace(/\D/g, "");

  if (!phone || phone.length !== 10) {
    showError(breachResult, "Please enter a valid 10-digit mobile number.");
    return;
  }

  setLoading(breachLoading, breachResult, true);

  try {
    // Hash on device — raw number never transmitted
    const hashPrefix = await getPhoneHashPrefix(`+91${phone}`);

    const res = await fetch(`${WORKER_URL}/breach-lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashPrefix }),
    });

    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();

    breachResult.innerHTML = renderBreachCard(data, t);
    breachResult.classList.remove("hidden");

    if (data.found) {
      notifySection.classList.remove("hidden");
    }
  } catch (err) {
    showError(breachResult, err.message);
  } finally {
    setLoading(breachLoading, breachResult, false);
  }
});

notifyBtn.addEventListener("click", async () => {
  notifyBtn.disabled = true;
  notifyBtn.textContent = "Subscribing…";
  const ok = await subscribeToBreachAlerts();
  notifyBtn.textContent = ok ? "✅ Subscribed!" : "❌ Permission denied";
  notifyBtn.disabled = false;
});

// ── Community signal report ────────────────────────────────────────────────────
function setupCommunityReport(container, hashOrDomain, type, uid) {
  const reportBtn = container.querySelector(".report-btn");
  if (!reportBtn) return;

  reportBtn.addEventListener("click", async () => {
    reportBtn.disabled = true;
    reportBtn.textContent = "Reporting…";

    try {
      const res = await fetch(`${WORKER_URL}/report-signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hashOrDomain, type, anonUid: uid }),
      });
      const data = await res.json();
      reportBtn.textContent = data.propagated ? "⚠️ Added to blocklist" : "✅ Reported";
    } catch {
      reportBtn.textContent = "Report failed";
      reportBtn.disabled = false;
    }
  });
}

// ── Language FAB ──────────────────────────────────────────────────────────────
const langToggle = document.getElementById("langToggle");
const langMenu = document.getElementById("langMenu");
const currentLangLabel = document.getElementById("currentLangLabel");

langToggle.addEventListener("click", () => {
  const expanded = langToggle.getAttribute("aria-expanded") === "true";
  langToggle.setAttribute("aria-expanded", String(!expanded));
  langMenu.classList.toggle("hidden");
});

document.querySelectorAll(".lang-option").forEach((opt) => {
  opt.addEventListener("click", () => {
    currentLang = opt.dataset.lang;
    localStorage.setItem("aegis_lang", currentLang);
    currentLangLabel.textContent = currentLang.toUpperCase();
    langMenu.classList.add("hidden");
    langToggle.setAttribute("aria-expanded", "false");
  });
});

// Close lang menu on outside click
document.addEventListener("click", (e) => {
  if (!e.target.closest("#langFab")) {
    langMenu.classList.add("hidden");
    langToggle.setAttribute("aria-expanded", "false");
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function setLoading(loadingEl, resultEl, show) {
  if (show) {
    loadingEl.classList.remove("hidden");
    resultEl.classList.add("hidden");
  } else {
    loadingEl.classList.add("hidden");
  }
}

function showError(container, message) {
  container.innerHTML = `<div class="error-card" role="alert"><p>${escapeHTML(message)}</p></div>`;
  container.classList.remove("hidden");
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Service Worker registration (handled by vite-plugin-pwa) ──────────────────
// vite-plugin-pwa auto-registers in production via the generated registerSW.js.
// No manual registration needed here.
