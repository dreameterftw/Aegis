/**
 * verdicts.js — Static verdict template registry
 *
 * These are the pre-baked verdict strings used as:
 *  1. Fallback when Groq is unavailable
 *  2. Push notification body text (short, punchy)
 *
 * Groq fills these dynamically with context-aware sentences at runtime.
 * The structure here documents the expected schema.
 */

export const VERDICT_TEMPLATES = {
  apk: {
    dangerous: {
      hi: "यह ऐप आपके OTP चुरा सकता है। तुरंत डिलीट करें।",
      en: "This app can steal your OTP. Delete it immediately.",
      ta: "இந்த ஆப் உங்கள் OTP-ஐ திருட முடியும். உடனே நீக்கவும்.",
      te: "ఈ యాప్ మీ OTPని దొంగిలించగలదు. వెంటనే తొలగించండి.",
      bn: "এই অ্যাপটি আপনার OTP চুরি করতে পারে। এখনই মুছুন।",
      mr: "हे अॅप तुमचे OTP चोरू शकते. ताबडतोब डिलीट करा।",
    },
    safe: {
      hi: "यह ऐप सुरक्षित प्रतीत होता है।",
      en: "This app appears to be safe.",
      ta: "இந்த ஆப் பாதுகாப்பானதாக தெரிகிறது.",
      te: "ఈ యాప్ సురక్షితంగా కనిపిస్తోంది.",
      bn: "এই অ্যাপটি নিরাপদ মনে হচ্ছে।",
      mr: "हे अॅप सुरक्षित वाटते।",
    },
  },
  link: {
    dangerous: {
      hi: "यह फ़िशिंग लिंक है। क्लिक न करें।",
      en: "This is a phishing link. Do not click.",
      ta: "இது ஒரு ஃபிஷிங் இணைப்பு. கிளிக் செய்யாதீர்கள்.",
      te: "ఇది ఒక ఫిషింగ్ లింక్. క్లిక్ చేయకండి.",
      bn: "এটি একটি ফিশিং লিঙ্ক। ক্লিক করবেন না।",
      mr: "हा फिशिंग लिंक आहे. क्लिक करू नका।",
    },
    safe: {
      hi: "यह लिंक सुरक्षित लगता है।",
      en: "This link appears safe.",
      ta: "இந்த இணைப்பு பாதுகாப்பானதாகத் தெரிகிறது.",
      te: "ఈ లింక్ సురక్షితంగా కనిపిస్తోంది.",
      bn: "এই লিঙ্কটি নিরাপদ মনে হচ্ছে।",
      mr: "हा लिंक सुरक्षित वाटतो।",
    },
  },
  breach: {
    found: {
      hi: "आपका डेटा एक डेटा उल्लंघन में मिला है।",
      en: "Your data was found in a breach. Take action now.",
      ta: "உங்கள் தரவு ஒரு தரவு மீறலில் கண்டறியப்பட்டது.",
      te: "మీ డేటా ఒక బ్రీచ్‌లో కనుగొనబడింది. ఇప్పుడే చర్య తీసుకోండి.",
      bn: "আপনার ডেটা একটি ডেটা লঙ্ঘনে পাওয়া গেছে।",
      mr: "तुमचा डेटा डेटा उल्लंघनात आढळला. आता कारवाई करा।",
    },
  },
};
