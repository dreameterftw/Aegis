/**
 * firebase-client.js — Firebase client SDK initialisation
 *
 * Provides:
 *  - Anonymous Auth (sign in once, persist session)
 *  - FCM messaging + push subscription
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { FIREBASE_CONFIG, VAPID_KEY, WORKER_URL } from "./config.js";

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);

let _uid = null;

/**
 * Sign in anonymously and cache the UID.
 * Called once at app startup. Subsequent calls resolve instantly.
 * @returns {Promise<string>} anonymous user UID
 */
export async function ensureAnonymousAuth() {
  if (_uid) return _uid;

  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        _uid = user.uid;
        resolve(_uid);
      } else {
        try {
          const cred = await signInAnonymously(auth);
          _uid = cred.user.uid;
          resolve(_uid);
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

/**
 * Request push notification permission and register FCM token.
 * Sends the token to the Worker so breach alerts can be delivered.
 * @returns {Promise<boolean>} true if subscription succeeded
 */
export async function subscribeToBreachAlerts() {
  if (!("Notification" in window)) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  try {
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    const uid = await ensureAnonymousAuth();

    const res = await fetch(`${WORKER_URL}/subscribe-alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, uid }),
    });

    if (!res.ok) throw new Error(`Subscription failed: ${res.status}`);

    // Listen for foreground messages
    onMessage(messaging, (payload) => {
      console.log("FCM foreground message:", payload);
      showInAppNotification(payload);
    });

    return true;
  } catch (err) {
    console.error("FCM subscription error:", err);
    return false;
  }
}

/**
 * Show a simple in-app notification banner for foreground FCM messages.
 */
function showInAppNotification(payload) {
  const banner = document.createElement("div");
  banner.className = "fcm-banner";
  banner.setAttribute("role", "alert");
  banner.innerHTML = `
    <strong>${payload.notification?.title || "Alert"}</strong>
    <p>${payload.notification?.body || ""}</p>
  `;
  document.body.prepend(banner);
  setTimeout(() => banner.remove(), 6000);
}
