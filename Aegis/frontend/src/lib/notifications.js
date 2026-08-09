/**
 * notifications.js — FCM push notification subscription (Phase 6)
 *
 * Handles permission request, FCM token registration, and foreground
 * message display. Token is stored in Firestore fcm_subscriptions/{uid}
 * via the Worker's /subscribe-alerts endpoint (auth required).
 */

import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { VAPID_KEY, WORKER_URL } from "../config.js";
import { ensureAnonymousAuth, getIdToken } from "../firebase-client.js";

let _messagingInstance = null;

function getMessagingInstance(app) {
  if (!_messagingInstance) _messagingInstance = getMessaging(app);
  return _messagingInstance;
}

/**
 * Request notification permission, get FCM token, register with Worker.
 *
 * @param {object} firebaseApp  Initialised Firebase app instance
 * @returns {Promise<{ enabled: boolean, reason?: string }>}
 */
export async function enableBreachAlerts(firebaseApp) {
  if (!('Notification' in window)) {
    return { enabled: false, reason: 'Notifications not supported in this browser' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { enabled: false, reason: 'Permission denied' };
  }

  try {
    const messaging = getMessagingInstance(firebaseApp);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });

    if (!token) {
      return { enabled: false, reason: 'Failed to get FCM token' };
    }

    // Register token with Worker — requires auth
    const idToken = await getIdToken();
    const res = await fetch(`${WORKER_URL}/subscribe-alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { enabled: false, reason: err.error || `Server error ${res.status}` };
    }

    // Handle foreground messages
    onMessage(messaging, (payload) => {
      showForegroundNotification(payload);
    });

    return { enabled: true };
  } catch (err) {
    console.error('enableBreachAlerts error:', err);
    return { enabled: false, reason: err.message };
  }
}

/**
 * Show an in-app notification banner for foreground FCM messages.
 */
function showForegroundNotification(payload) {
  const { title, body } = payload.notification || {};

  const banner = document.createElement('div');
  banner.className = 'fcm-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');
  banner.innerHTML = `
    <div class="fcm-banner-content">
      <span class="fcm-icon" aria-hidden="true">🚨</span>
      <div class="fcm-text">
        <strong class="fcm-title">${escapeHTML(title || 'Aegis Alert')}</strong>
        <p class="fcm-body">${escapeHTML(body || '')}</p>
      </div>
      <button class="fcm-close" aria-label="Dismiss notification">✕</button>
    </div>
  `;

  banner.querySelector('.fcm-close').addEventListener('click', () => banner.remove());
  document.body.prepend(banner);
  setTimeout(() => banner.remove(), 8000);
}

function escapeHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
