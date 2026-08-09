/**
 * warningCard.js — Shareable phishing warning card generator
 *
 * Renders a 1080×1080 canvas image suitable for sharing on WhatsApp/Instagram.
 * Returns a PNG data URL that can be downloaded or shared via the Web Share API.
 */

const CARD_SIZE = 1080;

const SEVERITY_COLORS = {
  danger: { bg: '#B91C1C', accent: '#FCA5A5', badge: '#7F1D1D' },
  warn:   { bg: '#D97706', accent: '#FDE68A', badge: '#92400E' },
  safe:   { bg: '#065F46', accent: '#6EE7B7', badge: '#064E3B' },
};

const AEGIS_TAGLINE = 'Aegis — India ka Digital Suraksha Kavach';

/**
 * Generate a shareable warning card image.
 *
 * @param {object} params
 * @param {string} params.verdictText  The danger verdict sentence (already localised)
 * @param {string} params.hostname     The domain/URL being flagged
 * @param {'danger'|'warn'|'safe'} params.severity
 * @param {string} [params.language]  ISO language code (for label text)
 * @returns {string} PNG data URL
 */
export function generateWarningCard({ verdictText, hostname, severity = 'danger', language = 'hi' }) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');

  const colors = SEVERITY_COLORS[severity] || SEVERITY_COLORS.danger;

  // ── Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  // ── Top accent bar ────────────────────────────────────────────────────────
  ctx.fillStyle = colors.badge;
  ctx.fillRect(0, 0, CARD_SIZE, 12);

  // ── Aegis logo text ───────────────────────────────────────────────────────
  ctx.fillStyle = colors.accent;
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AEGIS', CARD_SIZE / 2, 100);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillText('India ka Digital Suraksha Kavach', CARD_SIZE / 2, 145);

  // ── Divider ───────────────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 175);
  ctx.lineTo(CARD_SIZE - 80, 175);
  ctx.stroke();

  // ── Warning icon ──────────────────────────────────────────────────────────
  ctx.font = '160px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(severity === 'safe' ? '✅' : '⚠️', CARD_SIZE / 2, 400);

  // ── Status label ──────────────────────────────────────────────────────────
  const labels = {
    danger: { hi: 'खतरनाक लिंक', en: 'DANGEROUS LINK', ta: 'ஆபத்தான இணைப்பு', te: 'ప్రమాదకర లింక్', bn: 'বিপজ্জনক লিঙ্ক', mr: 'धोकादायक लिंक' },
    warn:   { hi: 'संदिग्ध लिंक', en: 'SUSPICIOUS LINK', ta: 'சந்தேகமான இணைப்பு', te: 'అనుమానాస్పద లింక్', bn: 'সন্দেহজনক লিঙ্ক', mr: 'संशयास्पद लिंक' },
    safe:   { hi: 'सुरक्षित लिंक', en: 'SAFE LINK', ta: 'பாதுகாப்பான இணைப்பு', te: 'సురక్షిత లింక్', bn: 'নিরাপদ লিঙ্ক', mr: 'सुरक्षित लिंक' },
  };
  const label = labels[severity]?.[language] || labels[severity]?.en || '';

  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, CARD_SIZE / 2, 490);

  // ── Hostname badge ────────────────────────────────────────────────────────
  if (hostname) {
    const badgeW = Math.min(ctx.measureText(hostname).width + 60, CARD_SIZE - 160);
    const badgeX = (CARD_SIZE - badgeW) / 2;
    ctx.fillStyle = colors.badge;
    roundRect(ctx, badgeX, 510, badgeW, 60, 12);
    ctx.fill();
    ctx.fillStyle = colors.accent;
    ctx.font = '32px monospace, system-ui';
    ctx.fillText(truncate(hostname, 36), CARD_SIZE / 2, 550);
  }

  // ── Verdict text (wrapped) ────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '38px system-ui, sans-serif';
  wrapText(ctx, verdictText, CARD_SIZE / 2, 650, CARD_SIZE - 160, 52);

  // ── Bottom divider + tagline ──────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, CARD_SIZE - 120);
  ctx.lineTo(CARD_SIZE - 80, CARD_SIZE - 120);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '28px system-ui, sans-serif';
  ctx.fillText(AEGIS_TAGLINE, CARD_SIZE / 2, CARD_SIZE - 70);

  // ── Bottom accent bar ─────────────────────────────────────────────────────
  ctx.fillStyle = colors.badge;
  ctx.fillRect(0, CARD_SIZE - 12, CARD_SIZE, 12);

  return canvas.toDataURL('image/png');
}

/**
 * Download the warning card as a PNG file.
 * @param {string} dataUrl
 * @param {string} [filename]
 */
export function downloadWarningCard(dataUrl, filename = 'aegis-warning.png') {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/**
 * Share the warning card via the Web Share API (mobile-first).
 * Falls back to download if Web Share isn't available.
 * @param {string} dataUrl
 * @param {string} verdictText
 */
export async function shareWarningCard(dataUrl, verdictText) {
  if (!navigator.share || !navigator.canShare) {
    downloadWarningCard(dataUrl);
    return;
  }

  try {
    // Convert data URL to Blob for Web Share API
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], 'aegis-warning.png', { type: 'image/png' });

    if (navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Aegis Security Alert',
        text: verdictText,
        files: [file],
      });
    } else {
      // Web Share without files
      await navigator.share({ title: 'Aegis Security Alert', text: verdictText });
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.warn('Share failed, downloading instead:', err.message);
      downloadWarningCard(dataUrl);
    }
  }
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  if (!text) return;
  const words = text.split(' ');
  let line = '';
  let offsetY = 0;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, y + offsetY);
      line = word + ' ';
      offsetY += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, y + offsetY);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}
