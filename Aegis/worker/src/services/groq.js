/**
 * groq.js — Groq LLM service helpers
 *
 * Uses llama-3.1-8b-instant (free tier, fast) for:
 *  - APK + link danger verdicts in 6 languages
 *  - BreachRadar action plans in 6 languages
 *
 * Results are NOT cached here — the calling handler caches them
 * in Firestore keyed by hash/domain so Groq is only called once per entity.
 */

const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

const LANGUAGES = [
  { code: "hi", name: "Hindi" },
  { code: "en", name: "English" },
  { code: "ta", name: "Tamil" },
  { code: "te", name: "Telugu" },
  { code: "bn", name: "Bengali" },
  { code: "mr", name: "Marathi" },
];

async function callGroq(prompt, env) {
  const res = await fetch(GROQ_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/**
 * Generate a one-sentence danger verdict in all six languages.
 *
 * @param {'apk'|'link'} type
 * @param {object} context  Flags, scores, VT result
 * @param {object} env
 * @returns {Promise<Record<string,string>>}  e.g. { hi: "...", en: "...", ... }
 */
export async function getGroqVerdict(type, context, env) {
  if (!env.GROQ_API_KEY) {
    // Fallback to static templates when key is not set
    return buildStaticVerdict(type, context);
  }

  const contextStr = JSON.stringify(context, null, 2);
  const langList = LANGUAGES.map((l) => `"${l.code}": "<${l.name} sentence>"`).join(",\n  ");

  const prompt =
    type === "apk"
      ? `You are a mobile security expert. Given the following APK analysis result, write a single danger verdict sentence for each language. Be concise and direct. Output ONLY valid JSON with no extra text.

Analysis:
${contextStr}

Required JSON format:
{
  ${langList}
}`
      : `You are a cybersecurity expert. Given the following URL/phishing analysis result, write a single danger verdict sentence for each language. Be concise and direct. Output ONLY valid JSON with no extra text.

Analysis:
${contextStr}

Required JSON format:
{
  ${langList}
}`;

  try {
    const raw = await callGroq(prompt, env);
    // Strip possible markdown code fences
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq verdict parse error:", err);
    return buildStaticVerdict(type, context);
  }
}

/**
 * Generate a three-step action plan after a breach is found.
 *
 * @param {Array<object>} breaches
 * @param {object} env
 * @returns {Promise<Record<string,string[]>>}
 */
export async function getGroqActionPlan(breaches, env) {
  if (!env.GROQ_API_KEY) {
    return buildStaticActionPlan();
  }

  const breachSummary = breaches
    .map((b) => `- ${b.name} (${b.date}): ${(b.dataTypes || []).join(", ")}`)
    .join("\n");

  const langList = LANGUAGES.map(
    (l) => `"${l.code}": ["step1 in ${l.name}", "step2 in ${l.name}", "step3 in ${l.name}"]`
  ).join(",\n  ");

  const prompt = `You are a cybersecurity advisor helping Indian mobile users. The following data breaches were found linked to this user's phone number:

${breachSummary}

Provide exactly 3 short, actionable steps the user should take immediately. Output ONLY valid JSON with no extra text.

Required JSON format:
{
  ${langList}
}`;

  try {
    const raw = await callGroq(prompt, env);
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("Groq action plan parse error:", err);
    return buildStaticActionPlan();
  }
}

// ── Static fallback templates ─────────────────────────────────────────────────

function buildStaticVerdict(type, context) {
  const isDangerous =
    context.isDangerous ||
    context.flags?.otp_stealer_pattern ||
    (context.vtResult?.positives ?? 0) > 2;

  if (type === "apk") {
    return isDangerous
      ? {
          hi: "यह ऐप आपके OTP चुरा सकता है। तुरंत डिलीट करें।",
          en: "This app can steal your OTP. Delete it immediately.",
          ta: "இந்த ஆப் உங்கள் OTP-ஐ திருட முடியும். உடனே நீக்கவும்.",
          te: "ఈ యాప్ మీ OTPని దొంగిలించగలదు. వెంటనే తొలగించండి.",
          bn: "এই অ্যাপটি আপনার OTP চুরি করতে পারে। এখনই মুছুন।",
          mr: "हे अॅप तुमचे OTP चोरू शकते. ताबडतोब डिलीट करा।",
        }
      : {
          hi: "यह ऐप सामान्य लगता है, लेकिन सावधान रहें।",
          en: "This app appears normal, but remain cautious.",
          ta: "இந்த ஆப் சாதாரணமாக தெரிகிறது, ஆனால் எச்சரிக்கையாக இருங்கள்.",
          te: "ఈ యాప్ సాధారణంగా కనిపిస్తోంది, కానీ జాగ్రత్తగా ఉండండి.",
          bn: "এই অ্যাপটি স্বাভাবিক মনে হচ্ছে, তবে সতর্ক থাকুন।",
          mr: "हे अॅप सामान्य वाटते, परंतु सतर्क राहा।",
        };
  }

  return isDangerous
    ? {
        hi: "यह लिंक फ़िशिंग है। क्लिक न करें।",
        en: "This link is a phishing attempt. Do not click.",
        ta: "இந்த இணைப்பு ஃபிஷிங். கிளிக் செய்யாதீர்கள்.",
        te: "ఈ లింక్ ఫిషింగ్. క్లిక్ చేయకండి.",
        bn: "এই লিঙ্কটি ফিশিং। ক্লিক করবেন না।",
        mr: "हा लिंक फिशिंग आहे. क्लिक करू नका।",
      }
    : {
        hi: "यह लिंक सुरक्षित लगता है।",
        en: "This link appears safe.",
        ta: "இந்த இணைப்பு பாதுகாப்பானதாகத் தெரிகிறது.",
        te: "ఈ లింక్ సురక్షితంగా కనిపిస్తోంది.",
        bn: "এই লিঙ্কটি নিরাপদ মনে হচ্ছে।",
        mr: "हा लिंक सुरक्षित वाटतो।",
      };
}

function buildStaticActionPlan() {
  return {
    hi: [
      "तुरंत अपना पासवर्ड बदलें।",
      "अपने बैंक को सूचित करें।",
      "दो-चरणीय प्रमाणीकरण चालू करें।",
    ],
    en: [
      "Change your password immediately.",
      "Notify your bank about the breach.",
      "Enable two-factor authentication.",
    ],
    ta: [
      "உடனடியாக உங்கள் கடவுச்சொல்லை மாற்றவும்.",
      "உங்கள் வங்கிக்கு தெரிவிக்கவும்.",
      "இரண்டு-படி சரிபார்ப்பை இயக்கவும்.",
    ],
    te: [
      "వెంటనే మీ పాస్‌వర్డ్ మార్చండి.",
      "మీ బ్యాంకుకు తెలియజేయండి.",
      "రెండు-దశల ధృవీకరణను ప్రారంభించండి.",
    ],
    bn: [
      "অবিলম্বে আপনার পাসওয়ার্ড পরিবর্তন করুন।",
      "আপনার ব্যাংককে জানান।",
      "দুই-পদক্ষেপ যাচাইকরণ চালু করুন।",
    ],
    mr: [
      "ताबडतोब तुमचा पासवर्ड बदला।",
      "तुमच्या बँकेला सूचित करा।",
      "दोन-चरण प्रमाणीकरण सुरू करा।",
    ],
  };
}
