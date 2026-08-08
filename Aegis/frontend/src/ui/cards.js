/**
 * cards.js — Result card HTML renderers
 *
 * Each render function returns an HTML string injected into a result container.
 * Designed for accessibility: includes role="region", aria-labels, and
 * appropriate colour semantics (not colour alone for status communication).
 */

// ── APK TrustScore card ───────────────────────────────────────────────────────

/**
 * @param {object} data  Worker response from /analyze
 * @param {function} t   Translation helper t(verdicts) → string
 * @returns {string} HTML
 */
export function renderAPKCard(data, t) {
  const { trustScore, packageName, flags, verdicts, permissions, vtDetections, source } = data;
  const isDangerous = trustScore < 40;
  const statusClass = isDangerous ? "status-danger" : trustScore < 70 ? "status-warn" : "status-safe";
  const statusIcon = isDangerous ? "🚨" : trustScore < 70 ? "⚠️" : "✅";
  const statusLabel = isDangerous ? "DANGEROUS" : trustScore < 70 ? "SUSPICIOUS" : "SAFE";

  const verdictText = t(verdicts) || (isDangerous ? "This app may be dangerous." : "This app appears safe.");

  const flagsList = Object.entries(flags || {})
    .filter(([, v]) => v === true)
    .map(([k]) => `<li class="flag-item flag-danger">${formatFlagName(k)}</li>`)
    .join("");

  const topPerms = (permissions || [])
    .filter((p) => p.includes("SEND_SMS") || p.includes("READ_SMS") || p.includes("ACCESSIBILITY") ||
                   p.includes("DEVICE_ADMIN") || p.includes("INSTALL_PACKAGES"))
    .slice(0, 5)
    .map((p) => `<li class="perm-item">${p.replace("android.permission.", "")}</li>`)
    .join("");

  return `
<div class="verdict-card ${statusClass}" role="region" aria-label="APK scan result">
  <div class="verdict-header">
    <span class="verdict-icon" aria-hidden="true">${statusIcon}</span>
    <div class="verdict-meta">
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      <span class="package-name">${escapeHTML(packageName || "Unknown package")}</span>
      ${source === "cache" ? '<span class="cache-badge">⚡ from cache</span>' : ""}
    </div>
    <div class="trust-score-ring" aria-label="Trust score ${trustScore} out of 100">
      <svg viewBox="0 0 36 36" class="ring-svg" aria-hidden="true">
        <circle class="ring-bg" cx="18" cy="18" r="15.9"/>
        <circle class="ring-fill ${statusClass}-ring" cx="18" cy="18" r="15.9"
          stroke-dasharray="${trustScore} ${100 - trustScore}"
          stroke-dashoffset="25"/>
      </svg>
      <span class="ring-label">${trustScore}</span>
    </div>
  </div>

  <p class="verdict-text">${escapeHTML(verdictText)}</p>

  ${vtDetections !== null ? `<p class="vt-badge">VirusTotal detections: <strong>${vtDetections}</strong></p>` : ""}

  ${flagsList ? `
  <details class="flags-section" open>
    <summary class="flags-title">Risk flags detected</summary>
    <ul class="flags-list" role="list">${flagsList}</ul>
  </details>` : ""}

  ${topPerms ? `
  <details class="perms-section">
    <summary class="perms-title">Sensitive permissions</summary>
    <ul class="perms-list" role="list">${topPerms}</ul>
  </details>` : ""}

  ${isDangerous ? `
  <div class="action-row">
    <button class="btn btn-danger report-btn" aria-label="Report this APK to community blocklist">
      Report to blocklist
    </button>
  </div>` : ""}
</div>`;
}

// ── LinkSentry card ───────────────────────────────────────────────────────────

/**
 * @param {object} data  Worker response from /check-link
 * @param {function} t   Translation helper
 * @returns {string} HTML
 */
export function renderLinkCard(data, t) {
  const { hostname, dangerous, onnxScore, vtDetections, verdicts, source } = data;
  const statusClass = dangerous ? "status-danger" : "status-safe";
  const statusIcon = dangerous ? "🚨" : "✅";
  const statusLabel = dangerous ? "PHISHING" : "SAFE";

  const verdictText = t(verdicts) || (dangerous ? "This link is dangerous." : "This link appears safe.");
  const confidencePct = onnxScore !== null ? Math.round(onnxScore * 100) : null;

  return `
<div class="verdict-card ${statusClass}" role="region" aria-label="Link check result">
  <div class="verdict-header">
    <span class="verdict-icon" aria-hidden="true">${statusIcon}</span>
    <div class="verdict-meta">
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      <span class="hostname">${escapeHTML(hostname)}</span>
      ${source === "cache" ? '<span class="cache-badge">⚡ blocklist hit</span>' : ""}
    </div>
  </div>

  <p class="verdict-text">${escapeHTML(verdictText)}</p>

  ${confidencePct !== null ? `
  <div class="confidence-bar" role="meter" aria-valuenow="${confidencePct}" aria-valuemin="0"
       aria-valuemax="100" aria-label="Phishing confidence ${confidencePct}%">
    <div class="confidence-fill ${dangerous ? "fill-danger" : "fill-safe"}"
         style="width: ${confidencePct}%"></div>
    <span class="confidence-label">AI confidence: ${confidencePct}%</span>
  </div>` : ""}

  ${vtDetections !== null ? `<p class="vt-badge">VirusTotal detections: <strong>${vtDetections}</strong></p>` : ""}

  ${dangerous ? `
  <div class="action-row">
    <button class="btn btn-danger report-btn" aria-label="Report this domain to community blocklist">
      Report to blocklist
    </button>
  </div>` : ""}
</div>`;
}

// ── BreachRadar card ──────────────────────────────────────────────────────────

/**
 * @param {object} data  Worker response from /breach-lookup
 * @param {function} t   Translation helper
 * @returns {string} HTML
 */
export function renderBreachCard(data, t) {
  const { found, breachCount, breaches, actionPlan } = data;

  if (!found) {
    return `
<div class="verdict-card status-safe" role="region" aria-label="Breach check result">
  <div class="verdict-header">
    <span class="verdict-icon" aria-hidden="true">✅</span>
    <div class="verdict-meta">
      <span class="status-badge status-safe">CLEAN</span>
    </div>
  </div>
  <p class="verdict-text">No breaches found for this number in our India breach index.</p>
</div>`;
  }

  const breachItems = (breaches || [])
    .map(
      (b) => `
<li class="breach-item">
  <strong class="breach-name">${escapeHTML(b.name || "Unknown")}</strong>
  <span class="breach-date">${escapeHTML(b.date || "")}</span>
  <span class="breach-types">${(b.dataTypes || []).map(escapeHTML).join(", ")}</span>
</li>`
    )
    .join("");

  // actionPlan is Record<lang, string[]>
  const currentLang = localStorage.getItem("aegis_lang") || "en";
  const steps = actionPlan?.[currentLang] || actionPlan?.en || [];
  const stepItems = steps
    .map((s, i) => `<li class="action-step"><span class="step-num">${i + 1}</span>${escapeHTML(s)}</li>`)
    .join("");

  return `
<div class="verdict-card status-danger" role="region" aria-label="Breach check result">
  <div class="verdict-header">
    <span class="verdict-icon" aria-hidden="true">🚨</span>
    <div class="verdict-meta">
      <span class="status-badge status-danger">BREACHED</span>
      <span class="breach-count">${breachCount} breach${breachCount > 1 ? "es" : ""} found</span>
    </div>
  </div>

  <details class="breaches-section" open>
    <summary class="breaches-title">Affected breaches</summary>
    <ul class="breaches-list" role="list">${breachItems}</ul>
  </details>

  ${stepItems ? `
  <div class="action-plan" role="region" aria-label="Recommended actions">
    <h3 class="action-plan-title">What to do now</h3>
    <ol class="action-steps" role="list">${stepItems}</ol>
  </div>` : ""}
</div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHTML(str) {
  if (typeof str !== "string") return String(str ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatFlagName(key) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
